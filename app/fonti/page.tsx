import type { Metadata } from "next";
import { SourcesPage } from "../components/SourcesPage";
import { listCommittedImportBatches } from "../../db/import-sources";
import { getServerLocale, getServerMessages } from "../lib/server-i18n";

/**
 * /fonti — data sources (import pipeline FASE C, t_4dbce318).
 *
 * Lists every committed import batch with its attribution contract
 * (source name + link, licence + link, import date, record count,
 * attribution text). Server-rendered from D1 at request time (the batch
 * list changes only when an import lands), so the page is force-dynamic
 * like /sitemap.xml: a new batch appears on the next request, and a
 * rolled-back batch disappears — the page can never present an
 * attribution for data that is not published.
 *
 * NOT in the main navigation (CEO route decision 2026-08-05): the footer
 * links it next to Licences; /licenze mentions the general policy and
 * links here.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const content = bundle.sources;
  return {
    title: content.title,
    description: content.intro,
    openGraph: { title: content.title, description: content.intro, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: content.title, description: content.intro, images: ["/og.png"] },
  };
}

export default async function FontiPage() {
  const [locale, bundle] = await Promise.all([getServerLocale(), getServerMessages()]);
  const home = bundle.home;
  const batches = await listCommittedImportBatches();
  return (
    <SourcesPage
      navLabels={{ mainNavigation: home.mainNavigation, homeAria: home.homeAria }}
      t={bundle.sources}
      locale={locale}
      batches={batches}
    />
  );
}
