"use client";

import { useState } from "react";
import { SiteHeader } from "./SiteHeader";
import { PublicNavLinks } from "./PublicNavLinks";
import { AuthNavLinks } from "./AuthNavLinks";

/**
 * PublicNav — the shared header for every public page.
 *
 * The header focuses on the three primary actions: Explore map /mappa,
 * Browse records /directory and Add a camera /segnala. Institutional pages
 * remain in the footer, preventing the header from competing with the main
 * task.
 *
 * This component is the single header for ALL public pages: brand + mobile
 * menu + the shared primary links (PublicNavLinks, active page marked
 * aria-current="page") + locale toggle. The home keeps its in-page brand
 * anchor (brandAs="anchor", brandHref="#top"); every other page uses the
 * default brand link to "/".
 *
 * Auth entry point (t_65b778c5 + mobile fix t_94b3726d): AuthNavLinks
 * ("Log in" / "Create account", or the account link) renders INSIDE the
 * .nav-links container, as the last item of the mobile menu dropdown. On
 * compact desktops and mobile (<1081px) the whole container collapses into the hamburger menu, so
 * the auth links travel with it — no more second row outside the menu, no
 * header wrap. On wide desktop (≥1081px)
 * the container is the inline nav row and the auth links stay visible in
 * the header, pushed to the right end (margin-left:auto) next to the locale
 * toggle. aria-current marks the current auth route (same pattern as the
 * six public links, WCAG 2.2 AA). It renders nothing until GET
 * /api/auth/me resolves, so the SSR HTML stays session-free (privacy by
 * design) and the closed dropdown shows no auth links.
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
    <SiteHeader navLabel={navLabel} homeLabel={homeLabel} brandHref={brandHref} brandAs={brandAs} menu menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((current) => !current)}>
      <div className={`nav-links ${menuOpen ? "is-open" : ""}`} id="main-links">
        <PublicNavLinks />
        <AuthNavLinks />
      </div>
    </SiteHeader>
  );
}
