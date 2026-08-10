import { env } from "cloudflare:workers";
import { revokeApiKey } from "../../../../../db/api-keys";
import { authLimit } from "../../../../lib/auth-route-helpers";
import { malformedSessionCookieGuard } from "../../../../lib/auth-session";
import { csrfVerified, sameOrigin } from "../../../../lib/csrf";
import { urlTooLong } from "../../../../lib/input-limits";
import { requireVerifiedContributor } from "../../../../lib/write-gate";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

/**
 * Strict id parse from the URL path (same grammar as the confirmation and
 * camera routes): `^\d+$` plus >= 1. Anything else returns null -> 404 —
 * the public ids are plain decimal strings, and the positivity check keeps
 * "0" (which passes the regex) out. The query stays parameterised either
 * way; this is a tighter contract, not a security boundary.
 */
function parseId(request: Request): number | null {
  const idParam = new URL(request.url).pathname.split("/").pop() ?? "";
  if (!/^\d+$/.test(idParam) || Number(idParam) < 1) return null;
  return Number(idParam);
}

/**
 * DELETE /api/auth/keys/[id] — soft-revoke one of the caller's own API keys
 * (EPIC api-keys, T9, plan §1.3, AC5, decision D9).
 *
 * Contract: `revokeApiKey` runs the owner-scoped UPDATE
 * `SET revoked_at = ? WHERE id = ? AND contributor_id = ? AND revoked_at
 * IS NULL` and returns whether a row changed. Three outcomes are therefore
 * indistinguishable by design — an unknown id, a key owned by a different
 * contributor, and an already-revoked key all answer this endpoint's ONE
 * uniform 404 (`API key not found.`), so the route never leaks whether a
 * key exists or whom it belongs to (no existence oracle). Revoking is
 * idempotent (D9): a second DELETE of the same key is a harmless 404, which
 * the account page maps to "already revoked".
 *
 * Guard order (spec §1.3, same as the mint POST): urlTooLong (project-wide
 * transport guard, 414) → authLimit (shared auth-mutation bucket, 429 —
 * revoking a credential is a state change, so it uses the same 10/min
 * bucket as minting, not the session-read one) → malformed-cookie 400 (QA
 * F1: a present-but-undecodable session cookie is a client bug, not an
 * anonymous caller) → requireVerifiedContributor (write gate: 401 anonymous
 * / 403 unverified, single canonical body, anti-enumeration) → sameOrigin +
 * csrfVerified (the state change carries a live session, so it must echo
 * the session's X-CSRF-Token; same-origin first) → strict id parse (404).
 *
 * The success answer is `200 { ok: true }` (same shape as the sibling
 * DELETE /api/auth/passkey/credentials); the account page refetches the
 * metadata-only list afterwards, so no row data is needed here. Every
 * response is `Cache-Control: no-store` (P0-2): credential-handle surfaces
 * must never be cached by an edge or browser.
 */
export async function DELETE(request: Request) {
  // Transport guard: reject absurdly long URLs before any auth or parsing.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  // Shared auth-mutation rate limit (default 10/min per caller, AUTH_LIMITER
  // binding in production; in-memory fallback in dev/tests). Revoking a key
  // is a credential-bearing state change, so it shares the mint's bucket
  // rather than the generous session-read one.
  const blocked = await authLimit(request, env, "/api/auth/keys/[id]");
  if (blocked) return blocked;

  // QA F1: a PRESENT-but-undecodable session cookie answers a clean 400 —
  // clearing the corrupt cookie is actionable, a silent 401 would hide it.
  const malformed = malformedSessionCookieGuard(request);
  if (malformed) return malformed;

  // Write gate: revoking a key requires a VERIFIED contributor session.
  // Anonymous (401) and unverified (403) share ONE canonical body
  // (anti-enumeration).
  const gate = await requireVerifiedContributor(request);
  if (!gate.ok) return gate.response;

  // State change carrying a live session: same-origin + CSRF double-submit.
  if (!sameOrigin(request) || !csrfVerified(request, gate.session.csrfToken)) {
    return Response.json(
      { error: "Cross-origin request rejected." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  // Strict decimal id before any db work. An unparseable, zero or
  // non-numeric id is indistinguishable from an unknown one — same uniform
  // 404, so even the URL grammar reveals nothing (no existence oracle).
  const id = parseId(request);
  if (id === null) {
    return Response.json({ error: "API key not found." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  try {
    const revoked = await revokeApiKey(id, gate.contributor.id);
    if (!revoked) {
      // Idempotent soft revoke (D9): unknown id, another contributor's key
      // or an already-revoked key all answer this SAME 404 body — the route
      // cannot tell which, and neither can the caller.
      return Response.json({ error: "API key not found." }, { status: 404, headers: NO_STORE_HEADERS });
    }
    return Response.json({ ok: true }, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("DELETE /api/auth/keys/[id] failed", error);
    return Response.json(
      { error: "Unable to revoke the API key" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
