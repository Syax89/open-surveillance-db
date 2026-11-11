/**
 * Route-scoped map stylesheet (perf 2026-11).
 *
 * Leaflet's CSS and every map-only rule (app/styles/map.css) used to ship in
 * the single render-blocking global bundle, i.e. on /faq, /privacy, /fonti…
 * too. They now live in a separate, content-hashed asset that only the
 * routes rendering a Leaflet map link through this component: /mappa,
 * /segnala, /records/[id] and /records/[id]/edit.
 *
 * The href is injected at build time by the `routeStylesheets` plugin in
 * vite.config.ts (`__OSDB_MAP_CSS_HREF__` → "/assets/map-<hash>.css", served
 * immutable by public/_headers). Outside Vite (the node test harnesses that
 * transpile the pages) the define is absent and the stable fallback is used,
 * so no module ever imports a `.css` file.
 *
 * React 19 hoists a `precedence` stylesheet into <head> (render-blocking,
 * deduplicated) AFTER the layout's global stylesheet, which is the cascade
 * position the moved rules had at the end of app/globals.css.
 */
declare const __OSDB_MAP_CSS_HREF__: string | undefined;

export const MAP_CSS_HREF: string =
  typeof __OSDB_MAP_CSS_HREF__ === "string" ? __OSDB_MAP_CSS_HREF__ : "/assets/map.css";

export function MapStyles() {
  return <link rel="stylesheet" href={MAP_CSS_HREF} precedence="default" />;
}
