/**
 * Adapter USA — Rochester Cameras (RPD open data) (CEO 2026-08-08, scan
 * catalog.csv fonti ufficiali).
 *
 * Source: City of Rochester / Rochester Police Department open data
 * (data-rpdny.opendata.arcgis.com). 177 telecamere (programmi BlueLight
 * e RedLight). Live.
 * Licence: ODbL 1.0 + DbCL (Open Database License, dichiarata sul portale).
 *
 * - Fetch: ArcGIS FeatureServer query con returnCountOnly + paging
 *   (resultOffset, 200/riga).
 * - Mapping: Address → title; Type/Program → notes; POINT_X/POINT_Y sono
 *   già WGS84 (verificato: 704 Hudson Ave → -77.5986, 43.1778).
 * - external_id = "rochester:<OBJECTID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "usa-rochester-cameras-2026";

const FS = "https://services7.arcgis.com/wMvCpnbQEKXZsPSQ/arcgis/rest/services/Rochester_Cameras/FeatureServer/0";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-rochester-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const all = [];
  let offset = 0;
  const PAGE = 200;
  for (;;) {
    const url = `${FS}/query?where=1%3D1&outFields=*&resultOffset=${offset}&resultRecordCount=${PAGE}&f=json`;
    const res = await fetchWithRetry(url);
    const data = await res.json();
    const feats = data?.features ?? [];
    if (!feats.length) break;
    all.push(...feats);
    if (feats.length < PAGE) break;
    offset += PAGE;
  }
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(all));
  return { data: all, checksum: hasher.digest("hex") };
}

/** Parse ArcGIS features into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!Array.isArray(data)) return { staged, skipped, checksum: null };

  for (const f of data) {
    const a = f.attributes ?? {};
    const lat = Number.parseFloat(a.POINT_Y);
    const lon = Number.parseFloat(a.POINT_X);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }

    const address = cleanText(String(a.Address ?? ""), 180) || null;
    const program = String(a.Program ?? "");
    const camType = String(a.Type ?? "");

    const bits = [];
    if (program) bits.push(`Programma: ${program}`);
    if (camType) bits.push(`Tipo: ${camType}`);
    if (a.Notes) bits.push(cleanText(String(a.Notes), 60));

    staged.push({
      title: cleanText(address ?? `Rochester cam ${a.OBJECTID ?? ""}`, 90),
      kind: "Other / unknown",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address,
      notes: bits.length ? bits.join(" · ").slice(0, 200) : null,
      description: null,
      external_id: `rochester:${a.OBJECTID ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
