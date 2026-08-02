import type { Metadata } from "next";
import { SegnalaTool } from "../../components/tools/SegnalaTool";
import { getServerMessages } from "../../lib/server-i18n";
import { parseReportCoordinates } from "../../lib/report-coordinates";

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

type Props = {
  /** ?lat=&lng= deep link from the /mappa pick popup (t_6abb96ac). */
  searchParams?: Promise<{ lat?: string; lng?: string }>;
};

/**
 * /segnala — report tool (F1 route group (tools), t_03c0fa15).
 *
 * The URL shell carries the picked position (?lat=&lng=, built by the
 * /mappa pick popup, t_6abb96ac): the server component parses and validates
 * it and pre-fills the form. Reading searchParams server-side means no
 * useSearchParams on this page, so no Suspense boundary is needed.
 */
export default async function SegnalaPage({ searchParams = Promise.resolve({}) }: Props = {}) {
  const params = await searchParams;
  const initialCoordinates = parseReportCoordinates(new URLSearchParams(params as Record<string, string>));
  return <SegnalaTool initialCoordinates={initialCoordinates} />;
}
