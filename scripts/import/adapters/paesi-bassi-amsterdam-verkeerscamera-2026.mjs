/**
 * Adapter Amsterdam — "Verkeersinformatiesystemen (VIS)" (CEO 2026-08-08,
 * scan NL fonti ufficiali).
 *
 * Source: Gemeente Amsterdam, Datapunt API (api.data.amsterdam.nl,
 * dataset verkeersinformatiesystemen). 203 "Verkeerscamera" su ~600
 * oggetti (DRIP pannelli informativi + telecamere) con geometria RD.
 * Licence: CC BY 4.0 (standard Datapunt, attribuzione richiesta) — già
 * nel gate.
 *
 * - Fetch: API HAL paginata (?page=N, size 20), filtro objectSoort
 *   contenente "camera".
 * - Mapping: objectnummer → title; standplaats → address; geometrie
 *   (RD coordinates, EPSG:28992) → WGS84 via formula Rijksdriehoek.
 * - external_id = "ams-vis-camera:<objectnummer>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText } from "./lib.mjs";

export const slug = "paesi-bassi-amsterdam-verkeerscamera-2026";

const BASE_URL =
  "https://api.data.amsterdam.nl/v1/verkeersinformatiesystemen/verkeersinformatiesystemen/";

/** Rijksdriehoek (EPSG:28992) → WGS84 (formula ufficiale Rijkswaterstaat:
 * i polinomi producono arcosecondi, si dividono per 3600; precisione
 * ~centimetri). */
export function rdToWgs84(x, y) {
  const dX = (x - 155000) / 100000;
  const dY = (y - 463000) / 100000;
  const sumN =
    (3235.65389 * dY +
      -32.58297 * dX * dX +
      -0.2475 * dY * dY +
      -0.84978 * dX * dX * dY +
      -0.0655 * dY * dY * dY +
      -0.01709 * dX * dX * dY * dY +
      -0.00738 * dX +
      0.0053 * dX * dX * dX * dX +
      -0.00039 * dX * dX * dY * dY * dY +
      0.00033 * dX * dX * dX * dX * dY +
      -0.00012 * dX * dY) /
    3600;
  const sumE =
    (5260.52916 * dX +
      105.94684 * dX * dY +
      2.45656 * dX * dY * dY +
      -0.81885 * dX * dX * dX +
      0.05594 * dX * dY * dY * dY +
      -0.05607 * dX * dX * dX * dY +
      0.01199 * dY +
      -0.00256 * dX * dX * dX * dY * dY +
      0.00128 * dX * dY * dY * dY * dY +
      0.00022 * dY * dY +
      -0.00022 * dX * dX +
      0.00026 * dX * dX * dX * dX * dX) /
    3600;
  return { lat: 52.15517 + sumN, lon: 5.387206 + sumE };
}

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/paesi-bassi-amsterdam-verkeerscamera-2026.json", import.meta.url), "utf8"));
}

/** Fetch all VIS items paged via HAL _links.next, keep only cameras. */
export async function fetchPayload() {
  const items = [];
  const hasher = createHash("sha256");
  let url = BASE_URL;
  let pages = 0;
  while (url && pages < 50) {
    const res = await fetch(url, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0 (+https://open-surveillancedb.org)" } });
    if (!res.ok) throw new Error(`Amsterdam VIS fetch failed: ${res.status}`);
    const body = await res.json();
    const batch = body._embedded?.verkeersinformatiesystemen ?? [];
    for (const it of batch) {
      if (/camera/i.test(it.objectSoort ?? "")) {
        items.push(it);
        hasher.update(JSON.stringify(it));
      }
    }
    url = body._links?.next?.href ?? null;
    if (!batch.length) break;
    pages += 1;
  }
  return { items, checksum: hasher.digest("hex") };
}

/** Parse the VIS items into canonical staged rows (RD → WGS84). */
export function parsePayload({ items } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  for (const it of items ?? []) {
    // defence in depth: the fetch filters cameras, but a payload that leaks
    // non-camera objects must not reach the DB.
    if (!/camera/i.test(it.objectSoort ?? "")) {
      recordSkip("non-camera objectSoort");
      continue;
    }
    const geom = it.geometrie;
    if (!geom || geom.type !== "Point" || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
      recordSkip("non-Point geometry");
      continue;
    }
    const [x, y] = geom.coordinates;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      recordSkip("non-finite RD coordinates");
      continue;
    }
    const { lat, lon } = rdToWgs84(x, y);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("out-of-range converted coordinates");
      continue;
    }

    const num = cleanText(it.objectnummer, 40);
    const title = num ? `Verkeerscamera ${num}` : "Verkeerscamera (Amsterdam)";
    const address = cleanText(it.standplaats, 90) ?? null;

    let notes = null;
    const bits = [];
    if (it.type) bits.push(`Tipo: ${cleanText(it.type, 60)}`);
    if (it.memo) bits.push(`Nota: ${cleanText(it.memo, 80)}`);
    if (bits.length) notes = bits.join(" · ").slice(0, 200);

    staged.push({
      title,
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address,
      notes,
      description: null,
      external_id: `ams-vis-camera:${it.objectnummer ?? it.id ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
