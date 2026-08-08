/**
 * Adapter USA Baltimore — ATVES Automated Enforcement Cameras (CEO
 * 2026-08-08, scan catalog.csv + verifica diretta + verdetto legale).
 *
 * Source: City of Baltimore ATVES — 3 servizi ArcGIS:
 *   - Baltimore_ATVES_Red_Light_Camera/0  → 180 red light
 *   - ATVES_Speed_Cameras_Fixed/3         → 21 speed fixed
 *   - ATVES_Speed_Cameras_Portable/1      → 128 speed portable
 * Live.
 * Licence: Maryland public domain + attribution (verificato 2026-08-08).
 *
 * - Fetch: 3 FeatureServer query paginate, EPSG:2248 → lcc2248ToWgs84.
 * - Mapping: Location → title; CamType/SchlLocation → notes.
 * - external_id = "balt-atves:<tipo>:<GIS_ID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchArcGisFeatures, lcc2248ToWgs84 } from "./lib.mjs";

export const slug = "usa-baltimore-atves-cameras-2026";

const SERVICES = [
  { name: "redlight", url: "https://services3.arcgis.com/ZTvQ9NuONePFYofE/ArcGIS/rest/services/Baltimore_ATVES_Red_Light_Camera/FeatureServer/0" },
  { name: "speed-fixed", url: "https://services3.arcgis.com/ZTvQ9NuONePFYofE/ArcGIS/rest/services/ATVES_Speed_Cameras_Fixed/FeatureServer/3" },
  { name: "speed-portable", url: "https://services3.arcgis.com/ZTvQ9NuONePFYofE/ArcGIS/rest/services/ATVES_Speed_Cameras_Portable/FeatureServer/1" },
];

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-baltimore-atves-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const all = [];
  for (const svc of SERVICES) {
    const feats = await fetchArcGisFeatures(svc.url);
    for (const f of feats) all.push({ ...f, __svc: svc.name });
  }
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(all));
  return { data: all, checksum: hasher.digest("hex") };
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

    const loc = cleanText(String(a.Location ?? ""), 90);
    const camType = cleanText(String(a.CamType ?? ""), 50);
    const school = cleanText(String(a.SchlLocation ?? ""), 60);
    const bits = [];
    if (camType) bits.push(camType);
    if (school) bits.push(`Scuola: ${school}`);
    const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

    staged.push({
      title: loc || `${camType || "ATVES cam"} ${a.GIS_ID ?? a.OBJECTID ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: loc || null,
      notes,
      description: null,
      external_id: `balt-atves:${f.__svc}:${a.GIS_ID ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
