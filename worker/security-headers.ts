/** Global security headers, CSP nonce and discovery Link header (split from worker/index.ts). */
import { SESSION_COOKIE } from "../app/lib/csrf";
import { PREPRODUCTION_HOST } from "./host";

/**
 * Global security headers (audit t_a07443bd, P2 gap).
 *
 * Applied by the worker edge to EVERY response — pages, API JSON, errors,
 * image optimization, the moderation gate. Individual handlers may set
 * stricter values (an app route may set a more restrictive policy on its
 * own response): the middleware only
 * ADDS headers that are not already present, so a more restrictive policy
 * set by an app route is never weakened.
 *
 * CSP notes (calibrated for the vinext/Next RSC runtime):
 * - `script-src 'unsafe-inline'` is required: the server-rendered HTML
 *   embeds RSC bootstrap inline scripts (`self.__VINEXT_RSC_*`) plus a
 *   same-origin dynamic `import()`. No CDNs, no `unsafe-eval`.
 * - `style-src 'unsafe-inline'` is required for the inline
 *   `<style data-vinext-fonts>` font preloads emitted by vinext.
 * - `img-src 'self' data: blob:` — tiles are served same-origin through the
 *   /api/tiles proxy (docs/OSM_INTEGRATION.md); Leaflet div-icons use HTML.
 * - `frame-ancestors 'none'` + `X-Frame-Options: DENY`: the site must not
 *   be iframable (clickjacking). Kept as headers even though modern
 *   browsers prefer the CSP directive, for legacy coverage.
 * - `default-src 'self'` + `object-src 'none'` + `form-action 'self'` +
 *   `base-uri 'self'`: baseline that blocks most reflected/XSS payloads at
 *   the header level.
 *
 * HSTS + COOP (2026-10-15, closes t_6148aa6f): the public domain is live
 * on HTTPS (hostRedirect already forces https:// and the www alias to the
 * apex), so `Strict-Transport-Security` is safe to set here rather than at
 * the CF zone level. `includeSubDomains` is safe too: www already 308s to
 * the apex and the only other host, the preprod alias, lives on an
 * entirely different domain (osdb.syaxhome89.com), not a subdomain of
 * this one. `preload` is deliberately omitted — it is a long-lived
 * browser-list commitment that is hard to reverse; add it later once HTTPS
 * coverage has been stable for a while.
 * `Cross-Origin-Opener-Policy: same-origin` is safe alongside the existing
 * Google OIDC login: that flow is a full-page redirect (db/oidc.ts), never
 * a `window.open` popup, so there is no `window.opener` relationship for
 * COOP to break.
 */
/**
 * Geolocation unblock for /mappa and /segnala (t_18259daa + CEO 2026-08-09
 * one-tap report location). On /mappa the locate feature is fully
 * client-side (the position never leaves the browser). On /segnala, an
 * explicit one-tap action feeds the selected point into the same report flow
 * as a map click: an explicit user action plus the browser permission gate
 * the lookup, and the UI still exposes map/manual alternatives. `geolocation=(self)` restricts the
 * feature to THIS origin's own document — an embedded iframe can never
 * inherit it. Every other route keeps the fully-denying policy; camera and
 * microphone stay blocked everywhere.
 */
const GEOLOCATION_PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(self)";
const GEOLOCATION_ROUTES = new Set(["/mappa", "/segnala"]);

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  [
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; " +
      "font-src 'self'; " +
      "connect-src 'self'; " +
      "media-src 'self'; " +
      "object-src 'none'; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'; " +
      "worker-src 'self' blob:",
  ],
];

/**
 * CSP nonce for the vinext-rendered page path only (see the call site in
 * `dispatch()`). A random nonce per request lets that ONE path drop
 * 'unsafe-inline' from script-src/style-src without touching the static
 * fallback above, which every other response in this file still uses.
 */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildCspWithNonce(nonce: string): string {
  return (
    "default-src 'self'; " +
    `script-src 'self' 'nonce-${nonce}'; ` +
    `style-src 'self' 'nonce-${nonce}'; ` +
    "img-src 'self' data: blob:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
    "media-src 'self'; " +
    "object-src 'none'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "worker-src 'self' blob:"
  );
}

/**
 * RFC 8288 discovery links (2026-08-22, isitagentready `linkHeaders`):
 * every 2xx HTML document carries Link headers pointing to the RFC 9727
 * API catalog, the OpenAPI spec (service-desc) and the human docs page
 * (service-doc), so an AI agent that lands on ANY page can discover the
 * machine-readable API. Relative references resolve against the request
 * URI per RFC 8288 §3.2. Never added to API/JSON responses, errors or
 * redirects.
 */
const API_LINK_HEADER = [
  `</.well-known/api-catalog>; rel="api-catalog"`,
  `</openapi.json>; rel="service-desc"; type="application/openapi+json"`,
  `</api-docs>; rel="service-doc"`,
].join(", ");

/**
 * Return a copy of `response` carrying the global security headers. On the
 * /mappa and /segnala routes the Permissions-Policy is relaxed to allow
 * geolocation for the top-level document; every other route keeps the
 * fully-denying policy. The override still respects the "never overwrite"
 * rule: a stricter policy already set by an app handler survives untouched.
 */
export function withSecurityHeaders(response: Response, pathname?: string, hostname?: string, privatePolicy = false): Response {
  const headers = new Headers(response.headers);
  // Never overwrite an existing header: app routes may set stricter
  // values that must survive the middleware. The
  // Permissions-Policy is special-cased below, so remember whether an app
  // handler already shipped one BEFORE the defaults below fill it in.
  const appSetPermissionsPolicy = headers.has("Permissions-Policy");
  for (const [name, value] of SECURITY_HEADERS) {
    if (!headers.has(name)) headers.set(name, value);
  }
  // RFC 8288 discovery links on HTML documents only (2xx, text/html), and
  // never clobbering a Link an app route already set.
  if (
    response.status >= 200 &&
    response.status < 300 &&
    (response.headers.get("content-type") ?? "").startsWith("text/html") &&
    !headers.has("Link")
  ) {
    headers.set("Link", API_LINK_HEADER);
  }
  if (pathname && GEOLOCATION_ROUTES.has(pathname) && !appSetPermissionsPolicy) {
    headers.set("Permissions-Policy", GEOLOCATION_PERMISSIONS_POLICY);
  }
  if (hostname?.toLowerCase() === PREPRODUCTION_HOST) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  // Private (gated) surfaces must never be publicly cacheable.
  if (privatePolicy) headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * HTML document cache policy (2026-11, bfcache / Lighthouse
 * `MainResourceHasCacheControlNoStore`).
 *
 * vinext answers every dynamic page `Cache-Control: no-store,
 * must-revalidate`, which disqualifies the page from the back/forward cache:
 * Back then does a full reload + re-hydration. For PUBLIC, non-personalised
 * HTML the edge rewrites that to `private, no-cache`:
 * - `private`: shared caches (Cloudflare, proxies) must never store the
 *   page, so a per-request CSP nonce is never served to another visitor;
 * - `no-cache`: the browser may keep a copy (bfcache, history) but must
 *   revalidate before reusing it on any normal navigation. HTML carries no
 *   ETag / Last-Modified (stripped below), so revalidation can never end in
 *   a 304 that reuses a stored body: every fresh navigation gets a full
 *   render with a fresh nonce.
 *
 * `no-store` is KEPT (forced) for an HTML document when ANY of:
 * - the request carries an `osdb_session` cookie: the shell (header, menus)
 *   and several pages render per-user state, so the whole visit is personal;
 * - the response sets a cookie (`Set-Cookie`);
 * - the route is personal or an auth flow (PRIVATE_HTML_ROUTES: account,
 *   moderation, record edit, login/register/password/verification pages,
 *   whose URLs may also carry one-time tokens).
 * Only 200 GET/HEAD documents whose app policy is vinext's dynamic no-store
 * default are relaxed; errors, redirects, ISR/explicit app policies, RSC
 * flight (text/x-component) and API JSON responses are left untouched.
 */
export const PUBLIC_HTML_CACHE_CONTROL = "private, no-cache";
const VINEXT_DYNAMIC_CACHE_CONTROL = new Set(["no-store", "no-store, must-revalidate"]);
const PRIVATE_HTML_ROUTES = new Set([
  "/account",
  "/moderation",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
]);
const PRIVATE_HTML_ROUTE_PATTERNS = [/^\/records\/[^/]+\/edit$/];

/** `normalizedPath` is the router-equivalent path from normalizeGatePath. */
export function isPrivateHtmlRoute(normalizedPath: string): boolean {
  const key = normalizedPath.toLowerCase();
  return PRIVATE_HTML_ROUTES.has(key) || PRIVATE_HTML_ROUTE_PATTERNS.some((pattern) => pattern.test(key));
}

export function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get("cookie");
  if (!cookie) return false;
  return cookie.split(";").some((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
}

/**
 * API cache policy (defence in depth, security audit 2026-11).
 *
 * Every response under /api/auth/* (sessions, keys, passkeys, OIDC,
 * password reset — personal or token-bearing by definition) and every
 * /api/* response to a request that carries an `osdb_session` cookie is
 * forced to `Cache-Control: no-store`, unless the route already chose
 * no-store. A route that forgets its own header, or a public cached
 * response served to a signed-in caller, can then never be stored by a
 * shared cache or the browser with personal content in it.
 *
 * Anonymous requests to public API routes (public-cache.ts reads, tiles,
 * geocode) are left untouched, so their edge/browser caching is unchanged.
 * `headers` is mutated in place.
 */
export function applyApiCachePolicy(request: Request, normalizedPath: string, headers: Headers): void {
  const key = normalizedPath.toLowerCase();
  if (key !== "/api" && !key.startsWith("/api/")) return;
  const personal = key === "/api/auth" || key.startsWith("/api/auth/") || hasSessionCookie(request);
  if (!personal) return;
  const current = (headers.get("Cache-Control") ?? "").toLowerCase();
  if (/(?:^|,)\s*no-store\s*(?:,|$)/.test(current)) return;
  headers.set("Cache-Control", "no-store");
  // A validator would let a cache revalidate a body it must not keep.
  headers.delete("ETag");
  headers.delete("Last-Modified");
}

/**
 * Apply the HTML document cache policy above to `headers` (mutated in
 * place) for a response rendered by the vinext page pipeline. Non-HTML
 * responses are returned untouched.
 */
export function applyHtmlDocumentCachePolicy(
  request: Request,
  normalizedPath: string,
  status: number,
  headers: Headers,
): void {
  if (!(headers.get("content-type") ?? "").toLowerCase().startsWith("text/html")) return;
  // Never offer a validator on an HTML document: a 304 would let the
  // browser reuse a stored body whose CSP nonce belongs to an older render.
  headers.delete("ETag");
  headers.delete("Last-Modified");
  if (hasSessionCookie(request) || headers.has("Set-Cookie") || isPrivateHtmlRoute(normalizedPath)) {
    headers.set("Cache-Control", "no-store");
    return;
  }
  const current = (headers.get("Cache-Control") ?? "").trim().toLowerCase();
  if (
    status === 200 &&
    (request.method === "GET" || request.method === "HEAD") &&
    VINEXT_DYNAMIC_CACHE_CONTROL.has(current)
  ) {
    headers.set("Cache-Control", PUBLIC_HTML_CACHE_CONTROL);
  }
}
