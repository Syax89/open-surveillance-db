import { getD1 } from "../cameras";
import { TOKEN_BYTES, randomBase64Url, sha256Hex } from "./crypto";
import type { Session, SessionWithContributor } from "./types";

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
