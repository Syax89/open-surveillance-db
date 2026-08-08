/**
 * Adapter Ministère de l'Intérieur — "Vidéoprotection – Implantation des
 * caméras" (PVPP Parigi, CEO 2026-08-08, scan FR fonti ufficiali).
 *
 * Source: data.gouv.fr (dataset ministeriale, export KML 2018-11-15).
 * 1339 camere della Prefettura di Polizia di Parigi con coordinate.
 * Licence: fr-lo (Licence Ouverte) — attribution-only, classe CC-BY.
 *
 * - Fetch: KML statico da static.data.gouv.fr (2018, stabile).
 * - Mapping: <Placemark><name> (vuoto) → titolo generico; <coordinates>
 *   "lon,lat,alt" → coordinate; <description> (se presente) → notes.
 * - external_id = "pvpp-camera:<lon>,<lat>" (la chiave stabile è la
 *   posizione: il KML non espone id).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText } from "./lib.mjs";

export const slug = "francia-pvpp-cameras-2026";

const KML_URL =
  "https://static.data.gouv.fr/resources/videoprotection-implantation-des-cameras-551635/20181116-165730/2018-11-15-export-cameras-pvpp.kml";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/francia-pvpp-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetch(KML_URL, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0 (+https://open-surveillancedb.org)" } });
  if (!res.ok) throw new Error(`PVPP KML fetch failed: ${res.status}`);
  const text = await res.text();
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse the KML into canonical staged rows. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  // KML 2.2: <Placemark> blocks, each with optional <name>/<description>
  // and a <Point><coordinates>lon,lat,alt</coordinates></Point>.
  const placemarks = text.match(/<Placemark>[\s\S]*?<\/Placemark>/g) ?? [];
  for (const pm of placemarks) {
    const name = /<name>([^<]*)<\/name>/.exec(pm)?.[1];
    const desc = /<description>([^<]*)<\/description>/.exec(pm)?.[1];
    const coordsRaw = /<coordinates>([^<]*)<\/coordinates>/.exec(pm)?.[1];
    if (!coordsRaw) {
      recordSkip("missing coordinates");
      continue;
    }
    const parts = coordsRaw.trim().split(",");
    const lon = Number.parseFloat(parts[0]);
    const lat = Number.parseFloat(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const title = cleanText(name, 90) ?? "Caméra de vidéoprotection (PVPP)";
    let notes = null;
    if (desc) notes = cleanText(desc, 200);

    staged.push({
      title,
      kind: "Fixed camera",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes,
      description: null,
      external_id: `pvpp-camera:${lon.toFixed(5)},${lat.toFixed(5)}`,
    });
  }

  return { staged, skipped, checksum: null };
}
