/**
 * Adapter Finlandia — Fintraffic Digitraffic weathercam stations (CEO
 * 2026-08-08, scan catalog.csv fonti ufficiali).
 *
 * Source: Fintraffic, tie.digitraffic.fi/api/weathercam/v1/stations.
 * 812 stazioni weathercam su strade statali finlandesi. Live.
 * Licence: CC BY 4.0 (dichiarata dal servizio Digitraffic, attribution-only).
 *
 * - Fetch: GET /api/weathercam/v1/stations — GeoJSON FeatureCollection,
 *   features[] con geometry Point [lon, lat, alt] e properties.
 * - Mapping: properties.name → title; presets → notes (conteggio camere);
 *   collectionStatus GATHERING = attiva.
 * - external_id = "digitraffic:<station id>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "finlandia-fintraffic-weathercam-2026";

const API_URL = "https://tie.digitraffic.fi/api/weathercam/v1/stations";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/finlandia-fintraffic-weathercam-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(API_URL);
  const data = await res.json();
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(data));
  return { data, checksum: hasher.digest("hex") };
}

/** Parse the GeoJSON FeatureCollection into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  const features = data?.features;
  if (!Array.isArray(features)) return { staged, skipped, checksum: null };

  for (const f of features) {
    const coords = f.geometry?.coordinates;
    const lon = Number.parseFloat(coords?.[0]);
    const lat = Number.parseFloat(coords?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const p = f.properties ?? {};
    const presets = Array.isArray(p.presets) ? p.presets.length : 0;
    const bits = [];
    if (presets > 0) bits.push(`${presets} camere`);
    if (p.collectionStatus) bits.push(`Stato: ${p.collectionStatus}`);

    staged.push({
      title: cleanText(p.name ?? `Weathercam ${p.id ?? ""}`.trim(), 90),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes: bits.length ? bits.join(" · ").slice(0, 200) : null,
      description: null,
      external_id: `digitraffic:${p.id ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
