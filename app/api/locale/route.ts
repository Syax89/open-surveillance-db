import { LOCALE_COOKIE, resolveLocale } from "../../lib/i18n/types";
import type { Locale } from "../../lib/i18n/types";
import { urlTooLong } from "../../lib/input-limits";

/**
 * GET /api/locale?lang=it&next=/guide — persist the interface locale and
 * deep-link to it (ADR 0015).
 *
 * The locale preference is normally written client-side by the LocaleToggle
 * (localStorage + cookie, multi-tab sync). This route exists for the URL
 * deep-link case: a shareable link that forces a language for the *next*
 * viewer, e.g. `https://site/api/locale?lang=it&next=/guide` sets the
 * preference cookie server-side and lands on /guide, which then SSR-renders
 * Italian (html lang, metadata and content) with no EN->IT flash.
 *
 * Privacy by design: this sets the same preference cookie the client writes
 * (interface locale only, no personal data). SameSite=Lax means a
 * cross-site subresource (e.g. an <img> embed) cannot set it — only a
 * top-level navigation the user actually performs can, and its worst effect
 * is switching their UI language.
 */
export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  const url = new URL(request.url);
  // Registry-driven: only registered locale codes are accepted, anything
  // else falls back to the pilot language (no it/en ternary).
  const locale: Locale = resolveLocale(url.searchParams.get("lang"));

  // Safe redirect target: same-site path only. Rejects absolute URLs,
  // protocol-relative //host and backslash tricks, literal CR/LF and the
  // percent-encoded forms (%0d/%0a): URL parsing decodes once, so an
  // encoded CRLF arrives here as literal "%0d%0a" text and must not reach
  // the Location header (defense in depth — the headers API would throw on
  // raw CR/LF, but proxies and clients may decode differently).
  const next = url.searchParams.get("next") ?? "/";
  const target =
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/\\") &&
    !/[\r\n]/.test(next) &&
    !/%0d|%0a/i.test(next)
      ? next
      : "/";

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      // Same attributes as the client-side write (LocaleProvider):
      // a one-year interface preference, never a tracker.
      "Set-Cookie": `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`,
      // Redirect stub: keep it out of the index so deep-links don't
      // compete with the canonical content URL in search results.
      "X-Robots-Tag": "noindex",
    },
  });
}
