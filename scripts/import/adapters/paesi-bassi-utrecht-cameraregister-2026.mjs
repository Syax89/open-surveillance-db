/**
 * Adapter Utrecht — "Cameraregister Utrecht" (CEO 2026-08-08, scan NL
 * fonti ufficiali).
 *
 * Source: Gemeente Utrecht, open data (open.utrecht.nl). Registro ufficiale
 * di ~368 telecamere (OOV, OV, ponti, milieuzone, private) con lat/lon.
 * Licence: CC-0 (Public Domain Dedication, dichiarata sul portale
 * data.overheid.nl) — già nel gate.
 *
 * - Fetch: XLSX da open.utrecht.nl (foglio unico, header in prima riga).
 * - Parse: mini-parser XLSX pure-JS su fflate (unzip + XML) — niente
 *   dipendenze pesanti (exceljs rimosso: catena uuid/nanoid → advisory
 *   bloccanti sul gate npm audit di produzione).
 * - Mapping: Naam → title; Locatie (straat) → address; GPS Latitude /
 *   GPS Longtitude → coordinates.
 * - external_id = "utrecht-camera:<Naam>|:<lon>,<lat>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { cleanText } from "./lib.mjs";

export const slug = "paesi-bassi-utrecht-cameraregister-2026";

const XLSX_URL =
  "https://open.utrecht.nl/sites/default/files/open-data/cameraregister-utrecht-20251028.xlsx";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/paesi-bassi-utrecht-cameraregister-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetch(XLSX_URL, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0 (+https://open-surveillancedb.org)" } });
  if (!res.ok) throw new Error(`Utrecht XLSX fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const hasher = createHash("sha256");
  hasher.update(buf);
  return { buf, checksum: hasher.digest("hex") };
}

/* ------------------------------------------------------------------ */
/* Mini XLSX reader (fflate + regex XML). Handles shared strings,      */
/* inline strings and numeric cells. Column letters → index.           */
/* ------------------------------------------------------------------ */

const COL_INDEX = (letters) =>
  [...letters].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

/** Unzip an .xlsx buffer and return sheet rows as arrays of cell values. */
export function readXlsxRows(buf) {
  const files = unzipSync(new Uint8Array(buf));
  const text = (name) => {
    const f = files[name];
    return f ? new TextDecoder().decode(f) : null;
  };

  // shared strings: <sst><si><t>..</t></si>...</sst>
  const shared = [];
  const sst = text("xl/sharedStrings.xml");
  if (sst) {
    for (const si of sst.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      const t = si.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      shared.push(t ? decodeXml(t[1]) : "");
    }
  }

  // sheet: <row r="N">...<c r="A1" t="s"><v>0</v></c>...</row>
  const sheet = text("xl/worksheets/sheet1.xml") ?? text("xl/worksheets/sheet.xml");
  if (!sheet) return [];

  const rows = [];
  for (const rowXml of sheet.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const cells = [];
    for (const c of rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>|<c\b[^>]*\/>/g) ?? []) {
      const ref = /<c\b[^>]*r="([A-Z]+)\d+"/.exec(c)?.[1];
      if (!ref) continue;
      const t = /<c\b[^>]*t="([^"]+)"/.exec(c)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(c)?.[1];
      let value;
      if (t === "s" && v != null) value = shared[Number(v)] ?? "";
      else if (t === "inlineStr") value = decodeXml(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(c)?.[1] ?? "");
      else value = v != null ? decodeXml(v) : "";
      cells[COL_INDEX(ref)] = value;
    }
    rows.push(cells);
  }
  return rows;
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/* ------------------------------------------------------------------ */

/** Parse the XLSX into canonical staged rows. */
export function parsePayload({ buf } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!buf) return { staged, skipped, checksum: null };

  let rows;
  try {
    rows = readXlsxRows(buf);
  } catch (e) {
    skipped.total += 1;
    skipped.reasons[`xlsx parse error: ${e.message.slice(0, 80)}`] = 1;
    return { staged, skipped, checksum: null };
  }
  if (rows.length < 2) return { staged, skipped, checksum: null };

  const header = rows[0].map((h, i) => ({ h: String(h ?? "").toLowerCase(), i }));
  const col = (name) => header.find((c) => c.h.includes(name))?.i ?? -1;
  const iNaam = col("naam");
  const iStraat = col("straat");
  const iLat = col("latitude");
  const iLon = col("longtitude") >= 0 ? col("longtitude") : col("longitude");

  for (const r of rows.slice(1)) {
    const get = (i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
    const lat = Number.parseFloat(get(iLat).replace(",", "."));
    const lon = Number.parseFloat(get(iLon).replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const naam = cleanText(get(iNaam), 90) ?? "Camera (Utrecht)";
    const straat = cleanText(get(iStraat), 80);

    staged.push({
      title: naam,
      kind: "Other / unknown",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: straat || null,
      notes: null,
      description: null,
      external_id: `utrecht-camera:${(naam === "Camera (Utrecht)" ? `${lon.toFixed(5)},${lat.toFixed(5)}` : naam).replace(/\s+/g, "_")}`,
    });
  }

  return { staged, skipped, checksum: null };
}
