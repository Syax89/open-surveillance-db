/**
 * Adapter Norvegia — NVDB vegobjekter type 163 "Kamera" (CEO 2026-08-08,
 * scan catalog.csv fonti ufficiali).
 *
 * Source: Statens vegvesen, NVDB API v3 (Nasjonal vegdatabank). 13.444
 * telecamere su strade statali norvegesi. Live.
 * Licence: NLOD 2.0 (Norwegian Licence for Open Government Data,
 * attribution-only, classe compatibile con la matrice — aggiunta al gate).
 *
 * - Fetch: GET /vegobjekter/163?inkluder=egenskaper,geometri — paginazione
 *   a token via metadata.neste.href (1000/riga, ~14 pagine).
 * - Geometry: WKT "POINT Z(east north h)", srid 5973 (UTM33N/EPSG:5973,
 *   GRS80) → formula UTM→WGS84 (meridiano centrale 15°E, k0=0.9996);
 *   anchor verificato: Gardermoen 60.009, 11.056 (Oslo-Gardermoen 2026).
 * - Mapping: "Type kamera" → kind (Fast videokamera → Fixed dome? no:
 *   fast=Fixed, bevegelig=PTZ); "Utgår_*" (fuori servizio) skippati;
 *   fylke/kommune dalla lokasjon → notes.
 * - external_id = "nvdb:<id>/<versjon>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry, mapKind } from "./lib.mjs";

export const slug = "norvegia-nvdb-kamera-2026";

const BASE = "https://nvdbapiles-v3.atlas.vegvesen.no/vegobjekter/163";

const KIND_MAP = {
  fast_videokamera: "Fixed dome",
  bevegelig_videokamera_ptz_dome: "PTZ",
  fotokamera: "Traffic / licence plate reader",
  ip_kamera: "Other / unknown",
};

/** UTM zone 33N (EPSG:5973, GRS80) → WGS84. Meridiano centrale 15°E. */
export function utm33ToWgs84(easting, northing) {
  const a = 6378137.0;
  const f = 1 / 298.257222101; // GRS80
  const e2 = f * (2 - f);
  const k0 = 0.9996;
  const E = 500000.0;
  const cm = 15; // 33*6-183
  const x = easting - E;
  const y = northing;
  const M = y / k0;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = (e2 / (1 - e2)) * Math.cos(phi1) ** 2;
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = x / (N1 * k0);
  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (D ** 2 / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * e2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * e2 - 3 * C1 ** 2) * D ** 6) / 720);
  const lon =
    (cm * Math.PI) / 180 +
    (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * e2 + 24 * T1 ** 2) * D ** 5) / 120) /
      Math.cos(phi1);
  return [Number(toDeg(lat).toFixed(6)), Number(toDeg(lon).toFixed(6))];
}

const toDeg = (rad) => (rad * 180) / Math.PI;

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/norvegia-nvdb-kamera-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const all = [];
  let url = `${BASE}?inkluder=egenskaper%2Cgeometri`;
  let pages = 0;
  // NVDB Les API richiede un User-Agent "browser-valid" (400 4017 altrimenti).
  const headers = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) OpenSurveillanceDB-import/1.0" };
  while (url && pages < 30) {
    const res = await fetchWithRetry(url, { headers });
    const data = await res.json();
    if (!data?.objekter?.length) break;
    all.push(...data.objekter);
    const next = data.metadata?.neste?.href;
    if (!next) break;
    url = next;
    pages++;
    await new Promise((r) => setTimeout(r, 300)); // etiquette: ~3 req/s
  }
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(all));
  return { data: all, checksum: hasher.digest("hex") };
}

/** Parse staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!Array.isArray(data)) return { staged, skipped, checksum: null };

  for (const obj of data) {
    const egenskaper = new Map((obj.egenskaper ?? []).map((e) => [e.navn, e.verdi ?? e.strukturert_verdi]));
    const type = String(egenskaper.get("Type kamera") ?? "");
    if (type.startsWith("Utgår_") || type === "None" || type === "null" || type === "") {
      recordSkip(`type=${type || "empty"}`);
      continue;
    }

    const wkt = obj.geometri?.wkt;
    const m = /POINT\s*Z?\(([-\d.]+)\s+([-\d.]+)/.exec(wkt ?? "");
    if (!m) {
      recordSkip("no point geometry");
      continue;
    }
    const [lat, lon] = utm33ToWgs84(Number.parseFloat(m[1]), Number.parseFloat(m[2]));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("coordinate conversion out of range");
      continue;
    }

    const kind = mapKind(type, KIND_MAP).kind;
    const fylke = (obj.lokasjon?.fylker ?? []).join(", ");
    const kommune = (obj.lokasjon?.kommuner ?? []).join(", ");
    const bits = [];
    if (fylke) bits.push(`Fylke: ${fylke}`);
    if (kommune) bits.push(`Kommune: ${kommune}`);
    const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

    staged.push({
      title: cleanText(`Kamera ${type} (NVDB)`, 90),
      kind,
      latitude: lat,
      longitude: lon,
      direction: null,
      address: null,
      notes,
      description: null,
      external_id: `nvdb:${obj.id}/${obj.href?.split("/").pop() ?? ""}`,
    });
  }

  return { staged, skipped, checksum: null };
}
