import { env } from "cloudflare:workers";
import {
  authenticateContributor,
  createSession,
  isValidEmail,
  normalizeEmail,
} from "../../../../db/auth";
import { sessionCookieHeaders } from "../../../lib/auth-session";
import { authLimit, cookieHeaderInit, isValidPassword } from "../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../lib/csrf";
import { isRecord } from "../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../lib/input-limits";

/**
 * POST /api/auth/login — verify credentials and open a session.
 *
 * Unknown email and wrong password both answer the same generic 401 so the
 * response never reveals which part was wrong. Success sets the same cookie
 * pair as registration (`osdb_session` + `osdb_csrf`).
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const blocked = authLimit(request, env, "/api/auth/login");
  if (blocked) return blocked;

  try {
    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload)) {
      return Response.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
    const password = payload.password;
    if (!isValidEmail(email) || !isValidPassword(password)) {
      return Response.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const contributor = await authenticateContributor(email, password);
    if (!contributor) {
      return Response.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const { rawToken, csrfToken } = await createSession(contributor.id);
    return Response.json(
      { contributor },
      { headers: cookieHeaderInit(sessionCookieHeaders(rawToken, csrfToken, env)) },
    );
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/auth/login payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/auth/login failed", error);
    return Response.json({ error: "Unable to log in" }, { status: 500 });
  }
}
