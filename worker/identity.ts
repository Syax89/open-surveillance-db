/** Identity header stripping / injection, ADR 0014 (split from worker/index.ts). */
import type { Env } from "./env";
import type { ModerationAuthSource } from "./gate";

// Identity headers (ADR 0014). The prototype header `x-osdb-user-email` and
// the ChatGPT-plugin headers (`oai-*`) are trusted ONLY when set by this
// edge after a real gate — never when supplied by the caller. The worker is
// the single identity authority: it strips client-supplied values on every
// path and re-injects the server-chosen identity where a gate succeeded.
const PROTOTYPE_IDENTITY_HEADER = "x-osdb-user-email";
// Which credential the moderation gate accepted (`session` | `edge`). Set
// ONLY by this edge next to `x-osdb-user-email` (and stripped from every
// client request like it): a moderator identity resolved from the ambient
// `osdb_session` cookie must still pass the per-session CSRF double-submit
// check at the route, while Basic/bearer (explicit credentials) need none.
// Mirrored in app/lib/authz.ts (MODERATION_AUTH_SOURCE_HEADER).
const MODERATION_AUTH_SOURCE_HEADER = "x-osdb-auth-source";
const PLATFORM_IDENTITY_HEADER = "oai-authenticated-user-email";
const PLATFORM_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const PLATFORM_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";

/**
 * Remove every client-supplied identity header from the request (ADR 0014).
 * The caller can never choose their own role: `x-osdb-user-email` is always
 * dropped, and the ChatGPT-platform headers (`oai-*`) are dropped too unless
 * the deployment explicitly trusts the platform gateway
 * (`TRUST_PLATFORM_HEADERS=true`, ChatGPT-plugin public-alpha only).
 */
export function stripIdentityHeaders(request: Request, env: Env): Request {
  const headers = new Headers(request.headers);
  headers.delete(PROTOTYPE_IDENTITY_HEADER);
  headers.delete(MODERATION_AUTH_SOURCE_HEADER);
  const trustPlatform =
    env.TRUST_PLATFORM_HEADERS === "1" || env.TRUST_PLATFORM_HEADERS === "true";
  if (!trustPlatform) {
    headers.delete(PLATFORM_IDENTITY_HEADER);
    headers.delete(PLATFORM_FULL_NAME_HEADER);
    headers.delete(PLATFORM_FULL_NAME_ENCODING_HEADER);
  }
  return new Request(request, { headers });
}

/**
 * After the moderation gate succeeds, set the server-chosen identity (the
 * per-operator email resolved by the gate, or `MODERATION_IDENTITY_EMAIL`)
 * as `x-osdb-user-email` (QA#3 F5). Fail-closed: without a resolved identity
 * the request passes through anonymous and the route layer rejects it (401),
 * so a misconfigured host can never accidentally grant a role.
 *
 * Alongside it the edge records WHICH credential passed the gate as
 * `x-osdb-auth-source` (`session` for the ambient osdb_session cookie,
 * `edge` for Basic/bearer), so moderator write routes can require the CSRF
 * token exactly when the identity came from the cookie.
 */
export function injectIdentityAfterGate(
  request: Request,
  identityEmail: string | null,
  source: ModerationAuthSource = "edge",
): Request {
  if (!identityEmail) return request;
  const headers = new Headers(request.headers);
  headers.set(PROTOTYPE_IDENTITY_HEADER, identityEmail);
  headers.set(MODERATION_AUTH_SOURCE_HEADER, source);
  return new Request(request, { headers });
}
