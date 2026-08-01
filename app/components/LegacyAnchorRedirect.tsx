"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * LegacyAnchorRedirect (F3, t_2ca69725) — client-side redirect of the legacy
 * home-page tool anchors to the new tool routes.
 *
 * Before the F1/F2 route split the four public tools lived on the home page
 * as anchor sections (#map, #records, #report, #correction). Bookmarks and
 * shared links still point at those fragments, but a URL fragment NEVER
 * reaches the server — a 302 redirect cannot work (CTO correction to Vera's
 * D8, t_f24c3227, docs/FRONTEND_PLAN.md §1.2). This component runs once on
 * mount, reads `location.hash` and `router.replace()`s to the matching tool
 * route.
 *
 * Behaviour contract:
 *  - only the four legacy tool anchors redirect; in-page anchors that still
 *    exist on the home (#top, #how-it-works) are left untouched;
 *  - the current query string is preserved (future deep-link params, e.g.
 *    ?focus= or ?freshness=), the fragment itself is dropped;
 *  - language is a cookie (ADR 0015), not a URL param — the redirect never
 *    touches it, so the locale survives the client-side navigation;
 *  - `router.replace` (not `push`): the redirect does not create a history
 *    entry, so the back button returns to the referring page, not to the
 *    fragment URL.
 *
 * Progressive enhancement: SSR renders nothing (the component returns null);
 * with JavaScript disabled the home-page anchors remain usable (F2 replaces
 * them with real route links).
 */
const LEGACY_ANCHOR_ROUTES: Record<string, string> = {
  map: "/mappa",
  records: "/directory",
  report: "/segnala",
  correction: "/correggi",
};

export function LegacyAnchorRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const target = LEGACY_ANCHOR_ROUTES[hash];
    if (!target) return;
    const search = window.location.search;
    router.replace(search ? `${target}${search}` : target);
  }, [router]);

  return null;
}
