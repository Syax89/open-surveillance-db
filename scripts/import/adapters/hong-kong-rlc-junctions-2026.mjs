/**
 * Adapter Hong Kong — Junctions with Red Light Camera System installed (TD).
 * Coda giurisdizioni pass v2 (2026-08-21, catalogo OK).
 *
 * Source: data.gov.hk dataset hk-td-tis_25-junctions-with-rlc, resource
 * "List of Junctions with Red Light Camera System installed" (CSV da
 * www.td.gov.hk/datagovhk_td/). 232 giunzioni, SOLO nomi siti (no coordinate).
 * Licence: data.gov.hk Terms of Use — verified OK in catalog.
 *
 * Geocodifica: le coordinate NON sono nel dataset; l'import usa un payload
 * JSONL geocodificato (Nominatim, 1 req/s, UA ufficiale — script
 * payloads/geocode-hk-rlc.py). Le giunzioni senza hit vengono SKIPpate con
 * motivo documentato (nessuna coordinata inventata).
 *
 * - Mapping: Sites (English) → title; No. → external_id.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "hong-kong-rlc-junctions-2026";

const CSV_URL = "https://www.td.gov.hk/datagovhk_td/junctions-with-rlc/resources/junctions_with_rlc.csv";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/hong-kong-rlc-junctions-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(CSV_URL);
  const text = await res.text();
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/**
 * Payload atteso: JSONL geocodificato (una riga JSON per giunzione):
 * {no, name, lat, lon, display}. Le righe senza lat/lon vengono skip.
 */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      recordSkip("riga non-JSON");
      continue;
    }
    const lat = rec.lat;
    const lon = rec.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("geocodifica mancante (nessuna coordinata inventata)");
      continue;
    }
    const name = cleanText(String(rec.name ?? ""), 200);
    if (!name) {
      recordSkip("nome sito mancante");
      continue;
    }
    staged.push({
      title: `Red light camera junction: ${name}`.slice(0, 90),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes: "Giunzione con sistema Red Light Camera (Hong Kong Transport Department)",
      description: rec.display ? `Nominatim: ${rec.display}` : null,
      external_id: `hk-rlc:${String(rec.no ?? "").trim()}`,
    });
  }

  return { staged, skipped, checksum: null };
}
