/**
 * Adapter USA New York — Thruway Toll Gantries (CEO 2026-08-08, scan
 * catalog.csv + verifica diretta).
 *
 * Source: NYS Thruway Authority via data.ny.gov (Socrata). 70 gantries
 * E-ZPass. Live.
 * Licence: NY Open Data policy (data.ny.gov terms of use) — IMPORT SOLO
 * SE la policy confermata è permissiva; descriptor segnato in attesa del
 * verdetto legale subagent (fail-closed).
 *
 * NOTA SCOPE: i gantries sono portali a pedaggio (tolling), NON telecamere
 * di traffico pubbliche. Da valutare se rientrano nello scope del
 * progetto (sono strutture con telecamere fisse di sorveglianza — come
 * le altre fonti tolling già presenti?).
 *
 * - Fetch: Socrata SODA, lat/lon dirette.
 * - Mapping: name → title; road/type/milepost → notes.
 * - external_id = "ny-thruway:<name>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "usa-ny-thruway-gantries-2026";

const API_URL = "https://data.ny.gov/resource/pfuu-4nqq.json";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-ny-thruway-gantries-2026.json", import.meta.url), "utf8"));
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
    const lat = Number.parseFloat(r.latitude);
    const lon = Number.parseFloat(r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }

    const name = cleanText(String(r.name ?? ""), 90);
    const road = cleanText(String(r.road ?? ""), 40);
    const type = cleanText(String(r.type ?? ""), 40);
    const milepost = cleanText(String(r.milepost ?? ""), 20);

    const bits = [];
    if (road) bits.push(road);
    if (type) bits.push(type);
    if (milepost) bits.push(`MP ${milepost}`);
    const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

    staged.push({
      title: name || `Thruway gantry ${milepost || ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes,
      description: null,
      external_id: `ny-thruway:${name || `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
