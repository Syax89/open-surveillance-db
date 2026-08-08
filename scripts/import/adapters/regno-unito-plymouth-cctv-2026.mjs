/**
 * Adapter UK Plymouth — CCTV Traffic Cameras (CEO 2026-08-08, scan
 * catalog.csv + verifica diretta).
 *
 * Source: Plymouth City Council (plymouth.thedata.place). 44 telecamere
 * traffico. Live.
 * Licence: OGL 3.0 (data.gov.uk).
 *
 * - Fetch: CSV diretto.
 * - Mapping: Camera Loc → title; x/y già WGS84 (lon/lat).
 * - external_id = "plymouth-cctv:<fid>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "regno-unito-plymouth-cctv-2026";

const CSV_URL = "https://plymouth.thedata.place/dataset/603331e3-5505-44c1-adf4-8278c02535d6/resource/4984b27f-ae96-4c7b-9102-17434408a1b3/download/traffic-cameras.csv";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/regno-unito-plymouth-cctv-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(CSV_URL);
  const text = await res.text();
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse the CSV into canonical staged rows. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  const lines = text.split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = line.split(",");
    const lon = Number.parseFloat(cells[idx["x"]]);
    const lat = Number.parseFloat(cells[idx["y"]]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }

    const loc = cleanText(cells[idx["Camera Loc"]] ?? "", 90);
    const num = cleanText(cells[idx["Camera Num"]] ?? "", 30);

    staged.push({
      title: loc || `Plymouth cam ${num || ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: loc || null,
      notes: num ? `Cam ${num}` : null,
      description: null,
      external_id: `plymouth-cctv:${cells[idx["fid"]] || `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
