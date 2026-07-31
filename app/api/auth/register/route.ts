import { env } from "cloudflare:workers";
import {
  createContributor,
  createSession,
  findContributorByEmail,
  isValidEmail,
  normalizeEmail,
  type PublicContributor,
} from "../../../../db/auth";
import { sessionCookieHeaders } from "../../../lib/auth-session";
import {
  authLimit,
  cookieHeaderInit,
  isValidPassword,
  parseDisplayName,
} from "../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../lib/csrf";
import { isRecord } from "../../../lib/guards";
import { PayloadTooLargeError, readJsonBody, urlTooLong } from "../../../lib/input-limits";

/**
 * POST /api/auth/register — create a contributor account and open a session.
 *
 * Email + password was chosen over magic links for the local prototype
 * (ADR 0013): it needs no email transport, hashes with PBKDF2-SHA256, and
 * works entirely in-process. A successful registration sets two cookies:
 *   - `osdb_session`   (HttpOnly, SameSite=Strict): the raw session token;
 *   - `osdb_csrf`      (SameSite=Strict, script-readable): the per-session
 *     CSRF token the client echoes via the `X-CSRF-Token` header.
 */
export async function POST(request: Request) {
  // Input limits: reject absurdly long URLs before any parsing work.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  // Login-CSRF defence: a cross-site browser request always carries an
  // Origin header; this endpoint never accepts one from another site.
  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const blocked = authLimit(request, env, "/api/auth/register");
  if (blocked) return blocked;

  try {
    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload)) {
      return Response.json(
        { error: "Provide a valid email and a password of at least 10 characters." },
        { status: 400 },
      );
    }

    const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
    const displayName = parseDisplayName(payload.displayName);
    if (!isValidEmail(email) || !isValidPassword(payload.password) || displayName === undefined) {
      return Response.json(
        { error: "Provide a valid email, a password of at least 10 characters, and an optional display name of at most 60 characters." },
        { status: 400 },
      );
    }

    // Fast path: an existing account answers 409 before any hashing work.
    const existing = await findContributorByEmail(email);
    if (existing) {
      return Response.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    let contributor: PublicContributor;
    try {
      contributor = await createContributor({ email, displayName, password: payload.password });
    } catch (error) {
      // The unique email index is the last line of defence against a
      // register race; map the constraint error to the same 409.
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        return Response.json({ error: "An account with this email already exists." }, { status: 409 });
      }
      throw error;
    }

    const { rawToken, csrfToken } = await createSession(contributor.id);
    return Response.json(
      { contributor },
      { status: 201, headers: cookieHeaderInit(sessionCookieHeaders(rawToken, csrfToken, env)) },
    );
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      console.warn("POST /api/auth/register payload rejected: body over the configured byte cap");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/auth/register failed", error);
    return Response.json({ error: "Unable to create account" }, { status: 500 });
  }
}
