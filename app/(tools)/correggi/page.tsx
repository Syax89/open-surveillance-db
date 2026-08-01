import { Suspense } from "react";
import type { Metadata } from "next";
import { CorreggiTool } from "../../components/tools/CorreggiTool";
import { getServerMessages } from "../../lib/server-i18n";

export async function generateMetadata(): Promise<Metadata> {
  const bundle = await getServerMessages();
  const t = bundle.correction;
  return {
    title: t.pageTitle,
    description: t.pageIntro,
    // Form page: never indexed (docs/FRONTEND_PLAN.md §1.3, privacy & safety
    // by design — corrections are private requests).
    robots: { index: false, follow: false },
  };
}

/**
 * /correggi — correction tool (F1 route group (tools), t_03c0fa15).
 *
 * CorreggiTool reads ?record=ID via useSearchParams to pre-fill the related
 * record, which requires a Suspense boundary in Next 16 (same pattern as
 * /mappa). The fallback is the SSR loading note.
 */
export default function CorreggiPage() {
  return (
    <Suspense fallback={<p className="loading-note">Loading…</p>}>
      <CorreggiTool />
    </Suspense>
  );
}
