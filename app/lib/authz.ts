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
 *      never set it directly.
 *
 * `requireRole` resolves the caller against the `users` table (coarse role),
 * rejects unknown/inactive callers with 401, and callers below the required
 * tier with 403. Every protected route calls it before doing any work.
 * Security note: these headers are edge-set-only; any code path that would
 * accept them from an un-gated client reintroduces the authz-spoofing
 * vulnerability closed by ADR 0014.
 */

import { getUserByEmail, type UserRecord, type UserRole, roleAtLeast } from "../../db/users";

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
