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
 * - Mapping: Naam → title; Locatie (straat) → address; GPS Latitude /
 *   GPS Longtitude → coordinates; Tijdigheid camera → notes.
 * - external_id = "utrecht-camera:<Naam>|:<lon>,<lat>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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

/** Parse the XLSX (exceljs) into canonical staged rows. */
export async function parsePayload({ buf } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!buf) return { staged, skipped, checksum: null };

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return { staged, skipped, checksum: null };

  // header row: Naam | Locatie (straat) | Locatie (GPS Latitude) |
  // Locatie (GPS Longtitude) | Tijdigheid camera | ...
  const rows = [];
  ws.eachRow((r, n) => { rows.push(r.values); });
  if (rows.length < 2) return { staged, skipped, checksum: null };

  const header = (rows[0] ?? [])
    .map((h, i) => (h != null ? { h: String(h), i } : null))
    .filter(Boolean);
  const col = (name) => header.find((c) => c.h.toLowerCase().includes(name))?.i ?? -1;
  const iNaam = col("naam");
  const iStraat = col("straat");
  const iLat = col("latitude");
  const iLon = col("longtitude") >= 0 ? col("longtitude") : col("longitude");

  for (const r of rows.slice(1)) {
    const get = (i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
    const lat = Number.parseFloat(get(iLat));
    const lon = Number.parseFloat(get(iLon));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const naam = cleanText(get(iNaam), 90) ?? "Camera (Utrecht)";
    const straat = cleanText(get(iStraat), 80);
    const title = naam;
    const address = straat || null;

    staged.push({
      title,
      kind: "Fixed camera",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address,
      notes: null,
      description: null,
      external_id: `utrecht-camera:${(naam === "Camera (Utrecht)" ? `${lon.toFixed(5)},${lat.toFixed(5)}` : naam).replace(/\s+/g, "_")}`,
    });
  }

  return { staged, skipped, checksum: null };
}
