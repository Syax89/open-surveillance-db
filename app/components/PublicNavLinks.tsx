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
 * The header is deliberately limited to the primary user tasks: explore
 * the map, browse the directory, report a camera and support the project
 * (/contribuisci — CEO 2026-08-08, task t_c9c200a8). Guide, rules and
 * manifesto remain discoverable from the global footer, where they do
 * not compete with those actions. The same compact set appears on every
 * public page, marking the current page with aria-current="page".
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
    { href: "/segnala", label: t.addCamera, action: true },
    { href: "/contribuisci", label: t.contribuisci },
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
