/**
 * Route-level authorization (STATUS gap #2, ADR 0014).
 *
 * The prototype has two identity paths, and BOTH are trusted only because
 * the worker edge (worker/index.ts) is the single identity authority:
 *
 *   1. Real ChatGPT-plugin headers (`oai-authenticated-user-email`) when the
 *      app runs inside the ChatGPT plugin platform — the public-alpha path
 *      (the old `app/chatgpt-auth.ts` scaffold was removed; the header
 *      contract below is what remains). The edge strips these headers from
 *      every request unless `TRUST_PLATFORM_HEADERS=true` (a deployment
 *      where the platform gateway, not arbitrary clients, sits in front of
 *      the worker).
 *   2. The prototype header `x-osdb-user-email`, which the worker edge
 *      STRIPS from every incoming request and re-injects ONLY after the
 *      Basic/bearer moderation gate succeeds, from the server-side
 *      `MODERATION_IDENTITY_EMAIL` setting (worker/index.ts). A client can
 *      never set it directly. The gate also accepts a moderator's own
 *      `osdb_session` cookie; the edge then marks the request
 *      `x-osdb-auth-source: session` and moderator writes must pass
 *      `moderatorWriteGuard` (CSRF double-submit) below.
 *
 * `requireRole` resolves the caller against the `users` table (coarse role),
 * rejects unknown/inactive callers with 401, and callers below the required
 * tier with 403. Every protected route calls it before doing any work.
 * Security note: these headers are edge-set-only; any code path that would
 * accept them from an un-gated client reintroduces the authz-spoofing
 * vulnerability closed by ADR 0014.
 */

import { getUserByEmail, type UserRecord, type UserRole, roleAtLeast } from "../../db/users";
import { resolveOptionalContributor } from "./auth-session";
import { CSRF_REJECTED_ERROR, SESSION_COOKIE, csrfVerified, readCookie, sameOrigin } from "./csrf";

const CHATGPT_EMAIL_HEADER = "oai-authenticated-user-email";
const PROTOTYPE_EMAIL_HEADER = "x-osdb-user-email";

/** Resolve the authenticated user from the request, or null when anonymous. */
export async function resolveAuthUser(request: Request): Promise<UserRecord | null> {
  const email = request.headers.get(CHATGPT_EMAIL_HEADER) ?? request.headers.get(PROTOTYPE_EMAIL_HEADER);
  if (!email) return null;
  const user = await getUserByEmail(email);
  if (!user || user.active !== 1) return null;
  return user;
}

export type AuthResult =
  | { ok: true; user: UserRecord }
  | { ok: false; response: Response };

/** Require an authenticated caller whose coarse role is at least `minimum`. */
export async function requireRole(
  request: Request,
  minimum: UserRole,
): Promise<AuthResult> {
  const user = await resolveAuthUser(request);
  if (!user) {
    return {
      ok: false,
      response: Response.json(
        { error: "Authentication required. Provide an authenticated user identity." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  if (!roleAtLeast(user.role, minimum)) {
    return {
      ok: false,
      response: Response.json(
        { error: "Your role does not permit this action." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }
  return { ok: true, user };
}

/**
 * Which credential the worker's moderation gate accepted, injected by the
 * edge next to `x-osdb-user-email` (worker/index.ts, same constant name) and
 * stripped from every client request like it: `session` when the moderator
 * identity was resolved from the ambient `osdb_session` cookie (ADR 0003
 * amendment 2026-10, `users.contributor_id` link), `edge` for Basic/bearer.
 */
export const MODERATION_AUTH_SOURCE_HEADER = "x-osdb-auth-source";

function writeOriginRejected(): Response {
  return Response.json(
    { error: CSRF_REJECTED_ERROR },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Write-origin guard for moderator-gated state changes (PATCH
 * /api/moderation, PATCH /api/appeals/:id). Returns the denial response, or
 * null when the request may proceed. Call it AFTER `requireRole`.
 *
 *  - Every caller: `sameOrigin` (a cross-site browser request always carries
 *    a foreign Origin).
 *  - Session-authenticated moderator (`x-osdb-auth-source: session`): the
 *    browser attaches the `osdb_session` cookie on its own (ambient
 *    authority) and an absent Origin passes `sameOrigin`, so the request
 *    must ALSO echo the per-session CSRF token (`X-CSRF-Token`, double
 *    submit) exactly like the contributor write routes.
 *  - Basic/bearer (`edge`): explicit credentials, no session, no token to
 *    echo — same-origin only, unchanged.
 */
export async function moderatorWriteGuard(request: Request): Promise<Response | null> {
  if (!sameOrigin(request)) return writeOriginRejected();
  // Fail closed: only an explicit `edge` (Basic/bearer) source skips the
  // token. A missing/unknown source still requires it whenever the request
  // carries an osdb_session cookie (the ambient authority CSRF exploits), so a
  // future gate branch that forgets to set the source cannot silently drop
  // the check.
  const source = request.headers.get(MODERATION_AUTH_SOURCE_HEADER);
  if (source === "edge") return null;
  if (source !== "session" && readCookie(request, SESSION_COOKIE) === null) return null;
  let resolved: Awaited<ReturnType<typeof resolveOptionalContributor>> = null;
  try {
    resolved = await resolveOptionalContributor(request);
  } catch (error) {
    console.error("Moderator write guard: session lookup failed", error);
    return Response.json(
      { error: "Moderation is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!resolved || !csrfVerified(request, resolved.session.csrfToken)) return writeOriginRejected();
  return null;
}
