import { getD1 } from "../cameras";
import { publicContributorColumns } from "./contributors";
import { TOKEN_BYTES, randomBase64Url, sha256Hex } from "./crypto";
import { hashPassword } from "./password";
import type { PublicContributor } from "./types";

// ---------------------------------------------------------------------------
// Email verification + password reset tokens (multi-method auth Fase B)
// ---------------------------------------------------------------------------
//
// Both flows that prove mailbox control share the `email_verification_tokens`
// table (migration 0027 + purpose column 0031): 'verify' links emailed at
// registration, 'reset' links emailed by the reset-request handler. The
// security model is inherited from 0027:
//   - only the SHA-256 of the raw token is stored (a DB leak cannot replay);
//   - tokens die after their per-purpose TTL (`expires_at` — verify 24h,
//     reset 3h) or on first use (`used_at`);
//   - consuming a token is an atomic conditional UPDATE, so two parallel
//     requests cannot both succeed (single-use even under a race);
//   - creating a new token for a purpose revokes every older UNUSED token of
//     the same purpose: only the newest link works, and replaying a stale
//     link answers 410 Gone instead of silently re-verifying.
//
// Send throttling is the SHARED 1-email-per-5-minutes budget of issue #440:
// `reserveAuthEmail` (db/mailer.ts) admits every verification/reset send
// ATOMICALLY against the `email_send_log` table (INSERT ... SELECT ...
// WHERE count < limit RETURNING id), one budget shared by register, re-send
// and reset-request — there is no per-purpose send counter anymore.
// `countVerificationTokensSentSince` below is a non-admission diagnostic
// token-count helper (tests/auth-d1.test.mjs); no route calls it for
// admission.

/** TTL for email-address verification links (registration + re-send). */
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** TTL for password-reset links — shorter window, higher-stakes purpose. */
export const RESET_TOKEN_TTL_MS = 3 * 60 * 60 * 1000;

/** Per-purpose TTL, so callers cannot accidentally mix the two windows. */
export const TOKEN_TTL_MS_BY_PURPOSE: Record<EmailVerificationPurpose, number> = {
  verify: VERIFICATION_TOKEN_TTL_MS,
  reset: RESET_TOKEN_TTL_MS,
};

export type EmailVerificationPurpose = "verify" | "reset";

/**
 * Create a verification/reset token for a contributor and return the RAW
 * token (the only thing the mailer may see — the DB stores only its hash).
 * Older UNUSED tokens of the same purpose are revoked (used_at set) first,
 * so a re-send invalidates every previously mailed link and a stale link
 * answers 410 instead of verifying twice.
 *
 * The TTL is per-purpose: verify links live 24h, reset links 3h
 * (TOKEN_TTL_MS_BY_PURPOSE). Pass `ttlMs` explicitly only when a caller
 * needs a window different from the purpose default (tests forcing expiry).
 *
 * `now` is injectable for deterministic tests (same convention as
 * createSession).
 */
export async function createVerificationToken(
  contributorId: number,
  purpose: EmailVerificationPurpose,
  now: string = new Date().toISOString(),
  ttlMs: number = TOKEN_TTL_MS_BY_PURPOSE[purpose],
): Promise<{ rawToken: string; expiresAt: string }> {
  const d1 = await getD1();
  const rawToken = randomBase64Url(TOKEN_BYTES);
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.parse(now) + ttlMs).toISOString();
  await d1.batch([
    // Revoke older unused tokens of the same purpose: only the newest link
    // stays valid. (Used/expired rows are left alone — they are already dead.)
    d1.prepare(
      "UPDATE email_verification_tokens SET used_at = ? WHERE contributor_id = ? AND purpose = ? AND used_at IS NULL",
    ).bind(now, contributorId, purpose),
    d1.prepare(
      "INSERT INTO email_verification_tokens (contributor_id, token_hash, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(contributorId, tokenHash, purpose, now, expiresAt),
  ]);
  return { rawToken, expiresAt };
}

export type VerificationConsumeResult =
  | { kind: "verified"; contributorId: number }
  | { kind: "invalid" }
  | { kind: "used" }
  | { kind: "expired" };

/**
 * Atomically consume a raw token for the given purpose.
 *
 *   - unknown hash, or a hash belonging to the OTHER purpose -> "invalid"
 *     (the response must not reveal whether a token exists — anti-enumeration);
 *   - already consumed (used_at set) -> "used";
 *   - past expires_at -> "expired";
 *   - live -> "verified": the row is burned single-use (conditional UPDATE,
 *     so a concurrent request loses the race and sees "used") and the
 *     contributor id is returned for the caller to act on.
 *
 * The caller (verify-email or reset-confirm route) performs the side effect
 * — setting `email_verified_at` and/or rotating the password — so this
 * function stays a single-purpose token gate. `now` is injectable for
 * deterministic tests.
 */
export async function consumeVerificationToken(
  rawToken: string,
  purpose: EmailVerificationPurpose,
  now: string = new Date().toISOString(),
): Promise<VerificationConsumeResult> {
  const d1 = await getD1();
  const tokenHash = await sha256Hex(rawToken);
  const row = await d1
    .prepare(
      "SELECT id, contributor_id AS contributorId, purpose, used_at AS usedAt, expires_at AS expiresAt FROM email_verification_tokens WHERE token_hash = ?",
    )
    .bind(tokenHash)
    .first<{ id: number; contributorId: number; purpose: string; usedAt: string | null; expiresAt: string }>();
  if (!row || row.purpose !== purpose) return { kind: "invalid" };
  if (row.usedAt !== null) return { kind: "used" };
  if (row.expiresAt <= now) return { kind: "expired" };

  // Single-use under a race: the conditional UPDATE is the consume. If two
  // requests present the same live token, exactly one wins (changes = 1);
  // the loser sees used_at already set and gets "used".
  const consumed = (await d1
    .prepare("UPDATE email_verification_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?")
    .bind(now, row.id, now)
    .run()) as { meta: { changes: number } };
  if (consumed.meta.changes === 0) return { kind: "used" };
  return { kind: "verified", contributorId: row.contributorId };
}

/**
 * Diagnostic / token-count helper: how many tokens of a purpose were
 * CREATED for a contributor since a timestamp. NOT the admission gate —
 * the current send gate (issue #440) is the SHARED 1-email-per-5-minutes
 * atomic `email_send_log` reservation in db/mailer.ts; no route calls this
 * for admission. Retained for tests/auth-d1.test.mjs.
 */
export async function countVerificationTokensSentSince(
  contributorId: number,
  purpose: EmailVerificationPurpose,
  since: string,
): Promise<number> {
  const d1 = await getD1();
  const result = await d1
    .prepare(
      "SELECT COUNT(*) AS n FROM email_verification_tokens WHERE contributor_id = ? AND purpose = ? AND created_at >= ?",
    )
    .bind(contributorId, purpose, since)
    .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

/**
 * Set `email_verified_at` on a contributor (idempotent: the first
 * verification wins, the original timestamp is preserved — COALESCE). This
 * is the flip that turns a read-only session into a write-capable one; the
 * write gate (Fase E1) reads the column on every state-changing write.
 * Returns the refreshed public profile, or null when the account no longer
 * exists (erased between the token consume and this update).
 */
export async function markContributorEmailVerified(
  contributorId: number,
  now: string = new Date().toISOString(),
): Promise<PublicContributor | null> {
  const d1 = await getD1();
  return d1
    .prepare(
      `UPDATE contributors
       SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ?
       WHERE id = ?
       RETURNING ${publicContributorColumns}`,
    )
    .bind(now, now, contributorId)
    .first<PublicContributor>();
}

/**
 * Rotate a contributor's password hash (password reset confirm, Fase B).
 * The new hash uses the current Cloudflare-compatible iteration count.
 */
export async function resetContributorPassword(
  contributorId: number,
  newPassword: string,
  now: string = new Date().toISOString(),
): Promise<void> {
  const d1 = await getD1();
  const passwordHash = await hashPassword(newPassword);
  await d1
    .prepare("UPDATE contributors SET password_hash = ?, updated_at = ? WHERE id = ?")
    .bind(passwordHash, now, contributorId)
    .run();
}

/**
 * Revoke every live session of a contributor (password reset hardening):
 * after the hash rotates, any session opened with the old password must die.
 * Returns the number of sessions revoked.
 */
export async function revokeAllContributorSessions(
  contributorId: number,
  now: string = new Date().toISOString(),
): Promise<number> {
  const d1 = await getD1();
  const result = (await d1
    .prepare("UPDATE sessions SET revoked_at = ? WHERE contributor_id = ? AND revoked_at IS NULL")
    .bind(now, contributorId)
    .run()) as { meta: { changes: number } };
  return result.meta.changes;
}

/**
 * One statement result from `d1.batch(...)`: a RETURNING statement populates
 * `results`, everything else only `meta` (P1-2 atomic write path).
 */
type D1BatchResult = {
  success: boolean;
  results: Record<string, unknown>[];
  meta: { changes: number; lastRowId: number };
};

/**
 * Apply a completed password reset (Fase B confirm): rotate the hash, revoke
 * EVERY live session, and mark the email verified — in ONE atomic batch. A
 * crash cannot leave the hash rotated but sessions live, or sessions dead but
 * the hash old. `consumeVerificationToken` stays a separate single-use gate by
 * design: the token is consumed (and so single-use) before this write, and the
 * two writes cannot be combined because the token consume is a read-then-write
 * on the same row. Returns the refreshed public profile, or null when the
 * account vanished between the consume and this update.
 */
export async function applyPasswordReset(
  contributorId: number,
  newPassword: string,
  now: string = new Date().toISOString(),
): Promise<PublicContributor | null> {
  const d1 = await getD1();
  const passwordHash = await hashPassword(newPassword);
  const results = (await d1.batch([
    d1.prepare("UPDATE contributors SET password_hash = ?, updated_at = ? WHERE id = ?").bind(passwordHash, now, contributorId),
    d1.prepare("UPDATE sessions SET revoked_at = ? WHERE contributor_id = ? AND revoked_at IS NULL").bind(now, contributorId),
    d1.prepare(`UPDATE contributors SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ? RETURNING ${publicContributorColumns}`).bind(now, now, contributorId),
  ])) as D1BatchResult[];
  const contributor = results[2]?.results?.[0] as PublicContributor | undefined;
  return contributor ?? null;
}
