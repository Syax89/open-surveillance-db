/**
 * Adapter USA California — CalTrans Highway CCTV (CEO 2026-08-08, scan
 * catalog.csv + verifica diretta ArcGIS Online).
 *
 * Source: Caltrans, CHhighway/CCTV FeatureServer (gisdata.dot.ca.gov).
 * 2.936 telecamere CCTV su autostrade statali CA. Live.
 * Licence: CC BY 4.0 — ESPLICITA nel licenseInfo dell'item ArcGIS Online
 * ("This work is licensed under a Creative Commons Attribution 4.0
 * International License"). Il KML QuickMap (3.493, "none stated") è
 * ESCLUSO: stessa rete ma senza licenza dichiarata.
 *
 * - Fetch: FeatureServer query paginata (fetchArcGisFeatures), WGS84
 *   diretto (wkid 4326).
 * - Mapping: locationName → title; direction → direction; nearbyPlace/
 *   county/route/district → notes.
 * - external_id = "caltrans-cctv:<OBJECTID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchArcGisFeatures, parseDirection } from "./lib.mjs";

export const slug = "usa-caltrans-cctv-2026";

const FS = "https://gisdata.dot.ca.gov/arcgis/rest/services/CHhighway/CCTV/FeatureServer/0";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-caltrans-cctv-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const data = await fetchArcGisFeatures(FS);
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(data));
  return { data, checksum: hasher.digest("hex") };
}

/** Parse ArcGIS features (WGS84) into canonical staged rows. */
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
    const lat = Number.parseFloat(a.latitude);
    const lon = Number.parseFloat(a.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }

    const name = cleanText(String(a.locationName ?? ""), 90);
    const place = cleanText(String(a.nearbyPlace ?? ""), 60);
    const county = cleanText(String(a.county ?? ""), 40);
    const route = cleanText(String(a.route ?? ""), 20);
    const district = a.district != null ? String(a.district) : "";

    const bits = [];
    if (route) bits.push(`Route ${route}`);
    if (county) bits.push(county);
    if (place) bits.push(place);
    if (district) bits.push(`District ${district}`);
    const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

    staged.push({
      title: name || `Caltrans CCTV ${a.OBJECTID ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: parseDirection(String(a.direction ?? "")),
      address: place || null,
      notes,
      description: null,
      external_id: `caltrans-cctv:${a.OBJECTID ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
