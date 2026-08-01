"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteHeader } from "../SiteHeader";
import { useMessages } from "../LocaleProvider";

/**
 * HomeNav — navigation shell of the home hub (F2, t_52dcb95e).
 *
 * The home page itself is an SSR-pure Server Component (criterion Grace: no
 * JS, no client data dependency), so the only interactive chrome — the
 * mobile menu toggle — lives in this small client island, exactly like the
 * other client islands the server pages already embed (SiteFooter,
 * LocaleToggle). The nav set is the complete public set (docs/
 * FRONTEND_DESIGN.md §2.5): the four tools plus guide, rules, manifesto.
 */
export function HomeNav() {
  const t = useMessages().home;
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <SiteHeader navLabel={t.mainNavigation} homeLabel={t.homeAria} brandHref="#top" brandAs="anchor" menu menuOpen={menuOpen} onMenuToggle={() => setMenuOpen((current) => !current)}>
      <div className={`nav-links ${menuOpen ? "is-open" : ""}`} id="main-links">
        <Link href="/mappa">{t.exploreMap}</Link>
        <Link href="/directory">{t.browseRecords}</Link>
        <Link href="/guide">{t.howItWorks}</Link>
        <Link href="/regole">{t.rules}</Link>
        <Link href="/manifesto">{t.manifesto}</Link>
        <Link className="nav-action" href="/segnala">{t.addCamera}</Link>
      </div>
    </SiteHeader>
  );
}
