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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Contributor = {
  id: number;
  email: string;
  displayName: string | null;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

/** What the API ever returns: the password hash never leaves the db layer. */
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
  "id, email, display_name AS displayName, password_hash AS passwordHash, created_at AS createdAt, updated_at AS updatedAt";

const publicContributorColumns =
  "id, email, display_name AS displayName, created_at AS createdAt, updated_at AS updatedAt";

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
 */
export async function authenticateContributor(
  email: string,
  password: string,
): Promise<PublicContributor | null> {
  const contributor = await findContributorByEmail(email);
  if (!contributor) return null;
  const valid = await verifyPassword(password, contributor.passwordHash);
  if (!valid) return null;
  return {
    id: contributor.id,
    email: contributor.email,
    displayName: contributor.displayName,
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
 * database. `ttlDays` defaults to 30; `now` is injectable for deterministic
 * tests.
 */
export async function createSession(
  contributorId: number,
  options: { ttlDays?: number; now?: string } = {},
): Promise<NewSession> {
  const d1 = await getD1();
  const now = options.now ?? new Date().toISOString();
  const ttlDays = options.ttlDays ?? 30;
  const expiresAt = new Date(Date.parse(now) + ttlDays * 24 * 60 * 60 * 1000).toISOString();
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

/** The three contribution kinds the profile list can filter on. */
export const CONTRIBUTION_TYPES = ["camera", "correction", "photo"] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

/** Whitelist of contribution statuses accepted by the profile list filter. */
export const CONTRIBUTION_STATUSES = [
  "pending",
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
  /** camera: title; correction/photo: null (no public title of their own). */
  title: string | null;
  /** correction: issue_type; camera/photo: null. */
  issueType: string | null;
  /** correction/photo: linked camera; camera: null (it is the camera). */
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
 * compatibility) with a bounded, filterable list over the three contribution
 * kinds: attributed camera reports, filed corrections, and photo uploads.
 * Only rows attributed to the caller are ever returned; anonymous
 * submissions are not attributable and therefore never listed.
 *
 * `type` (whitelist) restricts to one kind, `status` (whitelist) to one
 * status. `limit` is clamped to [1, 100] and `offset` to >= 0 at the db
 * boundary, so a caller can never request an unbounded page. The ORDER BY
 * (created_at DESC, id DESC) matches the old submissions ordering and is
 * served by the (contributor_id, created_at DESC) index added in migration
 * 0025 for cameras and photos; correction_requests already carries a
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

  // One UNION ALL over the three contribution tables: each branch projects
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
      case "photo":
        branches.push(
          `SELECT 'photo' AS type, id, NULL AS title, NULL AS issueType, camera_id AS cameraId, status, created_at AS createdAt FROM photos WHERE contributor_id = ?${status ? " AND status = ?" : ""}`,
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

/**
 * Count the contributor's verified camera reports — the ONLY number that
 * feeds the trust level (ADR 0018 §3, COMMUNITY_PLAN §3.1: "contano solo i
 * record status='verified'"). The (contributor_id, status) index from
 * migration 0023 makes this an index-only COUNT.
 */
export async function countVerifiedCameras(contributorId: number): Promise<number> {
  const d1 = await getD1();
  const result = await d1
    .prepare("SELECT COUNT(*) AS n FROM cameras WHERE contributor_id = ? AND status = 'verified'")
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
 * Returns the number of reports de-attributed, community verifications
 * deleted and correction reports de-attributed (for the erasure response and
 * the audit trail) and whether the account row existed at all.
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
    .prepare("SELECT COUNT(*) AS n FROM camera_confirmations WHERE contributor_id = ?")
    .bind(contributorId)
    .first<{ n: number }>();
  const deletedConfirmations = Number(confirmations?.n ?? 0);
  const corrections = await d1
    .prepare("SELECT COUNT(*) AS n FROM correction_requests WHERE contributor_id = ?")
    .bind(contributorId)
    .first<{ n: number }>();
  const deattributedCorrections = Number(corrections?.n ?? 0);

  await d1.batch([
    // Community verifications are the contributor's own data (art. 17): the
    // rows are hard-deleted. The count drops back on every public record.
    d1.prepare("DELETE FROM camera_confirmations WHERE contributor_id = ?").bind(contributorId),
    // Contribution-edit requests: SET NULL, never delete — the edit request
    // (and its moderation trail) survives, unlinked (audit, ADR 0018 §6.2).
    d1.prepare("UPDATE camera_edit_requests SET contributor_id = NULL WHERE contributor_id = ?").bind(contributorId),
    // Correction reports: SET NULL, never delete (same rule as cameras).
    d1.prepare("UPDATE correction_requests SET contributor_id = NULL WHERE contributor_id = ?").bind(contributorId),
    d1.prepare("UPDATE cameras SET contributor_id = NULL WHERE contributor_id = ?").bind(contributorId),
    // Explicit session revocation, mirroring logout: after erasure no
    // session of this contributor may resolve, in every environment
    // (real D1 would cascade on contributor delete, but the test harness
    // does not enforce FKs, so the app layer must be the source of truth).
    d1.prepare("DELETE FROM sessions WHERE contributor_id = ?").bind(contributorId),
    d1.prepare("DELETE FROM contributors WHERE id = ?").bind(contributorId),
  ]);

  return { deleted: true, deattributedReports, deletedConfirmations, deattributedCorrections };
}
