/**
 * Adapter USA King County — Traffic Cameras (cron ricerca 2026-08-09).
 *
 * Source: King County GIS (services.arcgis.com). 125 camere.
 * Live (ImageURL per cam).
 * Licence: King County GIS Terms — copy/distribute/use permitted,
 * sale requires written agreement (licenseInfo esplicita).
 *
 * - Fetch: FeatureServer query paginata, EPSG:2926 (WA State Plane
 *   North, ftUS) → lcc2926ToWgs84.
 * - Mapping: Location → title; CamRegion → notes.
 * - external_id = "kingco-cam:<AssetID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchArcGisFeatures, lcc2926ToWgs84 } from "./lib.mjs";

export const slug = "usa-kingcounty-traffic-cameras-2026";

const FS = "https://services.arcgis.com/Ej0PsM5Aw677QF1W/arcgis/rest/services/TRAFFICCAMERA_POINT_2029/FeatureServer/0";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-kingcounty-traffic-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const data = await fetchArcGisFeatures(FS);
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(data));
  return { data, checksum: hasher.digest("hex") };
}

/** Parse ArcGIS features (EPSG:2926) into canonical staged rows. */
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
    const [lat, lon] = lcc2926ToWgs84(Number(g.x), Number(g.y));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("coordinate conversion out of range/zero");
      continue;
    }

    const loc = cleanText(String(a.Location ?? ""), 120);
    const region = cleanText(String(a.CamRegion ?? ""), 30);
    const bits = [];
    if (region) bits.push(region);
    const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

    staged.push({
      title: loc || `King County cam ${a.AssetID ?? a.OBJECTID ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: loc || null,
      notes,
      description: null,
      external_id: `kingco-cam:${a.AssetID ?? a.OBJECTID ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
