/**
 * Adapter Grand Paris Seine Ouest — "Vidéoprotection" (CEO 2026-08-08,
 * state-by-state scan FR: fonti ufficiali).
 *
 * Source: Territoire Grand Paris Seine Ouest, open-data commune (ODS API
 * v2.1, dataset videoprotection). 446 videocamere di sorveglianza pubbliche
 * con indirizzo e coordinate (geo_point_2d / geometry Point).
 * Licence: fr-lo = Licence Ouverte (attribution-only, classe CC-BY,
 * compatibile con la matrice — stessa famiglia di "Licence Ouverte 2.0"
 * già nel gate).
 *
 * - Fetch: export GeoJSON dell'API ODS (esporta tutti i record).
 * - Mapping: properties.nom → title; adresse/commune/code_insee → address;
 *   type/etat → notes; geometry Point [lon, lat] → coordinates.
 * - external_id = "gpso-videoprotection:<nom>|:<lon>,<lat>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText } from "./lib.mjs";

export const slug = "francia-gpso-videoprotection-2026";

const EXPORT_URL =
  "https://data.seineouest.fr/api/explore/v2.1/catalog/datasets/videoprotection/exports/geojson";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/francia-gpso-videoprotection-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetch(EXPORT_URL, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0 (+https://open-surveillancedb.org)" } });
  if (!res.ok) throw new Error(`GPSO export fetch failed: ${res.status}`);
  const body = await res.json();
  const features = body.features ?? [];
  const hasher = createHash("sha256");
  for (const f of features) hasher.update(JSON.stringify(f));
  return { features, checksum: hasher.digest("hex") };
}

/** Parse the GeoJSON payload into canonical staged rows. */
export function parsePayload({ features } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  for (const f of features ?? []) {
    const props = f.properties ?? {};
    const geom = f.geometry;
    if (!geom || geom.type !== "Point" || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
      recordSkip("non-Point geometry");
      continue;
    }
    const [lon, lat] = geom.coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      recordSkip("non-finite/out-of-range coordinates");
      continue;
    }

    const title = cleanText(props.nom, 90) ?? "Caméra de vidéoprotection";
    const parts = [cleanText(props.adresse, 80), cleanText(props.commune, 40)].filter(Boolean);
    const address = parts.length ? parts.join(", ").slice(0, 160) : null;

    let notes = null;
    const bits = [];
    if (props.type) bits.push(`Tipo: ${cleanText(props.type, 60)}`);
    if (props.etat) bits.push(`Stato: ${cleanText(props.etat, 60)}`);
    if (bits.length) notes = bits.join(" · ").slice(0, 200);

    staged.push({
      title,
      kind: "Fixed camera",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address,
      notes,
      description: null,
      external_id: `gpso-videoprotection:${(cleanText(props.nom, 60) ?? `${lat.toFixed(5)},${lon.toFixed(5)}`).replace(/\s+/g, "_")}`,
    });
  }

  return { staged, skipped, checksum: null };
}
