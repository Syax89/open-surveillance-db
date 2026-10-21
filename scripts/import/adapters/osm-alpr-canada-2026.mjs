/**
 * Adapter OSM ALPR — Canada (`osm-alpr-canada-2026`).
 *
 * Selection: DeFlock-equivalent ALPR query on OpenStreetMap
 * (`man_made=surveillance` + `surveillance:type=ALPR`, nodes and ways),
 * PLUS this project's public/outdoor scope gate — see
 * osm-alpr-factory.mjs for the full gate list and the licence note.
 *
 * Source: national Geofabrik extract
 * https://download.geofabrik.de/north-america/canada.html, downloaded by the
 * operator and converted to `{elements:[...]}` JSON at
 * `.import-data/osm-alpr-canada-2026.elements.json` (repo root, gitignored).
 * No network access in this adapter: no Overpass calls, no fetch at all.
 *
 * Provenance scope (stated honestly): the extract is the national Geofabrik
 * snapshot, so the rows are "what OSM holds for this extract", not a
 * per-feature proof of Canadian territory. The parser does not test each
 * coordinate against a boundary polygon. Licence ODbL 1.0 (OpenStreetMap).
 */
import { fileURLToPath } from "node:url";
import { createOsmAlprAdapter } from "./osm-alpr-factory.mjs";

const descriptorPath = fileURLToPath(
  new URL("../../../docs/data-sources/imports/osm-alpr-canada-2026.json", import.meta.url),
);

// Repo-root file, resolved relative to this module (never a developer home).
const localSourcePath = fileURLToPath(
  new URL("../../../.import-data/osm-alpr-canada-2026.elements.json", import.meta.url),
);

export const { slug, getDescriptor, fetchPayload, parsePayload, chunkBbox, buildQuery } = createOsmAlprAdapter({
  slug: "osm-alpr-canada-2026",
  iso3166: "CA",
  bbox: [-141.0, 41.6, -52.6, 83.2], // [w, s, e, n] — national extent
  descriptorPath,
  grid: { nx: 3, ny: 2 },
  localSourcePath,
});
