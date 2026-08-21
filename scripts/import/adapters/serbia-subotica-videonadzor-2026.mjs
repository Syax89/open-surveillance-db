/**
 * Adapter Serbia — City of Subotica, general video surveillance.
 * Scan coda giurisdizioni (cron 2026-08-15, pass v1).
 *
 * Source: data.gov.rs (Serbian Open Data Portal), dataset "video-nadzor".
 * 7 punti di videosorveglianza generale, GeoJSON Point WGS84 (CRS84).
 * Licence: Serbian Open Data License (SODL) — terms page data.gov.rs/sr/terms
 * (commercial and non-commercial reuse, copying, distribution, adaptation,
 * merging, with attribution). Statico (2022).
 *
 * - Fetch: GeoJSON diretto.
 * - Mapping: properties.id → external_id; coordinate dirette.
 * - external_id = "subotica-videonadzor:<id>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "serbia-subotica-videonadzor-2026";

const GEOJSON_URL = "https://data.gov.rs/s/resources/video-nadzor/20220209-235811/subotica-videonadzorostalo-tac.geojson";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/serbia-subotica-videonadzor-2026.json", import.meta.url), "utf8"));
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
    const geom = f.geometry ?? {};
    if (geom.type !== "Point" || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
      recordSkip("non-Point geometry");
      continue;
    }
    const lon = Number.parseFloat(geom.coordinates[0]);
    const lat = Number.parseFloat(geom.coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }

    const id = String(p.id ?? "").trim();

    staged.push({
      title: id ? `Subotica camera ${id}` : `Subotica camera ${lon.toFixed(5)},${lat.toFixed(5)}`,
      kind: "Other / unknown",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes: "Videonadzor — general surveillance (Grad Subotica)",
      description: null,
      external_id: `subotica-videonadzor:${id || `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
