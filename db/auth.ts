import { getD1 } from "./cameras";

/**
 * Contributor accounts and sessions (STATUS gap #1, ADR 0013).
 *
 * Security properties:
 *  - Passwords are stored as salted PBKDF2-SHA256 hashes
 *    (`pbkdf2$<iterations>$<saltB64>$<hashB64>`, 210,000 iterations per the
 *    OWASP recommendation for PBKDF2-HMAC-SHA256). The iteration count is
 *    embedded in the hash so it can be raised without a migration.
 *  - Only the SHA-256 of the raw session token is stored: a database leak
 *    cannot replay live sessions, and the raw token (32 random bytes,
 *    base64url) is the only thing the browser cookie carries.
 *  - Each session carries its own CSRF token, echoed through a non-HttpOnly
 *    cookie and verified on state-changing requests (app/lib/auth-session).
 *
 * Anonymous submissions remain possible by design: `contributor_id` on a
 * camera is NULL unless the submitter was logged in (see ADR 0013).
 */

// ---------------------------------------------------------------------------
// Crypto helpers (WebCrypto — available in Cloudflare Workers and Node 22+)
// ---------------------------------------------------------------------------

export const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_HASH = "SHA-256";
const PBKDF2_KEY_LENGTH = 32; // 256 bits
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function randomBytes(byteLength: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(byteLength));
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomBase64Url(byteLength: number): string {
  return bytesToBase64Url(randomBytes(byteLength));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(PBKDF2_HASH, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time byte comparison, mirroring the edge gate in worker/index.ts.
 * Never used for secrets under test assumptions: it only defends against
 * timing side channels on password/session verification.
 */
function constantTimeEqual(first: string, second: string): boolean {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Derive the PBKDF2-SHA256 key for a password/salt pair at the given
 * iteration count.
 *
 * The count is honoured as-is — hashing always passes the current
 * PBKDF2_ITERATIONS constant, while verification passes the count embedded
 * in the stored hash (ADR 0013). Raising the constant therefore never
 * invalidates existing hashes: each one re-derives at its own stored count
 * until a rehash-on-login upgrades it (AUTH_OPTIONS §8).
 */
async function derivePasswordKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: PBKDF2_HASH,
      salt,
      iterations,
    },
    keyMaterial,
    PBKDF2_KEY_LENGTH * 8,
  );
  return new Uint8Array(derived);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await derivePasswordKey(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts[0] !== "pbkdf2") return false;

  let iterations: number;
  let salt: Uint8Array<ArrayBuffer>;
  let expected: string;

  if (parts.length === 4) {
    // Current format (ADR 0013): `pbkdf2$<iterations>$<saltB64>$<hashB64>`.
    // The embedded count drives the derivation, so a bump of
    // PBKDF2_ITERATIONS verifies old hashes at their own (lower) count
    // instead of locking every contributor out.
    const parsed = Number(parts[1]);
    if (!Number.isInteger(parsed) || parsed < 1) return false;
    iterations = parsed;
    salt = base64UrlToBytes(parts[2]);
    expected = parts[3];
  } else if (parts.length === 3) {
    // Legacy hashes predate the embedded iteration count
    // (`pbkdf2$<saltB64>$<hashB64>`): fall back to the current constant.
    iterations = PBKDF2_ITERATIONS;
    salt = base64UrlToBytes(parts[1]);
    expected = parts[2];
  } else {
    return false;
  }

  try {
    const derived = await derivePasswordKey(password, salt, iterations);
    return constantTimeEqual(bytesToBase64Url(derived), expected);
  } catch {
    return false;
  }
}

/**
 * A structurally valid PBKDF2 hash the code never verifies against: it exists
 * ONLY to make unknown-email lookups pay the same derivation cost as a real
 * password check. The salt and key are fixed constants — the comparison
 * result is discarded, so neither value carries any secret.
 *
 * QA#3 F1 (t_63e0d13c): the login response body is anti-enumeration (one
 * generic 401), but the response TIME was not — an unknown email returned
 * immediately while a registered email paid 210 000 PBKDF2 iterations
 * (~50-150 ms). authenticateContributor and the lockout branch of the login
 * route both call verifyPasswordDummy on the fast paths so the response time
 * no longer reveals whether the email exists.
 */
const DUMMY_PASSWORD_HASH =
  "pbkdf2$210000$WlpaWlpaWlpaWlpaWlpaWg$zU4WhYARxiSZk8T4hHTDxIt0TKfuJ3ZGBFxf6wvNosY";

/**
 * Pay the full PBKDF2 derivation cost against the dummy hash and return
 * false. Callers DISCARD the result — the point is the timing, not the
 * boolean — but returning false keeps the call site honest about the fact
 * that this is a failed verification.
 */
export async function verifyPasswordDummy(password: string): Promise<boolean> {
  try {
    const parts = DUMMY_PASSWORD_HASH.split("$");
    // Derive at the DUMMY hash's own (fixed) iteration count, exactly like a
    // real verify would — the comparison result is discarded on purpose.
    await derivePasswordKey(password, base64UrlToBytes(parts[2]), Number(parts[1]));
  } catch {
    // Derivation never fails for a string password; swallow so the fast path
    // stays uniform (a throwing caller would reintroduce a timing signal).
  }
  return false;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Contributor = {
  id: number;
  email: string;
  displayName: string | null;
  passwordHash: string;
  emailVerifiedAt: string | null;
  authProvider: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * What the API ever returns: the password hash never leaves the db layer.
 * `emailVerifiedAt` (migration 0027, Fase B) tells the client whether the
 * account can write yet — NULL until the address is verified, ISO timestamp
 * after. The write gate (Fase E1) enforces the same column server-side.
 */
export type PublicContributor = Omit<Contributor, "passwordHash">;

export type Session = {
  id: number;
  contributorId: number;
  tokenHash: string;
  csrfToken: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type SessionWithContributor = Session & { contributor: PublicContributor };

export type ContributorSubmission = {
  id: number;
  title: string;
  status: string;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Email normalisation
// ---------------------------------------------------------------------------

const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalise a submitted email: trim, lowercase. Invalid emails stay invalid. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= EMAIL_MAX_LENGTH &&
    EMAIL_PATTERN.test(value)
  );
}

// ---------------------------------------------------------------------------
// Contributors
// ---------------------------------------------------------------------------

const contributorColumns =
  "id, email, display_name AS displayName, password_hash AS passwordHash, email_verified_at AS emailVerifiedAt, auth_provider AS authProvider, created_at AS createdAt, updated_at AS updatedAt";

const publicContributorColumns =
  "id, email, display_name AS displayName, email_verified_at AS emailVerifiedAt, auth_provider AS authProvider, created_at AS createdAt, updated_at AS updatedAt";

/**
 * Create a contributor and return the public profile. The unique email index
 * (`contributors_email_unique`) is the last line of defence: a race between
 * two registrations with the same email fails here with a constraint error,
 * which the route maps to 409.
 */
export async function createContributor(input: {
  email: string;
  displayName: string | null;
  password: string;
}): Promise<PublicContributor> {
  const d1 = await getD1();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(input.password);
  const result = await d1
    .prepare(
      `INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       RETURNING ${publicContributorColumns}`,
    )
    .bind(input.email, input.displayName, passwordHash, now, now)
    .first<PublicContributor>();
  if (!result) throw new Error("Contributor could not be created");
  return result;
}

/**
 * Derive the stored key for the per-IP registration cap (QA#3 F4,
 * t_63e0d13c). The register route keys `registrations_ip_log` by this value
 * — never by the raw IP.
 *
 * Plain SHA-256 of the caller key is INVERTIBLE for practical purposes: the
 * IPv4 space is 2^32, so a precomputed table maps any stored hash back to
 * the caller's address (PII at rest, GDPR art. 5(1)(e)). The fix:
 *
 *   - when `REGISTRATION_IP_HMAC_KEY` is configured (production), the value
 *     is HMAC-SHA256(key, callerKey) TRUNCATED to 128 bits — the key is a
 *     server secret, so the stored value is not computable offline and a
 *     database leak cannot be dictionary-attacked;
 *   - without a key (local prototype / tests), the fallback is plain
 *     SHA-256 truncated to 128 bits: still not a raw IP, and the 30-day
 *     retention sweep (R17) bounds the exposure; the QA-accepted "truncate"
 *     option. Production must set the key (deploy checklist).
 *
 * The output is always 32 hex characters (128 bits), independent of which
 * branch ran, so the column/index shape never changes.
 */
export async function registrationIpHash(
  callerKeyValue: string,
  hmacKey: string | undefined,
): Promise<string> {
  if (hmacKey && hmacKey.length > 0) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(hmacKey),
      { name: "HMAC", hash: PBKDF2_HASH },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      keyMaterial,
      new TextEncoder().encode(callerKeyValue),
    );
    return [...new Uint8Array(mac).slice(0, 16)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return (await sha256Hex(callerKeyValue)).slice(0, 32);
}

/**
 * Record one registration attempt and return the reserved row id plus the
 * number of attempts for the caller's IP hash inside the rolling window —
 * atomically, in ONE D1 batch.
 *
 * Per-IP registration cap (P3-4, CEO decision t_0941036b — anti account-farm,
 * docs/COMMUNITY_PLAN.md §3.3): the register route inserts the attempt and
 * counts the window (`created_at >= windowStart`) in the same batch, so two
 * concurrent registrations cannot both read a stale count below the cap. The
 * stored key is `registrationIpHash(callerKey)` — a keyed HMAC (or truncated
 * SHA-256) of the caller key, never the raw IP and never an invertible hash
 * (privacy by design, QA#3 F4; same rule as the abuse-alert `callerHash`).
 * The route answers 429 once the count reaches `registrationIpLimits(env).maxRequests`
 * (so the 5th request in the window is blocked and its row stays — it must
 * keep counting for the 6th to stay blocked too); rows older than the window
 * fall out of the COUNT, so the cap resets automatically without a cleanup
 * job. When registration FAILS (400/409/500 — no account created) the route
 * rolls the row back with `deleteRegistrationAttempt`, so junk attempts never
 * consume the per-IP budget and the malformed-body "no write" contract holds.
 */
export async function recordRegistrationAttempt(input: {
  ipHash: string;
  now: string;
  windowStart: string;
}): Promise<{ id: number; count: number }> {
  const d1 = await getD1();
  const results = (await d1.batch([
    d1
      .prepare("INSERT INTO registrations_ip_log (ip_hash, created_at) VALUES (?, ?) RETURNING id")
      .bind(input.ipHash, input.now),
    d1
      .prepare("SELECT COUNT(*) AS n FROM registrations_ip_log WHERE ip_hash = ? AND created_at >= ?")
      .bind(input.ipHash, input.windowStart),
  ])) as { results: Array<Record<string, unknown>> }[];
  const inserted = results[0]?.results?.[0] as { id?: number } | undefined;
  const counted = results[1]?.results?.[0] as { n?: number } | undefined;
  return { id: Number(inserted?.id ?? 0), count: Number(counted?.n ?? 0) };
}

/**
 * Roll back a reserved registration attempt (see `recordRegistrationAttempt`).
 * Called by the register route on every non-201 exit: no account was created,
 * so the reservation must not consume the per-IP budget. The id is the row
 * returned by the reservation's INSERT ... RETURNING id, so the delete is a
 * point write and can never touch a different attempt.
 */
export async function deleteRegistrationAttempt(id: number): Promise<void> {
  const d1 = await getD1();
  await d1.prepare("DELETE FROM registrations_ip_log WHERE id = ?").bind(id).run();
}

/** Full row including the password hash — used only by the login verifier. */
export async function findContributorByEmail(email: string): Promise<Contributor | null> {
  const d1 = await getD1();
  return d1
    .prepare(`SELECT ${contributorColumns} FROM contributors WHERE email = ?`)
    .bind(email)
    .first<Contributor>();
}

export async function getContributorById(id: number): Promise<PublicContributor | null> {
  const d1 = await getD1();
  return d1
    .prepare(`SELECT ${publicContributorColumns} FROM contributors WHERE id = ?`)
    .bind(id)
    .first<PublicContributor>();
}

/**
 * Update the contributor's own display name (profile field, C6/C8 — the only
 * inline-editable profile field; editing is reserved to the profile, never to
 * contribution records). Returns the refreshed public profile, or null when
 * the account no longer exists (erased between the session read and this
 * update). `now` is injectable for deterministic tests.
 */
export async function updateContributorDisplayName(
  id: number,
  displayName: string | null,
  now: string = new Date().toISOString(),
): Promise<PublicContributor | null> {
  const d1 = await getD1();
  return d1
    .prepare(
      `UPDATE contributors SET display_name = ?, updated_at = ? WHERE id = ? RETURNING ${publicContributorColumns}`,
    )
    .bind(displayName, now, id)
    .first<PublicContributor>();
}

/**
 * Verify an email/password pair against the stored PBKDF2 hash. Returns the
 * public profile on success, null on unknown email or wrong password — the
 * route maps both to the same generic 401 so responses do not reveal which
 * part was wrong.
 *
 * QA#3 F1 (t_63e0d13c): an unknown email used to return immediately while a
 * registered email paid the full PBKDF2 cost — a response-TIME oracle that
 * enumerated accounts. The unknown-email branch now pays the same derivation
 * cost via verifyPasswordDummy, so the only remaining difference is the
 * lookup itself (a single indexed SELECT, no measurable signal).
 */
export async function authenticateContributor(
  email: string,
  password: string,
): Promise<PublicContributor | null> {
  const contributor = await findContributorByEmail(email);
  if (!contributor) {
    // Same 401, same cost: pay the PBKDF2 derivation so the response time
    // cannot distinguish "no such email" from "wrong password" (QA#3 F1).
    await verifyPasswordDummy(password);
    return null;
  }
  const valid = await verifyPassword(password, contributor.passwordHash);
  if (!valid) return null;
  return {
    id: contributor.id,
    email: contributor.email,
    displayName: contributor.displayName,
    emailVerifiedAt: contributor.emailVerifiedAt,
    authProvider: contributor.authProvider,
    createdAt: contributor.createdAt,
    updatedAt: contributor.updatedAt,
  };
}

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

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type NewSession = {
  rawToken: string;
  csrfToken: string;
  session: Session;
};

/**
 * Create a session for a contributor. Returns the raw token (cookie value)
 * alongside the stored row: only the SHA-256 of the token ever reaches the
 * database. `ttlSeconds` is the single source of truth for session lifetime
 * (callers pass `sessionTtlSeconds(env)` from app/lib/auth-session.ts so the
 * DB `expires_at` always matches the cookie Max-Age — audit t_5ca60ab2, P2).
 * `ttlDays` remains supported as a convenience and for deterministic tests;
 * when both are given, `ttlSeconds` wins. Defaults to 30 days. `now` is
 * injectable for deterministic tests.
 */
export async function createSession(
  contributorId: number,
  options: { ttlDays?: number; ttlSeconds?: number; now?: string } = {},
): Promise<NewSession> {
  const d1 = await getD1();
  const now = options.now ?? new Date().toISOString();
  const ttlSeconds =
    options.ttlSeconds ?? (options.ttlDays ?? 30) * 24 * 60 * 60;
  const expiresAt = new Date(Date.parse(now) + ttlSeconds * 1000).toISOString();
  const rawToken = randomBase64Url(TOKEN_BYTES);
  const csrfToken = randomBase64Url(TOKEN_BYTES);
  const tokenHash = await sha256Hex(rawToken);
  const session = await d1
    .prepare(
      `INSERT INTO sessions (contributor_id, token_hash, csrf_token, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       RETURNING id, contributor_id AS contributorId, token_hash AS tokenHash, csrf_token AS csrfToken, created_at AS createdAt, expires_at AS expiresAt, revoked_at AS revokedAt`,
    )
    .bind(contributorId, tokenHash, csrfToken, now, expiresAt)
    .first<Session>();
  if (!session) throw new Error("Session could not be created");
  return { rawToken, csrfToken, session };
}

/**
 * Resolve a raw session token to a live session plus its contributor.
 * Returns null for unknown, revoked, or expired sessions — the only three
 * ways a presented token can be dead.
 */
export async function findSessionByToken(
  rawToken: string,
  now: string = new Date().toISOString(),
): Promise<SessionWithContributor | null> {
  const d1 = await getD1();
  const tokenHash = await sha256Hex(rawToken);
  const row = await d1
    .prepare(
      `SELECT s.id, s.contributor_id AS sessionContributorId, s.token_hash AS tokenHash, s.csrf_token AS csrfToken,
              s.created_at AS createdAt, s.expires_at AS expiresAt, s.revoked_at AS revokedAt,
              c.id AS contributorId, c.email AS email, c.display_name AS displayName,
              c.email_verified_at AS emailVerifiedAt, c.auth_provider AS authProvider,
              c.created_at AS contributorCreatedAt, c.updated_at AS contributorUpdatedAt
       FROM sessions s JOIN contributors c ON c.id = s.contributor_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{
      id: number;
      sessionContributorId: number;
      tokenHash: string;
      csrfToken: string;
      createdAt: string;
      expiresAt: string;
      revokedAt: string | null;
      contributorId: number;
      email: string;
      displayName: string | null;
      emailVerifiedAt: string | null;
      authProvider: string;
      contributorCreatedAt: string;
      contributorUpdatedAt: string;
    }>();
  if (!row) return null;
  if (row.revokedAt !== null) return null;
  if (row.expiresAt <= now) return null;
  return {
    id: row.id,
    contributorId: row.sessionContributorId,
    tokenHash: row.tokenHash,
    csrfToken: row.csrfToken,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    contributor: {
      id: row.contributorId,
      email: row.email,
      displayName: row.displayName,
      emailVerifiedAt: row.emailVerifiedAt,
      authProvider: row.authProvider,
      createdAt: row.contributorCreatedAt,
      updatedAt: row.contributorUpdatedAt,
    },
  };
}

/** Revoke a session (logout). Returns false when the token is already dead. */
export async function revokeSession(rawToken: string, now: string = new Date().toISOString()): Promise<boolean> {
  const d1 = await getD1();
  const tokenHash = await sha256Hex(rawToken);
  const result = await d1
    .prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(now, tokenHash)
    .run() as { meta: { changes: number } };
  return result.meta.changes > 0;
}

// ---------------------------------------------------------------------------
// Write gate (multi-method auth Fase E1): contributor verification state
// ---------------------------------------------------------------------------

/**
 * The verification state the write gate checks (migration 0027,
 * multi-method auth Fase A). `email_verified_at` is the SINGLE source of
 * truth for "can this account write?": NULL means the account is not yet
 * verified and every state-changing write is refused, no matter how the
 * account was created (password, passkey or OIDC — Fase C/D set the same
 * column once the external identity is accepted).
 */
export type ContributorVerification = {
  id: number;
  emailVerifiedAt: string | null;
  /** Registration method: 'password' | 'passkey' | 'github' | 'google'. */
  authProvider: string;
};

/**
 * Read a contributor's verification state for the write gate
 * (app/lib/write-gate.ts). Returns null when the account no longer exists
 * (erased between the session read and this check) — the caller treats
 * that exactly like an anonymous request.
 */
export async function getContributorVerification(
  contributorId: number,
): Promise<ContributorVerification | null> {
  const d1 = await getD1();
  return d1
    .prepare(
      "SELECT id, email_verified_at AS emailVerifiedAt, auth_provider AS authProvider FROM contributors WHERE id = ?",
    )
    .bind(contributorId)
    .first<ContributorVerification>();
}

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
// Send throttling is a COUNT over rows created inside the window (per
// contributor + purpose): each send creates exactly one row, so "3 sends per
// hour" is a COUNT <= 3 — no separate counter table, and the count is immune
// to tokens being consumed or revoked in between. Register, re-send and
// reset-request all funnel through `countVerificationTokensSentSince`.

/** TTL for email-address verification links (registration + re-send). */
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** TTL for password-reset links — shorter window, higher-stakes purpose. */
export const RESET_TOKEN_TTL_MS = 3 * 60 * 60 * 1000;

/** Per-purpose TTL, so callers cannot accidentally mix the two windows. */
export const TOKEN_TTL_MS_BY_PURPOSE: Record<EmailVerificationPurpose, number> = {
  verify: VERIFICATION_TOKEN_TTL_MS,
  reset: RESET_TOKEN_TTL_MS,
};
/** Max emails (verify or reset, each with its own budget) per window. */
export const VERIFICATION_SEND_LIMIT = 3;
export const VERIFICATION_SEND_WINDOW_MS = 60 * 60 * 1000;

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
 * How many tokens of a purpose were CREATED for a contributor inside the
 * window ending at `now` — the send budget (default 3/h). Every send creates
 * a row, so this count is exact regardless of consumption/revocation.
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
 * The PBKDF2 hash embeds its own iteration count, so a newer constant never
 * locks the account out on the next login (ADR 0013).
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

// ---------------------------------------------------------------------------
// Contributor's own submissions
// ---------------------------------------------------------------------------

/**
 * The reports a contributor submitted (attributed rows only). Used by the
 * account page; anonymous submissions are never attributable, by design.
 */
export async function listContributorSubmissions(contributorId: number): Promise<ContributorSubmission[]> {
  const d1 = await getD1();
  const result = await d1
    .prepare(
      "SELECT id, title, status, created_at AS createdAt FROM cameras WHERE contributor_id = ? ORDER BY created_at DESC, id DESC LIMIT 50",
    )
    .bind(contributorId)
    .all<ContributorSubmission>();
  return result.results;
}

// ---------------------------------------------------------------------------
// Contributor's own contributions (COMMUNITY_PLAN §2.3, C2)
// ---------------------------------------------------------------------------

/** The two contribution kinds the profile list can filter on. */
export const CONTRIBUTION_TYPES = ["camera", "correction"] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

/** Whitelist of contribution statuses accepted by the profile list filter. */
export const CONTRIBUTION_STATUSES = [
  "pending",
  // Post-migration 0039 the public camera domain status is "active"
  // (verified/needs_review/stale → active, rejected → removed); the legacy
  // "verified" key stays in the whitelist only for historical queries.
  "active",
  "verified",
  "needs_review",
  "stale",
  "rejected",
  "removed",
  "reviewed",
  "approved",
] as const;

/** One row of the paginated profile contributions list (C2). */
export type ContributorContribution = {
  type: ContributionType;
  id: number;
  /** camera: title; correction: null (no public title of their own). */
  title: string | null;
  /** correction: issue_type; camera: null. */
  issueType: string | null;
  /** correction: linked camera; camera: null (it is the camera). */
  cameraId: number | null;
  status: string;
  createdAt: string;
};

export type ContributionsPage = {
  contributions: ContributorContribution[];
  /** Total number of rows matching the filters, independent of the page. */
  total: number;
};

/**
 * Paginated profile contributions list (COMMUNITY_PLAN §2.3, C2).
 *
 * Replaces the old LIMIT-50 `listContributorSubmissions` (kept for backward
 * compatibility) with a bounded, filterable list over the two contribution
 * kinds: attributed camera reports and filed corrections.
 * Only rows attributed to the caller are ever returned; anonymous
 * submissions are not attributable and therefore never listed.
 *
 * `type` (whitelist) restricts to one kind, `status` (whitelist) to one
 * status. `limit` is clamped to [1, 100] and `offset` to >= 0 at the db
 * boundary, so a caller can never request an unbounded page. The ORDER BY
 * (created_at DESC, id DESC) matches the old submissions ordering and is
 * served by the (contributor_id, created_at DESC) index added in migration
 * 0025 for cameras; correction_requests already carries a
 * (contributor_id) index from migration 0022.
 */
export async function listContributorContributions(
  contributorId: number,
  filters: {
    type?: ContributionType;
    status?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<ContributionsPage> {
  const d1 = await getD1();
  // Defensive clamp: the route already validates, but the db boundary never
  // trusts its caller with an unbounded page size.
  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 25) || 25, 1), 100);
  const offset = Math.max(Math.trunc(filters.offset ?? 0) || 0, 0);

  const types: ContributionType[] = filters.type ? [filters.type] : [...CONTRIBUTION_TYPES];
  const status = filters.status ?? null;

  // One UNION ALL over the two contribution tables: each branch projects
  // the shared shape (type, id, title, issue_type, camera_id, status,
  // created_at) with NULLs for the columns the table does not have. The
  // per-branch contributor_id predicate plus the global ORDER BY keep the
  // whole list time-consistent and index-friendly.
  const branches: string[] = [];
  const parameters: (string | number)[] = [];
  for (const type of types) {
    const params: (string | number)[] = [contributorId];
    if (status) params.push(status);
    switch (type) {
      case "camera":
        branches.push(
          `SELECT 'camera' AS type, id, title, NULL AS issueType, NULL AS cameraId, status, created_at AS createdAt FROM cameras WHERE contributor_id = ?${status ? " AND status = ?" : ""}`,
        );
        break;
      case "correction":
        branches.push(
          `SELECT 'correction' AS type, id, NULL AS title, issue_type AS issueType, camera_id AS cameraId, status, created_at AS createdAt FROM correction_requests WHERE contributor_id = ?${status ? " AND status = ?" : ""}`,
        );
        break;
    }
    parameters.push(...params);
  }

  // Total matching rows (same predicate, no page) for the pagination object.
  const countParameters = [...parameters];
  const countResult = await d1
    .prepare(`SELECT COUNT(*) AS n FROM (${branches.join(" UNION ALL ")})`)
    .bind(...countParameters)
    .first<{ n: number }>();
  const total = Number(countResult?.n ?? 0);

  if (total === 0) {
    return { contributions: [], total: 0 };
  }

  const pageParameters = [...parameters, limit, offset];
  const page = await d1
    .prepare(`${branches.join(" UNION ALL ")} ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...pageParameters)
    .all<ContributorContribution>();
  return { contributions: page.results, total };
}

// ---------------------------------------------------------------------------
// Contribution summary (account page stats, C7 rework 2026-08-08)
// ---------------------------------------------------------------------------

/** Global per-type and per-status counts for the caller's own contributions. */
export type ContributionSummary = {
  total: number;
  byType: Record<ContributionType, number>;
  byStatus: Record<string, number>;
};

/**
 * One grouped query over the two contribution tables — global totals,
 * INDEPENDENT of any list filter, so the account page can render the
 * summary strip ("X in moderation · Y published …") without an extra
 * endpoint. Anonymous rows (contributor_id NULL) never count: the profile
 * list shows only attributed contributions (ADR 0013).
 */
export async function summarizeContributorContributions(contributorId: number): Promise<ContributionSummary> {
  const d1 = await getD1();
  const result = await d1
    .prepare(
      `SELECT type, status, COUNT(*) AS n FROM (
        SELECT 'camera' AS type, status FROM cameras WHERE contributor_id = ?
        UNION ALL
        SELECT 'correction', status FROM correction_requests WHERE contributor_id = ?
      ) GROUP BY type, status`,
    )
    .bind(contributorId, contributorId)
    .all<{ type: ContributionType; status: string; n: number }>();

  const summary: ContributionSummary = {
    total: 0,
    byType: { camera: 0, correction: 0 },
    byStatus: {},
  };
  for (const row of result.results) {
    const n = Number(row.n) || 0;
    summary.total += n;
    summary.byType[row.type] = (summary.byType[row.type] ?? 0) + n;
    summary.byStatus[row.status] = (summary.byStatus[row.status] ?? 0) + n;
  }
  return summary;
}

/**
 * Count the contributor's active camera reports — the ONLY number that
 * feeds the trust level (ADR 0018 §3, ADR 0021 §12.1: after migration 0039
 * the domain status is "active"). The (contributor_id, status) index from
 * migration 0023 makes this an index-only COUNT. Kept as
 * `countVerifiedCameras` for backward compatibility; the name remains the
 * same for existing importers.
 */
export async function countVerifiedCameras(contributorId: number): Promise<number> {
  const d1 = await getD1();
  const result = await d1
    .prepare("SELECT COUNT(*) AS n FROM cameras WHERE contributor_id = ? AND status = 'active'")
    .bind(contributorId)
    .first<{ n: number }>();
  return Number(result?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Account erasure (RETENTION_SCHEDULE R7, TERMS §15 pre-launch item)
// ---------------------------------------------------------------------------

export type ErasureResult = {
  /** Whether a contributor row with this id existed and was hard-deleted. */
  deleted: boolean;
  /** Number of attributed reports that were de-attributed to anonymous. */
  deattributedReports: number;
  /** Number of community verifications given/received that were hard-deleted. */
  deletedConfirmations: number;
  /** Number of correction reports de-attributed to anonymous (SET NULL). */
  deattributedCorrections: number;
};

/**
 * Erase a contributor account (GDPR art. 17 erasure path, R7; community data
 * ADR 0018 §6.2).
 *
 * De-attribution is EXPLICIT, not FK-driven: `cameras.contributor_id` has no
 * ON DELETE action on purpose, so the only way to remove a contributor who
 * owns reports is this function — which first severs the attribution, then
 * revokes every session, then hard-deletes the account. The reported data
 * itself stays published: only the link between the account and its reports
 * is removed (RETENTION_SCHEDULE R7: "on verified records kept as
 * provenance … as long as the record is public"; the anonymous report keeps
 * its public fields, `contributor_id` becomes NULL).
 *
 * Community data (ADR 0018 §6.2): verifications *given* to other records are
 * hard-deleted — they were the contributor's own data, art. 17 — and the
 * verification count on every record drops back. Verifications *received*
 * by the erased account disappear with it. `camera_edit_requests` and
 * `correction_requests` are de-attributed with SET NULL, never deleted: the
 * requests (audit trail) survive, unlinked. `cameras` are never touched
 * beyond the existing de-attribution (the ADR 0013 pattern).
 *
 * The statements run as one atomic batch: a failure in any step rolls back
 * the whole erasure, so an account is never left half-deleted (e.g. sessions
 * gone but reports still attributed, or verifications deleted but the
 * contributor row surviving).
 *
 * Auth artifacts are hard-deleted explicitly, in the same batch: passkeys,
 * recovery codes, email-verification tokens, the transactional-email send
 * log, WebAuthn ceremony challenges, pending OIDC merge requests and API
 * keys (EPIC api-keys, D9) are the contributor's own data (art. 17), and
 * each of those tables declares ON DELETE CASCADE on `contributors.id` —
 * mirrored here because the test harness does not enforce foreign keys
 * (P2-2, t_adfc121b; same rule as `sessions` and `camera_community_actions`).
 * `oidc_states` is NOT included: it is pre-auth state with no contributor
 * link.
 *
 * Returns the number of reports de-attributed, community actions deleted
 * (ADR 0021 §13.1) and correction reports de-attributed (for the erasure
 * response and the audit trail) and whether the account row existed at all.
 */
export async function eraseContributor(contributorId: number): Promise<ErasureResult> {
  const d1 = await getD1();

  // A contributor that never existed (or was already erased) is a no-op:
  // nothing to de-attribute, nothing to delete.
  const existing = await d1
    .prepare("SELECT COUNT(*) AS n FROM contributors WHERE id = ?")
    .bind(contributorId)
    .first<{ n: number }>();
  if (Number(existing?.n ?? 0) === 0) {
    return { deleted: false, deattributedReports: 0, deletedConfirmations: 0, deattributedCorrections: 0 };
  }

  const attributed = await d1
    .prepare("SELECT COUNT(*) AS n FROM cameras WHERE contributor_id = ?")
    .bind(contributorId)
    .first<{ n: number }>();
  const deattributedReports = Number(attributed?.n ?? 0);
  const confirmations = await d1
    .prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE contributor_id = ?")
    .bind(contributorId)
    .first<{ n: number }>();
  // ADR 0021 §13.1: the contributor's community actions are their own data
  // (art. 17) — all types (confirm/like/gone/problem/privacy) are hard
  // deleted. The response field keeps the legacy name `deletedConfirmations`
  // for API compatibility; it now counts every deleted action row.
  const deletedConfirmations = Number(confirmations?.n ?? 0);
  const corrections = await d1
    .prepare("SELECT COUNT(*) AS n FROM correction_requests WHERE contributor_id = ?")
    .bind(contributorId)
    .first<{ n: number }>();
  const deattributedCorrections = Number(corrections?.n ?? 0);

  await d1.batch([
    // Community actions (ADR 0021 §13.1) are the contributor's own data
    // (art. 17): the rows are hard-deleted. Their influence on thresholds
    // and counts ends immediately — counts are recomputed live. Transitions
    // that already happened stay in history (aggregate, unattributed — no
    // personal data in camera_lifecycle_events).
    d1.prepare("DELETE FROM camera_community_actions WHERE contributor_id = ?").bind(contributorId),
    // Contribution-edit requests: SET NULL, never delete — the edit request
    // (and its moderation trail) survives, unlinked (audit, ADR 0018 §6.2).
    d1.prepare("UPDATE camera_edit_requests SET contributor_id = NULL WHERE contributor_id = ?").bind(contributorId),
    // Correction reports: SET NULL, never delete (same rule as cameras).
    d1.prepare("UPDATE correction_requests SET contributor_id = NULL WHERE contributor_id = ?").bind(contributorId),
    d1.prepare("UPDATE cameras SET contributor_id = NULL WHERE contributor_id = ?").bind(contributorId),
    // Role-identity link (audit t_5ca60ab2, P2): sever the explicit
    // users.contributor_id mapping so the users row (an independently
    // provisioned role identity) survives, but can no longer attribute
    // appeals to the erased contributor.
    d1.prepare("UPDATE users SET contributor_id = NULL WHERE contributor_id = ?").bind(contributorId),
    // Explicit auth-artifact deletion, mirroring the session rule below:
    // every table that references contributors with ON DELETE CASCADE is
    // deleted HERE, in the app layer, because the test harness does not
    // enforce FKs (real D1 would cascade on the contributor delete). Left
    // to the cascade alone, the in-memory harness leaves orphan rows and
    // the erasure contract is not actually exercised (P2-2, t_adfc121b).
    // Passkeys: the authenticator credential is the contributor's own
    // data (art. 17) — after erasure no ceremony may resolve it.
    d1.prepare("DELETE FROM passkeys WHERE contributor_id = ?").bind(contributorId),
    // Recovery codes: hashed single-use codes, own data — hard-deleted.
    d1.prepare("DELETE FROM recovery_codes WHERE contributor_id = ?").bind(contributorId),
    // Verification tokens: hashed, single-use — own data, hard-deleted.
    d1.prepare("DELETE FROM email_verification_tokens WHERE contributor_id = ?").bind(contributorId),
    // Transactional-email send log: rate-limit rows (no content, no
    // recipient) — own data, hard-deleted.
    d1.prepare("DELETE FROM email_send_log WHERE contributor_id = ?").bind(contributorId),
    // WebAuthn ceremony challenges: hashed challenges, own data. The
    // column is nullable, so the WHERE also covers challenge rows whose
    // contributor was never linked (no-op).
    d1.prepare("DELETE FROM webauthn_challenges WHERE contributor_id = ?").bind(contributorId),
    // Pending OIDC merge requests: single-use merge tokens bound to the
    // account — own data, hard-deleted (an unmergeable account must not
    // leave a live token behind).
    d1.prepare("DELETE FROM oidc_merge_requests WHERE contributor_id = ?").bind(contributorId),
    // API keys (EPIC api-keys, D9): the contributor's private write keys are
    // their own data (art. 17) — SHA-256 hashes and display prefixes are
    // hard-deleted so no ceremony or gate can ever resolve them after
    // erasure. Mirrors the ON DELETE CASCADE on api_keys.contributor_id
    // (same no-FK harness rule as the rows above).
    d1.prepare("DELETE FROM api_keys WHERE contributor_id = ?").bind(contributorId),
    // Explicit session revocation, mirroring logout: after erasure no
    // session of this contributor may resolve, in every environment
    // (real D1 would cascade on contributor delete, but the test harness
    // does not enforce FKs, so the app layer must be the source of truth).
    d1.prepare("DELETE FROM sessions WHERE contributor_id = ?").bind(contributorId),
    d1.prepare("DELETE FROM contributors WHERE id = ?").bind(contributorId),
  ]);

  return { deleted: true, deattributedReports, deletedConfirmations, deattributedCorrections };
}
