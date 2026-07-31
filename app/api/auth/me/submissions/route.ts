import { env } from "cloudflare:workers";
import { listContributorSubmissions } from "../../../../../db/auth";
import { resolveOptionalContributor } from "../../../../lib/auth-session";
import { authLimit } from "../../../../lib/auth-route-helpers";
import { urlTooLong } from "../../../../lib/input-limits";

/**
 * GET /api/auth/me/submissions — the authenticated contributor's own
 * attributed reports (id, title, status, created_at). 401 when anonymous.
 * Anonymous submissions are never attributable and therefore never listed.
 */
export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  const blocked = authLimit(request, env, "/api/auth/me/submissions");
  if (blocked) return blocked;

  try {
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }
    const submissions = await listContributorSubmissions(resolved.contributor.id);
    return Response.json({ submissions });
  } catch (error) {
    console.error("GET /api/auth/me/submissions failed", error);
    return Response.json({ error: "Unable to list your submissions" }, { status: 503 });
  }
}
