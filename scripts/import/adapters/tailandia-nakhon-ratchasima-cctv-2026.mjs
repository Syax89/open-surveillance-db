/**
 * Adapter Thailandia — Nakhon Ratchasima Provincial Police CCTV
 * (cron ricerca 2026-08-09).
 *
 * Source: Thai GD Catalog (nakhonratchasima.gdcatalog.go.th), CSV
 * ufficiale polizia provinciale. 11.481 righe, 11.464 con lat/lon.
 * Licence: Open Data Common (ODC).
 *
 * - Fetch: CSV diretto (UTF-8 BOM). Nomi colonna con SPAZI → strip.
 * - Mapping: ชื่อจุดติดตั้ง → title; ชื่อสถานที่ → address; หน่วยงาน → notes.
 * - external_id = "nkr-cctv:<idx>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "tailandia-nakhon-ratchasima-cctv-2026";

const CSV_URL = "https://nakhonratchasima.gdcatalog.go.th/dataset/321a5bc5-03cc-437b-bf5b-c6c6d936d284/resource/daad6a09-58f6-4918-9331-7d9555b888ec/download/cctv_camera_locations__.csv";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/tailandia-nakhon-ratchasima-cctv-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(CSV_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString("utf8").replace(/^\uFEFF/, "");
  const hasher = createHash("sha256");
  hasher.update(text);
  return { data: text, checksum: hasher.digest("hex") };
}

/** Parse CSV (nomi colonna thai, con spazi) into canonical staged rows. */
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

  // Parser CSV quoted (campi thai possono contenere virgole).
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
  const latCol = Object.keys(idx).find((k) => k.includes("ละติจูด"));
  const lonCol = Object.keys(idx).find((k) => k.includes("ลองจิจูด"));
  const titleCol = Object.keys(idx).find((k) => k.includes("ชื่อจุดติดตั้ง"));
  const placeCol = Object.keys(idx).find((k) => k.includes("ชื่อสถานที่"));
  const orgCol = Object.keys(idx).find((k) => k.includes("หน่วยงาน"));
  const catCol = Object.keys(idx).find((k) => k.includes("ประเภทสถานที่"));
  if (!latCol || !lonCol) { recordSkip("no lat/lon columns"); return { staged, skipped, checksum: null }; }
  // PM decision 2026-08-09 (kanban t_8a0445a4): keep ONLY government/public
  // cameras (categoria 'ราชการ'). The dataset exposes the category column;
  // if it ever disappears, refuse the whole batch (fail-closed) rather than
  // importing private cameras with precise coordinates (privacy risk).
  if (!catCol) { recordSkip("no category column (cannot filter government cameras)"); return { staged, skipped, checksum: null }; }

  let idxNum = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = parseRow(line);
    const at = (col) => (col !== undefined && cells[idx[col]] !== undefined ? cells[idx[col]].trim() : "");
    const category = at(catCol);
    if (category !== "ราชการ") { recordSkip("non-government category"); continue; }
    const lat = Number.parseFloat(at(latCol));
    const lon = Number.parseFloat(at(lonCol));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }
    const title = cleanText(at(titleCol), 120);
    const place = cleanText(at(placeCol), 120);
    const org = cleanText(at(orgCol), 120);

    staged.push({
      title: title || place || `CCTV NKR ${idxNum}`.trim(),
      kind: "Other / unknown",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: place || null,
      notes: org ? org.slice(0, 200) : null,
      description: null,
      external_id: `nkr-cctv:${idxNum}`,
    });
    idxNum += 1;
  }

  return { staged, skipped, checksum: null };
}
