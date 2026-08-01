import type { Metadata } from "next";
import RecordPageBody from "./RecordPageBody";

/**
 * /records/[id] — public record detail (F3 a11y H2, t_793479ed).
 *
 * Server shell: resolves the per-record <title> (2.4.2 Page Titled) without
 * fetching the record server-side — the detail body is client-rendered
 * (usePublicCamera walk), so the title is built from the route id. The body
 * (RecordPageBody) keeps the full client surface (loading/offline/error
 * states, verification widget, history).
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Record #${id} — OpenSurveillanceDB`,
  };
}

export default function RecordPage() {
  return <RecordPageBody />;
}
