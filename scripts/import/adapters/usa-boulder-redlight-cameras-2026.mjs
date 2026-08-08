/**
 * Adapter USA Boulder CO — Red Light Cameras PUBLIC VIEW (CEO 2026-08-08,
 * scan catalog.csv fonti ufficiali).
 *
 * Source: City of Boulder Colorado open data, Red_Light_Cameras_PUBLIC_VIEW.
 * 13 red-light camera locations. Live.
 * Licence: CC0 (licenseInfo su ArcGIS → Boulder open data terms).
 *
 * - Fetch: ArcGIS FeatureServer query (count 13 verificato).
 * - Mapping: attrs Location → title; coordinate Web Mercator (EPSG:3857)
 *   → webMercatorToWgs84 (verificato: -11716806, 4868060 → 40.01, -105.25).
 * - external_id = "boulder:<OBJECTID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry, webMercatorToWgs84 } from "./lib.mjs";

export const slug = "usa-boulder-redlight-cameras-2026";

const FS = "https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/Red_Light_Cameras_PUBLIC_VIEW/FeatureServer/0";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-boulder-redlight-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const all = [];
  let offset = 0;
  const PAGE = 100;
  for (;;) {
    const url = `${FS}/query?where=1%3D1&outFields=*&resultOffset=${offset}&resultRecordCount=${PAGE}&f=json`;
    const res = await fetchWithRetry(url);
    const data = await res.json();
    const feats = data?.features ?? [];
    if (!feats.length) break;
    all.push(...feats);
    if (feats.length < PAGE) break;
    offset += PAGE;
  }
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(all));
  return { data: all, checksum: hasher.digest("hex") };
}

/** Parse ArcGIS features (Web Mercator) into canonical staged rows. */
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
    const [lat, lon] = webMercatorToWgs84(Number(g.x), Number(g.y));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("coordinate conversion out of range");
      continue;
    }

    const loc = cleanText(String(a.Location ?? ""), 90);

    staged.push({
      title: loc || `Red light cam ${a.OBJECTID ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: loc || null,
      notes: a.CameraType ? `Tipo: ${cleanText(String(a.CameraType), 40)}` : null,
      description: null,
      external_id: `boulder:${a.OBJECTID ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
