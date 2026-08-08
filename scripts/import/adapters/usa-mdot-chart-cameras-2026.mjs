/**
 * Adapter USA Maryland — MDOT SHA CHART Traffic Cameras (CEO 2026-08-08,
 * scan catalog.csv + verifica diretta + verdetto legale).
 *
 * Source: MDOT, MD_TrafficCameras FeatureServer (mdgeodata.md.gov). 451
 * telecamere CHART. Live (feed URL per cam).
 * Licence: Maryland public domain + attribution (verificato 2026-08-08).
 *
 * - Fetch: FeatureServer query paginata, Web Mercator → webMercatorToWgs84.
 * - Mapping: location → title; county/feedID → notes; url → description.
 * - external_id = "mdot-chart:<feedID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchArcGisFeatures, webMercatorToWgs84 } from "./lib.mjs";

export const slug = "usa-mdot-chart-cameras-2026";

const FS = "https://mdgeodata.md.gov/imap/rest/services/Transportation/MD_TrafficCameras/FeatureServer/0";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-mdot-chart-cameras-2026.json", import.meta.url), "utf8"));
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

    const loc = cleanText(String(a.location ?? ""), 90);
    const county = cleanText(String(a.county ?? ""), 40);
    const feed = cleanText(String(a.feedID ?? ""), 40);
    const url = cleanText(String(a.url ?? ""), 180);

    const bits = [];
    if (county) bits.push(county);
    if (feed) bits.push(`Feed ${feed}`);
    const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

    staged.push({
      title: loc || `MDOT CHART cam ${a.OBJECTID ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: null,
      notes,
      description: url ? `Live: ${url}` : null,
      external_id: `mdot-chart:${feed || `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
