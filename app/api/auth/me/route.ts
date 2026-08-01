import { env } from "cloudflare:workers";
import { resolveOptionalContributor } from "../../../lib/auth-session";
import { authLimit } from "../../../lib/auth-route-helpers";
import { urlTooLong } from "../../../lib/input-limits";
import { trustLevelMeta } from "../../../lib/trust-levels";
import { countVerifiedCameras } from "../../../../db/auth";

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
