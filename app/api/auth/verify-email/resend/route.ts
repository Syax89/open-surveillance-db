import { env } from "cloudflare:workers";
import { createVerificationToken } from "../../../../../db/auth";
import { resolveOptionalContributor } from "../../../../lib/auth-session";
import { authLimit } from "../../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../../lib/csrf";
import { canSendAuthEmail, sendAuthEmail } from "../../../../../db/mailer";
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
 * Send budget: 3 auth emails per hour per contributor, counted over
 * `email_send_log` rows (the canonical mailer budget, ADR 0020 decision 2 —
 * the log row is written ONLY after the provider accepted the email, so a
 * failed send never consumes the budget and register's own email counts as
 * the first send). The 4th attempt answers 429 with Retry-After before any
 * token or mail work happens, so a blocked request never mints a new token
 * (which would revoke the previous, still-valid link). Creating the new
 * token atomically revokes every older unused verify token for the account,
 * so only the newest link works.
 *
 * Guard order mirrors the other auth mutations: urlTooLong -> sameOrigin ->
 * auth rate-limit -> session (401) -> budget (429) -> token+mail.
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
    // Pre-flight budget check BEFORE minting: a blocked request must not
    // revoke the previous link by creating a token it will never mail.
    // sendAuthEmail re-checks inside (authoritative), so this is only the
    // fast 429 path — the canonical check still gates the provider call.
    const decision = await canSendAuthEmail(resolved.contributor.id, now, env);
    if (!decision.allowed) {
      return Response.json(
        { error: "Too many verification emails. Please try again later." },
        { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(decision.retryAfterSeconds) } },
      );
    }

    const { rawToken } = await createVerificationToken(resolved.contributor.id, "verify", now);
    const mail = await sendAuthEmail({
      contributorId: resolved.contributor.id,
      to: resolved.contributor.email,
      kind: "verify",
      rawToken,
      nowIso: now,
    });

    if (!mail.ok && mail.reason === "rate_limited") {
      // A concurrent request won the window between the pre-flight and the
      // send. Answer 429 like the pre-flight would have.
      return Response.json(
        { error: "Too many verification emails. Please try again later." },
        { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(mail.retryAfterSeconds) } },
      );
    }
    if (!mail.ok) {
      // missing_config (VERIFY_BASE_URL unset) or provider rejection: the
      // email did not go out. Honest failure — the raw token is NEVER
      // echoed; the user can retry once the deployment is fixed.
      console.error("POST /api/auth/verify-email/resend mail failed", mail);
      return Response.json(
        { error: "Unable to resend the verification email" },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    return Response.json({ sent: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("POST /api/auth/verify-email/resend failed", error);
    return Response.json({ error: "Unable to resend the verification email" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
