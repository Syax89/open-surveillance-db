/**
 * Adapter USA Kentucky — KYTC Traffic Cameras (cron ricerca 2026-08-09).
 *
 * Source: KYTC official MapServer (kygisserver.ky.gov). 226 camere.
 * Live (snapshot URL per cam).
 * Licence: CC0 1.0 (dichiarato su maps.kytc.ky.gov/trafficcameras/).
 *
 * - Fetch: MapServer query paginata, Web Mercator → webMercatorToWgs84.
 * - Mapping: description → title; direction/district/county → notes.
 * - external_id = "kytc-cam:<OBJECTID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchArcGisFeatures, webMercatorToWgs84 } from "./lib.mjs";

export const slug = "usa-kentucky-kytc-cameras-2026";

const FS = "https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/Ky_WebCams_WGS84WM/MapServer/0";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-kentucky-kytc-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const data = await fetchArcGisFeatures(FS);
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(data));
  return { data, checksum: hasher.digest("hex") };
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

    const desc = cleanText(String(a.description ?? ""), 120);
    const district = cleanText(String(a.district ?? ""), 30);
    const county = cleanText(String(a.county ?? ""), 40);
    const bits = [];
    if (district) bits.push(`Distretto ${district}`);
    if (county) bits.push(county);
    const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

    staged.push({
      title: desc || `KYTC cam ${a.OBJECTID ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: null,
      notes,
      description: null,
      external_id: `kytc-cam:${a.OBJECTID ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
