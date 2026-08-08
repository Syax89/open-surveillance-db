/**
 * Adapter USA Baltimore — CitiWatch Camera Locations (CEO 2026-08-08,
 * scan catalog.csv + verifica diretta + verdetto legale).
 *
 * Source: City of Baltimore, CitiWatchCamera FeatureServer. 861
 * telecamere CitiWatch (BPD). Live.
 * Licence: Maryland public domain + attribution (verificato 2026-08-08).
 *
 * - Fetch: FeatureServer query paginata, EPSG:2248 (NAD83 Maryland LCC
 *   ftUS) → lcc2248ToWgs84 (validato vs Nominatim, ~20m).
 * - Mapping: CAM_LOCATION → title.
 * - external_id = "balt-citiwatch:<CAM_NUMBER>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchArcGisFeatures, lcc2248ToWgs84 } from "./lib.mjs";

export const slug = "usa-baltimore-citiwatch-2026";

const FS = "https://baltegis.baltimorecity.gov/mapping/rest/services/CityView/CitiWatchCamera/FeatureServer/0";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-baltimore-citiwatch-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const data = await fetchArcGisFeatures(FS);
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(data));
  return { data, checksum: hasher.digest("hex") };
}

/** Parse ArcGIS features (EPSG:2248) into canonical staged rows. */
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
    const [lat, lon] = lcc2248ToWgs84(Number(g.x), Number(g.y));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("coordinate conversion out of range/zero");
      continue;
    }

    const loc = cleanText(String(a.CAM_LOCATION ?? ""), 90);

    staged.push({
      title: loc || `CitiWatch cam ${a.CAM_NUMBER ?? a.OBJECTID ?? ""}`.trim(),
      kind: "Other / unknown",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: loc || null,
      notes: "Programma CitiWatch (BPD)",
      description: null,
      external_id: `balt-citiwatch:${a.CAM_NUMBER ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
