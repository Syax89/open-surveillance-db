/**
 * OIDC external-login database layer (Fase D, migration 0030).
 *
 * Everything here follows the security rules of db/auth.ts (ADR 0013):
 *   - only the SHA-256 of the raw `state` and of the merge token is stored
 *     (a database leak cannot replay an in-flight OIDC request);
 *   - the PKCE `code_verifier` is the one exception — it MUST be recoverable
 *     to exchange the authorization code, so it lives in clear, but the row
 *     is single-use (`used_at` consumed atomically) and short-lived (10-min
 *     `expires_at`, swept by the index);
 *   - the provider email is NEVER persisted (Fase D constraint): the
 *     conflict check at callback time compares it in memory only, and the
 *     merge request stores the existing `contributor_id`, not the email.
 *
 * The module is a sibling of db/auth.ts and follows its raw-D1 style (no
 * Drizzle ORM at runtime — db/index.ts is deliberately excluded from the
 * runtime layer, see tests/helpers/api-harness.mjs REAL_DB_MODULES).
 */

import { getD1 } from "./cameras";
import { randomBase64Url, sha256Hex } from "./auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OidcProvider = "github" | "google";

export type OidcState = {
  id: number;
  stateHash: string;
  provider: OidcProvider;
  codeVerifier: string;
  redirectTo: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

export type OidcMergeRequest = {
  id: number;
  tokenHash: string;
  provider: OidcProvider;
  externalSub: string;
  contributorId: number;
  /** Provider assertion about the conflicting email (a flag, never the address). */
  emailVerified: boolean;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

// ---------------------------------------------------------------------------
// OIDC authorization state (PKCE)
// ---------------------------------------------------------------------------

export const OIDC_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OIDC_MERGE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Persist a fresh OIDC authorization request. Returns the raw `state` nonce
 * (the only value the caller may send to the provider); the row stores its
 * SHA-256. The PKCE verifier is generated here and stored in clear (it must
 * survive until the callback), bound to the state row so a callback can only
 * exchange the code for the exact verifier it was issued with.
 */
export async function createOidcState(input: {
  provider: OidcProvider;
  redirectTo: string;
  now?: string;
}): Promise<{ rawState: string; codeVerifier: string }> {
  const d1 = await getD1();
  const now = input.now ?? new Date().toISOString();
  const expiresAt = new Date(Date.parse(now) + OIDC_STATE_TTL_MS).toISOString();
  const rawState = randomBase64Url(32);
  const codeVerifier = randomBase64Url(32);
  const stateHash = await sha256Hex(rawState);
  await d1
    .prepare(
      `INSERT INTO oidc_states (state_hash, provider, code_verifier, redirect_to, created_at, expires_at, used_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(stateHash, input.provider, codeVerifier, input.redirectTo, now, expiresAt)
    .run();
  return { rawState, codeVerifier };
}

/**
 * Atomically consume an OIDC state row for a callback: the row must exist,
 * belong to the requested provider, be unexpired and unused. Returns the
 * stored verifier + redirect target on success, null otherwise. The
 * conditional UPDATE (used_at IS NULL) makes the row single-use even under
 * concurrent callbacks.
 */
export async function consumeOidcState(
  rawState: string,
  provider: OidcProvider,
  now: string = new Date().toISOString(),
): Promise<{ codeVerifier: string; redirectTo: string } | null> {
  const d1 = await getD1();
  const stateHash = await sha256Hex(rawState);
  const result = await d1
    .prepare(
      `UPDATE oidc_states
       SET used_at = ?
       WHERE state_hash = ? AND provider = ? AND used_at IS NULL AND expires_at > ?
       RETURNING code_verifier AS codeVerifier, redirect_to AS redirectTo`,
    )
    .bind(now, stateHash, provider, now)
    .first<{ codeVerifier: string; redirectTo: string }>();
  return result ?? null;
}

// ---------------------------------------------------------------------------
// Account linking (auth_provider + external_sub) -> contributor
// ---------------------------------------------------------------------------

const linkedColumns =
  "id, email, display_name AS displayName, auth_provider AS authProvider, external_sub AS externalSub, email_verified_at AS emailVerifiedAt, created_at AS createdAt, updated_at AS updatedAt";

export type LinkedContributor = {
  id: number;
  email: string;
  displayName: string | null;
  authProvider: string;
  externalSub: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Resolve an existing contributor by its external OIDC identity. This is the
 * fast path of Fase D account linking: a returning user logs in when
 * (auth_provider, external_sub) already maps to a contributor.
 */
export async function findContributorByExternalIdentity(
  provider: OidcProvider,
  externalSub: string,
): Promise<LinkedContributor | null> {
  const d1 = await getD1();
  return d1
    .prepare(
      `SELECT ${linkedColumns} FROM contributors
       WHERE auth_provider = ? AND external_sub = ?`,
    )
    .bind(provider, externalSub)
    .first<LinkedContributor>();
}

/**
 * Create a contributor from a verified external identity. `email` is the
 * provider's address but is NEVER persisted: the column keeps a deterministic
 * non-routable placeholder (RFC 2606 `.invalid`) derived from the identity,
 * so the unique email index stays satisfied without leaking the address.
 * `emailVerifiedAt` carries the provider's verified flag (Fase D: only sub +
 * verified flag are kept). The password hash is an unguessable random value:
 * an OIDC-only account cannot authenticate with a password.
 */
export async function createOidcContributor(input: {
  provider: OidcProvider;
  externalSub: string;
  emailVerified: boolean;
  displayName: string | null;
  now?: string;
}): Promise<LinkedContributor> {
  const d1 = await getD1();
  const now = input.now ?? new Date().toISOString();
  const placeholderEmail = `oidc.${input.provider}.${input.externalSub}@invalid`;
  const unusableHash = `pbkdf2$1$${randomBase64Url(16)}$${randomBase64Url(32)}`;
  const emailVerifiedAt = input.emailVerified ? now : null;
  const result = await d1
    .prepare(
      `INSERT INTO contributors
         (email, display_name, password_hash, email_verified_at, auth_provider, external_sub, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING ${linkedColumns}`,
    )
    .bind(
      placeholderEmail,
      input.displayName,
      unusableHash,
      emailVerifiedAt,
      input.provider,
      input.externalSub,
      now,
      now,
    )
    .first<LinkedContributor>();
  if (!result) throw new Error("Contributor could not be created from OIDC identity");
  return result;
}

// ---------------------------------------------------------------------------
// Manual merge (email conflict)
// ---------------------------------------------------------------------------

/**
 * Issue a single-use merge token when the provider's verified email matches
 * an existing password account. The callback must NOT auto-link in that case
 * (account takeover); the user proves ownership with the account password,
 * then linkExternalIdentity() writes the OIDC identity onto the contributor.
 * Returns the raw token; only its SHA-256 is stored.
 */
export async function createOidcMergeRequest(input: {
  provider: OidcProvider;
  externalSub: string;
  contributorId: number;
  emailVerified: boolean;
  now?: string;
}): Promise<{ rawToken: string }> {
  const d1 = await getD1();
  const now = input.now ?? new Date().toISOString();
  const expiresAt = new Date(Date.parse(now) + OIDC_MERGE_TTL_MS).toISOString();
  const rawToken = randomBase64Url(32);
  const tokenHash = await sha256Hex(rawToken);
  await d1
    .prepare(
      `INSERT INTO oidc_merge_requests (token_hash, provider, external_sub, contributor_id, email_verified, created_at, expires_at, used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      tokenHash,
      input.provider,
      input.externalSub,
      input.contributorId,
      input.emailVerified ? 1 : 0,
      now,
      expiresAt,
    )
    .run();
  return { rawToken };
}

/**
 * Read the merge request bound to a raw token without consuming it. Used by
 * the merge route to find the target contributor before the password check;
 * the actual consume is atomic and happens only after the password verifies.
 */
export async function getOidcMergeRequest(
  rawToken: string,
  now: string = new Date().toISOString(),
): Promise<OidcMergeRequest | null> {
  const d1 = await getD1();
  const tokenHash = await sha256Hex(rawToken);
  return d1
    .prepare(
      `SELECT id, token_hash AS tokenHash, provider, external_sub AS externalSub,
              contributor_id AS contributorId, email_verified AS emailVerified,
              created_at AS createdAt, expires_at AS expiresAt, used_at AS usedAt
       FROM oidc_merge_requests
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
    )
    .bind(tokenHash, now)
    .first<OidcMergeRequest>();
}

/**
 * Atomically consume a merge request (single-use) and link the external
 * identity onto its contributor. Returns the linked contributor on success,
 * null when the request was already used/expired or the account vanished.
 * The provider's verified flag was captured on the request row at callback
 * time (`email_verified`); when set and the account is not yet verified,
 * the link also stamps `email_verified_at`.
 */
export async function linkExternalIdentity(
  rawToken: string,
  provider: OidcProvider,
  externalSub: string,
  now: string = new Date().toISOString(),
): Promise<LinkedContributor | null> {
  const d1 = await getD1();
  const tokenHash = await sha256Hex(rawToken);
  const result = await d1
    .prepare(
      `UPDATE contributors
       SET auth_provider = ?, external_sub = ?,
           email_verified_at = COALESCE(email_verified_at,
             CASE WHEN (SELECT email_verified FROM oidc_merge_requests
                        WHERE token_hash = ? AND provider = ? AND external_sub = ?
                          AND used_at IS NULL AND expires_at > ?) = 1
                  THEN ? END),
           updated_at = ?
       WHERE id = (SELECT contributor_id FROM oidc_merge_requests
                   WHERE token_hash = ? AND provider = ? AND external_sub = ?
                     AND used_at IS NULL AND expires_at > ?)
       RETURNING ${linkedColumns}`,
    )
    .bind(provider, externalSub, tokenHash, provider, externalSub, now, now, now, tokenHash, provider, externalSub, now)
    .first<LinkedContributor>();
  if (result) {
    await d1
      .prepare(`UPDATE oidc_merge_requests SET used_at = ? WHERE token_hash = ? AND used_at IS NULL`)
      .bind(now, tokenHash)
      .run();
  }
  return result;
}

// ---------------------------------------------------------------------------
// Expiry sweep
// ---------------------------------------------------------------------------

/**
 * Delete expired OIDC state and merge-request rows (single-use, short-lived
 * by design). Called from the worker's scheduled cron alongside the
 * retention sweep (ADR 0004 §3); the (expires_at) indexes keep the delete
 * a range scan. Returns the number of rows removed from each table.
 */
export async function sweepOidcExpired(
  now: string = new Date().toISOString(),
): Promise<{ states: number; mergeRequests: number }> {
  const d1 = await getD1();
  const states = await d1
    .prepare(`DELETE FROM oidc_states WHERE expires_at <= ?`)
    .bind(now)
    .run();
  const mergeRequests = await d1
    .prepare(`DELETE FROM oidc_merge_requests WHERE expires_at <= ?`)
    .bind(now)
    .run();
  const changes = (result: unknown): number => {
    const meta = result as { meta?: { changes?: number } };
    return typeof meta.meta?.changes === "number" ? meta.meta.changes : 0;
  };
  return { states: changes(states), mergeRequests: changes(mergeRequests) };
}
