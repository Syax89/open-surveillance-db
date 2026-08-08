/**
 * Adapter Irlanda — Dublin City Council Traffic Poles with CCTV (CEO
 * 2026-08-08, scan catalog.csv + verifica diretta).
 *
 * Source: Dublin City Council via data.smartdublin.ie. 241 pali con
 * telecamera CCTV su strade di Dublino. Live.
 * Licence: CC BY (data.gov.ie, dichiarata).
 *
 * - Fetch: GeoJSON diretto.
 * - Mapping: Road_1 → title; coordinate da properties (WGS84).
 * - external_id = "dcc-cctv:<ID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "irlanda-dublino-cctv-poles-2026";

const GEOJSON_URL = "https://data.smartdublin.ie/dataset/776b91ac-9822-454b-b9d8-16ae393981b3/resource/0286a017-8b00-43bd-a092-8116a1874070/download/dc-traffic-poles-with-cctv.geojson";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/irlanda-dublino-cctv-poles-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(GEOJSON_URL);
  const data = await res.json();
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(data));
  return { data, checksum: hasher.digest("hex") };
}

/** Parse GeoJSON features into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!data?.features) return { staged, skipped, checksum: null };

  for (const f of data.features) {
    const p = f.properties ?? {};
    const lat = Number.parseFloat(p.Latitude);
    const lon = Number.parseFloat(p.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }

    const road = cleanText(String(p.Road_1 ?? ""), 90);

    staged.push({
      title: road || `DCC CCTV ${p.ID ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: road || null,
      notes: "Palo con CCTV (DCC)",
      description: null,
      external_id: `dcc-cctv:${p.ID ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
