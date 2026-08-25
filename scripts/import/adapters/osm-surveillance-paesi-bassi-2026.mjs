/**
 * Adapter OSM — Paesi Bassi (wave 14, mega-check catalogo 2026-08-16).
 * Reuses the shared country factory; see osm-country-factory.mjs for the
 * full tag mapping. Source is a LOCAL FILE (Geofabrik PBF filtered extract,
 * man_made=surveillance + surveillance=public|outdoor) — no Overpass calls;
 * licence ODbL 1.0 (OSM) unchanged.
 */
import { fileURLToPath } from "node:url";
import { createOsmCountryAdapter } from "./osm-country-factory.mjs";

const descriptorPath = fileURLToPath(
  new URL("../../../docs/data-sources/imports/osm-surveillance-paesi-bassi-2026.json", import.meta.url),
);

export const { slug, getDescriptor, fetchPayload, parsePayload, chunkBbox, buildQuery } = createOsmCountryAdapter({
  slug: "osm-surveillance-paesi-bassi-2026",
  iso3166: "NL",
  bbox: [3.2, 50.7, 7.3, 53.6], // [w, s, e, n]
  descriptorPath,
  grid: { nx: 6, ny: 4 },
});
