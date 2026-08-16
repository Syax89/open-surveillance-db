/**
 * Adapter OSM — Francia metropolitana (wave 14, mega-check catalogo 2026-08-16).
 * Reuses the shared country factory; see osm-country-factory.mjs for the
 * full tag mapping and rate-limit etiquette (chunked Overpass, ODbL 1.0).
 */
import { fileURLToPath } from "node:url";
import { createOsmCountryAdapter } from "./osm-country-factory.mjs";

const descriptorPath = fileURLToPath(
  new URL("../../../docs/data-sources/imports/osm-surveillance-francia-2026.json", import.meta.url),
);

export const { slug, getDescriptor, fetchPayload, parsePayload, chunkBbox, buildQuery } = createOsmCountryAdapter({
  slug: "osm-surveillance-francia-2026",
  iso3166: "FR",
  bbox: [-5.5, 41.2, 9.8, 51.2], // [w, s, e, n]
  descriptorPath,
  grid: { nx: 12, ny: 8 },
});
