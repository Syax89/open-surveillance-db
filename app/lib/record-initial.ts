import type { Camera } from "./records";
import { isRecordPageStatus } from "./public-status";

/**
 * Server-resolved seed for the /records/[id] body (perf/SEO, LCP).
 *
 * The record page used to ship an empty "Loading the public record…" shell
 * and resolve the record only after hydration (usePublicCamera →
 * GET /api/cameras/[id]). The server shell now resolves the SAME record
 * through the SAME data-access function the API route uses
 * (db/cameras.ts getCommunityRecordById: public predicate + the ADR 0021
 * §6.3 hidden/removed tombstone fallback), so the first HTML already holds
 * the h1, the facts and the community status.
 *
 * Contract (kept pure — the loader is injected — so it is unit-testable
 * without a D1 binding and stays out of any client bundle's db imports):
 *  - found with a record-page status (active/demo/hidden/removed) →
 *    `{ record }`, a plain-JSON copy of exactly what the API serializes
 *    (no extra fields reach the RSC payload);
 *  - not found, or any other status (defence in depth, mirrors the client
 *    gate in ensureRecord) → `{ record: null }`: the same "not found" state
 *    the client would settle on, rendered earlier;
 *  - the loader throws (D1 binding missing, transient DB error) →
 *    `undefined`: no seed, the client keeps today's loading/fetch/retry
 *    path — a transient DB error never becomes a 500.
 */
export type InitialRecordSeed = { record: Camera | null };

export async function resolveInitialRecord(
  id: number,
  load: (id: number) => Promise<unknown>,
): Promise<InitialRecordSeed | undefined> {
  let found: unknown;
  try {
    found = await load(id);
  } catch (error) {
    console.error("records/[id]: server record read failed, falling back to the client path", error);
    return undefined;
  }
  if (!found || typeof found !== "object") return { record: null };
  const status = (found as { status?: unknown }).status;
  if (typeof status !== "string" || !isRecordPageStatus(status)) return { record: null };
  // JSON round-trip: the RSC payload carries byte-for-byte the API's JSON
  // shape (Response.json(record)), never a non-serializable value.
  return { record: JSON.parse(JSON.stringify(found)) as Camera };
}
