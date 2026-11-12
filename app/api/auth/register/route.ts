import { env } from "cloudflare:workers";
import { getRequestExecutionContext } from "vinext/shims/request-context";
import { localeFromCookieHeader } from "../../../lib/i18n/types";
import {
  createContributor,
  createVerificationToken,
  deleteRegistrationAttempt,
  findContributorByEmail,
  isValidEmail,
  normalizeEmail,
  recordRegistrationAttempt,
  registrationIpHash,
} from "../../../../db/auth";
import {
  authLimit,
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
 * POST /api/auth/register — create a contributor account (multi-method auth
 * Fase B), WITHOUT revealing whether the address already has one.
 *
 * Anti-enumeration (owner decision, ethics/privacy): on a site that maps
 * surveillance cameras, confirming that someone — an activist, a
 * journalist — has an account can expose them. So a valid request answers
 * the SAME 202 `{ ok: true, status: "check_email" }`, with the same
 * headers (no Set-Cookie, `Cache-Control: no-store`), whether the address
 * is new or already registered. What happens next is told only to the
 * mailbox owner:
 *
 *   - NEW address: the contributor is created with `email_verified_at =
 *     NULL` and a single-use, 24h verification link is emailed (canonical
 *     mailer db/mailer.ts, ADR 0020 — atomic reservation → mint → send →
 *     settle). NO session is opened any more: a Set-Cookie on the new-account
 *     branch only would be an existence oracle. The user verifies through
 *     the link, then signs in (the login gate refuses unverified accounts).
 *   - EXISTING address: nothing is created or changed; the owner receives
 *     an "account exists" notice (sign in / reset password links, no token).
 *     The notice shares the per-contributor mail window AND has its own
 *     daily cap (ACCOUNT_EXISTS_EMAIL_DAILY_MAX, db/mailer.ts), so the
 *     public form cannot be used to flood someone's inbox. Past the cap the
 *     route still answers the generic 202 and sends nothing.
 *
 * Timing: both branches pay the same PBKDF2 hashing (createContributor
 * hashes BEFORE the INSERT, and the unique email index — never a pre-check
 * SELECT — is what detects an existing address), and the mail work
 * (reservation, token mint, provider send) runs AFTER the response inside
 * the Worker's `ctx.waitUntil` (vinext exposes the request ExecutionContext
 * through `getRequestExecutionContext`), the same pattern as
 * POST /api/auth/reset-password/request. Without an ExecutionContext
 * (plain-Node dev server, tests) the mail work runs inline; its failures
 * are logged and never change the response (mail is best-effort).
 *
 * The per-IP registration attempt is kept for BOTH branches (it is only
 * rolled back on a validation / server error): rolling it back for one
 * branch only would make the cap itself an oracle.
 *
 * The raw verification token NEVER appears in the response (it lives only
 * in the email — fail-closed, no dev-link echo). The email+password
 * contract from ADR 0013 is unchanged (PBKDF2 hashing, no magic links).
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
  // STAYS so the cap keeps holding. On a validation or server error the
  // reservation is rolled back (the malformed-body "no write" contract
  // holds); a valid request keeps it whether or not the address was new (see
  // the doc comment). The stored key is
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

  try {
    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload)) {
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
    // single source of truth. createContributor hashes the password BEFORE
    // the INSERT, so an existing address pays the same PBKDF2 cost as a new
    // one (a pre-check SELECT would be a timing oracle).
    let mailTask: () => Promise<void>;
    try {
      const contributor = await createContributor({ email, displayName, password: payload.password });
      mailTask = () => sendVerificationEmail(contributor, locale(request));
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("UNIQUE constraint failed"))) throw error;
      // Existing address: create nothing, tell only the mailbox owner.
      mailTask = () => sendAccountExistsEmail(email, locale(request));
    }

    const ctx = getRequestExecutionContext();
    const background = mailTask().catch((error: unknown) => {
      console.error("POST /api/auth/register background mail failed", error);
    });
    if (ctx) {
      // Production (Workers): answer now, mail after the response (timing
      // anti-enumeration, see the doc comment).
      ctx.waitUntil(background);
    } else {
      await background;
    }
    return checkEmail();
  } catch (error) {
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

/** The one answer for every valid registration request (new or existing). */
function checkEmail(): Response {
  return Response.json(
    { ok: true, status: "check_email" },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}

function locale(request: Request) {
  return localeFromCookieHeader(request.headers.get("Cookie"));
}

type MailLocale = ReturnType<typeof localeFromCookieHeader>;

/**
 * New account: ATOMIC budget admission → mint → mail (issue #440). The
 * reservation runs BEFORE the token is minted, so a blocked request never
 * creates a token it cannot mail; a fresh account (zero rows) always wins
 * its slot. sendAuthEmail settles the reservation itself (kept on success,
 * released on a deterministic failure, retained on an ambiguous provider
 * outcome); only a mint failure is released here.
 */
async function sendVerificationEmail(
  contributor: { id: number; email: string },
  mailLocale: MailLocale,
): Promise<void> {
  const now = new Date().toISOString();
  const reservation = await reserveAuthEmail(contributor.id, "verify", now, env);
  if (!reservation.ok) return;
  let rawToken: string;
  try {
    ({ rawToken } = await createVerificationToken(contributor.id, "verify", now));
  } catch (error) {
    await releaseEmailReservation(reservation.reservationId, contributor.id, "verify");
    throw error;
  }
  await sendAuthEmail({
    locale: mailLocale,
    reservationId: reservation.reservationId,
    contributorId: contributor.id,
    to: contributor.email,
    kind: "verify",
    rawToken,
  });
}

/**
 * Existing account: mail the owner the token-less account-exists notice,
 * under the shared window + the per-kind daily cap (db/mailer.ts). Past the
 * cap nothing is sent (the response is already the generic 202).
 */
async function sendAccountExistsEmail(email: string, mailLocale: MailLocale): Promise<void> {
  const existing = await findContributorByEmail(email);
  // Erased between the INSERT and this lookup: nothing to notify.
  if (!existing) return;
  const now = new Date().toISOString();
  const reservation = await reserveAuthEmail(existing.id, "account_exists", now, env);
  if (!reservation.ok) return;
  await sendAuthEmail({
    locale: mailLocale,
    reservationId: reservation.reservationId,
    contributorId: existing.id,
    to: existing.email,
    kind: "account_exists",
  });
}
