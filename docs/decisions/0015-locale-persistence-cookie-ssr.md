# ADR 0015: Locale persistence — cookie + SSR, deep-link route

- **Status:** accepted
- **Date:** 2026-08-01
- **Author:** Simone Rondina (project owner)
- **Decision owner:** CEO (Simone) — review requested; see the kanban
  handoff (t_9d67605d). This ADR records the design decision and the CEO can
  veto or adjust it on review.
- **PR:** #132
- **Updates:** ADR 0007-i18n-externalisation-and-pilot-language (decision
  point 4, "Locale stays client-side", is superseded for the server side).
- **Related ADRs:** 0007 (i18n externalisation and pilot language)
- **Related docs:** `docs/SITEMAP.md` (language-neutral URL convention),
  `app/lib/server-i18n.ts`, `app/components/LocaleProvider.tsx`

## Context

The interface is bilingual (English pilot + Italian, type-checked parity,
ADR 0007). Until this decision the locale preference lived **only** in
`localStorage` (`LocaleProvider`, `useSyncExternalStore`), with these
consequences (CTO audit t_c6da60f0, gap 7):

- the first render was always English — an EN→IT flash for Italian users;
- `<html lang>` was set only client-side, after hydration;
- the root layout metadata (title/description/OG, the fallback for home,
  records and auth pages) was hardcoded English — monolingual SEO, no
  localized metadata;
- no shareable URL for a language.

Part of the fix already landed as t_c36fe96c: the nine informational pages
are Server Components with per-route `generateMetadata` and read the locale
from the `opensurveillancedb-locale` cookie (`app/lib/server-i18n.ts`,
`next/headers` `cookies()`), and the client toggle already mirrors the
preference to that cookie. What remained: the **root layout** (html lang +
fallback metadata) and the **deep-link** question.

Constraints: keep the multi-tab sync (`storage` event +
`opensurveillancedb-locale-change`), no regression on the existing i18n
tests, and privacy by design — the cookie is a pure interface preference,
never a tracker (no personal data).

The site map (docs/SITEMAP.md) deliberately uses language-neutral URLs:
public informational routes already use short Italian slugs (`/manifesto`,
`/regole`, `/faq`…) and "public pages stay public" — the URL is the
canonical object and the language is a reader preference.

## Decision

1. **The locale cookie is the single server-side persistence mechanism.**
   The root layout reads it via `getServerLocale()` and renders
   `<html lang={locale}>` on first paint, eliminating the EN→IT flash on
   every route, not just the informational pages.
2. **Root metadata is localized.** The root layout exports
   `generateMetadata()` using the cookie-selected bundle
   (`common.metaTitle` / `common.metaDescription`); it is the localized
   fallback for every route without its own metadata (home, records, auth
   pages). Without a cookie the pilot language (English, ADR 0007) is
   served, which is also what crawlers see.
3. **Deep-links go through a redirect route, not a URL prefix.**
   `GET /api/locale?lang=it&next=/guide` sets the same preference cookie
   server-side and 302-redirects to the same-site path. A shared link then
   renders the target in the chosen language with correct SSR (html lang,
   metadata, content) — no flash, no duplicated content tree. `lang` is
   validated against the supported locales; `next` is restricted to
   same-site paths (open-redirect and header-injection guards) and defaults
   to `/`; the response is `X-Robots-Tag: noindex`.
4. **Content URLs stay language-neutral.** No `/it/*` prefix, no `?lang=`
   parameter on content pages (see Alternatives). The preference persists
   per device/browser via the cookie; the canonical URL remains the single
   public object, consistent with SITEMAP.md.
5. **Client behaviour is unchanged.** The toggle still writes
   `localStorage` (multi-tab sync) + the cookie and calls `router.refresh()`
   on server-rendered routes; `LocaleProvider` keeps syncing
   `document.documentElement.lang` on client-side switches.

## Consequences

- **UX:** Italian users no longer see an EN→IT flash; `<html lang>` matches
  the content from the first paint (a11y + SEO).
- **SEO:** metadata for home/records/auth pages is localized per viewer.
  Trade-off accepted: cookie-dependent metadata means crawlers (which send
  no cookie) index the English pilot — documented, and consistent with
  English being the pilot language.
- **Deep-linking:** a shareable language URL exists
  (`/api/locale?lang=it&next=…`); it is a redirect stub, not indexable
  content, so it does not compete with canonical URLs.
- **Privacy:** the cookie remains a pure preference
  (`samesite=lax`, 1-year max-age, no personal data); a cross-site
  subresource cannot set it, so there is no tracking or session surface.
- **Tests:** rendered-HTML suite extended to assert cookie-driven SSR
  (html lang + localized metadata) and the deep-link route (Set-Cookie,
  safe redirect).
- **Future:** adopting the `/it/*` prefix later (multilingual SEO push,
  third locale) is additive — the cookie and `getServerLocale()` already
  provide the per-locale rendering; only the URL layer would change.

## Alternatives

- **ADR 0007 status quo (localStorage only):** rejected — leaves the flash,
  the client-only `<html lang>` and the monolingual metadata gap
  unaddressed; server components cannot read localStorage.
- **Path prefix `/it/*` (option b):** rejected for now. It is the strongest
  multilingual-SEO option (hreflang, per-language canonicals, true
  per-language share URLs) but it forks the URL space for a
  presentation-only difference (the database content is language-neutral),
  requires redirects + canonical/hreflang/sitemap machinery, and conflicts
  with the established language-neutral Italian-slug convention
  (SITEMAP.md). Revisit when a launch SEO push or a third locale makes the
  investment measurable.
- **`?lang=` parameter on content pages (option c):** rejected as the
  primary mechanism. The root layout cannot read `searchParams` in the App
  Router, so a query parameter cannot drive SSR `<html lang>`/metadata
  consistently — it would produce a client-only partial translation (the
  exact flash this decision removes) plus inconsistent metadata. Query
  parameters are also weak for SEO (duplicate/fragmented indexation). The
  `/api/locale` redirect route covers the deep-link use case server-side
  and consistently instead.
