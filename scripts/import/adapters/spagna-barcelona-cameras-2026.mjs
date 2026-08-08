/**
 * Adapter Barcelona — "Inventari de càmeres de seguretat" (CEO 2026-08-08,
 * scan ES fonti ufficiali).
 *
 * Source: Ajuntament de Barcelona, open data (CKAN). 165 telecamere di
 * sicurezza dell'infrastruttura pubblica con Longitud/Latitud.
 * Licence: Creative Commons Attribution 4.0 (dichiarata sul portale) —
 * già nel gate.
 *
 * - Fetch: CSV via API CKAN di opendata-ajuntament.barcelona.cat.
 * - Mapping: Tipus_Cam_Seguretat → kind; Num_Cam_Seguretat → title;
 *   Nom_Districte/Nom_Barri → address; Longitud/Latitud → coordinates.
 * - external_id = "bcn-camera:<Id_Cam_Seguretat>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText } from "./lib.mjs";

export const slug = "spagna-barcelona-cameras-2026";

const CKAN_SEARCH =
  "https://opendata-ajuntament.barcelona.cat/data/api/3/action/package_search?q=cameras+seguretat&rows=3";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/spagna-barcelona-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetch(CKAN_SEARCH, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0 (+https://open-surveillancedb.org)" } });
  if (!res.ok) throw new Error(`Barcelona CKAN search failed: ${res.status}`);
  const data = (await res.json()).result?.results ?? [];
  // pick the "Inventory of security cameras of the infrastructure network"
  const pkg = data.find((p) => /inventari.*càmeres.*seguretat|security cameras of the infrastructure/i.test(p.title ?? "")) ?? data[0];
  if (!pkg) throw new Error("Barcelona CKAN: dataset non trovato");
  const csvRes = (pkg.resources ?? []).find((r) => r.format === "CSV");
  if (!csvRes) throw new Error("Barcelona CKAN: nessuna risorsa CSV");
  const csv = await fetch(csvRes.url, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0 (+https://open-surveillancedb.org)" } });
  if (!csv.ok) throw new Error(`Barcelona CSV fetch failed: ${csv.status}`);
  const text = await csv.text();
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse the CSV (header con Longitud;Latitud) into canonical staged rows. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim());
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",").map((c) => c.trim());
    const row = {};
    header.forEach((h, i) => { row[h] = cols[i] ?? ""; });

    const lat = Number.parseFloat(row.Latitud ?? "");
    const lon = Number.parseFloat(row.Longitud ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const num = cleanText(row.Num_Cam_Seguretat, 40);
    const title = num ? `Càmera de seguretat ${num}` : "Càmera de seguretat (Barcelona)";
    const address = [cleanText(row.Nom_Barri, 40), cleanText(row.Nom_Districte, 40)].filter(Boolean).join(", ").slice(0, 120) || null;

    let notes = null;
    const bits = [];
    if (row.Tipus_Cam_Seguretat) bits.push(`Tipo: ${cleanText(row.Tipus_Cam_Seguretat, 60)}`);
    if (row.Codi_Suport) bits.push(`Supporto: ${cleanText(row.Codi_Suport, 30)}`);
    if (row.Data_Alta) bits.push(`Alta: ${cleanText(row.Data_Alta, 20)}`);
    if (bits.length) notes = bits.join(" · ").slice(0, 200);

    staged.push({
      title,
      kind: "Other / unknown",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address,
      notes,
      description: null,
      external_id: `bcn-camera:${row.Id_Cam_Seguretat ?? `${lon.toFixed(5)},${lat.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
