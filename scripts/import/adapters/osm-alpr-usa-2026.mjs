/**
 * OSM ALPR — United States (`osm-alpr-usa-2026`), file-mode adapter.
 *
 * Reads `.import-data/osm-alpr-usa-2026.elements.json` (repo root, gitignored):
 * the national Geofabrik extract (https://download.geofabrik.de/north-america/us.html)
 * converted by the operator to `{elements:[...]}` JSON. No Overpass, no network.
 * Selection, gates and licence: docs/data-sources/osm-alpr-imports.md.
 */
import { fileURLToPath } from "node:url";
import { createOsmAlprAdapter } from "./osm-alpr-factory.mjs";

export const { slug, getDescriptor, fetchPayload, parsePayload } = createOsmAlprAdapter({
  slug: "osm-alpr-usa-2026",
  descriptorPath: fileURLToPath(new URL("../../../docs/data-sources/imports/osm-alpr-usa-2026.json", import.meta.url)),
  localSourcePath: fileURLToPath(new URL("../../../.import-data/osm-alpr-usa-2026.elements.json", import.meta.url)),
});
