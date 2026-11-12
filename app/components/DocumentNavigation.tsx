"use client";

import { useEffect } from "react";

/**
 * One page transition everywhere (owner 2026-11: "the list → open record
 * transition is a soft fade; I want that between all pages").
 *
 * "Open record" is a plain <a>: the browser loads the next document and,
 * with the site-wide `@view-transition { navigation:auto }` opt-in
 * (app/globals.css), crossfades the two pages. The next/link links (header,
 * footer, map ↔ directory, back links…) instead swapped content in place via
 * a client-side router navigation, with no transition at all.
 *
 * This listener makes every internal link click a normal document
 * navigation, so every page change gets the same crossfade. It runs in the
 * CAPTURE phase on window, before React's delegated handlers: stopping the
 * propagation there keeps next/link's onClick (and its preventDefault) from
 * running while the browser's default navigation proceeds. Programmatic
 * navigations (filters, form redirects) are untouched.
 *
 * Left alone: modified/middle clicks, target/download links, other origins,
 * /api/ downloads, same-page #anchors, and links marked `data-client-nav`
 * (opt-out: the framework router handles them as usual). Browsers without
 * cross-document View Transitions simply navigate (no animation) — and
 * back/forward can restore pages from the bfcache.
 *
 * IMPORTANT for link authors: because propagation stops in the capture
 * phase, an `onClick` handler on an internal <a>/<Link> does NOT run
 * (analytics, closing a menu, saving a draft...). Put `data-client-nav` on
 * any link whose onClick must run, or handle the work on the next page.
 *
 * No `event.defaultPrevented` check: this capture listener on window is the
 * first listener to see the click, so nothing can have prevented it yet.
 */
export function DocumentNavigation() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.hasAttribute("data-client-nav")) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      event.stopPropagation();
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
