/**
 * CSRF and cookie primitives for the contributor session (ADR 0013).
 *
 * This module is deliberately dependency-free (no `cloudflare:workers`, no
 * `db/*` imports) so it can be unit-tested in plain Node and reused by every
 * route that must read cookies or verify a state-changing request.
 *
 * Defence in depth for state-changing requests:
 *  1. the session cookie is `HttpOnly; SameSite=Strict`, which already stops
 *     the classic cross-site form attack in modern browsers;
 *  2. every mutating endpoint verifies same-origin (a cross-site browser
 *     request always carries an `Origin` header; same-origin fetches may
 *     omit it in some clients, so absence passes);
 *  3. requests that carry a live session must also echo the per-session CSRF
 *     token through the `X-CSRF-Token` header, matched against the value
 *     stored with the session in the database.
 */

export const SESSION_COOKIE = "osdb_session";
export const CSRF_COOKIE = "osdb_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** Constant-time string comparison (same technique as the edge auth gate). */
export function constantTimeEqual(first: string, second: string): boolean {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return difference === 0;
}

/** Parse a `Cookie` header into a plain map (first occurrence wins). */
export function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("cookie");
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    // QA F1 (t_894e0cc3): a malformed percent-encoding (e.g. a truncated
    // `%E0%A4%A`) makes decodeURIComponent throw URIError, which an
    // unprotected parseCookies call would turn into a 503 / handler crash.
    // A malformed cookie is an ABSENT cookie: treat the value as missing.
    if (name && cookies[name] === undefined) {
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        // percent-encoding malformato: il cookie è trattato come assente
      }
    }
  }
  return cookies;
}

export function readCookie(request: Request, name: string): string | null {
  return parseCookies(request)[name] ?? null;
}

/**
 * Same-origin check: when the request carries an `Origin` header it must
 * match the request URL's scheme + host exactly. Absent Origin (curl, tests,
 * same-origin GET navigation) passes; a cross-site browser POST always sends
 * Origin, so this reliably blocks those.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  const expected = `${url.protocol}//${url.host}`;
  return origin === expected;
}

/**
 * Double-submit CSRF check: the `X-CSRF-Token` header must match the
 * per-session token stored server-side (compared in constant time).
 */
export function csrfVerified(request: Request, expected: string): boolean {
  const header = request.headers.get(CSRF_HEADER);
  return typeof header === "string" && header.length > 0 && constantTimeEqual(header, expected);
}

function cookieAttributes(options: {
  maxAgeSeconds: number;
  secure: boolean;
  httpOnly: boolean;
}): string {
  const parts = [
    "Path=/",
    `Max-Age=${options.maxAgeSeconds}`,
    `Expires=${new Date(Date.now() + options.maxAgeSeconds * 1000).toUTCString()}`,
    options.httpOnly ? "HttpOnly" : "",
    "SameSite=Strict",
    options.secure ? "Secure" : "",
  ];
  return parts.filter(Boolean).join("; ");
}

/**
 * The two cookies a live session produces:
 *  - session cookie: HttpOnly, holds the raw session token;
 *  - CSRF cookie: readable by script (so the client can echo it as a header),
 *    holds the per-session CSRF token.
 */
export function buildSessionCookies(
  rawToken: string,
  csrfToken: string,
  options: { maxAgeSeconds: number; secure: boolean },
): string[] {
  const attributes = cookieAttributes({ ...options, httpOnly: true });
  const csrfAttributes = cookieAttributes({ ...options, httpOnly: false });
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(rawToken)}; ${attributes}`,
    `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}; ${csrfAttributes}`,
  ];
}

/** Expire both cookies (logout). */
export function clearSessionCookies(options: { secure: boolean }): string[] {
  const expired = "Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/";
  const sameSite = "SameSite=Strict";
  const secure = options.secure ? "Secure" : "";
  return [
    `${SESSION_COOKIE}=; ${expired}; ${sameSite}; ${secure}`,
    `${CSRF_COOKIE}=; ${expired}; ${sameSite}; ${secure}`,
  ];
}
