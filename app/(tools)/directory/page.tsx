import type { Metadata } from "next";
import { DirectoryTool } from "../../components/tools/DirectoryTool";
import { getServerMessages } from "../../lib/server-i18n";

export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const t = bundle.directory;
  return {
    title: t.pageTitle,
    description: t.pageIntro,
    openGraph: { title: t.pageTitle, description: t.pageIntro, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title: t.pageTitle, description: t.pageIntro, images: ["/og.png"] },
  };
}

/**
 * /directory — public directory tool (F1 route group (tools), t_03c0fa15).
 * The only tool page with real SEO value (docs/FRONTEND_PLAN.md §1.3), so it
 * stays indexable with its own metadata.
 */
export default function DirectoryPage() {
  return <DirectoryTool />;
}
