/**
 * Session wiring between HTTP requests and the contributor session store.
 *
 * The database half (token storage, hashing) lives in `db/auth.ts`; this
 * module bridges raw `Request`/`Response` concerns — reading the session
 * cookie, resolving it to a contributor, and producing the cookie headers a
 * login/register/logout response must carry.
 */

import { findSessionByToken, type PublicContributor, type Session } from "../../db/auth";
import {
  buildSessionCookies,
  clearSessionCookies,
  readCookie,
  SESSION_COOKIE,
} from "./csrf";

type EnvLike = { [key: string]: unknown };

export const DEFAULT_SESSION_TTL_DAYS = 30;

/** Session lifetime in seconds, from `AUTH_SESSION_TTL_DAYS` (default 30). */
export function sessionTtlSeconds(env: unknown): number {
  const days = Number((env as EnvLike).AUTH_SESSION_TTL_DAYS);
  const effectiveDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_SESSION_TTL_DAYS;
  return Math.round(effectiveDays * 24 * 60 * 60);
}

/**
 * `Secure` cookie attribute — SECURE-BY-DEFAULT (QA#3 F2, t_63e0d13c).
 *
 * The old default was fail-open: `Secure` was set ONLY when
 * `AUTH_COOKIE_SECURE === "true"`, so a production deploy that forgot the
 * var served the session cookie over plain HTTP. The new rule:
 *
 *   - `AUTH_COOKIE_SECURE=true`  → always Secure;
 *   - `AUTH_COOKIE_SECURE=false` → never Secure (explicit local-prototype
 *     override on plain HTTP, documented in .dev.vars);
 *   - unset                     → Secure EXCEPT when `ENVIRONMENT ===
 *     "development"` (the local prototype runs on plain HTTP on a LAN; a
 *     Secure cookie would never be sent back). Unset in production = Secure
 *     (fail-closed).
 *
 * SameSite is `Strict` on every path (app/lib/csrf.ts) regardless of this
 * flag: the ENVIRONMENT conditioning only ever relaxes `Secure`.
 */
export function cookieSecure(env: unknown): boolean {
  const value = (env as EnvLike).AUTH_COOKIE_SECURE;
  if (value === "true") return true;
  if (value === "false") return false;
  return (env as EnvLike).ENVIRONMENT !== "development";
}

export type ResolvedSession = {
  contributor: PublicContributor;
  session: Session;
};

/**
 * Resolve the request's session cookie to a live session + contributor.
 * Returns null when there is no cookie or the token is unknown/revoked/
 * expired — callers treat null as "anonymous".
 */
export async function resolveOptionalContributor(
  request: Request,
  now: string = new Date().toISOString(),
): Promise<ResolvedSession | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const session = await findSessionByToken(token, now);
  if (!session) return null;
  return { contributor: session.contributor, session };
}

/** Convenience: the cookie header pair for a fresh session. */
export function sessionCookieHeaders(
  rawToken: string,
  csrfToken: string,
  env: unknown,
): string[] {
  return buildSessionCookies(rawToken, csrfToken, {
    maxAgeSeconds: sessionTtlSeconds(env),
    secure: cookieSecure(env),
  });
}

/** Convenience: the cookie headers that delete both session cookies. */
export function clearingCookieHeaders(env: unknown): string[] {
  return clearSessionCookies({ secure: cookieSecure(env) });
}
