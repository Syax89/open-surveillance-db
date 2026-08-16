/**
 * Adapter OSM — Germany (state-by-state scan, CEO 2026-08-07).
 * Reuses the shared country factory; see osm-country-factory.mjs for the
 * full tag mapping and rate-limit etiquette (chunked Overpass, ODbL 1.0).
 *
 * Germany is the biggest dataset (~45k elements): 4×4 chunk grid to keep
 * each Overpass query small, and the descriptor's max_records is raised.
 */
import { fileURLToPath } from "node:url";
import { createOsmCountryAdapter } from "./osm-country-factory.mjs";

const descriptorPath = fileURLToPath(
  new URL("../../../docs/data-sources/imports/osm-surveillance-germania-2026.json", import.meta.url),
);

export const { slug, getDescriptor, fetchPayload, parsePayload, chunkBbox, buildQuery } = createOsmCountryAdapter({
  slug: "osm-surveillance-germania-2026",
  iso3166: "DE",
  bbox: [5.8, 47.2, 15.1, 55.1], // [w, s, e, n]
  descriptorPath,
  grid: { nx: 6, ny: 6 },
});
