"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LocaleToggle, useMessages } from "./LocaleProvider";

/**
 * Global site header (landmark: navigation) shared by every page.
 *
 * Extracts the navigation shell that every page previously duplicated
 * (brand + per-area nav links + mobile menu + LocaleToggle), following the
 * same pattern SiteFooter established for the footer:
 *  - the brand link (mark + name) is rendered once here;
 *  - the per-area links/actions are injected as children by each page
 *    (public home with mobile menu, info/legal pages, auth, record,
 *    moderation), so every page's i18n bundle keeps its own copy;
 *  - the EN/IT LocaleToggle is rendered after the children by default;
 *    the record and moderation shells render it INSIDE their actions
 *    container, so they pass toggle="none" and include it themselves.
 *
 * The aria-label for the <nav> landmark and the optional brand aria-label
 * come from the page (each page localises its own navigation landmark, e.g.
 * t.navigation / t.mainNavigation). The only string read here is the mobile
 * menu button label (home bundle), which exists on the homepage variant.
 *
 * Since t_94b3726d the mobile-menu boundary is <768px (was 700px): the
 * hamburger and the collapsible .nav-links panel now cover the whole range
 * where the six links + auth entry point cannot fit on one line, so the
 * header never wraps or overflows between 701-767px either. The auth links
 * live inside the .nav-links container (PublicNav renders AuthNavLinks as
 * its last item), so they collapse with the menu on mobile and stay visible
 * in the inline row on desktop.
 *
 * Renders exactly the markup the per-page copies produced, so adopting it
 * is behaviour-neutral by construction (see tests/rendered-html.test.mjs
 * and the SSR byte-diff harness for the structural contracts that stay
 * pinned).
 */
export interface SiteHeaderProps {
  /** aria-label for the navigation landmark (page bundle, e.g. t.navigation). */
  navLabel: string;
  /** aria-label for the brand link to the homepage; omitted for no label (record page). */
  homeLabel?: string;
  /** Brand link target; defaults to "/" (the homepage uses "#top" for the hero). */
  brandHref?: string;
  /**
   * Brand element: "link" (next/link, default) or "anchor" (plain <a>). The
   * homepage uses "anchor" for its in-page "#top" target: a plain anchor
   * keeps the native same-page hash jump (no client router involvement) and
   * the exact baseline markup, byte for byte.
   */
  brandAs?: "link" | "anchor";
  /** Renders the mobile menu button (homepage variant only). */
  menu?: boolean;
  /** Controlled mobile-menu state (aria-expanded + .is-open on the links). */
  menuOpen?: boolean;
  /** Mobile menu toggle handler. */
  onMenuToggle?: () => void;
  /**
   * LocaleToggle placement: "after" (default) renders it after the children;
   * "none" suppresses it (record/moderation render it inside their actions).
   */
  toggle?: "after" | "none";
  /** Per-area links/actions rendered between the brand and the locale toggle. */
  children: ReactNode;
}

export function SiteHeader({
  navLabel,
  homeLabel,
  brandHref = "/",
  brandAs = "link",
  menu = false,
  menuOpen = false,
  onMenuToggle,
  toggle = "after",
  children,
}: SiteHeaderProps) {
  const t = useMessages().home;
  // The brand link represents the home page: mark it with aria-current on
  // the root path (finding QA-2026-08-01-3, closed in F-QA t_7b716c97).
  // The homepage itself renders the brand as an in-page anchor to "#top",
  // which is the same page — also current.
  const pathname = usePathname();
  const brandIsCurrent = brandAs === "anchor" || pathname === "/";
  const brandProps: {
    className: string;
    href: string;
    "aria-label"?: string;
    "aria-current"?: "page";
  } = {
    className: "brand",
    href: brandHref,
    ...(homeLabel ? { "aria-label": homeLabel } : {}),
    ...(brandIsCurrent ? { "aria-current": "page" as const } : {}),
  };
  const brandChildren = (
    <>
      <span className="brand-mark" aria-hidden="true">◉</span>
      <span>OpenSurveillanceDB</span>
    </>
  );
  return (
    <nav className="nav-shell" aria-label={navLabel}>
      {brandAs === "anchor" ? (
        <a {...brandProps}>
          {brandChildren}
        </a>
      ) : (
        <Link {...brandProps}>
          {brandChildren}
        </Link>
      )}
      {menu ? (
        <button className="menu-button" type="button" aria-expanded={menuOpen} aria-controls="main-links" onClick={onMenuToggle}>{t.menu}</button>
      ) : null}
      {children}
      {toggle === "after" ? <LocaleToggle /> : null}
    </nav>
  );
}
