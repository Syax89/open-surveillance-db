/**
 * Adapter Regno Unito — TfL JamCams CCTV (CEO 2026-08-08, scan
 * catalog.csv fonti ufficiali).
 *
 * Source: Transport for London, JamCams API (api.tfl.gov.uk). 882
 * telecamere CCTV stradali a Londra. Live.
 * Licence: OGL 2.0 (Open Government Licence v2.0, attribution-only —
 * dichiarata sul portale TfL, classe compatibile con la matrice).
 *
 * - Fetch: GET /Place/Type/JamCam — JSON array, no key, no pagination
 *   (882 elementi in una risposta).
 * - Mapping: commonName → title; lat/lon diretti; additionalProperties
 *   view → direction; imageUrl/videoUrl → notes.
 * - external_id = "tfl-jamcam:<id>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry, parseDirection } from "./lib.mjs";

export const slug = "regno-unito-tfl-jamcams-2026";

const API_URL = "https://api.tfl.gov.uk/Place/Type/JamCam";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/regno-unito-tfl-jamcams-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(API_URL);
  const data = await res.json();
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(data));
  return { data, checksum: hasher.digest("hex") };
}

/** Parse the TfL JSON array into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!Array.isArray(data)) return { staged, skipped, checksum: null };

  for (const cam of data) {
    const lat = Number.parseFloat(cam.lat);
    const lon = Number.parseFloat(cam.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const props = new Map((cam.additionalProperties ?? []).map((p) => [p.key, p.value]));
    const view = String(props.get("view") ?? "");
    const img = String(props.get("imageUrl") ?? "");

    const title = cleanText(cam.commonName ?? "JamCam", 90);
    const bits = [];
    if (img) bits.push(`Immagine: ${img}`);
    if (bits.length) {
      // la view va in direction
    }

    staged.push({
      title,
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: parseDirection(view),
      address: null,
      notes: img ? `Immagine: ${img}`.slice(0, 200) : null,
      description: null,
      external_id: `tfl-jamcam:${cam.id ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
