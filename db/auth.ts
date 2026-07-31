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

async function derivePasswordKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
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
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    PBKDF2_KEY_LENGTH * 8,
  );
  return new Uint8Array(derived);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await derivePasswordKey(password, salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  const salt = base64UrlToBytes(parts[2]);
  const expected = parts[3];
  try {
    const derived = await derivePasswordKey(password, salt);
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
// Account erasure (RETENTION_SCHEDULE R7, TERMS §15 pre-launch item)
// ---------------------------------------------------------------------------

export type ErasureResult = {
  /** Whether a contributor row with this id existed and was hard-deleted. */
  deleted: boolean;
  /** Number of attributed reports that were de-attributed to anonymous. */
  deattributedReports: number;
};

/**
 * Erase a contributor account (GDPR art. 17 erasure path, R7).
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
 * The three statements run as one atomic batch: a failure in any step rolls
 * back the whole erasure, so an account is never left half-deleted (e.g.
 * sessions gone but reports still attributed, or vice versa).
 *
 * Returns the number of reports de-attributed (for the erasure response and
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
    return { deleted: false, deattributedReports: 0 };
  }

  const attributed = await d1
    .prepare("SELECT COUNT(*) AS n FROM cameras WHERE contributor_id = ?")
    .bind(contributorId)
    .first<{ n: number }>();
  const deattributedReports = Number(attributed?.n ?? 0);

  await d1.batch([
    d1.prepare("UPDATE cameras SET contributor_id = NULL WHERE contributor_id = ?").bind(contributorId),
    // Explicit session revocation, mirroring logout: after erasure no
    // session of this contributor may resolve, in every environment
    // (real D1 would cascade on contributor delete, but the test harness
    // does not enforce FKs, so the app layer must be the source of truth).
    d1.prepare("DELETE FROM sessions WHERE contributor_id = ?").bind(contributorId),
    d1.prepare("DELETE FROM contributors WHERE id = ?").bind(contributorId),
  ]);

  return { deleted: true, deattributedReports };
}
