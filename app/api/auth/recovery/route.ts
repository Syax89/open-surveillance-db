import { env } from "cloudflare:workers";
import {
  createSession,
  findContributorByEmail,
  getContributorById,
  isValidEmail,
  normalizeEmail,
} from "../../../../db/auth";
import { consumeRecoveryCode } from "../../../../db/passkeys";
import { sessionCookieHeaders, sessionTtlSeconds } from "../../../lib/auth-session";
import { authLimit, cookieHeaderInit, sessionGate } from "../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../lib/csrf";
import { isRecord } from "../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../lib/input-limits";

/**
 * POST /api/auth/recovery — redeem a one-time recovery code (Fase C,
 * t_36989e06). Public.
 *
 * Recovery codes are issued (in plaintext, exactly once) at passkey
 * enrollment, stored only as SHA-256, and are single-use. Redeeming one
 * opens a session and flags that a passkey re-enrollment is required —
 * the user who lost their authenticator must enroll a fresh one from the
 * /account page (Fase E2 UX). The account's other passkeys stay valid.
 *
 * Verification gate (t_f940482b, CEO decision (a) — "login bloccato finché
 * email non verificata"): like every other session-opening method, recovery
 * refuses an account whose `email_verified_at` is NULL with the SAME
 * generic 401 as a wrong code — the code IS consumed on the denied
 * redemption (it was valid and single-use; the account state is what blocks
 * the session), but no session, no lockout. An unverified account cannot
 * hold any login session; its only session is the read-only one from
 * register. Shared choke-point: sessionGate.
 *
 * Anti-enumeration: unknown email, wrong code, used code and unverified
 * account all answer the same generic 401. The per-IP auth rate limit
 * throttles guessing; the code itself carries 96 bits of entropy.
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const blocked = await authLimit(request, env, "/api/auth/recovery");
  if (blocked) return blocked;

  try {
    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload)) {
      return Response.json({ error: "Invalid recovery code." }, { status: 401 });
    }

    const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    if (!isValidEmail(email) || code.length === 0 || code.length > 128) {
      return Response.json({ error: "Invalid recovery code." }, { status: 401 });
    }

    const contributor = await findContributorByEmail(email);
    if (!contributor) {
      return Response.json({ error: "Invalid recovery code." }, { status: 401 });
    }

    // Single-use consume: only an existing, unused code row consumes.
    const consumed = await consumeRecoveryCode(contributor.id, code);
    if (!consumed) {
      return Response.json({ error: "Invalid recovery code." }, { status: 401 });
    }

    const publicContributor = await getContributorById(contributor.id);
    if (!publicContributor) {
      return Response.json({ error: "Invalid recovery code." }, { status: 401 });
    }

    // Verification gate (t_f940482b, CEO decision (a)): a valid redemption
    // for an unverified account does not open a session — same generic 401
    // as a wrong code (anti-enumeration). The code was already consumed
    // above: it was valid and single-use, the account state is what blocks
    // the session. No lockout, no session. Shared choke-point: sessionGate.
    const denied = sessionGate(publicContributor, "Invalid recovery code.");
    if (denied) return denied;

    const { rawToken, csrfToken } = await createSession(contributor.id, {
      ttlSeconds: sessionTtlSeconds(env),
    });
    return Response.json(
      {
        contributor: publicContributor,
        recoveryUsed: true,
        reEnrollmentRequired: true,
      },
      { headers: cookieHeaderInit(sessionCookieHeaders(rawToken, csrfToken, env)) },
    );
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/auth/recovery payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/auth/recovery failed", error);
    return Response.json({ error: "Unable to redeem recovery code" }, { status: 500 });
  }
}
