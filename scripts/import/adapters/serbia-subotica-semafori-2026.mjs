/**
 * Adapter Serbia — City of Subotica, cameras on vertical traffic signals.
 * Scan coda giurisdizioni (cron 2026-08-15, pass v1).
 *
 * Source: data.gov.rs (Serbian Open Data Portal), dataset
 * "video-nadzor-na-vertikalnoj-signalizatsiji". 8 telecamere semaforiche
 * (velocità/rosso), GeoJSON Point WGS84 (CRS84).
 * Licence: Serbian Open Data License (SODL) — terms page data.gov.rs/sr/terms
 * (commercial and non-commercial reuse, copying, distribution, adaptation,
 * merging, with attribution). Statico (2022).
 *
 * - Fetch: GeoJSON diretto.
 * - Mapping: properties.Prekrsaji → notes; indice → external_id
 *   (il dataset non espone ID; dataset statico, indice stabile).
 * - external_id = "subotica-semafori:<index>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "serbia-subotica-semafori-2026";

const GEOJSON_URL = "https://data.gov.rs/s/resources/video-nadzor-na-vertikalnoj-signalizatsiji/20220210-000146/subotica-videonadzorsemafori-tac.geojson";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/serbia-subotica-semafori-2026.json", import.meta.url), "utf8"));
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

  data.features.forEach((f, i) => {
    const p = f.properties ?? {};
    const geom = f.geometry ?? {};
    if (geom.type !== "Point" || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
      recordSkip("non-Point geometry");
      return;
    }
    const lon = Number.parseFloat(geom.coordinates[0]);
    const lat = Number.parseFloat(geom.coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      return;
    }

    const violations = cleanText(String(p.Prekrsaji ?? ""), 80);

    staged.push({
      title: `Subotica traffic camera ${i + 1}`,
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes: violations ? `Violazioni: ${violations}` : "Camere su semafori verticali (Grad Subotica)",
      description: null,
      external_id: `subotica-semafori:${i}`,
    });
  });

  return { staged, skipped, checksum: null };
}
