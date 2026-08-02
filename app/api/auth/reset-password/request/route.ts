import { env } from "cloudflare:workers";
import {
  countVerificationTokensSentSince,
  createVerificationToken,
  findContributorByEmail,
  isValidEmail,
  normalizeEmail,
  VERIFICATION_SEND_LIMIT,
  VERIFICATION_SEND_WINDOW_MS,
} from "../../../../../db/auth";
import { authLimit } from "../../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../../lib/csrf";
import { isRecord } from "../../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../../lib/input-limits";
import { sendPasswordResetEmail } from "../../../../lib/mailer";

/**
 * POST /api/auth/reset-password/request — start a password reset
 * (multi-method auth Fase B).
 *
 * Anti-enumeration: EVERY request answers 200 `{ sent: true }`, whether or
 * not the email has an account — the response never reveals whether the
 * address is registered. Only a real account actually receives mail (a
 * reset token is created and the mailer invoked); unknown addresses consume
 * the same request path and cost the same response.
 *
 * Budget: 3 reset emails per hour per CONTRIBUTOR (reset purpose has its
 * own budget, independent from the verify budget). An attacker hammering
 * one known address hits 429 after the 3rd email; the per-IP `auth` bucket
 * bounds requests to unknown addresses.
 *
 * The link goes to the client-side reset page (Fase E2 UI), which calls
 * POST /api/auth/reset-password/confirm with the token + new password.
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const blocked = authLimit(request, env, "/api/auth/reset-password/request");
  if (blocked) return blocked;

  // Generic success for every outcome below (anti-enumeration).
  const ok = () => Response.json({ sent: true }, { headers: NO_STORE_HEADERS });

  try {
    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload)) return ok();

    const email = typeof payload.email === "string" ? normalizeEmail(payload.email) : "";
    if (!isValidEmail(email)) return ok();

    const contributor = await findContributorByEmail(email);
    if (!contributor) return ok();

    const now = new Date().toISOString();
    const since = new Date(Date.now() - VERIFICATION_SEND_WINDOW_MS).toISOString();
    const sent = await countVerificationTokensSentSince(contributor.id, "reset", since);
    if (sent >= VERIFICATION_SEND_LIMIT) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((Date.parse(now) - Date.parse(since)) / 1000),
      );
      return Response.json(
        { error: "Too many reset emails. Please try again later." },
        { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(retryAfterSeconds) } },
      );
    }

    const { rawToken } = await createVerificationToken(contributor.id, "reset", now);
    await sendPasswordResetEmail(env, {
      to: contributor.email,
      rawToken,
      requestOrigin: new URL(request.url).origin,
    });
    return ok();
  } catch (error) {
    if (error instanceof BodyReadError) {
      // Malformed body: same generic success — the reset request is public
      // and must not reveal anything about the address.
      return ok();
    }
    console.error("POST /api/auth/reset-password/request failed", error);
    return Response.json({ error: "Unable to request a password reset" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
