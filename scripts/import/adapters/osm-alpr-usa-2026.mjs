/**
 * Adapter OSM ALPR — United States (`osm-alpr-usa-2026`).
 *
 * Selection: DeFlock-equivalent ALPR query on OpenStreetMap
 * (`man_made=surveillance` + `surveillance:type=ALPR`, nodes and ways),
 * PLUS this project's public/outdoor scope gate — see
 * osm-alpr-factory.mjs for the full gate list and the licence note.
 *
 * Source: national Geofabrik extract
 * https://download.geofabrik.de/north-america/us.html, downloaded by the
 * operator and converted to `{elements:[...]}` JSON at
 * `.import-data/osm-alpr-usa-2026.elements.json` (repo root, gitignored).
 * No network access in this adapter: no Overpass calls, no fetch at all.
 *
 * Provenance scope (stated honestly): the extract is the national Geofabrik
 * snapshot, so the rows are "what OSM holds for this extract", not a
 * per-feature proof of US territory. The parser does not test each
 * coordinate against a boundary polygon. Licence ODbL 1.0 (OpenStreetMap).
 */
import { fileURLToPath } from "node:url";
import { createOsmAlprAdapter } from "./osm-alpr-factory.mjs";

const descriptorPath = fileURLToPath(
  new URL("../../../docs/data-sources/imports/osm-alpr-usa-2026.json", import.meta.url),
);

// Repo-root file, resolved relative to this module (never a developer home).
const localSourcePath = fileURLToPath(
  new URL("../../../.import-data/osm-alpr-usa-2026.elements.json", import.meta.url),
);

export const { slug, getDescriptor, fetchPayload, parsePayload, chunkBbox, buildQuery } = createOsmAlprAdapter({
  slug: "osm-alpr-usa-2026",
  iso3166: "US",
  bbox: [-125.0, 24.0, -66.0, 50.0], // [w, s, e, n] — continental extent
  descriptorPath,
  grid: { nx: 4, ny: 2 },
  localSourcePath,
});
