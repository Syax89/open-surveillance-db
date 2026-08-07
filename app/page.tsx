import type { Metadata } from "next";
import { HomeNav } from "./components/home/HomeNav";
import { Hero } from "./components/home/Hero";
import { ToolCards, type ToolCard } from "./components/home/ToolCards";
import { getServerMessages } from "./lib/server-i18n";

/**
 * Home — orienteering hub (F2, t_52dcb95e; docs/FRONTEND_PLAN.md §1.2/2.4).
 *
 * The home is NOT a tool anymore: no interactive map, no filters, no forms.
 * It orients the visitor and links the four public tools (/mappa /directory
 * /segnala /correggi), which F1 promoted to their own routes. The tools keep
 * their client components (MapPanel, PublicDirectory, ReportForm,
 * CorrectionForm) — this page imports none of them.
 *
 * SSR-pure contract (criterion Grace):
 *  - Server Component: the whole page renders server-side (getServerMessages,
 *    ADR 0015), works without JS and without a client data dependency;
 *  - zero Leaflet on the hub: the /mappa tool card IS the map entry point
 *    (the static MapTeaser preview was removed 2026-08-07 as redundant —
 *    CEO: the map card in the tools row already says it);
 *  - the only client islands are the navigation shell (mobile menu) and
 *    the hero stat (usePublicCount, ONE lightweight fetch → server total,
 *    progressive enhancement; the shared data layer is untouched).
 */
export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const t = bundle.home;
  return {
    title: t.pageTitle,
    description: t.pageDescription,
    alternates: { canonical: "/" },
    openGraph: { title: t.pageTitle, description: t.pageDescription, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: t.pageTitle, description: t.pageDescription, images: ["/og.png"] },
  };
}

export default async function HomePage() {
  const bundle = await getServerMessages();
  const t = bundle.home;

  const tools: ToolCard[] = [
    { href: "/mappa", icon: "◉", title: t.toolMapTitle, body: t.toolMapBody },
    { href: "/directory", icon: "▤", title: t.toolDirectoryTitle, body: t.toolDirectoryBody },
    { href: "/segnala", icon: "✎", title: t.toolReportTitle, body: t.toolReportBody },
    { href: "/correggi", icon: "↻", title: t.toolCorrectionTitle, body: t.toolCorrectionBody },
  ];

  return (
    <main id="main-content">
      <HomeNav />

      <Hero />

      <ToolCards heading={t.toolsTitle} cards={tools} />

      <section className="principles" id="how-it-works"><div className="principles-intro"><p className="eyebrow"><span /> {t.civicCommons}</p><h2>{t.principlesTitle}</h2><p>{t.principlesIntro}</p><a className="text-button" href="/manifesto">{t.manifestoLink} <span aria-hidden="true">→</span></a></div><div className="principles-grid"><article><span>01</span><h3>{t.openDefault}</h3><p>{t.openDefaultBody}</p></article><article><span>02</span><h3>{t.privacyFirst}</h3><p>{t.privacyFirstBody}</p></article><article><span>03</span><h3>{t.communityVerified}</h3><p>{t.communityVerifiedBody}</p></article></div></section>
    </main>
  );
}
