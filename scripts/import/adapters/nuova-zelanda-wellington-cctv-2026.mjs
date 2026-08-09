/**
 * Adapter Nuova Zelanda — Wellington CCTV City Safety (cron ricerca
 * 2026-08-09).
 *
 * Source: Wellington City Council (services1.arcgis.com). 173 telecamere.
 * Live.
 * Licence: CC BY 4.0 (NZ) — licenseInfo esplicita sulla web map ufficiale.
 *
 * - Fetch: FeatureServer query paginata, EPSG:2193 (NZTM2000) →
 *   nztm2193ToWgs84.
 * - Mapping: Camera_Name → title.
 * - external_id = "wcc-cctv:<OBJECTID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchArcGisFeatures, nztm2193ToWgs84 } from "./lib.mjs";

export const slug = "nuova-zelanda-wellington-cctv-2026";

const FS = "https://services1.arcgis.com/CPYspmTk3abe6d7i/arcgis/rest/services/CCTV_City_Safety_Camera_Locations_(View_layer)/FeatureServer/0";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/nuova-zelanda-wellington-cctv-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const data = await fetchArcGisFeatures(FS);
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(data));
  return { data, checksum: hasher.digest("hex") };
}

/** Parse ArcGIS features (EPSG:2193) into canonical staged rows. */
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
    const g = f.geometry ?? {};
    if (g.x == null || g.y == null) {
      recordSkip("no point geometry");
      continue;
    }
    const [lat, lon] = nztm2193ToWgs84(Number(g.x), Number(g.y));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("coordinate conversion out of range/zero");
      continue;
    }

    const name = cleanText(String(a.Camera_Name ?? ""), 120);

    staged.push({
      title: name || `WCC CCTV ${a.OBJECTID ?? ""}`.trim(),
      kind: "Other / unknown",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: name || null,
      notes: "CCTV City Safety (WCC)",
      description: null,
      external_id: `wcc-cctv:${a.OBJECTID ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
