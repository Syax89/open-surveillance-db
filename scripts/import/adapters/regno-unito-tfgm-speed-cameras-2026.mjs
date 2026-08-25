/**
 * Adapter UK — TfGM Speed Camera Locations (Greater Manchester, fixed).
 * Verifica coda giurisdizioni + mega-check catalogo (2026-08-20).
 *
 * Source: Transport for Greater Manchester via data.gov.uk (OGL 3.0).
 * 231 telecamere FISSE (Red Light / Speed / Average Speed / Speed & Red
 * Light) — i CSV Mobile/Community Concern sono ZONE "may park" (non
 * posizioni di telecamera) e NON vengono importati.
 *
 * - Fetch: CSV Fixed (odata.tfgm.com).
 * - Geocoding: i CSV non hanno coordinate; lookup Nominatim pre-calcolato
 *   (street-level, 2026-08-20) committato in tfgm-lookup-2026.json.
 * - Mapping: Location Description → title; District + Speed Limit → notes;
 *   lookup[key="<District>|<desc>"] → coordinates.
 * - external_id = "tfgm-fixed:<district>:<seq>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "regno-unito-tfgm-speed-cameras-2026";

const CSV_URL = "https://odata.tfgm.com/opendata/downloads/Speed_Camera_Locations_GM_Fixed.csv";

const LOOKUP_URL = new URL("./tfgm-lookup-2026.json", import.meta.url);

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/regno-unito-tfgm-speed-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(CSV_URL);
  const text = await res.text();
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse the Fixed CSV, applying the pre-computed geocode lookup. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  let lookup;
  try {
    lookup = JSON.parse(readFileSync(LOOKUP_URL, "utf8"));
  } catch (e) {
    recordSkip(`lookup unreadable: ${e.message.slice(0, 60)}`);
    return { staged, skipped, checksum: null };
  }
  const byKey = new Map((lookup.results ?? []).map((r) => [r.key, r]));

  // header: riga 3 (District,Camera Type,Location Description,Speed Limit MPH)
  const lines = text.split(/\r?\n/);
  const data = lines.slice(3);
  let seq = 0;
  for (const line of data) {
    const cells = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);
    if (cells.length < 4) continue;
    const district = cells[0].trim();
    const ctype = cells[1].trim();
    const desc = cells[2].trim();
    const speed = cells[3].trim();
    if (!district || !desc) continue;
    seq += 1;

    const hit = byKey.get(`${district}|${desc}`);
    if (!hit) {
      recordSkip(`no geocode (${district}: ${desc.slice(0, 50)})`);
      continue;
    }
    const lat = Number.parseFloat(hit.lat);
    const lon = Number.parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const bits = [];
    if (district) bits.push(`Distretto: ${district}`);
    if (ctype) bits.push(`Tipo: ${ctype}`);
    if (speed) bits.push(`Limite: ${speed} mph`);

    staged.push({
      title: cleanText(desc, 110),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: cleanText(desc, 110) || null,
      notes: bits.join(" · ").slice(0, 200),
      description: null,
      external_id: `tfgm-fixed:${district.toLowerCase().replace(/\s+/g, "-")}:${seq}`,
    });
  }

  return { staged, skipped, checksum: null };
}
