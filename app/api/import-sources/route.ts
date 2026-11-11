import { env } from "cloudflare:workers";
import { listCommittedImportBatches } from "../../../db/import-sources";
import { limitsFor } from "../../lib/rate-limit";
import { rateLimitResponse } from "../../lib/rate-limit-response";

/**
 * GET /api/import-sources — committed import batches (slug → attribution
 * info), the client-side counterpart of the /fonti page (import pipeline
 * FASE C, t_4dbce318).
 *
 * The map popup and the record page resolve an imported record's raw
 * `source` ('import:<slug>') through this endpoint: readable entity name,
 * licence + link, dataset link — never reconstructing attribution text
 * client-side. It serves ONLY committed batches (same read side as
 * /fonti), public like every other camera read, metered in the read
 * family, and edge-cached like the record list (the batch list changes
 * only when an import lands).
 */
export async function GET(request: Request) {
  const limited = await rateLimitResponse(request, {
    bucket: "read",
    route: "/api/import-sources",
    env,
    limits: limitsFor("read", env),
    log: "GET /api/import-sources rate limited",
    recordBlock: false,
  });
  if (limited) return limited;

  try {
    const batches = await listCommittedImportBatches();
    const sources = batches.map(({ slug, sourceName, sourceUrl, license, licenseUrl }) => ({
      slug,
      sourceName,
      sourceUrl,
      license,
      licenseUrl,
    }));
    return Response.json({ sources }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("GET /api/import-sources failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
