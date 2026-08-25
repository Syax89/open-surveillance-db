/**
 * Adapter OSM — australia (wave 14b, mega-check catalogo 2026-08-16).
 * Reuses the shared country factory; see osm-country-factory.mjs for the
 * full tag mapping. Source is a LOCAL FILE (Geofabrik PBF filtered extract,
 * man_made=surveillance + surveillance=public|outdoor) — no Overpass calls;
 * licence ODbL 1.0 (OSM) unchanged.
 */
import { fileURLToPath } from "node:url";
import { createOsmCountryAdapter } from "./osm-country-factory.mjs";

const descriptorPath = fileURLToPath(
  new URL("../../../docs/data-sources/imports/osm-surveillance-australia-2026.json", import.meta.url),
);

export const { slug, getDescriptor, fetchPayload, parsePayload, chunkBbox, buildQuery } = createOsmCountryAdapter({
  slug: "osm-surveillance-australia-2026",
  iso3166: "AU",
  bbox: [112.9, -44.0, 153.6, -10.0], // [w, s, e, n]
  descriptorPath,
  grid: { nx: 3, ny: 2 },
  localSourcePath: "/opt/open-surveillance-db/.import-data/osm-surveillance-australia-2026.elements.json",
});
