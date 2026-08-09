/**
 * Adapter Brasile — Belo Horizonte BHTRANS Fiscalização Eletrônica
 * (cron ricerca 2026-08-09).
 *
 * Source: dados.pbh.gov.br CKAN. 506 righe, GEOMETRIA "POINT (e n)"
 * UTM 23S (EPSG:31983) → utm23sToWgs84. Speed/red-light/radar.
 * Licence: CC BY (metadata CKAN).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry, utm23sToWgs84 } from "./lib.mjs";

export const slug = "brasile-bh-bhtrans-cameras-2026";

const PKG_URL = "https://dados.pbh.gov.br/api/3/action/package_show?id=7ce7b0b8-0a5b-4736-9b63-8bfd5da6cfe4";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/brasile-bh-bhtrans-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const pkg = await (await fetchWithRetry(PKG_URL)).json();
  const csvRes = (pkg?.result?.resources ?? []).find((r) => r.format === "CSV" && /fiscalizacao/i.test(r.name ?? ""));
  if (!csvRes) throw new Error("BHTRANS: nessuna risorsa CSV fiscalização trovata");
  const res = await fetchWithRetry(csvRes.url);
  const text = (await res.text()).replace(/^\uFEFF/, "");
  const hasher = createHash("sha256");
  hasher.update(text);
  return { data: text, checksum: hasher.digest("hex") };
}

/** Parse CSV (GEOMETRIA POINT UTM) into canonical staged rows. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (typeof data !== "string") return { staged, skipped, checksum: null };

  // parser quoted
  const parseRow = (line) => {
    const cells = [];
    let field = "";
    let inQ = false;
    for (const ch of line) {
      if (inQ) {
        if (ch === '"') inQ = false;
        else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { cells.push(field); field = ""; }
      else field += ch;
    }
    cells.push(field);
    return cells;
  };

  const lines = data.replace(/\r\n/g, "\n").split("\n");
  const header = parseRow(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ""));
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });

  const geo = /POINT\s*\(([-\d.]+)\s+([-\d.]+)\)/i;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = parseRow(lines[i]);
    const at = (col) => (col !== undefined && cells[idx[col]] !== undefined ? cells[idx[col]].trim() : "");
    const m = geo.exec(at("GEOMETRIA"));
    if (!m) { recordSkip("GEOMETRIA non POINT"); continue; }
    const [lat, lon] = utm23sToWgs84(Number.parseFloat(m[1]), Number.parseFloat(m[2]));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("coordinate conversion out of range/zero");
      continue;
    }
    const loc = cleanText(at("DESC_LOC_CONTROLADOR_TRANSITO"), 90);
    const type = cleanText(at("DESC_TIPO_CONTROLADOR_TRANSITO"), 80);
    const speed = at("VELOCIDADE_REGULAMENTAR");
    const bits = [];
    if (type) bits.push(type);
    if (speed) bits.push(`${speed} km/h`);
    const notes = bits.length ? bits.join(" · ").slice(0, 200) : null;

    staged.push({
      title: loc || `BHTRANS ${at("ID_FISCALIZACAO_ELETRONICA")}`.trim(),
      kind: "Traffic / licence plate reader",
      latitude: lat,
      longitude: lon,
      direction: null,
      address: loc || null,
      notes,
      description: null,
      external_id: `bh-bhtrans:${at("ID_FISCALIZACAO_ELETRONICA")}`,
    });
  }

  return { staged, skipped, checksum: null };
}
