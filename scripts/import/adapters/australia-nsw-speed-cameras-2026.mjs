/**
 * Adapter Australia NSW — Speed camera locations (CEO 2026-08-08, scan
 * catalog.csv + verifica diretta).
 *
 * Source: TfNSW Open Data (opendata.transport.nsw.gov.au). 2 CSV:
 *   - fixed-speed-cameras_1.csv       → 122 siti fixed
 *   - red-light-speed-cameras_1.csv   → 204 siti red-light
 * (mobile-speed-camera-locations: 1.166 righe SENZA coordinate → escluso)
 * Live.
 * Licence: CC BY 3.0 AU.
 *
 * - Fetch: 2 CSV con lat/lon (colonne Lat(1)/Long(1)... multipli per sito).
 * - Mapping: ROAD/S + SUBURB → title; SZ? (school zone) → notes.
 * - external_id = "nsw-cam:<fixed|redlight>:<n>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "australia-nsw-speed-cameras-2026";

const SOURCES = [
  {
    name: "fixed",
    url: "https://opendata.transport.nsw.gov.au/data/dataset/fb34bd89-443a-448c-a4a5-7c8caab70c44/resource/bcf2f6f4-ecfb-40e1-a807-0d5eb5f51507/download/fixed-speed-cameras_1.csv",
  },
  {
    name: "redlight",
    url: "https://opendata.transport.nsw.gov.au/data/dataset/fb34bd89-443a-448c-a4a5-7c8caab70c44/resource/debd70a9-f9f4-471c-81ae-c84098576ea6/download/red-light-speed-cameras_1.csv",
  },
];

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/australia-nsw-speed-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const all = [];
  for (const src of SOURCES) {
    const res = await fetchWithRetry(src.url);
    const text = await res.text();
    all.push({ __src: src.name, text });
  }
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(all));
  return { data: all, checksum: hasher.digest("hex") };
}

/** Parse the CSV rows into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!Array.isArray(data)) return { staged, skipped, checksum: null };

  let seq = 0;
  for (const src of data) {
    const lines = (src.text ?? "").split(/\r?\n/);
    // header: SZ?,SUBURB/TOWN,ROAD/S,Cameras,Lat(1),Long(1),Lat(2),Long(2)...
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cells = [];
      let cur = "";
      let inQ = false;
      for (const ch of line) {
        if (ch === '"') inQ = !inQ;
        else if (ch === "," && !inQ) { cells.push(cur); cur = ""; }
        else cur += ch;
      }
      cells.push(cur);

      // la prima coppia valida lat/lon
      let lat = null, lon = null;
      for (let k = 4; k + 1 < cells.length; k += 2) {
        const la = Number.parseFloat(cells[k]);
        const lo = Number.parseFloat(cells[k + 1]);
        if (Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0)) {
          lat = la; lon = lo; break;
        }
      }
      if (lat == null) {
        recordSkip("no valid coordinate pair");
        continue;
      }

      const suburb = cleanText(cells[1] ?? "", 50);
      const road = cleanText(cells[2] ?? "", 90);
      const school = cleanText(cells[0] ?? "", 10);
      const bits = [];
      if (suburb) bits.push(suburb);
      if (school === "Y") bits.push("School zone");
      const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

      staged.push({
        title: road || `${src.__src} speed cam ${suburb || ""}`.trim(),
        kind: "Traffic / licence plate reader",
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lon.toFixed(6)),
        direction: null,
        address: suburb || null,
        notes,
        description: null,
        external_id: `nsw-cam:${src.__src}:${seq++}`,
      });
    }
  }

  return { staged, skipped, checksum: null };
}
