import { env } from "cloudflare:workers";
import { eraseContributor } from "../../../../db/auth";
import { clearingCookieHeaders, resolveOptionalContributor } from "../../../lib/auth-session";
import { authLimit, cookieHeaderInit } from "../../../lib/auth-route-helpers";
import { csrfVerified, sameOrigin } from "../../../lib/csrf";
import { urlTooLong } from "../../../lib/input-limits";

/**
 * DELETE /api/auth/account — erasure of the authenticated contributor's
 * account (RETENTION_SCHEDULE R7, TERMS §15 pre-launch item; GDPR art. 17
 * self-service path).
 *
 * Security posture is identical to logout (the sibling state-changing auth
 * route): same-origin gate, the shared auth rate-limit bucket, and CSRF
 * double-submit (a request that carries a live session must echo the
 * session's `X-CSRF-Token`). An anonymous request gets 401 — erasure is a
 * per-account operation, not an idempotent logout.
 *
 * Semantics of the erasure (implemented atomically in db/auth.ts):
 *   - every report attributed to this contributor is de-attributed
 *     (`contributor_id = NULL`): the anonymous data stays published, only
 *     the link to the account is severed;
 *   - every session of the contributor is revoked (no live cookie survives);
 *   - the contributor row is hard-deleted.
 *
 * The response carries the number of de-attributed reports (so the UI can
 * confirm what happened) and clears both session cookies.
 */
export async function DELETE(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const blocked = await authLimit(request, env, "/api/auth/account");
  if (blocked) return blocked;

  try {
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ error: "Not authenticated." }, { status: 401 });
    }
    if (!csrfVerified(request, resolved.session.csrfToken)) {
      return Response.json({ error: "Invalid CSRF token. Refresh the page and try again." }, { status: 403 });
    }

    const result = await eraseContributor(resolved.contributor.id);
    return Response.json(
      {
        ok: true,
        deattributedReports: result.deattributedReports,
      },
      { headers: cookieHeaderInit(clearingCookieHeaders(env)) },
    );
  } catch (error) {
    console.error("DELETE /api/auth/account failed", error);
    return Response.json({ error: "Unable to delete the account" }, { status: 500 });
  }
}
