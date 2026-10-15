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
  const title = `Record #${id} — OpenSurveillanceDB`;
  // SEO fix (2026-10-15): self-referencing canonical + a per-id description.
  // No DB fetch here on purpose (see file header) — the description stays
  // generic text but varies by id, enough to stop every /records/* page
  // from sharing byte-identical <meta description>/og:description, which
  // Search Console was flagging as "Discovered, currently not indexed" at
  // scale (160k near-duplicate pages, zero canonical signal).
  const description = `Public surveillance camera record #${id} on OpenSurveillanceDB, an open, community-maintained database.`;
  return {
    title,
    description,
    alternates: { canonical: `/records/${id}` },
    openGraph: { title, description, images: ["/og.png"] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
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
