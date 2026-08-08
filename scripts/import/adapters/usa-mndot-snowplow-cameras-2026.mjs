/**
 * Adapter USA Minnesota — MnDOT AVL Plow Cam Images (CEO 2026-08-08,
 * scan catalog.csv + verifica diretta).
 *
 * Source: MnDOT, AVL_Plow_Cam_Images_Minnesota_View (services.arcgis.com).
 * 96 telecamere montate su spazzaneve. Live (posizioni mezzi).
 * Licence: CC BY 4.0 (dichiarata).
 *
 * - Fetch: FeatureServer query paginata; attrs PHOTO_LATITUDE/LONGITUDE
 *   già WGS84.
 * - Mapping: ROUTE_NAME → title; PHOTO_URL → description.
 * - external_id = "mndot-plow:<OBJECTID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchArcGisFeatures } from "./lib.mjs";

export const slug = "usa-mndot-snowplow-cameras-2026";

const FS = "https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/AVL_Plow_Cam_Images_Minnesota_View/FeatureServer/0";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-mndot-snowplow-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const data = await fetchArcGisFeatures(FS);
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(data));
  return { data, checksum: hasher.digest("hex") };
}

/** Parse ArcGIS features (WGS84 attrs) into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!Array.isArray(data)) return { staged, skipped, checksum: null };

  for (const f of data) {
    const a = f.attributes ?? {};
    const lat = Number.parseFloat(a.PHOTO_LATITUDE);
    const lon = Number.parseFloat(a.PHOTO_LONGITUDE);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }

    const route = cleanText(String(a.ROUTE_NAME ?? ""), 30);
    const photo = cleanText(String(a.PHOTO_URL ?? ""), 180);

    staged.push({
      title: route ? `MnDOT plow cam ${route}` : `MnDOT plow cam ${a.OBJECTID ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes: `Ref ${String(a.REF_POST ?? "").slice(0, 40)}`.trim() || null,
      description: photo ? `Immagine: ${photo}` : null,
      external_id: `mndot-plow:${a.OBJECTID ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
