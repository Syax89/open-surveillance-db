/**
 * Adapter OSM — Switzerland (state-by-state scan, CEO 2026-08-07).
 * Reuses the shared country factory; see osm-country-factory.mjs for the
 * full tag mapping and rate-limit etiquette (chunked Overpass, ODbL 1.0).
 */
import { fileURLToPath } from "node:url";
import { createOsmCountryAdapter } from "./osm-country-factory.mjs";

const descriptorPath = fileURLToPath(
  new URL("../../../docs/data-sources/imports/osm-surveillance-svizzera-2026.json", import.meta.url),
);

export const { slug, getDescriptor, fetchPayload, parsePayload, chunkBbox, buildQuery } = createOsmCountryAdapter({
  slug: "osm-surveillance-svizzera-2026",
  iso3166: "CH",
  bbox: [5.9, 45.8, 10.6, 47.9], // [w, s, e, n]
  descriptorPath,
  grid: { nx: 3, ny: 2 },
});
