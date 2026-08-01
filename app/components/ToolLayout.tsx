"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { useMessages } from "./LocaleProvider";

/**
 * Shared layout for the public tool routes (F1 route group (tools)):
 * /mappa /directory /segnala /correggi.
 *
 * Renders the navigation shell (brand + per-page nav links + locale toggle,
 * via the shared SiteHeader) and the main content region.
 *
 * The nav link SET is per-page (F3 t_2ca69725, docs/FRONTEND_DESIGN.md §2.5):
 * every tool page links the other public tools it hands off to, the
 * contextual pages and the home CTA — never a dead end between the four
 * tools. The route-group layout cannot know the current route, so the set is
 * derived from usePathname(); an unknown path falls back to the full
 * cross-tool set (defensive: the SSR harness and future routes still get a
 * complete navigation).
 *
 * The route-group layout (app/(tools)/layout.tsx) renders this component
 * around every tool page; the pages themselves render only their tool body.
 */
type ToolNavKey =
  | "toolMap"
  | "toolDirectory"
  | "toolReport"
  | "toolCorrection"
  | "toolGuide"
  | "toolRules"
  | "toolContact"
  | "toolHome";

type ToolNavLink = { href: string; label: ToolNavKey };

const TOOL_NAV_SETS: Record<string, ToolNavLink[]> = {
  "/mappa": [
    { href: "/directory", label: "toolDirectory" },
    { href: "/segnala", label: "toolReport" },
    { href: "/guide", label: "toolGuide" },
    { href: "/", label: "toolHome" },
  ],
  "/directory": [
    { href: "/mappa", label: "toolMap" },
    { href: "/segnala", label: "toolReport" },
    { href: "/guide", label: "toolGuide" },
    { href: "/", label: "toolHome" },
  ],
  "/segnala": [
    { href: "/directory", label: "toolDirectory" },
    { href: "/mappa", label: "toolMap" },
    { href: "/guide", label: "toolGuide" },
    { href: "/regole", label: "toolRules" },
    { href: "/", label: "toolHome" },
  ],
  "/correggi": [
    { href: "/directory", label: "toolDirectory" },
    { href: "/mappa", label: "toolMap" },
    { href: "/contatti", label: "toolContact" },
    { href: "/", label: "toolHome" },
  ],
};

/** Fallback for any route outside the four tools: the full cross-tool set. */
const FALLBACK_NAV: ToolNavLink[] = [
  { href: "/mappa", label: "toolMap" },
  { href: "/directory", label: "toolDirectory" },
  { href: "/segnala", label: "toolReport" },
  { href: "/correggi", label: "toolCorrection" },
  { href: "/guide", label: "toolGuide" },
  { href: "/", label: "toolHome" },
];

export function ToolLayout({ children }: { children: ReactNode }) {
  const t = useMessages().common;
  const pathname = usePathname();
  const nav = TOOL_NAV_SETS[pathname] ?? FALLBACK_NAV;
  return (
    <main id="main-content" className="tool-layout">
      <SiteHeader navLabel={t.toolNavigation} homeLabel={t.toolHomeAria}>
        <div className="nav-links">
          {nav.map(({ href, label }) => (
            <Link key={href} href={href} className={href === "/" ? "nav-action" : undefined}>
              {t[label]}
            </Link>
          ))}
        </div>
      </SiteHeader>
      {children}
    </main>
  );
}
