"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { useMessages } from "./LocaleProvider";

/**
 * Shared layout for the public tool routes (F1 route group (tools)):
 * /mappa /directory /segnala /correggi.
 *
 * Renders the navigation shell (brand + cross-tool nav links + locale
 * toggle, via the shared SiteHeader) and the main content region. The nav
 * set is the shared tool set — every tool page links the other public tools
 * plus the home, so there are never dead ends between the four tools
 * (docs/FRONTEND_DESIGN.md §2.5). Per-page link refinement is F3
 * (navigation task t_2ca69725).
 *
 * The route-group layout (app/(tools)/layout.tsx) renders this component
 * around every tool page; the pages themselves render only their tool body.
 */
export function ToolLayout({ children }: { children: ReactNode }) {
  const t = useMessages().common;
  return (
    <main id="main-content" className="tool-layout">
      <SiteHeader navLabel={t.toolNavigation} homeLabel={t.toolHomeAria}>
        <div className="nav-links">
          <Link href="/mappa">{t.toolMap}</Link>
          <Link href="/directory">{t.toolDirectory}</Link>
          <Link href="/segnala">{t.toolReport}</Link>
          <Link href="/correggi">{t.toolCorrection}</Link>
          <Link href="/guide">{t.toolGuide}</Link>
          <Link className="nav-action" href="/">{t.toolHome}</Link>
        </div>
      </SiteHeader>
      {children}
    </main>
  );
}
