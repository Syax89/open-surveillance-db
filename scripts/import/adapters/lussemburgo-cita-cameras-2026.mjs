/**
 * Adapter Lussemburgo — CITA caméras autoroutier KML (CEO 2026-08-08,
 * scan catalog.csv fonti ufficiali).
 *
 * Source: CITA Luxembourg, cameras.kml. 71 telecamere autostrade LU. Live.
 * Licence: CC0 (dichiarata sul sito CITA).
 *
 * - Fetch: KML statico (66KB).
 * - Mapping: Placemark name ("A6 - Camera 3") → title; coordinates
 *   lon,lat; description iframe → webcam URL.
 * - external_id = "cita:<placemark id>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "lussemburgo-cita-cameras-2026";

const KML_URL = "https://www.cita.lu/kml/cameras.kml";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/lussemburgo-cita-cameras-2026.json", import.meta.url), "utf8"));
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
    const id = /<Placemark[^>]*\bid="([^"]+)"/.exec(pm)?.[1];
    const name = /<name>([^<]+)<\/name>/.exec(pm)?.[1];
    const coords = /<coordinates>([^<]+)<\/coordinates>/.exec(pm)?.[1];
    const descMatch = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/.exec(pm) ?? /<description>([^<]*)<\/description>/.exec(pm);

    const [lonRaw, latRaw] = (coords ?? "").split(",");
    const lon = Number.parseFloat(lonRaw);
    const lat = Number.parseFloat(latRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const title = cleanText(name ?? `CITA cam ${id ?? ""}`, 90);

    staged.push({
      title,
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes: null,
      description: null,
      external_id: `cita:${id ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
