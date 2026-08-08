/**
 * Adapter Ucraina — Speed enforcement camera locations (CEO 2026-08-08,
 * scan catalog.csv + verifica diretta).
 *
 * Source: data.gov.ua (Cameras.csv). 380 telecamere enforcement velocità.
 * Live.
 * Licence: CC BY 4.0 (dichiarata su data.gov.ua).
 *
 * - Fetch: CSV diretto (resource download).
 * - Mapping: addressThoroughfare → title; lat/lon dirette; attrs ricchi
 *   (addressAdminUnitL3, balanceHolderName, isSpeedRecognition) → notes.
 * - external_id = "ua-camera:<inventoryNumber>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "ucraina-speed-cameras-2026";

const CSV_URL = "https://data.gov.ua/dataset/b7b6349c-d109-45e7-af37-b73310f73cf5/resource/01825845-4d62-4611-b9a6-d2a43d27cd0e/download/cameras_csv.csv";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/ucraina-speed-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(CSV_URL);
  const text = await res.text();
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse the CSV (header + semicolon? comma?) into canonical staged rows. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  const lines = text.split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // split CSV rispettando le virgolette
    const cells = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
      else cur += ch;
    }
    cells.push(cur);

    const lat = Number.parseFloat(cells[idx["lat"]]);
    const lon = Number.parseFloat(cells[idx["lon"]]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }

    const thoroughfare = cleanText((cells[idx["addressThoroughfare"]] ?? "").replace(/^"|"$/g, ""), 90);
    const adminL3 = cleanText((cells[idx["addressAdminUnitL3"]] ?? "").replace(/^"|"$/g, ""), 40);
    const holder = cleanText((cells[idx["balanceHolderName"]] ?? "").replace(/^"|"$/g, ""), 60);
    const inv = cleanText((cells[idx["inventoryNumber"]] ?? "").replace(/^"|"$/g, ""), 40);

    const bits = [];
    if (adminL3) bits.push(adminL3);
    if (String(cells[idx["isSpeedRecognition"]] ?? "") === "true") bits.push("Speed camera");
    if (String(cells[idx["isNumberRecognition"]] ?? "") === "true") bits.push("LPR");
    if (holder) bits.push(holder);
    const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

    staged.push({
      title: thoroughfare || `UA camera ${inv || ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: thoroughfare || null,
      notes,
      description: null,
      external_id: `ua-camera:${inv || `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
