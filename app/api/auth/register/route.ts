import { env } from "cloudflare:workers";
import {
  createContributor,
  createSession,
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
      // Generic body shared with the 409 below: register is a public
      // endpoint and must not reveal why it failed (account enumeration).
      return Response.json(
        { error: "Unable to register with this email." },
        { status: 400 },
      );
    }

    const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
    const displayName = parseDisplayName(payload.displayName);
    if (!isValidEmail(email) || !isValidPassword(payload.password) || displayName === undefined) {
      return Response.json(
        { error: "Unable to register with this email." },
        { status: 400 },
      );
    }

    // No pre-check for an existing email: the unique email index is the
    // single source of truth. A pre-check SELECT would be both a redundant
    // query and a timing oracle (existing email answered in ~ms vs ~100ms of
    // PBKDF2 hashing for a new one), which would let a caller enumerate
    // accounts by response time. The constraint error below maps to the same
    // generic 409.
    let contributor: PublicContributor;
    try {
      contributor = await createContributor({ email, displayName, password: payload.password });
    } catch (error) {
      // The unique email index is the last line of defence against a
      // register race; map the constraint error to the same generic 409
      // (body identical to the 400 above so responses stay indistinguishable).
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        return Response.json({ error: "Unable to register with this email." }, { status: 409 });
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
