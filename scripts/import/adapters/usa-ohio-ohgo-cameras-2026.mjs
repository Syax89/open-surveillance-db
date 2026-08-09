/**
 * Adapter USA Ohio — OHGO Cameras (cron ricerca 2026-08-09).
 *
 * Source: ODOT OHGO public API (api.ohgo.com/cameras). 1.159 siti con
 * Latitude/Longitude. Live (snapshot ogni 5s).
 * Licence: public domain (ODOT statement su publicapi.ohgo.com).
 *
 * - Fetch: GET JSON diretto (no key).
 * - Mapping: Location → title; Latitude/Longitude WGS84.
 * - external_id = "ohio-ohgo:<Id>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "usa-ohio-ohgo-cameras-2026";

const API_URL = "https://api.ohgo.com/cameras";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-ohio-ohgo-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(API_URL);
  const data = await res.json();
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(data));
  return { data, checksum: hasher.digest("hex") };
}

/** Parse OHGO camera sites into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!Array.isArray(data)) return { staged, skipped, checksum: null };

  for (const c of data) {
    const lat = Number.parseFloat(c.Latitude);
    const lon = Number.parseFloat(c.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }
    const loc = cleanText(String(c.Location ?? ""), 120);
    staged.push({
      title: loc || `OHGO cam ${c.Id ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: loc || null,
      notes: "OHGO (ODOT)",
      description: null,
      external_id: `ohio-ohgo:${c.Id ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
