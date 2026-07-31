import { env } from "cloudflare:workers";
import { resolveOptionalContributor } from "../../../lib/auth-session";
import { authLimit } from "../../../lib/auth-route-helpers";
import { urlTooLong } from "../../../lib/input-limits";

/**
 * GET /api/auth/me — the current contributor profile, or 401 when anonymous.
 * The account page calls this on load; the profile never includes the
 * password hash (the db layer already strips it).
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
    return Response.json({ contributor: resolved.contributor });
  } catch (error) {
    console.error("GET /api/auth/me failed", error);
    return Response.json({ error: "Unable to read the session" }, { status: 503 });
  }
}
