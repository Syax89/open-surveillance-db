import { env } from "cloudflare:workers";
import { resolveOptionalContributor } from "../../../lib/auth-session";
import { authLimit, parseDisplayName } from "../../../lib/auth-route-helpers";
import { csrfVerified, sameOrigin } from "../../../lib/csrf";
import { urlTooLong } from "../../../lib/input-limits";
import { trustLevelMeta } from "../../../lib/trust-levels";
import { countVerifiedCameras, updateContributorDisplayName } from "../../../../db/auth";

/**
 * GET /api/auth/me — the current contributor profile, or 401 when anonymous.
 * The account page calls this on load; the profile never includes the
 * password hash (the db layer already strips it).
 *
 * Since C2 (COMMUNITY_PLAN §2.3) the response also carries the caller's own
 * `level` (derived on the fly from the verified contribution count, never
 * denormalised): the account page renders the level badge and the progress
 * line from this single call, without a second request. The level is
 * personal data, so the response stays `no-store` and no other endpoint
 * exposes it.
 */
export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  const blocked = authLimit(request, env, "/api/auth/me");
  if (blocked) return blocked;

  try {
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }
    const verifiedCount = await countVerifiedCameras(resolved.contributor.id);
    return Response.json(
      {
        contributor: resolved.contributor,
        level: trustLevelMeta(verifiedCount),
      },
      {
        // Personal data: never edge-cache.
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("GET /api/auth/me failed", error);
    return Response.json({ error: "Unable to read the session" }, { status: 503 });
  }
}

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

/**
 * PATCH /api/auth/me — update the caller's own display name (profile field,
 * ADR 0018 §4 / COMMUNITY_PLAN §6 C8: inline editing is reserved to the
 * profile displayName; contribution fields are edited on the dedicated
 * /records/[id]/edit page, never inline).
 *
 * The payload is a single-field whitelist: only `displayName` is accepted
 * (2..60 characters after trim, or null/empty to clear — same grammar as
 * registration). Any other key answers 400 with no partial effects. Guard
 * order mirrors the other auth mutations: urlTooLong -> sameOrigin -> auth
 * rate-limit -> session (401) -> CSRF (403) -> body validation (400). The
 * response is the refreshed public profile, always no-store (personal data).
 */
export async function PATCH(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const blocked = authLimit(request, env, "/api/auth/me");
  if (blocked) return blocked;

  try {
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ error: "Not authenticated." }, { status: 401, headers: NO_STORE_HEADERS });
    }
    if (!csrfVerified(request, resolved.session.csrfToken)) {
      return Response.json({ error: "Invalid CSRF token. Refresh the page and try again." }, { status: 403, headers: NO_STORE_HEADERS });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: "A JSON object with the displayName field is required." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return Response.json({ error: "A JSON object with the displayName field is required." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const keys = Object.keys(payload as Record<string, unknown>);
    if (keys.length !== 1 || keys[0] !== "displayName") {
      return Response.json({ error: 'Only the "displayName" field can be updated.' }, { status: 400, headers: NO_STORE_HEADERS });
    }
    const displayName = parseDisplayName((payload as Record<string, unknown>).displayName);
    if (displayName === undefined) {
      return Response.json(
        { error: "The display name must be between 2 and 60 characters." },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const contributor = await updateContributorDisplayName(resolved.contributor.id, displayName);
    if (!contributor) {
      return Response.json({ error: "Not authenticated." }, { status: 401, headers: NO_STORE_HEADERS });
    }
    return Response.json({ contributor }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("PATCH /api/auth/me failed", error);
    return Response.json({ error: "Unable to update the profile" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}
