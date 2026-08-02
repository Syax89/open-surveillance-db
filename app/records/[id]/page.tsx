import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RecordPageBody from "./RecordPageBody";

/**
 * /records/[id] — public record detail (F3 a11y H2, t_793479ed).
 *
 * Server shell: resolves the per-record <title> (2.4.2 Page Titled) without
 * fetching the record server-side — the detail body is client-rendered
 * (usePublicCamera walk), so the title is built from the route id. The body
 * (RecordPageBody) keeps the full client surface (loading/offline/error
 * states, verification widget, history).
 *
 * 404 guard (t_7eed4601): a malformed id (e.g. /records/abc) can never be
 * a real record, so the server shell rejects it with notFound() and the
 * custom 404 page (app/not-found.tsx) renders with a true 404 status —
 * instead of the client-side "record not found" state that would answer
 * 200. Valid numeric ids keep the existing behaviour: a well-formed id
 * that does not exist in the public list is surfaced client-side by
 * RecordPageBody (the list walk is the source of truth for existence).
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Record #${id} — OpenSurveillanceDB`,
  };
}

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recordId = Number(id);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    notFound();
  }
  return <RecordPageBody />;
}
