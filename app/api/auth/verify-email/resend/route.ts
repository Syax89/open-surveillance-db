import { env } from "cloudflare:workers";
import { createVerificationToken } from "../../../../../db/auth";
import { resolveOptionalContributor } from "../../../../lib/auth-session";
import { authLimit } from "../../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../../lib/csrf";
import { releaseEmailReservation, reserveAuthEmail, sendAuthEmail } from "../../../../../db/mailer";
import { urlTooLong } from "../../../../lib/input-limits";

/**
 * POST /api/auth/verify-email/resend — mail a fresh verification link
 * (multi-method auth Fase B).
 *
 * Requires a live session (the account that wants the new link), so an
 * anonymous caller cannot spray resets at arbitrary addresses. If the
 * account is already verified the endpoint answers 200 with
 * `verified: true` and sends nothing (idempotent no-op, no error).
 *
 * Send budget: 1 email per 5 minutes per contributor (issue #440, ADR 0020
 * decision 2 — the canonical mailer budget). Admission is ATOMIC:
 * `reserveAuthEmail` INSERTs the `email_send_log` row only while the
 * in-window count is below the limit (INSERT ... SELECT ... WHERE ... < ?
 * RETURNING id), so concurrent resends cannot race past a stale count.
 * The reservation runs BEFORE any token work: a blocked request answers
 * 429 with Retry-After and NEVER mints a new token, so it cannot revoke
 * the previous, still-valid link (creating a new token atomically revokes
 * every older unused verify token for the account — only the newest link
 * works, and only the request that won the window gets to mint one). The
 * reservation row is kept when the provider accepts the email and rolled
 * back on a deterministic pre-delivery failure (missing config, provider
 * rejection, mint error), so deterministic failures never burn the budget
 * (an ambiguous provider outcome keeps the short reservation to avoid a
 * duplicate-mail burst — see db/mailer.ts).
 *
 * Guard order mirrors the other auth mutations: urlTooLong -> sameOrigin ->
 * auth rate-limit -> session (401) -> atomic budget reservation (429) ->
 * token+mail.
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const blocked = await authLimit(request, env, "/api/auth/verify-email/resend");
  if (blocked) return blocked;

  try {
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ error: "Not authenticated." }, { status: 401, headers: NO_STORE_HEADERS });
    }
    if (resolved.contributor.emailVerifiedAt) {
      // Already verified: no-op success, nothing to send.
      return Response.json({ verified: true }, { headers: NO_STORE_HEADERS });
    }

    const now = new Date().toISOString();
    // ATOMIC budget admission BEFORE minting: the reservation INSERT lands
    // only while the in-window count is below the limit (INSERT ... SELECT
    // ... WHERE ... < ? RETURNING id — one statement, no race), so a
    // blocked or losing concurrent request can never revoke the winning
    // link by creating a token it will never mail. Only a request that
    // holds a reservation mints.
    const reservation = await reserveAuthEmail(resolved.contributor.id, "verify", now, env);
    if (!reservation.ok) {
      return Response.json(
        { error: "Too many verification emails. Please try again later." },
        { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(reservation.retryAfterSeconds) } },
      );
    }

    try {
      const { rawToken } = await createVerificationToken(resolved.contributor.id, "verify", now);
      const mail = await sendAuthEmail({
        reservationId: reservation.reservationId,
        contributorId: resolved.contributor.id,
        to: resolved.contributor.email,
        kind: "verify",
        rawToken,
      });

      if (!mail.ok && mail.reason === "rate_limited") {
        // Defensive: the reservation vanished between reserve and send
        // (unreachable through this route). Answer 429 like the gate would.
        return Response.json(
          { error: "Too many verification emails. Please try again later." },
          { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(mail.retryAfterSeconds) } },
        );
      }
      if (!mail.ok) {
        // missing_config (VERIFY_BASE_URL unset) or provider rejection: the
        // email may not have gone out. sendAuthEmail released the exact
        // reservation only on a DEFINITIVE pre-delivery failure; an
        // ambiguous provider outcome (E_UNKNOWN or any unrecognised code)
        // deliberately KEEPS it — the provider may have accepted the email
        // (response lost) and releasing it would let a retry duplicate it
        // (the short over-count ages out of the window, see db/mailer.ts).
        // Honest failure — the raw token is NEVER echoed; the user can
        // retry once the deployment is fixed. Fixed generic log event only:
        // a provider error must not echo the recipient address or any other
        // data into the application logs.
        console.error("POST /api/auth/verify-email/resend mail failed: verification email not confirmed delivered");
        return Response.json(
          { error: "Unable to resend the verification email" },
          { status: 503, headers: NO_STORE_HEADERS },
        );
      }

      return Response.json({ sent: true }, { headers: NO_STORE_HEADERS });
    } catch (error) {
      // Token mint or render threw after the reservation: roll the exact
      // reservation back so the failed attempt does not burn the budget.
      // Scoped to this contributor + kind, so it can never touch another
      // account's send row.
      await releaseEmailReservation(reservation.reservationId, resolved.contributor.id, "verify");
      console.error("POST /api/auth/verify-email/resend failed", error);
      return Response.json({ error: "Unable to resend the verification email" }, { status: 503, headers: NO_STORE_HEADERS });
    }
  } catch (error) {
    console.error("POST /api/auth/verify-email/resend failed", error);
    return Response.json({ error: "Unable to resend the verification email" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
