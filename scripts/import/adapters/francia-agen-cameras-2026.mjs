/**
 * Adapter Ville d'Agen — "Caméra de vidéo protection" (CEO 2026-08-08,
 * scan FR fonti ufficiali).
 *
 * Source: data.gouv.fr (Ville d'Agen), CSV 2025-11. ~130 videocamere
 * pubbliche comunali con coordinate dirette.
 * Licence: ODbL 1.0 (dichiarata sul portale) — già nel gate.
 *
 * - Fetch: CSV statico da static.data.gouv.fr.
 * - Mapping: Nom → title; Latitude/Longitude → coordinates; Lien → notes.
 * - external_id = "agen-camera:<nom>|:<lon>,<lat>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText } from "./lib.mjs";

export const slug = "francia-agen-cameras-2026";

const CSV_URL =
  "https://static.data.gouv.fr/resources/camera-de-video-protection/20251103-161529/agen-cameras-videoprotection-2025-11.csv";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/francia-agen-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetch(CSV_URL, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0 (+https://open-surveillancedb.org)" } });
  if (!res.ok) throw new Error(`Agen CSV fetch failed: ${res.status}`);
  const text = await res.text();
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse the CSV (header Nom,Lien,Latitude,Longitude — NOTE: coordinate
 * columns are actually lon,lat in the file despite the header) into rows. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  // header: Nom,Lien,Latitude,Longitude — file actually stores lon,lat
  const header = lines[0].split(",").map((h) => h.trim());
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    // split only on commas not inside quotes
    const cols = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
      else cur += ch;
    }
    cols.push(cur);
    const row = {};
    header.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });

    const lon = Number.parseFloat(row.Latitude ?? row.Longitude ?? "");
    const lat = Number.parseFloat(row.Longitude ?? row.Latitude ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const title = cleanText(row.Nom, 90) ?? "Caméra de vidéo protection (Agen)";
    let notes = null;
    if (row.Lien) notes = `Fonte: ${row.Lien}`.slice(0, 200);

    staged.push({
      title,
      kind: "Fixed camera",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes,
      description: null,
      external_id: `agen-camera:${(cleanText(row.Nom, 60) ?? `${lon.toFixed(5)},${lat.toFixed(5)}`).replace(/\s+/g, "_")}`,
    });
  }

  return { staged, skipped, checksum: null };
}
