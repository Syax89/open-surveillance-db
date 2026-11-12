/**
 * Referer sent to OpenStreetMap services by our proxies (privacy, 2026-11).
 *
 * The OSM tile and Nominatim usage policies ask for a valid Referer from web
 * pages and ask proxies not to strip or blank it. They do not need the full
 * page URL — and the full URL of a same-origin request (our site sends
 * `Referrer-Policy: strict-origin-when-cross-origin`, so the browser gives
 * our own proxy the whole URL) can reveal what a visitor is looking at,
 * e.g. `/mappa?lat=41.90&lng=12.48&zoom=17` or `/records/123/edit`.
 *
 * We forward only the ORIGIN ("https://example.org/"): exactly what the
 * browser itself would send to OSM under our Referrer-Policy if it called
 * OSM directly, so the policy is honoured (never stripped, never blank)
 * while nothing about the page, the place or the person is passed on.
 */
export function originOnlyReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}/`;
  } catch {
    return null;
  }
}
