import { env } from "cloudflare:workers";
import {
  authenticateContributor,
  clearLoginAttempts,
  createSession,
  getLoginLockout,
  isValidEmail,
  loginLockoutKey,
  normalizeEmail,
  recordFailedLogin,
} from "../../../../db/auth";
import { sessionCookieHeaders, sessionTtlSeconds } from "../../../lib/auth-session";
import {
  authLimit,
  cookieHeaderInit,
  isValidPassword,
  loginLockoutPolicy,
} from "../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../lib/csrf";
import { isRecord } from "../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../lib/input-limits";

/**
 * POST /api/auth/login — verify credentials and open a session.
 *
 * Unknown email and wrong password both answer the same generic 401 so the
 * response never reveals which part was wrong. Success sets the same cookie
 * pair as registration (`osdb_session` + `osdb_csrf`).
 *
 * Brute-force defence is layered (ADR 0016): the per-IP `auth` bucket
 * (authLimit) throttles a single caller, and a per-email lockout — keyed by
 * the SHA-256 of the normalised email, never the address — stops distributed
 * guessing against one account. A locked account answers 429 with
 * Retry-After before any hashing work; the attempt that crosses the
 * threshold trips the lock; a successful login clears the counter. The
 * lockout applies identically to unknown emails, so it cannot be used to
 * enumerate accounts.
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const blocked = await authLimit(request, env, "/api/auth/login");
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

    // Per-email lockout gate. The key is a hash of the normalised email, so
    // no PII ever appears in the counter table or in the log line below.
    const policy = loginLockoutPolicy(env);
    const emailKey = await loginLockoutKey(email);
    const lockout = await getLoginLockout(emailKey, policy);
    if (lockout.locked) {
      console.warn(`POST /api/auth/login rejected: account locked (emailKey ${emailKey})`);
      return Response.json(
        { error: "Too many failed login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(lockout.retryAfterSeconds) } },
      );
    }

    const contributor = await authenticateContributor(email, password);
    if (!contributor) {
      // Same generic 401 as before — the lockout only trips after the
      // threshold, and only this attempt's result tells us which branch.
      const after = await recordFailedLogin(emailKey, policy);
      if (after.locked) {
        console.warn(`POST /api/auth/login rejected: lockout triggered (emailKey ${emailKey})`);
        return Response.json(
          { error: "Too many failed login attempts. Please try again later." },
          { status: 429, headers: { "Retry-After": String(after.retryAfterSeconds) } },
        );
      }
      return Response.json({ error: "Invalid credentials." }, { status: 401 });
    }

    // A successful login resets the per-email counter.
    await clearLoginAttempts(emailKey);

    const { rawToken, csrfToken } = await createSession(contributor.id, {
      // Same TTL source as the cookie (sessionTtlSeconds(env)): the DB
      // expires_at and the cookie Max-Age must never diverge (audit
      // t_5ca60ab2, P2).
      ttlSeconds: sessionTtlSeconds(env),
    });
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
