/**
 * Adapter Perù — Municipalidad Distrital de La Punta, cámaras de
 * videovigilancia (datosabiertos.gob.pe). Scan coda giurisdizioni
 * (cron 2026-08-19, pass v2).
 *
 * Source: DKAN nacional peruano, dataset "camaras-de-videovigilancia-de-
 * seguridad-ciudadana-del-distrito-de-la-punta". 25 telecamere municipali,
 * CSV delimitatore ";" con LATITUD/LONGITUD WGS84.
 * Licence: Open Data Commons Attribution License (ODbL) — pane "Licencia"
 * della pagina dataset (verificata first-hand 2026-08-20). Fresh 2026-01-30.
 *
 * - Fetch: CSV (encoding windows-1252, separatore ";").
 * - Mapping: UBICACION → title; MARCA/MODELO → notes; NRO_REGISTRO →
 *   external_id.
 * - external_id = "peru-la-punta:<NRO_REGISTRO>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "peru-la-punta-cctv-2026";

const CSV_URL = "https://www.datosabiertos.gob.pe/sites/default/files/DATASET%20CAMARAS%20DE%20VIDEOVIGILANCIA.csv";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/peru-la-punta-cctv-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(CSV_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = new TextDecoder("windows-1252").decode(buf);
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse the CSV (semicolon, windows-1252) into canonical staged rows. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  const lines = text.split(/\r?\n/);
  const header = lines[0].split(";").map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(";").map((c) => c.trim());
    if (cells.length < 2 || !cells.join("").trim()) continue;

    const lat = Number.parseFloat(cells[idx["latitud"]]);
    const lon = Number.parseFloat(cells[idx["longitud"]]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }

    const ubicacion = cleanText(cells[idx["ubicacion"]] ?? "", 90);
    const marca = cleanText(cells[idx["marca"]] ?? "", 40);
    const modelo = cleanText(cells[idx["modelo"]] ?? "", 40);
    const nro = cleanText(cells[idx["nro_registro"]] ?? "", 20);

    const bits = [];
    if (marca) bits.push(`Marca: ${marca}`);
    if (modelo) bits.push(`Modelo: ${modelo}`);
    if (cleanText(cells[idx["condición"]] ?? cells[idx["condicion"]] ?? "", 30)) bits.push(`Stato: ${cleanText(cells[idx["condición"]] ?? cells[idx["condicion"]] ?? "", 30)}`);

    staged.push({
      title: ubicacion || `La Punta camera ${nro || ""}`.trim(),
      kind: "Other / unknown",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: ubicacion || null,
      notes: bits.length ? bits.join(" · ").slice(0, 200) : "Videovigilancia municipal (La Punta)",
      description: null,
      external_id: `peru-la-punta:${nro || `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
