/**
 * Adapter Giappone — Ichikawa City street CCTV (cron ricerca
 * 2026-08-09). CSV cp932 su geospatial.jp, 240 righe 緯度/経度.
 * Licence: CC BY 4.0.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "giappone-ichikawa-cctv-2026";

const CSV_URL = "https://www.geospatial.jp/ckan/dataset/d3f93bb3-6703-40f2-b631-a82cdbb0b0f5/resource/1671dbac-f7a7-4de0-8626-0b515ac63e6a/download/bouhannkamera.csv";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/giappone-ichikawa-cctv-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(CSV_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = new TextDecoder("shift_jis").decode(buf);
  const hasher = createHash("sha256");
  hasher.update(text);
  return { data: text, checksum: hasher.digest("hex") };
}

/** Parse CSV (cp932) into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (typeof data !== "string") return { staged, skipped, checksum: null };

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

  const lines = data.replace(/\r\n/g, "\n").split("\n");
  const header = parseRow(lines[0]).map((h) => h.trim());
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });
  const latCol = idx["緯度"] !== undefined ? "緯度" : Object.keys(idx).find((k) => k.includes("緯度"));
  const lonCol = idx["経度"] !== undefined ? "経度" : Object.keys(idx).find((k) => k.includes("経度"));
  const addrCol = idx["住所"] !== undefined ? "住所" : Object.keys(idx).find((k) => k.includes("住所"));
  const facCol = idx["設置施設名称"] !== undefined ? "設置施設名称" : Object.keys(idx).find((k) => k.includes("設置施設名称"));
  const catCol = idx["分類"] !== undefined ? "分類" : Object.keys(idx).find((k) => k.includes("分類"));
  if (!latCol || !lonCol) { recordSkip("no lat/lon columns"); return { staged, skipped, checksum: null }; }

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseRow(lines[i]);
    const at = (col) => (col !== undefined && cells[idx[col]] !== undefined ? cells[idx[col]].trim() : "");
    const lat = Number.parseFloat(at(latCol));
    const lon = Number.parseFloat(at(lonCol));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }
    const addr = cleanText(at(addrCol), 120);
    const fac = cleanText(at(facCol), 80);
    const cat = cleanText(at(catCol), 60);
    const mgmt = at("管理番号");

    staged.push({
      title: fac || addr || `Ichikawa CCTV ${mgmt || i}`.trim(),
      kind: "Other / unknown",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: addr || null,
      notes: cat || null,
      description: null,
      external_id: `ichikawa-cctv:${mgmt || `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
