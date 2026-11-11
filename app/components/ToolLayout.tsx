"use client";

import type { ReactNode } from "react";
import { PublicNav } from "./PublicNav";
import { useDomainMessages } from "../lib/use-domain-messages";
import { commonByLocale } from "../lib/i18n/common";

/**
 * Shared layout for the public tool routes (F1 route group (tools)):
 * /mappa /directory /segnala /correggi.
 *
 * Renders the shared public header (PublicNav — the same primary
 * links of the home hub on EVERY public page, with the current page marked
 * aria-current="page") and the main content region.
 *
 * This replaced the previous per-page compact nav sets (4 links,
 * FRONTEND_DESIGN §2.5 hand-off pattern) that made the tool header look
 * inconsistent with the home (CEO check 2026-08-02).
 *
 * The route-group layout (app/(tools)/layout.tsx) renders this component
 * around every tool page; the pages themselves render only their tool body.
 */
export function ToolLayout({ children }: { children: ReactNode }) {
  const t = useDomainMessages(commonByLocale);
  return (
    <main id="main-content" className="tool-layout">
      <PublicNav navLabel={t.toolNavigation} homeLabel={t.toolHomeAria} />
      {children}
    </main>
  );
}
