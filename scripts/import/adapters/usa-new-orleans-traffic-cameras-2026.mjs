/**
 * Adapter USA New Orleans — Traffic Camera Locations (CEO 2026-08-08,
 * scan catalog.csv fonti ufficiali).
 *
 * Source: City of New Orleans open data (Socrata te2d-4txp). 103
 * telecamere traffico/sicurezza. Live.
 * Licence: CC0 (logo CC0 + Public Domain Dedication sulla pagina).
 *
 * - Fetch: Socrata SODA API ($limit=200, paginazione $offset).
 * - Mapping: camloc → title; the_geom Point [lon,lat]; function (TFS),
 *   operational, camid → notes.
 * - external_id = "nola:<camid>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "usa-new-orleans-traffic-cameras-2026";

const API_URL = "https://data.nola.gov/resource/te2d-4txp.json";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-new-orleans-traffic-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const all = [];
  let offset = 0;
  const PAGE = 200;
  for (;;) {
    const url = `${API_URL}?$limit=${PAGE}&$offset=${offset}`;
    const res = await fetchWithRetry(url);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(all));
  return { data: all, checksum: hasher.digest("hex") };
}

/** Parse Socrata rows into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!Array.isArray(data)) return { staged, skipped, checksum: null };

  for (const r of data) {
    const coords = r.the_geom?.coordinates;
    const lon = Number.parseFloat(coords?.[0]);
    const lat = Number.parseFloat(coords?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }

    const camloc = cleanText(String(r.camloc ?? ""), 90);
    const fn = cleanText(String(r.function ?? ""), 30);
    const camid = cleanText(String(r.camid ?? ""), 30);
    const bits = [];
    if (fn) bits.push(`Funzione: ${fn}`);
    if (String(r.operational ?? "") !== "") bits.push(`Operativa: ${r.operational}`);
    const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

    staged.push({
      title: camloc || `NOLA cam ${camid || ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: camloc || null,
      notes,
      description: null,
      external_id: `nola:${camid || `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
