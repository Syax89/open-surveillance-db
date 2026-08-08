/**
 * Adapter USA Pennsylvania — PennDOT Traffic Cameras (CEO 2026-08-08,
 * scan catalog.csv + verifica diretta + verdetto legale).
 *
 * Source: PennDOT, paprojects MapServer layer 14. 1.410 telecamere PA.
 * Live.
 * Licence: PennDOT terms — redistribuzione esplicitamente consentita con
 * attribuzione (511PA, verificato 2026-08-08).
 *
 * - Fetch: MapServer query paginata, Web Mercator → webMercatorToWgs84.
 * - Mapping: STATEWIDE_ID → external_id; LOC_DISTRICT → notes.
 * - external_id = "penndot:<STATEWIDE_ID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchArcGisFeatures, webMercatorToWgs84 } from "./lib.mjs";

export const slug = "usa-penndot-traffic-cameras-2026";

const FS = "https://gis.penndot.gov/arcgis/rest/services/paprojects/paprojects/MapServer/14";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-penndot-traffic-cameras-2026.json", import.meta.url), "utf8"));
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

    const sid = cleanText(String(a.STATEWIDE_ID ?? ""), 40);
    const status = cleanText(String(a.STATUS_NAME ?? ""), 30);
    const install = cleanText(String(a.INSTALL_TYPE_NAME ?? ""), 40);
    const bits = [];
    if (status) bits.push(status);
    if (install) bits.push(install);
    const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

    staged.push({
      title: sid ? `PennDOT cam ${sid}` : `PennDOT cam ${a.OBJECTID ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: null,
      notes,
      description: null,
      external_id: `penndot:${sid || `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
