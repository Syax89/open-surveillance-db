/**
 * Adapter Slovacchia — Mesto Prešov camera-system geodata (KML).
 * Scan coda giurisdizioni (cron 2026-08-15, pass v1).
 *
 * Source: egov.presov.sk GeoDataKatalog, distribuzione KML ufficiale del
 * catalogo open data nazionale slovacco (data.gov.sk). 37 telecamere del
 * sistema di videosorveglianza municipale, coordinate WGS84.
 * Licence: CC BY 4.0 (assegnata dal catalogo a tutte le distribuzioni).
 * Statico (2017), fixed infrastructure.
 *
 * - Fetch: KML statico (~41KB).
 * - Mapping: C_ZAR (ExtendedData/description) → external_id;
 *   N_C_AREAL → title; ZAR_UMIEST → address; MON_ZONA → notes.
 * - external_id = "presov:<C_ZAR>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "slovacchia-presov-kamery-2026";

const KML_URL = "https://egov.presov.sk/GeoDataKatalog/monitor_zariadenia.kml";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/slovacchia-presov-kamery-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(KML_URL);
  const text = await res.text();
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse the KML placemarks into canonical staged rows. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  const placemarks = text.match(/<Placemark[^>]*>[\s\S]*?<\/Placemark>/g) ?? [];
  for (const pm of placemarks) {
    const name = /<name>([^<]+)<\/name>/.exec(pm)?.[1];
    const coords = /<coordinates>([^<]+)<\/coordinates>/.exec(pm)?.[1];
    const desc = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/.exec(pm)?.[1] ?? "";
    const field = (key) => {
      const m = desc.match(new RegExp(`${key}:\\s*([^\\n<]+)`));
      return m ? m[1].trim() : null;
    };

    const [lonRaw, latRaw] = (coords ?? "").split(",");
    const lon = Number.parseFloat(lonRaw);
    const lat = Number.parseFloat(latRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const cZar = field("C_ZAR");
    const area = field("N_C_AREAL");
    const place = field("ZAR_UMIEST");
    const zone = field("MON_ZONA");

    const title = cleanText(cZar ? `Prešov camera ${cZar}` : `Prešov camera ${name ?? ""}`.trim(), 90);

    staged.push({
      title,
      kind: "Other / unknown",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: cleanText(place ?? "", 80) || null,
      notes: cleanText(zone ?? area ?? "Mestská polícia Prešov — kamerový systém", 120),
      description: null,
      external_id: `presov:${cZar ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
