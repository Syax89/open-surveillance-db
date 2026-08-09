import { Suspense } from "react";
import type { Metadata } from "next";
import { MappaTool } from "../../components/tools/MappaTool";
import { getServerMessages } from "../../lib/server-i18n";

export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const t = bundle.map;
  return {
    title: t.pageTitle,
    description: t.pageIntro,
    // F6 qa#5 (t_ab0d4c75): /mappa is reachable with URL-state params
    // (?type=&freshness=&lat=&lng=&z=, deep links). Every variant
    // canonicalizes to the bare route so crawlers index ONE url per page
    // (resolved against metadataBase when NEXT_PUBLIC_SITE_URL is set).
    alternates: { canonical: "/mappa" },
    openGraph: { title: t.pageTitle, description: t.pageIntro, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: t.pageTitle, description: t.pageIntro, images: ["/og.png"] },
    // Issue #410: cross-document View Transitions — /mappa and /directory
    // are two views of the same explorer, and switching between them is
    // the only navigation that opts into the same-origin transition (the
    // meta must be present on BOTH sides). Scoped here, not in the root
    // layout: navigating anywhere else keeps a plain navigation.
    other: { "view-transition": "same-origin" },
  };
}

/**
 * /mappa — interactive map tool (F1 route group (tools), t_03c0fa15).
 *
 * The page is a thin server shell: the interactive body is MappaTool
 * ("use client"). useSearchParams (URL shell ?type=&freshness=&lat=&lng=&z=,
 * deep links) requires a Suspense boundary in Next 16 during static/build
 * rendering, so the tool body is wrapped here — the fallback is the
 * localized SSR loading note (F2 QA#6), matching the /records/[id] pattern.
 */
export default async function MappaPage() {
  const t = (await getServerMessages()).map;
  return (
    <Suspense fallback={<p className="loading-note">{t.loading}</p>}>
      <MappaTool />
    </Suspense>
  );
}
