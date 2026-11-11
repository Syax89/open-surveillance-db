import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getCommunityRecordById } from "../../../db/cameras";
import { limitsFor } from "../../lib/rate-limit";
import { rateLimitResponse } from "../../lib/rate-limit-response";
import { cachedPublicRecordResponse } from "../../lib/public-record-response";
import { canonicalRecordApiRequest, requestOrigin, resolveCachedInitialRecord, type InitialRecordSeed } from "../../lib/record-initial";
import RecordPageBody from "./RecordPageBody";
import { MapStyles } from "../../components/MapStyles";

/**
 * /records/[id] — public record detail (F3 a11y H2, t_793479ed).
 *
 * Server shell: resolves the per-record <title> (2.4.2 Page Titled) from
 * the route id, and (LCP fix, 2026-11) resolves the record itself on the
 * server through the same getCommunityRecordById read the
 * GET /api/cameras/[id] route uses (public predicate + hidden/removed
 * tombstone, ADR 0021 §6.3) — see app/lib/record-initial.ts. The seed is
 * handed to RecordPageBody so the first HTML holds the h1, facts and
 * community status. The read goes through the API's own gates — the
 * read-bucket rate limit and the shared worker-cache entry keyed on the
 * canonical /api/cameras/<id> URL (same Cache-Tag, so moderation purges
 * apply) — so a crawler walking /records/N never multiplies D1 reads.
 * The body keeps the full client surface (offline/error
 * states, community widget, timeline, reload). A server read failure
 * passes no seed and the body falls back to the client fetch path.
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
  // No DB fetch in the metadata on purpose — the description stays
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
  // Same strict decimal grammar as the API route: "1e3"/"0x10" are integers
  // to Number() but not public ids — no seed, the client path decides.
  const initial = /^\d+$/.test(id) ? await loadInitialRecord(recordId) : undefined;
  // key: a client navigation to another id remounts the body so the seed
  // (and the hook state it initializes) never belongs to the previous id.
  return (
    <>
      {/* Record mini-map + popup-style community actions: route-scoped map stylesheet. */}
      <MapStyles />
      <RecordPageBody key={recordId} id={recordId} initial={initial} />
    </>
  );
}

/**
 * Seed the body through the same gates as GET /api/cameras/[id]. Without a
 * resolvable origin (no Host header) there is no canonical cache key: no
 * seed, the client path decides. Rate-limited / errors → no seed either.
 */
async function loadInitialRecord(recordId: number): Promise<InitialRecordSeed | undefined> {
  let incoming: Headers;
  try {
    incoming = new Headers(await headers());
  } catch {
    return undefined;
  }
  const origin = requestOrigin(incoming);
  if (!origin) return undefined;
  const request = canonicalRecordApiRequest(origin, recordId, incoming);
  return resolveCachedInitialRecord(request, recordId, {
    rateLimit: (apiRequest) => rateLimitResponse(apiRequest, {
      bucket: "read",
      route: "/api/cameras/[id]",
      env,
      limits: limitsFor("read", env),
      log: (key) => `/records/[id] server seed rate limited for caller ${key} (client fallback)`,
    }),
    cachedResponse: (apiRequest, value) => cachedPublicRecordResponse(apiRequest, value, (lookup) => getCommunityRecordById(lookup)),
  });
}
