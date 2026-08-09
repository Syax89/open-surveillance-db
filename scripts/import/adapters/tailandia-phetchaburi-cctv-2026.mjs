/**
 * Adapter Thailandia — Phetchaburi CCTV registry (cron ricerca
 * 2026-08-09). Polizia provinciale + municipi, 636 righe con lat/lon.
 * Licence: Open Data Common (ODC).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "tailandia-phetchaburi-cctv-2026";

const CSV_URL = "https://phetchaburi.gdcatalog.go.th/dataset/6640561f-2d47-42d3-8d55-fa6e01a21b54/resource/126b3683-60e9-40c1-8cf5-33d2aee74eee/download/cctv.csv";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/tailandia-phetchaburi-cctv-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(CSV_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  const hasher = createHash("sha256");
  hasher.update(text);
  return { data: text, checksum: hasher.digest("hex") };
}

/** Parse CSV into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (typeof data !== "string") return { staged, skipped, checksum: null };

  const lines = data.replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 2) return { staged, skipped, checksum: null };

  const parseRow = (line) => {
    const cells = [];
    let field = "";
    let inQ = false;
    for (const ch of line) {
      if (inQ) {
        if (ch === '"') inQ = false;
        else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { cells.push(field); field = ""; }
      else field += ch;
    }
    cells.push(field);
    return cells;
  };

  const header = parseRow(lines[0]).map((h) => h.trim());
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });
  const latCol = idx.Latitude !== undefined ? "Latitude" : Object.keys(idx).find((k) => k.toLowerCase().includes("lat"));
  const lonCol = idx.Longitude !== undefined ? "Longitude" : Object.keys(idx).find((k) => k.toLowerCase().includes("lon"));
  const placeCol = Object.keys(idx).find((k) => k.includes("สถานที่ติดตั้ง"));
  const orgCol = Object.keys(idx).find((k) => k.includes("ชื่อหน่วยงาน"));
  const brandCol = Object.keys(idx).find((k) => k.includes("ยี่ห้อ"));
  const useCol = Object.keys(idx).find((k) => k.includes("การใช้งาน"));
  if (!latCol || !lonCol) { recordSkip("no lat/lon columns"); return { staged, skipped, checksum: null }; }

  let idxNum = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = parseRow(line);
    const at = (col) => (col !== undefined && cells[idx[col]] !== undefined ? cells[idx[col]].trim() : "");
    const lat = Number.parseFloat(at(latCol));
    const lon = Number.parseFloat(at(lonCol));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }
    const place = cleanText(at(placeCol), 120);
    const org = cleanText(at(orgCol), 80);
    const brand = cleanText(at(brandCol), 40);
    const use = cleanText(at(useCol), 80);
    const bits = [];
    if (org) bits.push(org);
    if (brand) bits.push(brand);
    if (use) bits.push(use);
    const notes = bits.length ? bits.slice(0, 3).join(" · ").slice(0, 200) : null;

    staged.push({
      title: place || `CCTV Phetchaburi ${idxNum}`.trim(),
      kind: "Other / unknown",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: place || null,
      notes,
      description: null,
      external_id: `pbr-cctv:${idxNum}`,
    });
    idxNum += 1;
  }

  return { staged, skipped, checksum: null };
}
