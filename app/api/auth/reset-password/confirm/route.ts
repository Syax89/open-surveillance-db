import { env } from "cloudflare:workers";
import { applyPasswordReset, consumeVerificationToken } from "../../../../../db/auth";
import { authLimit, isValidPassword } from "../../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../../lib/csrf";
import { isRecord } from "../../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../../lib/input-limits";

/**
 * POST /api/auth/reset-password/confirm — set a new password with the
 * single-use reset token from the emailed link (multi-method auth Fase B).
 *
 *   - 200  token live           -> password rotated (PBKDF2 re-hash), EVERY
 *                                  live session revoked (a session opened
 *                                  with the old password must die), and the
 *                                  email marked verified (proving mailbox
 *                                  control is what a reset does) — all in ONE
 *                                  atomic batch, so a crash cannot leave the
 *                                  hash rotated but sessions live, or sessions
 *                                  dead but the hash old.
 *   - 400  malformed token/password, or unknown token — generic body
 *          (anti-enumeration).
 *   - 410  token already used or past its 24h TTL — Gone, the link is dead.
 *
 * The response is `no-store`: a one-shot auth outcome.
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const blocked = await authLimit(request, env, "/api/auth/reset-password/confirm");
  if (blocked) return blocked;

  try {
    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload)) {
      return Response.json({ error: "Invalid or expired reset link." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const token = typeof payload.token === "string" ? payload.token : "";
    const password = payload.password;
    // Same token shape rule as the verify endpoint; the password policy is
    // the shared NEW-password one (10..200 chars + composition rules, CEO
    // feedback 2026-08-03).
    if (!/^[A-Za-z0-9_-]{20,128}$/.test(token) || !isValidPassword(password)) {
      return Response.json({ error: "Invalid or expired reset link." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const consumed = await consumeVerificationToken(token, "reset");
    if (consumed.kind !== "verified") {
      if (consumed.kind === "invalid") {
        return Response.json({ error: "Invalid or expired reset link." }, { status: 400, headers: NO_STORE_HEADERS });
      }
      return Response.json(
        { error: "This reset link has already been used or has expired." },
        { status: 410, headers: NO_STORE_HEADERS },
      );
    }

    const now = new Date().toISOString();
    // Rotate the hash, kill every live session and verify the address
    // (idempotent) in ONE atomic batch: the new hash must be in place before
    // the next login, revocation happens before the response so a stolen old
    // session cannot race the reset, and a crash mid-way can never leave the
    // hash rotated but sessions live (or vice versa).
    const contributor = await applyPasswordReset(consumed.contributorId, password, now);
    if (!contributor) {
      // Account erased between consume and update: nothing to reset into.
      return Response.json({ error: "Invalid or expired reset link." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    return Response.json({ ok: true, contributor }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/auth/reset-password/confirm payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE_HEADERS });
    }
    console.error("POST /api/auth/reset-password/confirm failed", error);
    return Response.json({ error: "Unable to reset the password" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
