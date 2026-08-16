/**
 * Adapter OSM — Spagna incl. Canarie (wave 14, mega-check catalogo 2026-08-16).
 * Reuses the shared country factory; see osm-country-factory.mjs for the
 * full tag mapping. Source is a LOCAL FILE (Geofabrik PBF filtered extract,
 * man_made=surveillance + surveillance=public|outdoor) — no Overpass calls;
 * licence ODbL 1.0 (OSM) unchanged.
 */
import { fileURLToPath } from "node:url";
import { createOsmCountryAdapter } from "./osm-country-factory.mjs";

const descriptorPath = fileURLToPath(
  new URL("../../../docs/data-sources/imports/osm-surveillance-spagna-2026.json", import.meta.url),
);

export const { slug, getDescriptor, fetchPayload, parsePayload, chunkBbox, buildQuery } = createOsmCountryAdapter({
  slug: "osm-surveillance-spagna-2026",
  iso3166: "ES",
  bbox: [-18.5, 27.5, 4.5, 43.9], // [w, s, e, n]
  descriptorPath,
  grid: { nx: 8, ny: 6 },
  localSourcePath: "/opt/open-surveillance-db/.import-data/osm-surveillance-spagna-2026.elements.json",
});
