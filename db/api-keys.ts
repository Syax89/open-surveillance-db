import { getD1 } from "./cameras";
import { randomBase64Url, sha256Hex } from "./auth";

/**
 * Per-contributor private write API keys (EPIC api-keys, decisions D1-D13
 * approved 2026-08-09 — docs/decisions/ADR 0022, migration 0045).
 *
 * The Drizzle table definition lives in db/schema.ts (single schema
 * reference, convention 0012/0014); it is re-exported here so the whole
 * api-keys surface is reachable from one module, mirroring how db/auth.ts
 * owns the contributor/session model.
 *
 * Security model (same rules as db/auth.ts, ADR 0013):
 *  - Only the SHA-256 hex of the raw key is stored (`key_hash`, globally
 *    UNIQUE); the raw key (`osdb_` + 32 random bytes base64url, D2) exists
 *    in exactly one API response (the mint POST, reveal-once).
 *  - `key_prefix` (first 10 chars) is the display-only handle; it never
 *    authenticates anything.
 *  - Scopes are family-level write grants (`submit`/`confirm`/`edit`/
 *    `action`, D4) stored as a JSON array; the whitelist is code-validated.
 *  - `revoked_at` soft-revokes; `expires_at` (NULL = never, default +365d
 *    at mint) hard-expires; both make a key dead even if its hash leaks.
 *  - `last_used_at` is throttled (≥5 min, D7) and ISO-8601 UTC TEXT — never
 *    SQLite `datetime('now')`.
 */
export { apiKeys } from "./schema";

export type ApiKeyScope = "submit" | "confirm" | "edit" | "action";

export type ApiKey = {
  id: number;
  contributorId: number;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

/** Write scopes a key can grant (D4): family-level, whitelist-validated. */
export const API_KEY_SCOPES: readonly ApiKeyScope[] = [
  "submit",
  "confirm",
  "edit",
  "action",
];

// ---------------------------------------------------------------------------
// Raw-key crypto helpers (T3, decisions D2/D3)
//
// The raw key is reveal-once: `osdb_` + 32 random bytes base64url (D2) exists
// in exactly one API response (the mint POST) and is NEVER stored — only its
// SHA-256 hex (D3, sha256Hex from ./auth) and the display-only prefix go to
// the database. Everything here is WebCrypto via the existing db/auth.ts
// helpers (randomBase64Url → crypto.getRandomValues, sha256Hex →
// crypto.subtle.digest); node:crypto is never used.
// ---------------------------------------------------------------------------

/** Raw-key prefix (D2): `osdb_` + 32 random bytes base64url. */
export const API_KEY_PREFIX = "osdb_";

/** Display-only `key_prefix` length in chars (D2): "osdb_" + 5 random chars. */
export const API_KEY_PREFIX_LENGTH = 10;

/** Random bytes in the raw key body (D2): 32 bytes ≈ 43 unpadded base64url chars. */
const API_KEY_RAW_BYTES = 32;

/**
 * Mint a fresh raw API key (D2). WebCrypto only — reuses randomBase64Url
 * from db/auth.ts (crypto.getRandomValues), never node:crypto.
 *
 * The caller must surface the raw value exactly once (the mint response,
 * Cache-Control: no-store) and persist only sha256Hex(rawKey) — see
 * derivePrefix for the display handle.
 */
export function mintRawKey(): string {
  return `${API_KEY_PREFIX}${randomBase64Url(API_KEY_RAW_BYTES)}`;
}

/**
 * Display-only handle for a raw key (D2): the first 10 chars. Never
 * authenticates anything — key resolution goes through the full SHA-256 hex
 * (D3, sha256Hex), so a leaked prefix alone cannot be replayed.
 */
export function derivePrefix(rawKey: string): string {
  return rawKey.slice(0, API_KEY_PREFIX_LENGTH);
}

/**
 * Count the contributor's ACTIVE keys (D5 cap, API_KEYS_MAX_PER_CONTRIBUTOR):
 * rows that are neither revoked nor expired. The mint endpoint enforces the
 * cap atomically inside `createApiKey` (see its `maxActive` guard), and a
 * revoked/expired key frees its slot immediately.
 *
 * `now` is injectable for deterministic tests (same pattern as
 * listPublicCameras). Liveness is judged by the INSTANT, not the string:
 * `julianday` parses ISO-8601 with offsets (legacy rows holding raw offset
 * text are judged correctly), and NULL expirations never expire (D6/D7).
 */
export async function countApiKeysForContributor(
  contributorId: number,
  now: string = new Date().toISOString(),
): Promise<number> {
  const d1 = await getD1();
  const row = await d1
    .prepare(
      `SELECT COUNT(*) AS n FROM api_keys
       WHERE contributor_id = ? AND revoked_at IS NULL
         AND (expires_at IS NULL OR julianday(expires_at) > julianday(?))`,
    )
    .bind(contributorId, now)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * @deprecated Renamed to `countApiKeysForContributor` (T5, plan §1.2). The
 * alias is kept so the T2-shipped surface keeps working; new code should
 * import the canonical name.
 */
export const countActiveKeys = countApiKeysForContributor;

// ---------------------------------------------------------------------------
// D5/D13 env knobs (EnvLike pattern — code defaults + optional env override,
// same shape as limitsFor in app/lib/rate-limit.ts; no wrangler `vars` block)
// ---------------------------------------------------------------------------

/** D5 default: max ACTIVE keys per contributor (env knob API_KEYS_MAX_PER_CONTRIBUTOR). */
export const API_KEYS_MAX_PER_CONTRIBUTOR_DEFAULT = 5;

/**
 * Effective cap of ACTIVE keys per contributor (D5). The mint endpoint
 * answers 409 once `countApiKeysForContributor` reaches this number; a
 * revoked or expired key frees its slot immediately (see
 * countApiKeysForContributor). The parameter is `unknown` (cast internally)
 * for the same reason as `limitsFor` in rate-limit.ts: Cloudflare's `Env`
 * has no string index signature, and this module must stay runnable in
 * plain Node.
 */
export function apiKeysMaxPerContributor(env: unknown): number {
  const value = Number((env as { [key: string]: unknown }).API_KEYS_MAX_PER_CONTRIBUTOR);
  return Number.isFinite(value) && value > 0 ? value : API_KEYS_MAX_PER_CONTRIBUTOR_DEFAULT;
}

// ---------------------------------------------------------------------------
// CRUD layer (T5, plan §1.2/§5.3, decisions D2-D7/D9)
//
// Raw key handling discipline: `createApiKey` is the ONLY place a raw key is
// minted and returned (reveal-once — the caller surfaces it in exactly one
// response, the mint POST). Everything else works on the SHA-256 hex (D3)
// and the display-only prefix (D2). All timestamps are ISO-8601 UTC TEXT
// generated with `new Date().toISOString()` and compared like-for-like —
// never SQLite `datetime('now')` (D7).
// ---------------------------------------------------------------------------

/** Default TTL at mint (D6): 365 days, unless an explicit `expiresAt` is given. */
const API_KEY_DEFAULT_TTL_DAYS = 365;

/** Minimum gap between `last_used_at` writes (D7): at least 5 minutes. */
const API_KEY_LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

export type CreateApiKeyInput = {
  contributorId: number;
  /** User label, 1..60 chars — trimmed and defensively clamped here. */
  name: string;
  /** Scope subset (D4); defaults to the full whitelist when omitted. */
  scopes?: readonly ApiKeyScope[];
  /**
   * ISO-8601 expiry. Omitted → `now` + API_KEY_DEFAULT_TTL_DAYS (D6);
   * explicit `null` → never expires. Anything else must parse as ISO-8601
   * (any offset is canonicalised to UTC Z before storage, D7).
   */
  expiresAt?: string | null;
  /**
   * D5 cap: when provided, the INSERT becomes one atomic conditional
   * statement (the COUNT and the INSERT are the same SQL) so concurrent
   * mints can never overshoot the cap. The result is `null` when the
   * atomic guard refused (cap reached); the route maps that to 409.
   */
  maxActive?: number;
  /** Injectable for deterministic tests (project convention). */
  now?: string;
};

/** A key row minus the stored hash: the list/GET surface never exposes it. */
export type ApiKeyListItem = Omit<ApiKey, "keyHash">;

/** The contributor a key resolves to (JOIN target for the write gate). */
export type ApiKeyContributor = {
  id: number;
  email: string;
  displayName: string | null;
  emailVerifiedAt: string | null;
  authProvider: string;
};

/** `findApiKeyByHash` result: the live key plus its owning contributor. */
export type ApiKeyWithContributor = {
  key: ApiKey;
  contributor: ApiKeyContributor;
};

/**
 * Mint a key for a contributor and persist it (D2/D3/D4/D6). The raw key is
 * returned exactly once — the caller must surface it in the mint response
 * and never store or log it; only the SHA-256 hex and the display-only
 * prefix land in the database.
 *
 * Defensive validation happens here too (whitelist scopes, name 1..60,
 * parseable expiry) because the db boundary never trusts its caller; the
 * mint endpoint runs the same checks first for a friendly 400.
 *
 * When `maxActive` is provided, the D5 cap is enforced ATOMICALLY inside
 * the INSERT: the conditional statement re-counts the contributor's ACTIVE
 * keys (revoked/expired excluded) in the same SQL that inserts, so two
 * concurrent mints can never both pass a stale count and overshoot. A
 * revoked or expired key frees its slot immediately. `null` is returned
 * when the atomic guard refuses (cap reached) — the caller maps that to
 * 409. Without `maxActive` the plain INSERT runs and a missing row throws
 * (current behaviour unchanged).
 */
export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<{ rawKey: string; key: ApiKey } | null> {
  const d1 = await getD1();
  const now = new Date(Date.parse(input.now ?? new Date().toISOString())).toISOString();

  const name = input.name.trim();
  if (name.length < 1 || name.length > 60) {
    throw new Error("API key name must be 1..60 characters");
  }

  const scopes = input.scopes ?? API_KEY_SCOPES;
  if (scopes.length === 0) throw new Error("API key needs at least one scope");
  for (const scope of scopes) {
    if (!API_KEY_SCOPES.includes(scope)) {
      throw new Error(`Unknown API key scope: ${scope}`);
    }
  }

  // Canonicalise the expiry BEFORE storing: `undefined` → `now` + 365d (D6),
  // explicit `null` → never, anything else must parse as ISO-8601 (any
  // offset is normalised to UTC Z, D7 — stored TEXT comparisons stay stable).
  let expiresAt: string | null;
  if (input.expiresAt === undefined) {
    expiresAt = new Date(Date.parse(now) + API_KEY_DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  } else if (input.expiresAt === null) {
    expiresAt = null;
  } else {
    const parsed = Date.parse(input.expiresAt);
    if (Number.isNaN(parsed)) {
      throw new Error("expiresAt must be ISO-8601 UTC or null");
    }
    expiresAt = new Date(parsed).toISOString();
  }

  const rawKey = mintRawKey();
  const keyHash = await sha256Hex(rawKey);
  const keyPrefix = derivePrefix(rawKey);
  const scopesJson = JSON.stringify([...scopes]);

  const key =
    input.maxActive === undefined
      ? await d1
          .prepare(
            `INSERT INTO api_keys (contributor_id, name, key_prefix, key_hash, scopes, created_at, last_used_at, expires_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)
             RETURNING id, contributor_id AS contributorId, name, key_prefix AS keyPrefix, key_hash AS keyHash,
                       scopes, created_at AS createdAt, last_used_at AS lastUsedAt,
                       expires_at AS expiresAt, revoked_at AS revokedAt`,
          )
          .bind(input.contributorId, name, keyPrefix, keyHash, scopesJson, now, expiresAt)
          .first<ApiKey>()
      : // D5 atomic cap: the COUNT of the contributor's active keys and the
        // INSERT are ONE statement, so no separable COUNT-then-INSERT race can
        // overshoot the cap (never in-memory locks). julianday judges expiry
        // by the instant, same as countApiKeysForContributor.
        await d1
          .prepare(
            `INSERT INTO api_keys (contributor_id, name, key_prefix, key_hash, scopes, created_at, last_used_at, expires_at, revoked_at)
             SELECT ?, ?, ?, ?, ?, ?, NULL, ?, NULL
             WHERE (SELECT COUNT(*) FROM api_keys
                    WHERE contributor_id = ? AND revoked_at IS NULL
                      AND (expires_at IS NULL OR julianday(expires_at) > julianday(?))) < ?
             RETURNING id, contributor_id AS contributorId, name, key_prefix AS keyPrefix, key_hash AS keyHash,
                       scopes, created_at AS createdAt, last_used_at AS lastUsedAt,
                       expires_at AS expiresAt, revoked_at AS revokedAt`,
          )
          .bind(
            input.contributorId,
            name,
            keyPrefix,
            keyHash,
            scopesJson,
            now,
            expiresAt,
            input.contributorId,
            now,
            input.maxActive,
          )
          .first<ApiKey>();

  if (!key) {
    // With the atomic guard, no returned row means the cap refused the
    // insert; without it a missing row is a genuine failure.
    if (input.maxActive !== undefined) return null;
    throw new Error("API key could not be created");
  }
  return { rawKey, key };
}

/**
 * Resolve a stored key by its SHA-256 hex (D3) with a JOIN to the owning
 * contributor, and apply the liveness check: a revoked or expired key is
 * dead even if its hash is presented. Returns null for the only three ways a
 * presented hash can be dead — unknown, revoked, expired — mirroring
 * `findSessionByToken` so the gate answers one uniform 401 (no oracle).
 */
export async function findApiKeyByHash(
  hash: string,
  now: string = new Date().toISOString(),
): Promise<ApiKeyWithContributor | null> {
  const d1 = await getD1();
  const row = await d1
    .prepare(
      `SELECT k.id, k.contributor_id AS keyContributorId, k.name, k.key_prefix AS keyPrefix,
              k.key_hash AS keyHash, k.scopes, k.created_at AS createdAt,
              k.last_used_at AS lastUsedAt, k.expires_at AS expiresAt, k.revoked_at AS revokedAt,
              c.id AS contributorId, c.email AS email, c.display_name AS displayName,
              c.email_verified_at AS emailVerifiedAt, c.auth_provider AS authProvider
       FROM api_keys k JOIN contributors c ON c.id = k.contributor_id
       WHERE k.key_hash = ?`,
    )
    .bind(hash)
    .first<{
      id: number;
      keyContributorId: number;
      name: string;
      keyPrefix: string;
      keyHash: string;
      scopes: string;
      createdAt: string;
      lastUsedAt: string | null;
      expiresAt: string | null;
      revokedAt: string | null;
      contributorId: number;
      email: string;
      displayName: string | null;
      emailVerifiedAt: string | null;
      authProvider: string;
    }>();
  if (!row) return null;
  if (row.revokedAt !== null) return null;
  // Liveness judged by the INSTANT (D6/D7): an offset-bearing stored expiry
  // that is temporally expired must be dead even when its raw string sorts
  // AFTER `now`. An unparseable stored expiry is treated as EXPIRED
  // (fail-closed — a corrupt row never widens access).
  const expires = row.expiresAt === null ? Number.POSITIVE_INFINITY : Date.parse(row.expiresAt);
  if (Number.isNaN(expires) || expires <= Date.parse(now)) return null;
  return {
    key: {
      id: row.id,
      contributorId: row.keyContributorId,
      name: row.name,
      keyPrefix: row.keyPrefix,
      keyHash: row.keyHash,
      scopes: row.scopes,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    },
    contributor: {
      id: row.contributorId,
      email: row.email,
      displayName: row.displayName,
      emailVerifiedAt: row.emailVerifiedAt,
      authProvider: row.authProvider,
    },
  };
}

/**
 * List one contributor's keys, metadata only (id, name, keyPrefix, scopes,
 * createdAt, lastUsedAt, expiresAt, revokedAt) — the hash is never exposed
 * (D2/D3). Includes revoked/expired rows so the account page can show the
 * full lifecycle ("Active"/"Revoked"); newest first.
 */
export async function listApiKeysForContributor(
  contributorId: number,
): Promise<ApiKeyListItem[]> {
  const d1 = await getD1();
  const result = await d1
    .prepare(
      `SELECT id, contributor_id AS contributorId, name, key_prefix AS keyPrefix,
              scopes, created_at AS createdAt, last_used_at AS lastUsedAt,
              expires_at AS expiresAt, revoked_at AS revokedAt
       FROM api_keys
       WHERE contributor_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
    .bind(contributorId)
    .all<ApiKeyListItem>();
  return result.results;
}

/**
 * Soft-revoke a key (D9): sets `revoked_at` only when the row belongs to the
 * caller and is still active. Idempotent — a second revoke (or a non-own /
 * unknown id) returns false, which the DELETE endpoint maps to the uniform
 * 404 so no existence oracle leaks.
 */
export async function revokeApiKey(
  id: number,
  contributorId: number,
  now: string = new Date().toISOString(),
): Promise<boolean> {
  const d1 = await getD1();
  const revokedAt = new Date(Date.parse(now)).toISOString();
  const result = await d1
    .prepare(
      "UPDATE api_keys SET revoked_at = ? WHERE id = ? AND contributor_id = ? AND revoked_at IS NULL",
    )
    .bind(revokedAt, id, contributorId)
    .run() as { meta: { changes: number } };
  return result.meta.changes > 0;
}

/**
 * Throttled `last_used_at` update (D7): writes only when the key was never
 * used or its previous write is at least 5 minutes old. The threshold is
 * `at` minus 5 minutes, compared like-for-like against the stored ISO-8601
 * UTC TEXT (never SQLite `datetime('now')`). Returns false when throttled or
 * when the id is unknown — the gate treats both as "skip the write".
 */
export async function touchApiKeyLastUsed(
  id: number,
  at: string = new Date().toISOString(),
): Promise<boolean> {
  const d1 = await getD1();
  // Canonicalise the instant to UTC Z before comparing (D7): an offset
  // variant of the same instant must throttle exactly like its Z form.
  const atCanonical = new Date(Date.parse(at)).toISOString();
  const threshold = new Date(Date.parse(atCanonical) - API_KEY_LAST_USED_THROTTLE_MS).toISOString();
  const result = await d1
    .prepare(
      `UPDATE api_keys SET last_used_at = ?
       WHERE id = ? AND (last_used_at IS NULL OR julianday(last_used_at) <= julianday(?))`,
    )
    .bind(atCanonical, id, threshold)
    .run() as { meta: { changes: number } };
  return result.meta.changes > 0;
}
