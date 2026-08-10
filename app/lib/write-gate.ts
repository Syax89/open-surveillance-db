/**
 * Write gate (multi-method auth Fase E1, t_7e41c4e2; EPIC api-keys T11).
 *
 * Every state-changing write that creates or mutates public data requires a
 * VERIFIED contributor — authenticated EITHER by an existing session cookie
 * OR by a private write API key (`Authorization: Bearer <key>`, EPIC
 * api-keys, decisions D1-D13):
 *
 *   POST   /api/cameras                      (record intake)
 *   POST   /api/corrections                  (correction/removal intake)
 *   PUT/DELETE /api/cameras/[id]/confirmation (community verification toggle)
 *
 * Dual-path gate (plan §1.4, T11):
 *
 *   1. `Authorization` header present → API-key path: the key is resolved
 *      through the pure bridge (app/lib/api-key-auth.ts, T10), which
 *      collapses every failure mode (unknown hash, revoked, expired,
 *      malformed header) to a single null → ONE canonical 401
 *      (`WRITE_GATE_ERROR`, no existence oracle). A key that resolves but
 *      lacks the required scope (D4 family scopes: submit/confirm/edit/
 *      action) → 403. The gate also decides verification (D10): a key whose
 *      owner is not an email-verified contributor is refused 403 even when
 *      the key itself is live — keys are minted only from verified sessions
 *      (T7), so this is a fail-closed invariant, not a reachable state.
 *      Success → `{ ok, contributor, session: null, authMethod: "api_key",
 *      apiKeyId }`. CSRF does NOT apply: a machine client holding a secret
 *      bearer credential carries no ambient authority from a browser origin.
 *
 *   2. No `Authorization` header → EXACT existing session path (unchanged):
 *      malformed-cookie 400 → resolveOptionalContributor → 401 anonymous/
 *      dead session → 403 unverified → success with `session` +
 *      `authMethod: "session"` — the handlers keep their double-submit CSRF
 *      check on this branch only.
 *
 * Anti-enumeration — single response: the 401 and 403 branches share ONE
 * canonical body (`WRITE_GATE_ERROR`), identical on every gated route, so a
 * caller can never tell "no session" from "account exists but unverified" by
 * the payload — only by the status code the spec assigns to each case. No
 * route-specific wording, no account-state hints, no verification echo, no
 * key-shape oracle (the D2 `osdb_` format is never checked by the gate).
 *
 * "NIENTE sessioni write prima di verifica": a session opened at register
 * (Fase B) is read-only until `email_verified_at` is set — this gate is the
 * enforcement point at the write boundary for every route, independent of
 * what the register/login flows do with their cookies. Since t_6dc1c96f
 * (CEO feedback 2026-08-03) the login flow is stricter: POST /api/auth/login
 * refuses unverified accounts entirely (generic 401), so the only session an
 * unverified account can hold is the read-only one from register — and this
 * gate still blocks every write for it (403).
 *
 * The db half (`getContributorVerification`, db/auth.ts) reads the same
 * `email_verified_at` column that Fase A migration 0027 introduces and Fase
 * B/C/D set; the gate never guesses verification from `auth_provider`.
 *
 * Responses are `Cache-Control: no-store`: they are per-request auth
 * outcomes and must never be cached by an edge or browser.
 */

import { getContributorVerification } from "../../db/auth";
import { API_KEY_SCOPES, type ApiKeyScope } from "../../db/api-keys";
import { resolveApiKeyContributor } from "./api-key-auth";
import {
  malformedSessionCookieGuard,
  resolveOptionalContributor,
  type ResolvedSession,
} from "./auth-session";

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

/** How the request authenticated (T11): session cookie or bearer API key. */
export type WriteAuthMethod = "session" | "api_key";

/**
 * Result of the unified write gate (T11). The `ok: true` branches carry the
 * auth method so handlers can apply the per-method extras — the double-submit
 * CSRF check on the `session` branch only (a bearer client holds no ambient
 * browser authority), nothing extra on `api_key`.
 */
export type WriteAuthResult =
  | {
      ok: true;
      contributor: VerifiedContributor;
      session: ResolvedSession["session"];
      authMethod: "session";
      apiKeyId: null;
    }
  | {
      ok: true;
      contributor: VerifiedContributor;
      session: null;
      authMethod: "api_key";
      apiKeyId: number;
    }
  | { ok: false; response: Response };

/** Result of the session-only gate (`requireVerifiedContributor`, pre-T11). */
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
 * Parse a stored key's `scopes` JSON column (D4, stored as a JSON array of
 * whitelist family scopes) into a safe scope list. Malformed JSON or
 * non-whitelist entries degrade to NO granted scopes (fail-closed → the gate
 * answers 403 scope-mismatch) — a corrupt row must never widen access.
 */
function parseKeyScopes(raw: string): readonly ApiKeyScope[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((scope): scope is ApiKeyScope =>
      API_KEY_SCOPES.includes(scope as ApiKeyScope),
    );
  } catch {
    return [];
  }
}

/**
 * Unified write gate (EPIC api-keys T11, plan §1.4): resolves the request to
 * a VERIFIED contributor through the bearer API-key path when an
 * `Authorization` header is present, or the exact existing session path
 * otherwise. `scope` is the D4 family scope the route requires (e.g.
 * `"submit"` for record intake); a valid key without it is refused 403.
 *
 * `now` is injectable for deterministic tests (same convention as
 * findSessionByToken / resolveOptionalContributor / findApiKeyByHash).
 */
export async function requireWriteAuth(
  request: Request,
  scope: ApiKeyScope,
  now: string = new Date().toISOString(),
): Promise<WriteAuthResult> {
  // Bearer present → API-key path (fail-closed: a machine client that
  // believed it was authenticating must never silently fall through to a
  // session, so ANY present Authorization header — even a malformed one —
  // commits the request to the key path).
  if (request.headers.has("authorization")) {
    const resolved = await resolveApiKeyContributor(request, now);
    if (resolved === null) return denied(401);

    // D10 — the gate decides verification, not the auth module: a key whose
    // owner lost verified status must not write even though the key itself
    // is live. Same 403 as the unverified-session branch, same canonical
    // body (anti-enumeration).
    if (!resolved.contributor.emailVerifiedAt) return denied(403);

    // Scope matrix (D4): the route's required family scope must be among the
    // key's granted scopes; anything else is a uniform 403.
    if (!parseKeyScopes(resolved.apiKey.scopes).includes(scope)) return denied(403);

    return {
      ok: true,
      contributor: {
        id: resolved.contributor.id,
        email: resolved.contributor.email,
        displayName: resolved.contributor.displayName,
        emailVerifiedAt: resolved.contributor.emailVerifiedAt,
        authProvider: resolved.contributor.authProvider,
      },
      session: null,
      authMethod: "api_key",
      apiKeyId: resolved.apiKey.id,
    };
  }

  // No Authorization header → exact existing session path (unchanged).
  const sessionGate = await requireVerifiedContributor(request, now);
  if (!sessionGate.ok) return sessionGate;
  return {
    ok: true,
    contributor: sessionGate.contributor,
    session: sessionGate.session,
    authMethod: "session",
    apiKeyId: null,
  };
}

/**
 * Resolve the request to a VERIFIED contributor via the SESSION path only,
 * or produce the uniform denial response. `now` is injectable for
 * deterministic tests (same convention as findSessionByToken /
 * resolveOptionalContributor).
 *
 * Kept exported unchanged (EPIC api-keys T11): the key-management endpoints
 * (POST/GET/DELETE /api/auth/keys, T7-T9) and any session-only consumer
 * still gate on this; `requireWriteAuth` uses it for its session branch.
 */
export async function requireVerifiedContributor(
  request: Request,
  now: string = new Date().toISOString(),
): Promise<WriteGateResult> {
  // QA F1 (t_b6f04976): a PRESENT-but-undecodable session cookie is a client
  // bug, not an anonymous caller — answer a clean 400 so the browser clears
  // the corrupt cookie instead of silently failing the write gate with the
  // generic 401 (which hides the corruption from the user).
  const malformed = malformedSessionCookieGuard(request);
  if (malformed) return { ok: false, response: malformed };

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
