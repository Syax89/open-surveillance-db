import { env } from "cloudflare:workers";
import {
  consumeVerificationToken,
  markContributorEmailVerified,
} from "../../../../db/auth";
import { urlTooLong } from "../../../lib/input-limits";

/**
 * GET /api/auth/verify-email?token=<raw> — confirm a registered email
 * address (multi-method auth Fase B).
 *
 * The raw single-use token from the emailed link is consumed atomically:
 *
 *   - 200  token live           -> email_verified_at set, account becomes
 *                                  write-capable (the write gate, Fase E1,
 *                                  reads the column on every state-changing
 *                                  write; this response only confirms it).
 *   - 400  malformed/unknown    -> generic body, never reveals whether a
 *                                  token exists (anti-enumeration).
 *   - 410  already used or past its 24h TTL — Gone, the link is dead.
 *
 * Sessions are NOT touched here: a session opened at register (or a later
 * login) is read-only until `email_verified_at` is set, and every write
 * re-reads the column — so an already-open session starts passing the write
 * gate the moment this endpoint succeeds. No new cookie, no CSRF needed:
 * the token IS the credential, single-use and time-boxed (same model as the
 * login flow's session token, ADR 0013).
 *
 * The response is `no-store`: it is a one-shot auth outcome and must never
 * be cached by an edge or browser.
 */
export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") ?? "";
    // The raw token is 32 random bytes base64url (43 chars); anything wildly
    // off-shape is rejected up front without touching the database.
    if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) {
      return Response.json({ error: "Invalid or expired verification link." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const consumed = await consumeVerificationToken(token, "verify");
    if (consumed.kind !== "verified") {
      // Unknown and wrong-purpose tokens answer 400; used or expired answer
      // 410. Both bodies stay generic (anti-enumeration: never reveal which
      // part was wrong).
      if (consumed.kind === "invalid") {
        return Response.json(
          { error: "Invalid or expired verification link." },
          { status: 400, headers: NO_STORE_HEADERS },
        );
      }
      return Response.json(
        { error: "This verification link has already been used or has expired." },
        { status: 410, headers: NO_STORE_HEADERS },
      );
    }

    // Idempotent flip (COALESCE keeps the first verification timestamp).
    // The account was erased between consume and this update -> treat like
    // an unknown token (same generic body, same 400).
    const contributor = await markContributorEmailVerified(consumed.contributorId);
    if (!contributor) {
      return Response.json({ error: "Invalid or expired verification link." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    return Response.json({ verified: true, contributor }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("GET /api/auth/verify-email failed", error);
    return Response.json({ error: "Unable to verify the email address" }, { status: 503, headers: NO_STORE_HEADERS });
  }
}

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
