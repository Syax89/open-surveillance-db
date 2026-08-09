import { env } from "cloudflare:workers";
import { listContributorSubmissions } from "../../../../../db/auth";
import { resolveOptionalContributor } from "../../../../lib/auth-session";
import { sessionLimit } from "../../../../lib/auth-route-helpers";
import { urlTooLong } from "../../../../lib/input-limits";

/**
 * GET /api/auth/me/submissions — the authenticated contributor's own
 * attributed reports (id, title, status, created_at). 401 when anonymous.
 * Anonymous submissions are never attributable and therefore never listed.
 *
 * DEPRECATED (COMMUNITY_PLAN §2.3, C2): kept for backward compatibility but
 * superseded by GET /api/auth/me/contributions, which adds pagination
 * (F0 contract), correction contribution kinds, a status filter and
 * the caller's trust level in the meta. New clients should call
 * /api/auth/me/contributions instead.
 */
export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  // Session READ bucket (120/min), not the auth mutation bucket: this list is
  // refetched on filter/page changes, and authLimit (10/min) 429'd a user
  // after ~10 interactions. Mirrors GET /api/auth/me/contributions.
  const blocked = await sessionLimit(request, env, "/api/auth/me/submissions");
  if (blocked) return blocked;

  try {
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }
    const submissions = await listContributorSubmissions(resolved.contributor.id);
    // Personal data: never edge-cache (same contract as the successor
    // /api/auth/me/contributions; audit 2026-08-09, P2).
    return Response.json(
      { submissions },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/auth/me/submissions failed", error);
    return Response.json({ error: "Unable to list your submissions" }, { status: 503 });
  }
}
