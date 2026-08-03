import { env } from "cloudflare:workers";
import {
  createVerificationToken,
  findContributorByEmail,
  isValidEmail,
  normalizeEmail,
} from "../../../../../db/auth";
import { authLimit } from "../../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../../lib/csrf";
import { isRecord } from "../../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../../lib/input-limits";
import { canSendAuthEmail, sendAuthEmail } from "../../../../../db/mailer";

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
 * Budget: 3 auth emails per hour per CONTRIBUTOR, counted over
 * `email_send_log` rows (canonical mailer budget, ADR 0020 decision 2 — the
 * log row is written ONLY after the provider accepted the email, so a
 * failed send never consumes the budget). Past the budget the route keeps
 * answering the generic 200 `{ sent: true }` WITHOUT minting a token or
 * sending mail — a 429 here would be reachable only for registered addresses
 * and turn the route into a binary existence oracle. The per-IP `auth`
 * bucket bounds raw request volume regardless of the address.
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
    // Pre-flight budget check BEFORE minting: a blocked request must not
    // revoke the previous link by creating a token it will never mail.
    // sendAuthEmail re-checks inside (authoritative), so this is only the
    // fast path for known accounts.
    const decision = await canSendAuthEmail(contributor.id, now, env);
    if (!decision.allowed) {
      // Budget exhausted: still answer the generic success (anti-enumeration).
      // A 429 here would be reachable only for registered addresses (unknown
      // emails always get 200 { sent: true }), turning the route into a binary
      // existence oracle. No token is minted and no mail is sent — the budget
      // still caps real emails at the canonical limit per window.
      return ok();
    }

    const { rawToken } = await createVerificationToken(contributor.id, "reset", now);
    // Mail result is deliberately swallowed: the reset endpoint is public
    // and must answer `{ sent: true }` even if the provider rejects — the
    // response can never reveal whether the address is registered.
    await sendAuthEmail({
      contributorId: contributor.id,
      to: contributor.email,
      kind: "reset",
      rawToken,
      nowIso: now,
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
