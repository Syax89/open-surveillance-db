import { getD1 } from "../cameras";
import { sha256Hex } from "./crypto";
import { normalizeEmail } from "./email";

// ---------------------------------------------------------------------------
// Per-email login lockout (P2 security, ADR 0016)
// ---------------------------------------------------------------------------
//
// The per-IP `auth` rate-limit bucket (app/lib/rate-limit.ts) throttles a
// single caller, but a distributed attacker (rotating IPs, NAT with multiple
// egresses) can keep guessing one account's password without ever being
// stopped. This counter is keyed by the SHA-256 of the normalised email —
// deliberately NOT by IP — so every failed login counts against the same
// account no matter where it comes from.
//
// Lockout poisoning (a third party deliberately failing N times against a
// known email to lock its owner out) is accepted and bounded: the lock is
// short and self-expiring, consecutive lockouts back off exponentially to a
// cap, and a successful login clears the row. See ADR 0016.

export type LoginLockoutPolicy = {
  /** Failed logins allowed inside one window before the lockout trips. */
  maxAttempts: number;
  /** Counting window (seconds): older failures no longer count. */
  windowSeconds: number;
  /** Base lockout duration (seconds); doubles per consecutive lockout. */
  durationSeconds: number;
  /** Hard cap for the exponential backoff (seconds). */
  maxDurationSeconds: number;
};

export type LoginLockoutState = {
  locked: boolean;
  retryAfterSeconds: number;
};

const LOCKOUT_NOW = () => new Date().toISOString();

/**
 * The per-email counter key: SHA-256 of the normalised email (hex). The raw
 * address never reaches the `login_attempts` table nor any log line — only
 * this hash does.
 */
export async function loginLockoutKey(email: string): Promise<string> {
  return sha256Hex(normalizeEmail(email));
}

/**
 * Read the current lockout state for an email key. `now` is injectable for
 * deterministic tests (same convention as createSession).
 */
export async function getLoginLockout(
  emailKey: string,
  policy: LoginLockoutPolicy,
  now: string = LOCKOUT_NOW(),
): Promise<LoginLockoutState> {
  const d1 = await getD1();
  const row = await d1
    .prepare(
      "SELECT failed_count AS failedCount, window_start AS windowStart, locked_until AS lockedUntil FROM login_attempts WHERE email_key = ?",
    )
    .bind(emailKey)
    .first<{ failedCount: number; windowStart: string; lockedUntil: string | null }>();
  if (!row) return { locked: false, retryAfterSeconds: 0 };
  if (row.lockedUntil && row.lockedUntil > now) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((Date.parse(row.lockedUntil) - Date.parse(now)) / 1000),
    );
    return { locked: true, retryAfterSeconds };
  }
  return { locked: false, retryAfterSeconds: 0 };
}

function lockoutDurationMs(policy: LoginLockoutPolicy, level: number): number {
  const seconds = Math.min(
    policy.durationSeconds * 2 ** level,
    policy.maxDurationSeconds,
  );
  return seconds * 1000;
}

/**
 * Record one failed login for an email key. Returns whether the account is
 * now locked — the attempt that reaches the threshold trips the lockout —
 * and how long the lock lasts (Retry-After).
 *
 * Window semantics: failures only count inside `windowSeconds`. A fresh
 * counter starts at 1. When the lockout trips, the window is re-anchored at
 * `now`, and the escalation window extends `windowSeconds` PAST the lock
 * expiry: an attacker who resumes right after the lock expires (or during
 * it, if the route is bypassed) keeps `lockout_level` — and the next lock
 * doubles its duration, up to the cap — instead of starting over at zero.
 * After a quiet period longer than the window, the level resets.
 */
export async function recordFailedLogin(
  emailKey: string,
  policy: LoginLockoutPolicy,
  now: string = LOCKOUT_NOW(),
): Promise<LoginLockoutState> {
  const d1 = await getD1();
  const nowMs = Date.parse(now);
  const row = await d1
    .prepare(
      "SELECT failed_count AS failedCount, window_start AS windowStart, locked_until AS lockedUntil, lockout_level AS lockoutLevel FROM login_attempts WHERE email_key = ?",
    )
    .bind(emailKey)
    .first<{
      failedCount: number;
      windowStart: string;
      lockedUntil: string | null;
      lockoutLevel: number;
    }>();

  const windowOpen =
    row !== null && nowMs - Date.parse(row.windowStart) < policy.windowSeconds * 1000;
  const postLockWindowOpen =
    row !== null &&
    row.lockedUntil !== null &&
    nowMs - Date.parse(row.lockedUntil) < policy.windowSeconds * 1000;
  // Escalation carries across a lock expiry while the account stays under
  // attack; it dies off once the window rolls over without new failures.
  const escalated = windowOpen || postLockWindowOpen;

  // First failure, or the previous window (incl. the post-lock window) rolled
  // over: start fresh at 1. (UPSERT keeps the single-row invariant.)
  if (!row || !escalated) {
    await d1
      .prepare(
        `INSERT INTO login_attempts (email_key, failed_count, window_start, locked_until, lockout_level)
         VALUES (?, 1, ?, NULL, 0)
         ON CONFLICT (email_key) DO UPDATE SET
           failed_count = 1,
           window_start = excluded.window_start,
           locked_until = NULL,
           lockout_level = 0`,
      )
      .bind(emailKey, now)
      .run();
    return { locked: false, retryAfterSeconds: 0 };
  }

  const nextCount = row.failedCount + 1;
  if (nextCount < policy.maxAttempts) {
    await d1
      .prepare("UPDATE login_attempts SET failed_count = ? WHERE email_key = ?")
      .bind(nextCount, emailKey)
      .run();
    return { locked: false, retryAfterSeconds: 0 };
  }

  // Threshold reached: lock the account. Consecutive lockouts double the
  // duration (capped); the window is re-anchored at `now` so the escalation
  // applies to an attacker who resumes as soon as the lock expires.
  const level = row.lockoutLevel;
  const durationMs = lockoutDurationMs(policy, level);
  const lockedUntil = new Date(nowMs + durationMs).toISOString();
  await d1
    .prepare(
      `UPDATE login_attempts
       SET failed_count = ?, window_start = ?, locked_until = ?, lockout_level = ?
       WHERE email_key = ?`,
    )
    .bind(nextCount, now, lockedUntil, level + 1, emailKey)
    .run();
  return { locked: true, retryAfterSeconds: Math.max(1, Math.ceil(durationMs / 1000)) };
}

/** Clear the per-email counter on a successful login. */
export async function clearLoginAttempts(emailKey: string): Promise<void> {
  const d1 = await getD1();
  await d1.prepare("DELETE FROM login_attempts WHERE email_key = ?").bind(emailKey).run();
}
