/**
 * Write gate (multi-method auth Fase E1, t_7e41c4e2).
 *
 * Every state-changing write that creates or mutates public data requires a
 * VERIFIED contributor session:
 *
 *   POST   /api/cameras                      (record intake)
 *   POST   /api/corrections                  (correction/removal intake)
 *   POST   /api/photos                       (photo evidence upload)
 *   PUT/DELETE /api/cameras/[id]/confirmation (community verification toggle)
 *
 * Contract (Fase E1 spec, mirrored in Fase G QA matrix):
 *   - anonymous (no session, dead session)      -> 401
 *   - live session, contributor NOT verified    -> 403
 *   - live session, contributor verified        -> ok
 *
 * Anti-enumeration — single response: the 401 and 403 branches share ONE
 * canonical body (`WRITE_GATE_ERROR`), identical on every gated route, so a
 * caller can never tell "no session" from "account exists but unverified" by
 * the payload — only by the status code the spec assigns to each case. No
 * route-specific wording, no account-state hints, no verification echo.
 *
 * "NIENTE sessioni write prima di verifica": a session opened at register
 * (Fase B) is read-only until `email_verified_at` is set — this gate is the
 * enforcement point at the write boundary for every route, independent of
 * what the register/login flows do with their cookies.
 *
 * The db half (`getContributorVerification`, db/auth.ts) reads the same
 * `email_verified_at` column that Fase A migration 0027 introduces and Fase
 * B/C/D set; the gate never guesses verification from `auth_provider`.
 *
 * Responses are `Cache-Control: no-store`: they are per-request auth
 * outcomes and must never be cached by an edge or browser.
 */

import { getContributorVerification } from "../../db/auth";
import { resolveOptionalContributor, type ResolvedSession } from "./auth-session";

/** The one canonical error body for every denied write (anti-enumeration). */
export const WRITE_GATE_ERROR = "Authentication required.";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

/** The verified contributor a successful gate resolves to. */
export type VerifiedContributor = {
  id: number;
  email: string;
  displayName: string | null;
  emailVerifiedAt: string;
  authProvider: string;
};

export type WriteGateResult =
  | { ok: true; contributor: VerifiedContributor; session: ResolvedSession["session"] }
  | { ok: false; response: Response };

function denied(status: 401 | 403): { ok: false; response: Response } {
  return {
    ok: false,
    response: Response.json({ error: WRITE_GATE_ERROR }, { status, headers: NO_STORE_HEADERS }),
  };
}

/**
 * Resolve the request to a VERIFIED contributor, or produce the uniform
 * denial response. `now` is injectable for deterministic tests (same
 * convention as findSessionByToken / resolveOptionalContributor).
 */
export async function requireVerifiedContributor(
  request: Request,
  now: string = new Date().toISOString(),
): Promise<WriteGateResult> {
  const resolved = await resolveOptionalContributor(request, now);
  if (!resolved) return denied(401);

  const verification = await getContributorVerification(resolved.contributor.id);
  // The account was erased between the session read and this check: treat it
  // exactly like an anonymous request (same 401, same body — never reveal
  // that the account ever existed).
  if (!verification) return denied(401);
  if (!verification.emailVerifiedAt) return denied(403);

  return {
    ok: true,
    contributor: {
      id: resolved.contributor.id,
      email: resolved.contributor.email,
      displayName: resolved.contributor.displayName,
      emailVerifiedAt: verification.emailVerifiedAt,
      authProvider: verification.authProvider,
    },
    session: resolved.session,
  };
}
