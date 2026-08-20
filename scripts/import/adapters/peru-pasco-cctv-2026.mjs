/**
 * Adapter Perù — Municipalidad Provincial de Pasco (HMPP), lista de cámaras
 * de video vigilancia (datosabiertos.gob.pe). Scan coda giurisdizioni
 * (cron 2026-08-19, pass v2).
 *
 * Source: DKAN nacional peruano, dataset "lista-de-camaras-de-video-
 * vigilancia-hmpp". 45 telecamere municipali (distretto Chaupimarca, Cerro
 * de Pasco), XLSX con NUMERO/DISTRITO/UBICACIÓN/TIPO/LATITUD/LONGITUD.
 * Licence: Open Data Commons Attribution License (ODbL) — pane "Licencia"
 * della pagina dataset (verificata first-hand 2026-08-20). Statico (2023).
 *
 * - Fetch: XLSX (mini-reader fflate, riusato da Utrecht).
 * - Mapping: UBICACIÓN → title; DISTRITO/TIPO → notes; NUMERO →
 *   external_id.
 * - external_id = "peru-pasco:<NUMERO>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";
import { readXlsxRows } from "./paesi-bassi-utrecht-cameraregister-2026.mjs";

export const slug = "peru-pasco-cctv-2026";

const XLSX_URL = "https://www.datosabiertos.gob.pe/sites/default/files/Dataset_Lista_de_Camaras_de_Video_Vigilancia.xlsx";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/peru-pasco-cctv-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(XLSX_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  const hasher = createHash("sha256");
  hasher.update(buf);
  return { buf, checksum: hasher.digest("hex") };
}

/** Parse the XLSX sheet into canonical staged rows. */
export function parsePayload({ buf } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!buf) return { staged, skipped, checksum: null };

  let rows;
  try {
    rows = readXlsxRows(buf);
  } catch (e) {
    skipped.total += 1;
    skipped.reasons[`xlsx parse error: ${e.message.slice(0, 80)}`] = 1;
    return { staged, skipped, checksum: null };
  }
  if (rows.length < 2) return { staged, skipped, checksum: null };

  // header = prima riga non vuota che contiene "latitud"
  const headerIdx = rows.findIndex((r) => r.some((c) => /latitud/i.test(String(c ?? ""))));
  if (headerIdx < 0) return { staged, skipped, checksum: null };
  const header = rows[headerIdx].map((h, i) => ({ h: String(h ?? "").toLowerCase(), i }));
  const col = (name) => header.find((c) => c.h.includes(name))?.i ?? -1;
  const iNumero = col("numero");
  const iDistrito = col("distrito");
  const iUbic = col("ubicaci");
  const iTipo = col("tipo");
  const iLat = col("latitud");
  const iLon = col("longitud");

  for (const r of rows.slice(headerIdx + 1)) {
    const get = (i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
    const lat = Number.parseFloat(get(iLat).replace(",", "."));
    const lon = Number.parseFloat(get(iLon).replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }

    const ubicacion = cleanText(get(iUbic), 90);
    const distrito = cleanText(get(iDistrito), 40);
    const tipo = cleanText(get(iTipo), 30);
    const numero = cleanText(get(iNumero), 30);

    const bits = [];
    if (distrito) bits.push(`Distrito: ${distrito}`);
    if (tipo) bits.push(`Tipo: ${tipo}`);

    staged.push({
      title: ubicacion || `Pasco camera ${numero || ""}`.trim(),
      kind: "Other / unknown",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: ubicacion || null,
      notes: bits.length ? bits.join(" · ").slice(0, 200) : "Videovigilancia municipal (Pasco HMPP)",
      description: null,
      external_id: `peru-pasco:${(numero || `${lon.toFixed(5)},${lat.toFixed(5)}`).replace(/\s+/g, "_")}`,
    });
  }

  return { staged, skipped, checksum: null };
}
