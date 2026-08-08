/**
 * Adapter USA Denver CO — HALO Cameras (DPD) (CEO 2026-08-08, scan
 * catalog.csv + verifica diretta).
 *
 * Source: Denver Police Department via Denver Open Data Hub. 259
 * telecamere HALO. Live.
 * Licence: Denver Hub open license policy — IMPORT SOLO SE la policy
 * confermata è permissiva (CC0/CC-BY); descriptor segnato in attesa del
 * verdetto legale subagent (fail-closed: se dubbio → non importare).
 *
 * - Fetch: FeatureServer query paginata, Web Mercator → webMercatorToWgs84.
 * - Mapping: LOCATION → title.
 * - external_id = "denver-halo:<OBJECTID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchArcGisFeatures, webMercatorToWgs84 } from "./lib.mjs";

export const slug = "usa-denver-halo-cameras-2026";

const FS = "https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/Halo_Cameras/FeatureServer/0";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/usa-denver-halo-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const data = await fetchArcGisFeatures(FS);
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(data));
  return { data, checksum: hasher.digest("hex") };
}

/** Parse ArcGIS features (Web Mercator) into canonical staged rows. */
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
    const g = f.geometry ?? {};
    if (g.x == null || g.y == null) {
      recordSkip("no point geometry");
      continue;
    }
    const [lat, lon] = webMercatorToWgs84(Number(g.x), Number(g.y));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("coordinate conversion out of range/zero");
      continue;
    }

    const loc = cleanText(String(a.LOCATION ?? ""), 90);

    staged.push({
      title: loc || `HALO cam ${a.OBJECTID ?? ""}`.trim(),
      kind: "Other / unknown",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: loc || null,
      notes: "Programma HALO (DPD)",
      description: null,
      external_id: `denver-halo:${a.OBJECTID ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
