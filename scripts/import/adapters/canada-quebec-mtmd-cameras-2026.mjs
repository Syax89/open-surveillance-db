/**
 * Adapter Canada Québec — MTMD infos_cameras WFS GeoJSON (CEO 2026-08-08,
 * scan catalog.csv fonti ufficiali).
 *
 * Source: Gouvernement du Québec, Ministère des Transports — WFS
 * ms:infos_cameras. 675 telecamere autostradali Québec. Live (flusso).
 * Licence: CC BY 4.0 (dichiarata sul portale données Québec).
 *
 * - Fetch: WFS GetFeature con outputformat=geojson (paginazione startIndex).
 * - Mapping: DescriptionLocalisationFr → title; NumeroRoute + NomRegion →
 *   notes; URL_FLUX_DONNEE → description. Coordinate Web Mercator
 *   (EPSG:3857) → webMercatorToWgs84 (verificato: -8087109, 5672110 →
 *   ~46.8, -72.6 — Bromont QC).
 * - external_id = "mtmd:<IDEcamera>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry, webMercatorToWgs84 } from "./lib.mjs";

export const slug = "canada-quebec-mtmd-cameras-2026";

const WFS_URL = "https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:infos_cameras&outputformat=geojson";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/canada-quebec-mtmd-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const all = [];
  let start = 0;
  const PAGE = 500;
  for (;;) {
    const url = `${WFS_URL}&startIndex=${start}&count=${PAGE}`;
    const res = await fetchWithRetry(url);
    const data = await res.json();
    const feats = data?.features ?? [];
    if (!feats.length) break;
    all.push(...feats);
    if (feats.length < PAGE) break;
    start += PAGE;
  }
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(all));
  return { data: all, checksum: hasher.digest("hex") };
}

/** Parse WFS GeoJSON features (Web Mercator) into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!Array.isArray(data)) return { staged, skipped, checksum: null };

  for (const f of data) {
    const p = f.properties ?? {};
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      recordSkip("no point geometry");
      continue;
    }
    const [lat, lon] = webMercatorToWgs84(Number(coords[0]), Number(coords[1]));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("coordinate conversion out of range");
      continue;
    }

    const locFr = cleanText(p.DescriptionLocalisationFr ?? p.DescriptionLocalisationEn ?? "", 90);
    const route = cleanText(p.NumeroRoute ?? "", 20);
    const region = cleanText(p.NomRegionDiffusion ?? "", 40);
    const flux = cleanText(p.URL_FLUX_DONNEE ?? "", 180);

    const bits = [];
    if (route) bits.push(`Route ${route}`);
    if (region) bits.push(`Région: ${region}`);
    const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

    staged.push({
      title: locFr || `Caméra ${p.NumeroCamera ?? p.IDEcamera ?? ""}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: null,
      notes,
      description: flux ? `Flusso: ${flux}` : null,
      external_id: `mtmd:${p.IDEcamera ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
