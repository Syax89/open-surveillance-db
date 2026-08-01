import type { Metadata } from "next";
import { SegnalaTool } from "../../components/tools/SegnalaTool";
import { getServerMessages } from "../../lib/server-i18n";

export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const t = bundle.report;
  return {
    title: t.pageTitle,
    description: t.pageIntro,
    // Form page: never indexed (docs/FRONTEND_PLAN.md §1.3, privacy & safety
    // by design — report submissions are private until moderated).
    robots: { index: false, follow: false },
  };
}

/**
 * /segnala — report tool (F1 route group (tools), t_03c0fa15). No
 * useSearchParams on this page, so no Suspense boundary is needed.
 */
export default function SegnalaPage() {
  return <SegnalaTool />;
}
