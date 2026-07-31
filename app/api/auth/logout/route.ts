import { env } from "cloudflare:workers";
import { revokeSession } from "../../../../db/auth";
import { clearingCookieHeaders, resolveOptionalContributor } from "../../../lib/auth-session";
import { authLimit, cookieHeaderInit } from "../../../lib/auth-route-helpers";
import { csrfVerified, readCookie, sameOrigin, SESSION_COOKIE } from "../../../lib/csrf";
import { urlTooLong } from "../../../lib/input-limits";

/**
 * POST /api/auth/logout — revoke the current session and clear its cookies.
 *
 * CSRF-protected: a request that carries a live session must come from the
 * same origin AND echo the session's CSRF token (`X-CSRF-Token` header).
 * Logging out without a session is idempotent (200, cookies cleared).
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const blocked = authLimit(request, env, "/api/auth/logout");
  if (blocked) return blocked;

  try {
    const resolved = await resolveOptionalContributor(request);
    if (resolved) {
      if (!csrfVerified(request, resolved.session.csrfToken)) {
        return Response.json({ error: "Invalid CSRF token. Refresh the page and try again." }, { status: 403 });
      }
      const token = readCookie(request, SESSION_COOKIE);
      if (token) await revokeSession(token);
    }
    return Response.json({ ok: true }, { headers: cookieHeaderInit(clearingCookieHeaders(env)) });
  } catch (error) {
    console.error("POST /api/auth/logout failed", error);
    return Response.json({ error: "Unable to log out" }, { status: 500 });
  }
}
