"use client";

import { useState } from "react";
import { SiteHeader } from "./SiteHeader";
import { PublicNavLinks } from "./PublicNavLinks";
import { AuthNavLinks } from "./AuthNavLinks";

/**
 * PublicNav — the ONE shared header for every public page (t_a72a3106).
 *
 * The home hub used to be the only page with the full six-link navigation
 * (Explore map /mappa, Browse records /directory, How it works /guide,
 * Rules /regole, Manifesto /manifesto, Add a camera /segnala); the tool
 * routes rendered compact per-page sets (4 links) and the info/legal pages
 * their own copies. The CEO check (2026-08-02) found the header
 * inconsistent: 4 links on the tools vs 6 on the home.
 *
 * This component is the single header for ALL public pages: brand + mobile
 * menu + the shared six links (PublicNavLinks, active page marked
 * aria-current="page") + locale toggle. The home keeps its in-page brand
 * anchor (brandAs="anchor", brandHref="#top"); every other page uses the
 * default brand link to "/".
 *
 * Since t_65b778c5 the header also carries the auth entry point
 * (AuthNavLinks, CEO request 2026-08-02) in the top-right corner, to the
 * RIGHT of the LocaleToggle (SiteHeader `trailing` slot): "Log in" /
 * "Create account" for anonymous visitors, the account link for signed-in
 * contributors. It renders nothing until GET /api/auth/me resolves, so the
 * SSR HTML stays session-free (privacy by design) and the mobile collapsed
 * menu never hides it.
 *
 * Consumers:
 *  - HomeNav (home)      → PublicNav brandHref="#top" brandAs="anchor"
 *  - ToolLayout (tools)  → PublicNav (default brand)
 *  - InfoPage (info)     → PublicNav (default brand)
 *  - LegalPage (legal)   → PublicNav (default brand)
 */
export interface PublicNavProps {
  /** aria-label for the navigation landmark (page bundle, e.g. t.navigation). */
  navLabel: string;
  /** aria-label for the brand link to the homepage (e.g. t.homeAria). */
  homeLabel: string;
  /** Brand link target; defaults to "/" (the homepage uses "#top" for the hero). */
  brandHref?: string;
  /** Brand element: "link" (next/link, default) or "anchor" (homepage #top). */
  brandAs?: "link" | "anchor";
}

export function PublicNav({ navLabel, homeLabel, brandHref = "/", brandAs = "link" }: PublicNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <SiteHeader navLabel={navLabel} homeLabel={homeLabel} brandHref={brandHref} brandAs={brandAs} menu menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((current) => !current)} trailing={<AuthNavLinks />}>
      <div className={`nav-links ${menuOpen ? "is-open" : ""}`} id="main-links">
        <PublicNavLinks />
      </div>
    </SiteHeader>
  );
}
