/**
 * Bearer API-key authentication bridge (EPIC api-keys, T10, plan §1.4,
 * decisions D1-D13).
 *
 * Pure module: no `cloudflare:workers` import and no db side effect at
 * module scope — the db functions it needs (`sha256Hex` from db/auth,
 * `findApiKeyByHash` / `touchApiKeyLastUsed` from db/api-keys) are plain
 * imports that the test harnesses transpile against an injectable
 * `cloudflare:workers` env, exactly like app/lib/auth-session.ts resolves
 * `findSessionByToken`. The file itself stays runnable in plain Node.
 *
 * Pipeline (task body): `Authorization: Bearer <rawKey>` → SHA-256 hex (D3)
 * → `findApiKeyByHash` (JOIN contributors + liveness: revoked/expired keys
 * are dead even if the hash is presented, D6/D9) → `{ apiKey, contributor }`
 * → throttled `touchApiKeyLastUsed` (≥5 min, D7) on success.
 *
 * Uniform-401 doctrine (no enumeration oracle, plan §2.1/R2): every failure
 * mode collapses to ONE `null` return — absent header, non-Bearer scheme,
 * malformed value, empty token, unknown hash, revoked key, expired key. The
 * write gate (T11) maps that single null to ONE canonical 401
 * (`WRITE_GATE_ERROR`), so a caller can never tell "no credential" from
 * "wrong key" from "revoked key" by the response. The gate distinguishes
 * "no Authorization at all" (→ existing session path) from "present but
 * invalid" (→ 401, fail-closed: a machine client that believed it was
 * authenticating must never silently fall through to a session) by calling
 * `parseBearerToken` first and then checking `request.headers.has(
 * "authorization")` — the two exported functions here cover both halves.
 *
 * No personal data is written by this module beyond the throttled
 * `last_used_at` touch (D7) of the presented key's own row.
 *
 * Query-string credential guard (ADR 0023): `rejectQueryCredentials` answers
 * a generic 400 BEFORE any authentication work when the request URL carries
 * an unambiguous credential parameter (`api_key`/`apikey`/`key`,
 * case-insensitive) — a key smuggled in the URL would leak into proxy/access
 * logs and Referer headers. The body never echoes the value (anti-logging,
 * anti-enumeration); the write gate and the /api/auth/keys handlers call it
 * first.
 */

import { findApiKeyByHash, touchApiKeyLastUsed, type ApiKey, type ApiKeyContributor } from "../../db/api-keys";
import { sha256Hex } from "../../db/auth";

/** A successful key resolution: the live key plus its owning contributor. */
export type ApiKeyAuthResult = {
  apiKey: ApiKey;
  contributor: ApiKeyContributor;
};

/**
 * Unambiguous query-parameter names that carry credentials (ADR 0023),
 * lowercase for the case-insensitive match. `apiKey` lowercases to `apikey`
 * (the JS camelCase spelling is covered by the same entry). Deliberately
 * small: only names that are unambiguous credential carriers are rejected,
 * so unrelated query params on the same URL never trip the guard.
 */
const QUERY_CREDENTIAL_NAMES = new Set(["api_key", "apikey", "key"]); // case-insensitive; apiKey lowercases to apikey

/**
 * Reject credentials smuggled in the query string BEFORE any authentication
 * work (ADR 0023): returns a generic 400 `Response` (Cache-Control:
 * no-store) when the request URL carries a credential-named query param, or
 * null to let the request proceed.
 *
 * Only NAMES are inspected (`params.keys()` — values are never read,
 * reflected or logged), and every rejected name answers the SAME generic
 * body (anti-enumeration: a caller cannot learn which param tripped the
 * guard, and the credential value never leaks into a response).
 */
export function rejectQueryCredentials(request: Request): Response | null {
  const params = new URL(request.url).searchParams;
  for (const name of params.keys()) {
    // iterate NAMES only, never the values
    if (QUERY_CREDENTIAL_NAMES.has(name.toLowerCase())) {
      return Response.json(
        { error: "API credentials in the query string are not accepted." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  return null;
}

/**
 * Parse the `Authorization` header as exactly one `Bearer <token>`
 * credential (RFC 7235; the auth-scheme is case-insensitive, so `bearer`
 * and `Bearer` are equivalent).
 *
 * Returns the token string, or null when the request carries NO
 * `Authorization` header OR a header that is not the single-scheme Bearer
 * form — Basic/Digest, a multi-token value (`Bearer a b`), a bare `Bearer`
 * with no token, or an empty token all return null. Every null collapses to
 * the uniform 401 upstream (see module doc), so the parser never leaks
 * which malformation it saw.
 *
 * The token is captured verbatim (no trimming of the token itself): raw
 * keys are exact strings, and normalising them here would enable
 * confusion. The D2 `osdb_` format is deliberately NOT checked — the
 * SHA-256 lookup (D3) is the only arbiter, and a format check would be an
 * oracle on key shape.
 */
export function parseBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null) return null;
  // Leading/trailing optional whitespace tolerated (the fetch parser
  // already trims OWS around the value; the guards are for odd clients);
  // the token itself is any non-whitespace run, followed by nothing else.
  const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

/**
 * Resolve the request's Bearer credential to a live API key and its owning
 * contributor, or return null (uniform 401 upstream).
 *
 * Chain: `parseBearerToken` → SHA-256 hex (D3) → `findApiKeyByHash` (JOIN
 * contributors + liveness: revoked/expired dead, D6/D9) → success. On
 * success the key's `last_used_at` is touched through the throttled writer
 * (D7: at most one write per 5 minutes per key); the touch's return value
 * is deliberately ignored — being throttled (or losing the write) never
 * fails an otherwise-valid authentication, and a `now` injectable keeps the
 * throttle deterministic in tests (same convention as findApiKeyByHash).
 *
 * `now` is ISO-8601 UTC TEXT, compared like-for-like with the stored
 * timestamps (D7 — never SQLite `datetime('now')`).
 */
export async function resolveApiKeyContributor(
  request: Request,
  now: string = new Date().toISOString(),
): Promise<ApiKeyAuthResult | null> {
  const token = parseBearerToken(request);
  if (token === null) return null;

  const hash = await sha256Hex(token);
  const resolved = await findApiKeyByHash(hash, now);
  if (resolved === null) return null;

  // Throttled touch on success (D7): skip when the last write is <5 min old.
  await touchApiKeyLastUsed(resolved.key.id, now);

  return { apiKey: resolved.key, contributor: resolved.contributor };
}
