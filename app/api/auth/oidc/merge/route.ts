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
} from "../../../../../db/auth";
import {
  getOidcMergeRequest,
  linkExternalIdentity,
} from "../../../../../db/oidc";
import { sessionCookieHeaders, sessionTtlSeconds } from "../../../../lib/auth-session";
import {
  authLimit,
  cookieHeaderInit,
  isValidPasswordShape,
  loginLockoutPolicy,
} from "../../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../../lib/csrf";
import { isRecord } from "../../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../../lib/input-limits";

const MAX_MERGE_TOKEN_LENGTH = 200;

/**
 * POST /api/auth/oidc/merge — complete the manual email-conflict merge.
 *
 * When the OIDC callback finds the provider's VERIFIED email on an existing
 * password account, it refuses to auto-link (account-takeover protection)
 * and redirects the browser to /login?merge=<token> instead. This route is
 * the backend half of that handshake: the user proves ownership of the
 * existing account with its email + password, and only then is
 * (auth_provider, external_sub) written onto that contributor.
 *
 * Flow:
 *   1. Resolve the single-use merge token (unknown/expired/used → 410).
 *   2. Prove the credentials with authenticateContributor — the same
 *      lockout-protected path as POST /api/auth/login, so this surface
 *      cannot be used to guess passwords faster than the login form.
 *   3. The authenticated contributor MUST be the one the merge request
 *      pins; a valid credential pair for a different account answers the
 *      same generic 401 as a wrong password (no account enumeration).
 *   4. linkExternalIdentity() atomically consumes the merge request and
 *      writes auth_provider/external_sub onto the contributor (plus
 *      email_verified_at when the provider asserted verification and the
 *      account is still unverified). A concurrent/expired request → 410.
 *   5. Open a session like login/register.
 *
 * The provider email is NEVER stored: the merge request holds only the
 * existing contributor_id plus the provider's verified flag, captured at
 * callback time (Fase D constraint, ADR 0020 decision 4).
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const blocked = await authLimit(request, env, "/api/auth/oidc/merge");
  if (blocked) return blocked;

  try {
    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload)) {
      return Response.json({ error: "Invalid merge request." }, { status: 400 });
    }

    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    if (!token || token.length > MAX_MERGE_TOKEN_LENGTH) {
      return Response.json({ error: "Invalid merge request." }, { status: 400 });
    }

    const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
    const password = payload.password;
    if (!isValidEmail(email) || !isValidPasswordShape(password)) {
      return Response.json({ error: "Invalid credentials." }, { status: 401 });
    }

    // Single-use token: unknown, expired or already consumed requests all
    // answer 410 — the browser must restart the OIDC flow.
    const mergeRequest = await getOidcMergeRequest(token);
    if (!mergeRequest) {
      return Response.json(
        { error: "This merge link is no longer valid." },
        { status: 410 },
      );
    }

    // Per-email lockout gate, identical to POST /api/auth/login (ADR 0016):
    // the password proof here is a credential-guessing surface and must be
    // throttled the same way.
    const policy = loginLockoutPolicy(env);
    const emailKey = await loginLockoutKey(email);
    const lockout = await getLoginLockout(emailKey, policy);
    if (lockout.locked) {
      console.warn(`POST /api/auth/oidc/merge rejected: account locked (emailKey ${emailKey})`);
      return Response.json(
        { error: "Too many failed login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(lockout.retryAfterSeconds) } },
      );
    }

    const contributor = await authenticateContributor(email, password);
    if (!contributor || contributor.id !== mergeRequest.contributorId) {
      // Same generic 401 for wrong password and for a valid pair that does
      // not own the pending merge — never reveal which part failed.
      const after = await recordFailedLogin(emailKey, policy);
      if (after.locked) {
        console.warn(`POST /api/auth/oidc/merge rejected: lockout triggered (emailKey ${emailKey})`);
        return Response.json(
          { error: "Too many failed login attempts. Please try again later." },
          { status: 429, headers: { "Retry-After": String(after.retryAfterSeconds) } },
        );
      }
      return Response.json({ error: "Invalid credentials." }, { status: 401 });
    }

    await clearLoginAttempts(emailKey);

    // Atomically consume the merge request and link the OIDC identity. A
    // concurrent callback/merge already consumed it between the read above
    // and here → 410 (single-use guaranteed by the conditional UPDATE).
    const linked = await linkExternalIdentity(
      token,
      mergeRequest.provider,
      mergeRequest.externalSub,
    );
    if (!linked) {
      return Response.json(
        { error: "This merge link is no longer valid." },
        { status: 410 },
      );
    }

    const { rawToken, csrfToken } = await createSession(linked.id, {
      // Same TTL source as the cookie (sessionTtlSeconds(env)): the DB
      // expires_at and the cookie Max-Age must never diverge (audit
      // t_5ca60ab2, P2).
      ttlSeconds: sessionTtlSeconds(env),
    });
    return Response.json(
      { contributor: linked },
      { headers: cookieHeaderInit(sessionCookieHeaders(rawToken, csrfToken, env)) },
    );
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/auth/oidc/merge payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/auth/oidc/merge failed", error);
    return Response.json({ error: "Unable to complete the merge." }, { status: 500 });
  }
}
