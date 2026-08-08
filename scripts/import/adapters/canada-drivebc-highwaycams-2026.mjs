/**
 * Adapter Canada BC — DriveBC HighwayCams CSV (CEO 2026-08-08, scan
 * catalog.csv fonti ufficiali).
 *
 * Source: Province of British Columbia, DriveBC webcams.csv. 1.034
 * telecamere autostradali BC. Live (immagini).
 * Licence: OGL-BC (verificata via CKAN package_show → license_title
 * "Open Government Licence - British Columbia").
 *
 * - Fetch: CSV diretto (data.gov.bc.ca resource download).
 * - Mapping: camName → title; latitude/longitude dirette; highway_number
 *   → notes; orientation → direction (N/S/E/W/NE...).
 * - external_id = "drivebc:<id>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry, parseDirection } from "./lib.mjs";

export const slug = "canada-drivebc-highwaycams-2026";

const CSV_URL = "https://catalogue.data.gov.bc.ca/dataset/6b39a910-6c77-476f-ac96-7b4f18849b1c/resource/a9d52d85-8402-4ce7-b2ac-a2779837c48a/download/webcams.csv";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/canada-drivebc-highwaycams-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(CSV_URL);
  const text = await res.text();
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse the CSV (comma, quoted fields) into canonical staged rows. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  const lines = text.split(/\r?\n/);
  const header = lines[0]?.split(",").map((h) => h.replace(/^"|"$/g, ""));
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // split rispettando le virgolette
    const cells = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);

    const lat = Number.parseFloat(cells[idx["latitude"]]);
    const lon = Number.parseFloat(cells[idx["longitude"]]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }

    const name = cleanText(cells[idx["camName"]] ?? "", 90);
    const hwy = cleanText(cells[idx["highway_number"]] ?? "", 30);
    const loc = cleanText(cells[idx["highway_locationDescription"]] ?? "", 120);
    const img = cleanText(cells[idx["links_imageDisplay"]] ?? "", 180);

    const bits = [];
    if (hwy) bits.push(`Highway ${hwy}`);
    if (loc) bits.push(loc);
    const notes = bits.length ? bits.join(" — ").slice(0, 200) : null;

    staged.push({
      title: name || `DriveBC cam ${cells[idx["id"]] ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: parseDirection(cells[idx["orientation"]]),
      address: null,
      notes,
      description: img ? `Immagine: ${img}` : null,
      external_id: `drivebc:${cells[idx["id"]] ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
