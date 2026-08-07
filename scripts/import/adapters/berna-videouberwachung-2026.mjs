/**
 * Adapter Kanton Bern — "Videoüberwachung im öffentlichen Raum" (CEO 2026-08-07,
 * state-by-state scan: CH fonti ufficiali).
 *
 * Source: geofiles.be.ch GeoParquet (VIDEO), discovered via opendata.swiss
 * ("Videoüberwachung im öffentlichen Raum", Amt für Geoinformation des
 * Kantons Bern). Licence: "Freie Nutzung. Quellenangabe ist Pflicht"
 * (Nutzungsbestimmung kantonaler Geodaten, 2021) — free use with mandatory
 * attribution, the Swiss OGD standard (≈ CC-BY, compatible per the matrix).
 *
 * - Fetch: the GeoParquet file (ZSTD-compressed), read with hyparquet+fzstd
 *   (pure-JS, no native deps).
 * - Coordinates: CH1903+/LV95 (EPSG:2056) xkoord/ykoord → WGS84 via the
 *   official swisstopo formula (~1 m accuracy, more than enough for the
 *   ~10 m rounding in the pipeline).
 * - Mapping: gebaed_de → title; strname+hausnr+plz+ortsname → address;
 *   zustng_de → notes "Gestione: <ente>" (responsible authority, never PII);
 *   infofeld → description when useful.
 * - external_id = "be-video:<objectid>" (idempotency key).
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parquetReadObjects } from "hyparquet";
import { decompress } from "fzstd";
import { cleanText } from "./lib.mjs";

export const slug = "berna-videouberwachung-2026";

const SOURCE_URL =
  "https://geofiles.be.ch/geoportal/pub/download/VIDEO/video_video.parquet";

/** CH1903+/LV95 (EPSG:2056) → WGS84 — official swisstopo approximation. */
export function lv95ToWgs84(easting, northing) {
  const yp = (easting - 2600000) / 1e6;
  const xp = (northing - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * yp + 0.791484 * yp * xp + 0.1306 * yp * xp ** 2 - 0.0436 * yp ** 3;
  const lat = 16.9023892 + 3.238272 * xp - 0.270978 * yp ** 2 - 0.002528 * xp ** 2 - 0.0447 * yp ** 2 * xp - 0.0140 * xp ** 3;
  return { lat: lat * 100 / 36, lon: lon * 100 / 36 };
}

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/berna-videouberwachung-2026.json", import.meta.url), "utf8"));
}

/** Fetch the GeoParquet file. Returns { bytes, checksum }. */
export async function fetchPayload() {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0 (+https://open-surveillancedb.org)" } });
  if (!res.ok) throw new Error(`Bern GeoParquet fetch failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, checksum: createHash("sha256").update(bytes).digest("hex") };
}

/** Map one GeoParquet row into a canonical staged row (shared with tests). */
export function mapRow(row) {
  const easting = Number(row.xkoord);
  const northing = Number(row.ykoord);
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
    return { skip: "no coordinates" };
  }
  const { lat, lon } = lv95ToWgs84(easting, northing);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { skip: "non-finite coordinates" };
  }

  // Title: building name (DE preferred, FR fallback), then street address.
  let title = cleanText(row.gebaed_de, 90) ?? cleanText(row.gebaed_fr, 90);
  if (!title) {
    const street = cleanText(row.strname, 60);
    if (street) title = `Videoüberwachung, ${street}${row.hausnr ? ` ${row.hausnr}` : ""}`.slice(0, 90);
    else title = "Videoüberwachung";
  }

  // Address: street + number + ZIP + city.
  const street = cleanText(row.strname, 100);
  const number = cleanText(String(row.hausnr ?? ""), 10);
  const city = cleanText(row.ortsname, 60);
  const zip = row.plz ? String(row.plz) : "";
  let address = null;
  if (street) {
    address = `${street}${number ? ` ${number}` : ""}${zip || city ? `, ${zip ? `${zip} ` : ""}${city ?? ""}`.trim() : ""}`.slice(0, 180);
  } else if (city) {
    address = `${zip ? `${zip} ` : ""}${city}`;
  }

  // Notes: responsible authority (zustng_de) — a public entity by nature.
  let notes = null;
  const authority = cleanText(row.zustng_de, 200);
  if (authority) notes = `Gestione: ${authority}`.slice(0, 200);

  return {
    staged: {
      title,
      kind: "Other / unknown",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address,
      notes,
      description: null,
      external_id: `be-video:${row.objectid}`,
    },
  };
}

/** Parse the GeoParquet rows into canonical staged rows. */
export async function parsePayload({ bytes } = {}) {
  if (!bytes) return { staged: [], skipped: { total: 0, reasons: {} }, checksum: null };
  const rows = await parquetReadObjects({
    file: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    compressors: { ZSTD: (input) => decompress(input) },
  });
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  for (const row of rows) {
    const mapped = mapRow(row);
    if (mapped.skip) {
      recordSkip(mapped.skip);
      continue;
    }
    staged.push(mapped.staged);
  }

  return { staged, skipped, checksum: null };
}
