import { env } from "cloudflare:workers";
import {
  API_KEY_SCOPES,
  apiKeysMaxPerContributor,
  countApiKeysForContributor,
  createApiKey,
  listApiKeysForContributor,
  type ApiKeyScope,
} from "../../../../db/api-keys";
import { authLimit, sessionLimit } from "../../../lib/auth-route-helpers";
import { malformedSessionCookieGuard, resolveOptionalContributor } from "../../../lib/auth-session";
import { csrfVerified, sameOrigin } from "../../../lib/csrf";
import { isRecord } from "../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../lib/input-limits";
import { requireVerifiedContributor } from "../../../lib/write-gate";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

/**
 * POST /api/auth/keys — mint a private write API key (EPIC api-keys, T7,
 * plan §1.3/§5.3, decisions D2/D4/D5/D6/D13).
 *
 * The ONLY endpoint that ever sees the raw key (reveal-once, D2/P1-2): the
 * mint response carries `key` exactly once and nothing else does — storage
 * keeps only the SHA-256 hex (D3) and the display-only prefix, and every
 * later surface (list/revoke) exposes metadata only. The response is
 * `Cache-Control: no-store` so the secret can never be cached by an edge or
 * browser.
 *
 * Guard order (spec §1.3): urlTooLong (project-wide transport guard, 414) →
 * authLimit (shared auth-mutation bucket, 429) → malformed-cookie 400 (QA
 * F1: a present-but-undecodable session cookie is a client bug, not an
 * anonymous caller) → requireVerifiedContributor (write gate: 401 anonymous
 * / 403 unverified, single canonical body, anti-enumeration) → sameOrigin +
 * csrfVerified (the state change carries a live session, so it must echo the
 * session's X-CSRF-Token; same-origin first).
 *
 * Body `{ name, scopes?, expiresAt? }`:
 *   - name: 1..60 chars after trim (required);
 *   - scopes: non-empty subset of the D4 whitelist, defaults to all four;
 *   - expiresAt: ISO-8601 UTC, default +365d (D6), explicit null = never.
 *
 * Cap D5: `countApiKeysForContributor` against `apiKeysMaxPerContributor`
 * (env knob API_KEYS_MAX_PER_CONTRIBUTOR, default 5); at the cap the mint
 * answers 409 and no key is created. A revoked/expired key frees its slot
 * immediately.
 */
export async function POST(request: Request) {
  // Transport guard: reject absurdly long URLs before any auth or parsing.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  // Shared auth-mutation rate limit (default 10/min per caller, AUTH_LIMITER
  // binding in production; in-memory fallback in dev/tests). This is a
  // credential-bearing surface: minting is the only way to create keys (R3).
  const blocked = await authLimit(request, env, "/api/auth/keys");
  if (blocked) return blocked;

  // QA F1: a PRESENT-but-undecodable session cookie answers a clean 400 —
  // clearing the corrupt cookie is actionable, a silent 401 would hide it.
  const malformed = malformedSessionCookieGuard(request);
  if (malformed) return malformed;

  // Write gate: the mint requires a VERIFIED contributor session. Anonymous
  // (401) and unverified (403) share ONE canonical body (anti-enumeration).
  const gate = await requireVerifiedContributor(request);
  if (!gate.ok) return gate.response;

  // State change carrying a live session: same-origin + CSRF double-submit.
  if (!sameOrigin(request) || !csrfVerified(request, gate.session.csrfToken)) {
    return Response.json(
      { error: "Cross-origin request rejected." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload)) {
      return Response.json(
        { error: "Provide a name for the API key." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    // name: required, 1..60 chars after trim (same grammar as createApiKey).
    if (typeof payload.name !== "string") {
      return Response.json(
        { error: "Provide a name for the API key." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    const name = payload.name.trim();
    if (name.length < 1 || name.length > 60) {
      return Response.json(
        { error: "The API key name must be between 1 and 60 characters." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    // scopes: optional non-empty subset of the D4 whitelist; default all four.
    let scopes: readonly ApiKeyScope[] = API_KEY_SCOPES;
    if (payload.scopes !== undefined) {
      if (
        !Array.isArray(payload.scopes) ||
        payload.scopes.length === 0 ||
        payload.scopes.some((scope) => typeof scope !== "string" || !API_KEY_SCOPES.includes(scope as ApiKeyScope))
      ) {
        return Response.json(
          { error: "Choose at least one scope: submit, confirm, edit, action." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
      scopes = payload.scopes as ApiKeyScope[];
    }

    // expiresAt: optional ISO-8601 UTC; explicit null = never (D6).
    let expiresAt: string | null | undefined;
    if (payload.expiresAt !== undefined && payload.expiresAt !== null) {
      if (typeof payload.expiresAt !== "string" || Number.isNaN(Date.parse(payload.expiresAt))) {
        return Response.json(
          { error: "expiresAt must be an ISO-8601 date or null." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
      expiresAt = payload.expiresAt;
    } else if (payload.expiresAt === null) {
      expiresAt = null;
    }

    // Cap D5: at the cap the mint answers 409 and no key is created.
    const active = await countApiKeysForContributor(gate.contributor.id);
    if (active >= apiKeysMaxPerContributor(env)) {
      return Response.json(
        { error: "API key limit reached. Revoke an existing key before creating a new one." },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    // Reveal-once: the raw key exists in exactly this response (D2/P1-2).
    // createApiKey persists only the SHA-256 hex and the display prefix.
    const { rawKey, key } = await createApiKey({
      contributorId: gate.contributor.id,
      name,
      scopes,
      expiresAt,
    });

    return Response.json(
      {
        id: key.id,
        name: key.name,
        key: rawKey,
        keyPrefix: key.keyPrefix,
        scopes: JSON.parse(key.scopes) as string[],
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
      },
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/auth/keys payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/auth/keys failed", error);
    return Response.json(
      { error: "Unable to create the API key" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

/**
 * GET /api/auth/keys — list the caller's own API keys, metadata only (EPIC
 * api-keys, T8, plan §1.3, decisions D2/D3).
 *
 * Contract: `200 { keys: [...] }` where every entry is
 * `{ id, name, keyPrefix, scopes, createdAt, lastUsedAt, expiresAt,
 * revokedAt }`. The SHA-256 hash (D3) and the raw key (D2) are NEVER
 * exposed here — the hash is not even selected from the db layer
 * (`ApiKeyListItem` omits it), and the raw key exists only in the mint
 * response (reveal-once, P1-2). Revoked/expired rows stay visible so the
 * account page can show the full lifecycle; the list is newest first.
 *
 * Guard order (spec §1.3): urlTooLong (project-wide transport guard, 414)
 * → sessionLimit (shared session-read bucket, 429 — this is a READ of the
 * caller's own data, refetched on every account-page render, so it uses
 * the generous 120/min session bucket, not the auth-mutation 10/min) →
 * resolveOptionalContributor (401 anonymous; own data only, no
 * cross-account path). No CSRF: a GET carries no state change and no
 * ambient authority is echoed.
 *
 * Response is `Cache-Control: no-store` (P0-2): personal data must never
 * be edge-cached, and this surface lists credential handles.
 */
export async function GET(request: Request) {
  // Transport guard: reject absurdly long URLs before any auth or parsing.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  // Session READ bucket (120/min per caller), not the auth mutation bucket:
  // the account page refetches this list on every open/reveal/revoke, and
  // authLimit (10/min) would 429 a user managing keys quickly. Mirrors
  // GET /api/auth/me/contributions.
  const blocked = await sessionLimit(request, env, "/api/auth/keys");
  if (blocked) return blocked;

  try {
    // Own data only: anonymous callers answer 401 and never touch the db.
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ error: "Not authenticated." }, { status: 401, headers: NO_STORE_HEADERS });
    }

    // Metadata only: `listApiKeysForContributor` selects no hash (D2/D3) and
    // returns revoked/expired rows for the lifecycle view, newest first.
    const rows = await listApiKeysForContributor(resolved.contributor.id);
    const keys = rows.map((row) => ({
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      // scopes is stored as JSON text; the API shape is an array (same
      // contract as the mint response).
      scopes: JSON.parse(row.scopes) as string[],
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    }));

    return Response.json({ keys }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("GET /api/auth/keys failed", error);
    return Response.json({ error: "Unable to list the API keys" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
