import { getD1 } from "./cameras";

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

/**
 * Count the contributor's ACTIVE keys (D5 cap, API_KEYS_MAX_PER_CONTRIBUTOR):
 * rows that are neither revoked nor expired. The mint endpoint answers 409
 * once the count reaches the cap, so the cap is enforced at the DB boundary
 * and a revoked/expired key frees its slot immediately.
 *
 * `now` is injectable for deterministic tests (same pattern as
 * listPublicCameras); the ISO-8601 UTC TEXT comparison is like-for-like with
 * the stored timestamps (never SQLite `datetime('now')`, D7).
 */
export async function countActiveKeys(
  contributorId: number,
  now: string = new Date().toISOString(),
): Promise<number> {
  const d1 = await getD1();
  const row = await d1
    .prepare(
      `SELECT COUNT(*) AS n FROM api_keys
       WHERE contributor_id = ? AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .bind(contributorId, now)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}
