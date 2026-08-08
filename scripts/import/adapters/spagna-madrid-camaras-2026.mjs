/**
 * Adapter Madrid — "Cámaras de videovigilancia vía pública" (CEO
 * 2026-08-08, scan ES fonti ufficiali).
 *
 * Sources: Ayuntamiento de Madrid, portal de datos abiertos (CKAN,
 * licenza cc-by = CC BY 4.0, dichiarata sul portale). Due dataset
 * georeferenziati con telecamere di videosorveglianza in via pubblica:
 *   1) 300229-0 ZBEDEP Distrito Centro — CSV con longitud;latitud (115)
 *   2) 300654-0 Madrid Zona de Bajas Emisiones — CSV con utm_x/utm_y
 *      (ETRS89 UTM30N, ~463 righe; conversione UTM→WGS84 nel parse).
 * Licence: CC BY 4.0 (cc-by) — già nel gate.
 *
 * - Fetch: entrambi i CSV via API CKAN di datos.madrid.es (package_show).
 * - Mapping: calle/barrio/distrito → title/address; longitud;latitud o
 *   utm_x/utm_y (conversione) → coordinates; tipo_elemento → notes.
 * - external_id = "madrid-camara:<id_camara o id>|:<lon>,<lat>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText } from "./lib.mjs";

export const slug = "spagna-madrid-camaras-2026";

const CKAN_URLS = [
  "https://datos.madrid.es/api/3/action/package_search?q=300229&rows=1",
  "https://datos.madrid.es/api/3/action/package_search?q=300654&rows=1",
];

/** ETRS89 UTM zone 30N → WGS84 (standard transverse Mercator, GRS80 ≈ WGS84
 * for our precision; error < 1 m at these latitudes). */
export function utm30ToWgs84(easting, northing) {
  const a = 6378137.0;
  const f = 1 / 298.257222101; // GRS80
  const e2 = f * (2 - f);
  const k0 = 0.9996;
  const x = easting - 500000;
  const y = northing;
  const M = y / k0;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const J1 = (3 * e1) / 2 - (27 * e1 * e1 * e1) / 32;
  const J2 = (21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32;
  const J3 = (151 * e1 * e1 * e1) / 96;
  const J4 = (1097 * e1 * e1 * e1 * e1) / 512;
  const fp = mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu);
  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);
  const N = a / Math.sqrt(1 - e2 * sinFp * sinFp);
  const T = tanFp * tanFp;
  const C = (e2 / (1 - e2)) * cosFp * cosFp;
  const R = (a * (1 - e2)) / Math.pow(1 - e2 * sinFp * sinFp, 1.5);
  const D = x / (N * k0);
  const lat = fp - ((N * tanFp) / R) * ((D * D) / 2 - ((5 + 3 * T + 10 * C - 4 * C * C - 9 * e2) * D * D * D * D) / 24 + ((61 + 90 * T + 298 * C + 45 * T * T - 252 * e2 - 3 * C * C) * D * D * D * D * D * D) / 720);
  const lon0 = (-3 * Math.PI) / 180; // UTM zone 30N central meridian
  const lon = lon0 + (D - ((1 + 2 * T + C) * D * D * D) / 6 + ((5 - 2 * C + 28 * T - 3 * C * C + 8 * e2 + 24 * T * T) * D * D * D * D * D) / 120) / cosFp;
  return { lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI };
}

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/spagna-madrid-camaras-2026.json", import.meta.url), "utf8"));
}

async function fetchCsv(datasetQuery) {
  const res = await fetch(datasetQuery, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0 (+https://open-surveillancedb.org)" } });
  if (!res.ok) throw new Error(`Madrid CKAN search failed: ${res.status}`);
  const pkg = (await res.json()).result?.results?.[0];
  if (!pkg) throw new Error("Madrid CKAN: dataset non trovato");
  const csvRes = (pkg.resources ?? []).find((r) => r.format === "CSV");
  if (!csvRes) throw new Error(`Madrid CKAN: nessuna risorsa CSV per ${pkg.title}`);
  const csv = await fetch(csvRes.url, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0 (+https://open-surveillancedb.org)" } });
  if (!csv.ok) throw new Error(`Madrid CSV fetch failed: ${csv.status}`);
  return { text: await csv.text(), dataset: pkg.title };
}

export async function fetchPayload() {
  const hasher = createHash("sha256");
  const parts = [];
  for (const url of CKAN_URLS) {
    const { text, dataset } = await fetchCsv(url);
    hasher.update(dataset).update(text);
    parts.push({ dataset, text });
  }
  return { parts, checksum: hasher.digest("hex") };
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].split(";").map((h) => h.trim());
  const rows = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(";").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row = {};
    header.forEach((h, i) => { row[h] = cols[i] ?? ""; });
    rows.push(row);
  }
  return rows;
}

/** Parse both CSVs into canonical staged rows. */
export function parsePayload({ parts } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  for (const { dataset, text } of parts ?? []) {
    for (const row of parseCsv(text)) {
      let lat, lon;
      // column sets: 300229 → longitud;latitud (WGS84) — 300654 → utm_x;utm_y
      if (Number.isFinite(Number.parseFloat(row.utm_x))) {
        const conv = utm30ToWgs84(Number.parseFloat(row.utm_x), Number.parseFloat(row.utm_y));
        lat = conv.lat;
        lon = conv.lon;
      } else {
        lat = Number.parseFloat(row.latitud ?? "");
        lon = Number.parseFloat(row.longitud ?? "");
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        recordSkip("non-finite/out-of-range coordinates");
        continue;
      }

      const street = cleanText(row.calle ?? row.lugar_infr, 80);
      const barrio = cleanText(row.barrio, 40);
      const distrito = cleanText(row.distrito, 40);
      const title = [barrio, street].filter(Boolean).join(" — ").slice(0, 90) || "Cámara de videovigilancia (Madrid)";
      const address = [street, barrio, distrito].filter(Boolean).join(", ").slice(0, 160) || null;

      let notes = null;
      const bits = [];
      if (row.tipo_elemento) bits.push(`Tipo: ${cleanText(row.tipo_elemento, 60)}`);
      if (row.codigo) bits.push(`Código: ${cleanText(row.codigo, 40)}`);
      if (row.fecha_alta) bits.push(`Alta: ${cleanText(row.fecha_alta, 20)}`);
      if (bits.length) notes = bits.join(" · ").slice(0, 200);

      const id = row.id_camara || row.id || null;
      staged.push({
        title,
        kind: "Fixed camera",
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lon.toFixed(6)),
        direction: null,
        address,
        notes,
        description: null,
        external_id: `madrid-camara:${id ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
      });
    }
  }

  return { staged, skipped, checksum: null };
}
