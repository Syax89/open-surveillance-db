import { env } from "cloudflare:workers";
import {
  createContributor,
  createSession,
  createVerificationToken,
  deleteRegistrationAttempt,
  isValidEmail,
  normalizeEmail,
  recordRegistrationAttempt,
  registrationIpHash,
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
import { recordRateLimitBlock } from "../../../lib/abuse-alerts";
import { callerKey, registrationIpLimits } from "../../../lib/rate-limit";
import { releaseEmailReservation, reserveAuthEmail, sendAuthEmail } from "../../../../db/mailer";

/**
 * POST /api/auth/register — create a contributor account and open a
 * READ-ONLY session (multi-method auth Fase B).
 *
 * Registration now proves mailbox control before the account can write:
 *   1. the contributor is created with `email_verified_at = NULL`;
 *   2. a single-use, 24h verification token is minted (hash-only in D1) and
 *      emailed via the Cloudflare `send_email` binding (canonical mailer
 *      db/mailer.ts, ADR 0020 — atomic reservation → render → send → settle);
 *   3. a session is opened exactly as before — but it is READ-ONLY until
 *      `email_verified_at` is set: the write gate (Fase E1) refuses every
 *      state-changing write for unverified accounts (403). GET /api/auth/me
 *      exposes `contributor.emailVerifiedAt` so the client can show the
 *      "verify your email" state.
 *
 * The mailer budget (1 email per 5 minutes per contributor, issue #440 —
 * shared with resend and password reset) is admitted ATOMICALLY BEFORE the
 * token is minted: `reserveAuthEmail` INSERTs the `email_send_log` row only
 * while the in-window count is below the limit, and a fresh account (zero
 * rows) always wins its slot. The reservation row is kept when the provider
 * accepts the email and rolled back on a deterministic pre-delivery failure,
 * so a deterministic failure never burns the budget (an ambiguous provider
 * outcome keeps the short reservation to avoid a duplicate-mail burst — see
 * db/mailer.ts).
 *
 * Mail is best-effort and NEVER fails registration: a mail outage still
 * returns 201 (the user can re-send from the session via
 * POST /api/auth/verify-email/resend). `verification.sent` is true ONLY
 * when the provider accepted the email; the raw token NEVER appears in the
 * response (it lives only in the email — fail-closed, no dev-link echo).
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

  const blocked = await authLimit(request, env, "/api/auth/register");
  if (blocked) return blocked;

  // Per-IP registration cap (P3-4, CEO decision t_0941036b — anti account-farm,
  // docs/COMMUNITY_PLAN.md §3.3): max 5 registration attempts per caller IP in
  // a rolling 24h window, enforced as a D1 state quota (`registrations_ip_log`)
  // — the in-memory auth bucket above only bounds bursts per isolate, it
  // cannot hold a 24h window across worker isolates. Runs BEFORE readJsonBody
  // so an account farm cannot even probe the endpoint.
  // `recordRegistrationAttempt` reserves the attempt and counts the window in
  // ONE batch (atomic, so concurrent registrations cannot race past a stale
  // count); the request that brings the count to the cap answers 429 with the
  // generic anti-enumeration body (no email/IP echo) and its reservation row
  // STAYS so the cap keeps holding. On any non-201 exit the reservation is
  // rolled back (no account was created -> the budget is not consumed and the
  // malformed-body "no write" contract holds). The stored key is
  // `registrationIpHash(callerKey, REGISTRATION_IP_HMAC_KEY)` — a keyed HMAC
  // (or truncated SHA-256 when the key is absent, local prototype/tests),
  // never the raw IP and never an invertible hash (privacy by design,
  // QA#3 F4).
  const registerIpKey = callerKey(request, env);
  const registerIpHash = await registrationIpHash(registerIpKey, env.REGISTRATION_IP_HMAC_KEY);
  const registerIpLimits = registrationIpLimits(env);
  const nowMs = Date.now();
  const reservation = await recordRegistrationAttempt({
    ipHash: registerIpHash,
    now: new Date(nowMs).toISOString(),
    windowStart: new Date(nowMs - registerIpLimits.windowSeconds * 1000).toISOString(),
  });
  const rollbackAttempt = () => deleteRegistrationAttempt(reservation.id);
  if (reservation.count >= registerIpLimits.maxRequests) {
    console.warn("POST /api/auth/register per-IP registration cap exceeded");
    recordRateLimitBlock(env, {
      route: "/api/auth/register",
      key: registerIpKey,
      windowSeconds: registerIpLimits.windowSeconds,
    });
    return Response.json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(registerIpLimits.windowSeconds) },
      },
    );
  }

  // Reservation of the verification-email slot, tracked across the try so an
  // early failure (token mint / session) rolls it back and does not burn the
  // mail budget (issue #440). sendAuthEmail settles the reservation itself
  // (kept on success, released on a deterministic failure, retained on an
  // ambiguous provider outcome) and the id is cleared the moment it returns,
  // so the catch below covers ONLY token-mint / pre-send exceptions and can
  // never delete the send-log row of an email the provider already accepted.
  let mailReservation: { reservationId: number; contributorId: number; kind: "verify" } | null = null;

  try {
    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload)) {
      // Generic body shared with the 409 below: register is a public
      // endpoint and must not reveal why it failed (account enumeration).
      await rollbackAttempt();
      return Response.json(
        { error: "Unable to register with this email." },
        { status: 400 },
      );
    }

    const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
    const displayName = parseDisplayName(payload.displayName);
    if (!isValidEmail(email) || !isValidPassword(payload.password) || displayName === undefined) {
      await rollbackAttempt();
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
        await rollbackAttempt();
        return Response.json({ error: "Unable to register with this email." }, { status: 409 });
      }
      throw error;
    }

    // Verification link (Fase B): ATOMIC budget admission → mint → mail.
    // The reservation INSERT lands only while the in-window count is below
    // the limit (INSERT ... SELECT ... WHERE ... < ? RETURNING id, one
    // statement — no race with concurrent sends for the same contributor)
    // and runs BEFORE the token is minted, so a blocked request never
    // creates a token it cannot mail. The raw token lives only in the email
    // (hash-only in D1); the mailer swallows send failures so a mail outage
    // never breaks registration.
    const now = new Date().toISOString();
    const reservation = await reserveAuthEmail(contributor.id, "verify", now, env);
    let verification;
    if (reservation.ok) {
      mailReservation = {
        reservationId: reservation.reservationId,
        contributorId: contributor.id,
        kind: "verify",
      };
      const { rawToken } = await createVerificationToken(contributor.id, "verify", now);
      try {
        const mail = await sendAuthEmail({
          reservationId: reservation.reservationId,
          contributorId: contributor.id,
          to: contributor.email,
          kind: "verify",
          rawToken,
        });
        // sent = the provider accepted the email (and the reservation row is
        // now the permanent send-log row).
        verification = { sent: mail.ok };
      } finally {
        // sendAuthEmail settled the reservation (kept on success, released on
        // a deterministic failure, retained on an ambiguous outcome) — the
        // route must not touch it again, even if createSession below throws.
        mailReservation = null;
      }
    } else {
      // A fresh account cannot normally lose the window (zero rows); if it
      // ever does (pre-existing rows for a re-registered email), register
      // still succeeds without mail — the user can resend from the session.
      verification = { sent: false };
    }

    const { rawToken: sessionRawToken, csrfToken } = await createSession(contributor.id, {
      // The DB expires_at must match the cookie Max-Age exactly: both derive
      // from the same sessionTtlSeconds(env) (audit t_5ca60ab2, P2 — a
      // divergent TTL would let a token stay valid server-side after the
      // cookie is gone, or expire sessions the client still holds).
      ttlSeconds: sessionTtlSeconds(env),
    });
    // No devLink, ever: the token is only in the mail channel, so a
    // misconfigured deployment (missing EMAIL binding / VERIFY_BASE_URL)
    // cannot leak it through the API.
    return Response.json(
      { contributor, verification },
      { status: 201, headers: cookieHeaderInit(sessionCookieHeaders(sessionRawToken, csrfToken, env)) },
    );
  } catch (error) {
    // An exception after the reservation (token mint / session failure)
    // must roll the exact mail reservation back so the budget is not burned.
    // By this point the id is non-null ONLY for token-mint / pre-send
    // exceptions: sendAuthEmail settled (and the route cleared) the
    // reservation the moment it returned, so a delivered email's send-log
    // row is never deleted here.
    if (mailReservation) {
      await releaseEmailReservation(
        mailReservation.reservationId,
        mailReservation.contributorId,
        mailReservation.kind,
      );
    }
    if (error instanceof BodyReadError) {
      console.warn("POST /api/auth/register payload rejected: body too large or not valid JSON");
      await rollbackAttempt();
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/auth/register failed", error);
    await rollbackAttempt();
    return Response.json({ error: "Unable to create account" }, { status: 500 });
  }
}
