import { env } from "cloudflare:workers";
import {
  countVerificationTokensSentSince,
  createVerificationToken,
  VERIFICATION_SEND_LIMIT,
  VERIFICATION_SEND_WINDOW_MS,
} from "../../../../../db/auth";
import { resolveOptionalContributor } from "../../../../lib/auth-session";
import { authLimit } from "../../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../../lib/csrf";
import { sendVerificationEmail } from "../../../../lib/mailer";
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
 * Send budget: 3 verification emails per hour per contributor (counted over
 * rows created in the window — register's own email counts as the first
 * send). The 4th attempt answers 429 with Retry-After before any token or
 * mail work happens. Creating the new token atomically revokes every older
 * unused verify token for the account, so only the newest link works.
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

  const blocked = authLimit(request, env, "/api/auth/verify-email/resend");
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
    const since = new Date(Date.now() - VERIFICATION_SEND_WINDOW_MS).toISOString();
    const sent = await countVerificationTokensSentSince(
      resolved.contributor.id,
      "verify",
      since,
    );
    if (sent >= VERIFICATION_SEND_LIMIT) {
      // The budget counts emails already produced (register = 1). Retry-After
      // is the remaining window, at least 1s.
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((Date.parse(now) - Date.parse(since)) / 1000),
      );
      return Response.json(
        { error: "Too many verification emails. Please try again later." },
        { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(retryAfterSeconds) } },
      );
    }

    const { rawToken } = await createVerificationToken(resolved.contributor.id, "verify", now);
    const mail = await sendVerificationEmail(env, {
      to: resolved.contributor.email,
      rawToken,
      requestOrigin: new URL(request.url).origin,
    });

    // The register contract is mirrored here: the dev/test fallback returns
    // the link so local flows can complete; a real deployment never echoes it.
    const payload: Record<string, unknown> = { sent: true };
    if (!mail.delivered && mail.devLink) payload.devLink = mail.devLink;
    return Response.json(payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("POST /api/auth/verify-email/resend failed", error);
    return Response.json({ error: "Unable to resend the verification email" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
