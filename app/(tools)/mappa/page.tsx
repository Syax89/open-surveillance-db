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
    openGraph: { title: t.pageTitle, description: t.pageIntro, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: t.pageTitle, description: t.pageIntro, images: ["/og.png"] },
  };
}

/**
 * /mappa — interactive map tool (F1 route group (tools), t_03c0fa15).
 *
 * The page is a thin server shell: the interactive body is MappaTool
 * ("use client"). useSearchParams (URL shell ?type=&freshness=&lat=&lng=&z=,
 * deep links) requires a Suspense boundary in Next 16 during static/build
 * rendering, so the tool body is wrapped here — the fallback is the SSR
 * loading note, matching the /records/[id] pattern.
 */
export default function MappaPage() {
  return (
    <Suspense fallback={<p className="loading-note">Loading the map…</p>}>
      <MappaTool />
    </Suspense>
  );
}
