/**
 * Adapter USA DC — DDOT Traffic Cameras (CEO 2026-08-08, scan catalog.csv
 * fonti ufficiali).
 *
 * Source: District of Columbia DDOT open data, layer 93 "Traffic Camera"
 * (Transportation_Sensors_WebMercator). 314 telecamere traffico DC. Live.
 * Licence: CC BY 4.0 (dichiarata su open data DC).
 *
 * - Fetch: ArcGIS FeatureServer query con paging (resultOffset).
 * - Mapping: attrs CAMERAID/CAMERATYPE; coordinate Web Mercator
 *   (EPSG:3857) → webMercatorToWgs84 (verificato: -8575659, 4720480 →
 *   38.94, -77.02 — DC).
 * - external_id = "ddot:<CAMERAID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry, webMercatorToWgs84 } from "./lib.mjs";

export const slug = "usa-ddot-traffic-cameras-2026";

const FS = "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_Sensors_WebMercator/MapServer/93";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-ddot-traffic-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const all = [];
  let offset = 0;
  const PAGE = 200;
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
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("coordinate conversion out of range/zero");
      continue;
    }

    const camType = cleanText(String(a.CAMERATYPE ?? ""), 40);
    const bits = [];
    if (camType) bits.push(`Tipo: ${camType}`);
    if (a.FACILITYID != null) bits.push(`Facility: ${a.FACILITYID}`);

    staged.push({
      title: `Traffic camera ${a.CAMERAID ?? a.OBJECTID ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: null,
      notes: bits.length ? bits.join(" · ").slice(0, 200) : null,
      description: null,
      external_id: `ddot:${a.CAMERAID ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
