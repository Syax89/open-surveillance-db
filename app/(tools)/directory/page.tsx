import { Suspense } from "react";
import type { Metadata } from "next";
import { DirectoryTool } from "../../components/tools/DirectoryTool";
import { getServerMessages } from "../../lib/server-i18n";

export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const t = bundle.directory;
  return {
    title: t.pageTitle,
    description: t.pageIntro,
    // F6 qa#5 (t_ab0d4c75): the pagination/filter state lives in the URL
    // (?page=&type=&freshness=); all variants canonicalize to the bare route
    // so crawlers never see duplicate content per page number (resolved
    // against metadataBase when NEXT_PUBLIC_SITE_URL is set).
    alternates: { canonical: "/directory" },
    openGraph: { title: t.pageTitle, description: t.pageIntro, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: t.pageTitle, description: t.pageIntro, images: ["/og.png"] },
  };
}

/**
 * /directory — public directory tool (F1 route group (tools), t_03c0fa15;
 * F4 t_522638a5). The only tool page with real SEO value
 * (docs/FRONTEND_PLAN.md §1.3), so it stays indexable with its own metadata.
 *
 * F4 wires useCameraFilters (useSearchParams) into DirectoryTool, which
 * requires a Suspense boundary in Next 16 during static/build rendering —
 * same pattern as /mappa and /correggi. The fallback is the localized SSR
 * loading note (F2 QA#6); the tool body renders synchronously, so the
 * boundary never flashes in practice.
 */
export default async function DirectoryPage() {
  const t = (await getServerMessages()).directory;
  return (
    <Suspense fallback={<p className="loading-note">{t.loading}</p>}>
      <DirectoryTool />
    </Suspense>
  );
}
