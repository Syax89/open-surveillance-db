"use client";

import { PublicNav } from "../PublicNav";
import { useMessages } from "../../lib/use-messages";

/**
 * HomeNav — navigation shell of the home hub (F2, t_52dcb95e).
 *
 * The home page itself is an SSR-pure Server Component (criterion Grace: no
 * JS, no client data dependency), so the only interactive chrome — the
 * mobile menu toggle — lives in this small client island, exactly like the
 * other client islands the server pages already embed (SiteFooter,
 * LocaleToggle). The nav is the shared public header (PublicNav,
 * t_a72a3106): the six home links on EVERY public page, with the current
 * page marked aria-current. The home keeps its in-page "#top" brand anchor.
 */
export function HomeNav() {
  const t = useMessages().home;
  return <PublicNav navLabel={t.mainNavigation} homeLabel={t.homeAria} brandHref="#top" brandAs="anchor" />;
}
