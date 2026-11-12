/**
 * Shared same-origin redirect validation (security audit 2026-11).
 *
 * Every user-controlled post-action redirect (OIDC `redirect_to`, the
 * login-wall `returnTo`, the `/api/locale` `next` deep-link) goes through
 * `safeRedirectTarget`. A target is accepted only when it is a relative,
 * same-origin path:
 *  - must start with a single `/` (no `//host` protocol-relative form);
 *  - no backslash or whitespace ANYWHERE: browsers normalise `\` to `/` and
 *    strip TAB/CR/LF from URLs, so `/\evil.com` and `/<TAB>/evil.com` both
 *    become `//evil.com`;
 *  - no other ASCII control characters (C0 range and DEL);
 *  - no percent-encoded CR/LF/TAB/backslash (`%0d`, `%0a`, `%09`, `%5c`),
 *    which a proxy or client decoding twice could turn into the above;
 *  - no URL scheme.
 *
 * The module has no imports so client components can use it too. Callers
 * that know the origin additionally pin the resolved URL to it with
 * `isSameOrigin` (belt and braces against parser differentials).
 */
export function safeRedirectTarget(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\s]/.test(value)) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  if (/%(?:0[9ad]|5c)/i.test(value)) return null;
  // Keep the browser inside the app: no scheme-relative or protocol values.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return null;
  return value.slice(0, 300);
}

/** True when `target` resolved against `base` stays on `base`'s origin. */
export function isSameOrigin(target: string, base: string): boolean {
  try {
    return new URL(target, base).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/**
 * Validate a redirect target against a known origin: `safeRedirectTarget`
 * plus the resolved-origin check. Returns the path or null.
 */
export function safeSameOriginRedirect(value: unknown, origin: string): string | null {
  const target = safeRedirectTarget(value);
  if (target === null) return null;
  return isSameOrigin(target, origin) ? target : null;
}
