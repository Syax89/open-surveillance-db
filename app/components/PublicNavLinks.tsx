"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "./LocaleProvider";
import { en as homeEn, it as homeIt } from "../lib/i18n/home";
import type { Locale, Translation } from "../lib/i18n";

const homeByLocale: Record<Locale, Translation<typeof homeEn>> = {
  en: homeEn,
  it: homeIt,
};

/**
 * PublicNavLinks — the ONE public navigation set (header nav, task
 * t_a72a3106).
 *
 * The home hub has six nav links (Explore map /mappa, Browse records
 * /directory, How it works /guide, Rules /regole, Manifesto /manifesto,
 * Add a camera /segnala). The tool routes (/mappa /directory /segnala
 * /correggi) previously rendered their own compact per-page sets (4 links,
 * FRONTEND_DESIGN §2.5 hand-off pattern), which made the header look
 * inconsistent: 4 links on the tools vs 6 on the home. This component
 * replaces every per-page set with the SAME six links of the home, on ALL
 * public pages (home, tools, info/legal pages), marking the current page
 * with aria-current="page" (active state, CEO check 2026-08-02).
 *
 * The labels come from the home bundle so the header is identical
 * everywhere; the page's own aria-label for the <nav> landmark stays
 * per-page (SiteHeader prop), as before.
 */
export function PublicNavLinks() {
  const { locale } = useLocale();
  const t = homeByLocale[locale];
  const pathname = usePathname();

  const links: Array<{ href: string; label: string; action?: boolean }> = [
    { href: "/mappa", label: t.exploreMap },
    { href: "/directory", label: t.browseRecords },
    { href: "/guide", label: t.howItWorks },
    { href: "/regole", label: t.rules },
    { href: "/manifesto", label: t.manifesto },
    { href: "/segnala", label: t.addCamera, action: true },
  ];

  return (
    <>
      {links.map(({ href, label, action }) => (
        <Link
          key={href}
          href={href}
          className={action ? "nav-action" : undefined}
          aria-current={pathname === href ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </>
  );
}
