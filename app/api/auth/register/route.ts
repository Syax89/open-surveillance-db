import { env } from "cloudflare:workers";
import {
  createContributor,
  createSession,
  createVerificationToken,
  isValidEmail,
  normalizeEmail,
  type PublicContributor,
} from "../../../../db/auth";
import { sessionCookieHeaders, sessionTtlSeconds } from "../../../lib/auth-session";
import {
  authLimit,
  cookieHeaderInit,
  isValidPassword,
  parseDisplayName,
} from "../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../lib/csrf";
import { isRecord } from "../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../lib/input-limits";
import { sendVerificationEmail } from "../../../lib/mailer";

/**
 * POST /api/auth/register — create a contributor account and open a
 * READ-ONLY session (multi-method auth Fase B).
 *
 * Registration now proves mailbox control before the account can write:
 *   1. the contributor is created with `email_verified_at = NULL`;
 *   2. a single-use, 24h verification token is minted (hash-only in D1) and
 *      emailed via the Cloudflare `send_email` binding (dev/test fallback:
 *      the link is logged and echoed as `verification.devLink`);
 *   3. a session is opened exactly as before — but it is READ-ONLY until
 *      `email_verified_at` is set: the write gate (Fase E1) refuses every
 *      state-changing write for unverified accounts (403). GET /api/auth/me
 *      exposes `contributor.emailVerifiedAt` so the client can show the
 *      "verify your email" state.
 *
 * Mail is best-effort and NEVER fails registration: a mail outage still
 * returns 201 (the user can re-send from the session via
 * POST /api/auth/verify-email/resend). `verification.devLink` is present
 * ONLY in the no-binding fallback — a real deployment never echoes the token.
 *
 * The email+password contract from ADR 0013 is unchanged (PBKDF2 hashing,
 * no magic links, cookies `osdb_session` + `osdb_csrf`).
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

    // Verification link (Fase B): mint + mail. The raw token lives only in
    // the email (hash-only in D1); the mailer swallows send failures so a
    // mail outage never breaks registration.
    const now = new Date().toISOString();
    const { rawToken } = await createVerificationToken(contributor.id, "verify", now);
    const mail = await sendVerificationEmail(env, {
      to: contributor.email,
      rawToken,
      requestOrigin: new URL(request.url).origin,
    });

    const { rawToken: sessionRawToken, csrfToken } = await createSession(contributor.id, {
      // The DB expires_at must match the cookie Max-Age exactly: both derive
      // from the same sessionTtlSeconds(env) (audit t_5ca60ab2, P2 — a
      // divergent TTL would let a token stay valid server-side after the
      // cookie is gone, or expire sessions the client still holds).
      ttlSeconds: sessionTtlSeconds(env),
    });
    const verification: Record<string, unknown> = { sent: mail.delivered };
    // Dev/test fallback only: with no SEND_EMAIL binding the mailer returns
    // the action link so local flows can complete verification; production
    // (binding present) never exposes the token in an API response.
    if (!mail.delivered && mail.devLink) verification.devLink = mail.devLink;
    return Response.json(
      { contributor, verification },
      { status: 201, headers: cookieHeaderInit(sessionCookieHeaders(sessionRawToken, csrfToken, env)) },
    );
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/auth/register payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/auth/register failed", error);
    return Response.json({ error: "Unable to create account" }, { status: 500 });
  }
}
