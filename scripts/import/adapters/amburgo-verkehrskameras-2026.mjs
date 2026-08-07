/**
 * Adapter Hamburg — "Verkehrskameras" (CEO 2026-08-07, state-by-state scan:
 * DE fonti ufficiali).
 *
 * Source: Freie und Hansestadt Hamburg, Verkehrsleitzentrale der Polizei
 * (transparenz.hamburg.de). Public traffic-monitoring cameras operated by
 * the Hamburg police, exposed via the OGC API - Features endpoint
 * (GeoJSON). Licence: Datenlizenz Deutschland – Namensnennung 2.0
 * (dl-de-by-2.0 = attribution-only, compatible per the matrix — same
 * obligations class as CC-BY).
 *
 * - Fetch: OGC API - Features collection "verkehr_kameras_internet"
 *   (https://api.hamburg.de/datasets/v1/verkehrskameras/...), paged via
 *   `offset` until numberMatched is covered.
 * - Mapping: properties.lage → title (e.g. "A1 AK Hamburg-Süd");
 *   anmerkung → notes (operational remark); geometry Point [lon, lat] →
 *   coordinates.
 * - external_id = "hh-verkehrskamera:<id>" (idempotency key).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText } from "./lib.mjs";

export const slug = "amburgo-verkehrskameras-2026";

const BASE_URL =
  "https://api.hamburg.de/datasets/v1/verkehrskameras/collections/verkehr_kameras_internet/items";
const PAGE_SIZE = 100;

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/amburgo-verkehrskameras-2026.json", import.meta.url), "utf8"));
}

/** Fetch all items from the OGC API - Features endpoint (paged). */
export async function fetchPayload() {
  const features = [];
  const hasher = createHash("sha256");
  let offset = 0;
  let matched = null;
  do {
    const url = `${BASE_URL}?f=json&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { headers: { "User-Agent": "OpenSurveillanceDB-import/1.0 (+https://open-surveillancedb.org)" } });
    if (!res.ok) throw new Error(`Hamburg OGC API fetch failed: ${res.status}`);
    const body = await res.json();
    matched = body.numberMatched ?? features.length;
    for (const f of body.features ?? []) {
      features.push(f);
      hasher.update(JSON.stringify(f));
    }
    offset += PAGE_SIZE;
  } while (offset < matched && offset < 1000);
  return { features, checksum: hasher.digest("hex") };
}

/** Parse the OGC API - Features payload into canonical staged rows. */
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
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      recordSkip("non-finite coordinates");
      continue;
    }

    const title = cleanText(props.lage, 90) ?? "Verkehrskamera";
    let notes = null;
    const remark = cleanText(props.anmerkung, 200);
    if (remark) notes = `Nota: ${remark}`.slice(0, 200);

    staged.push({
      title,
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes,
      description: null,
      external_id: `hh-verkehrskamera:${f.id ?? `${lat.toFixed(5)},${lon.toFixed(5)}`}`,
    });
  }

  return { staged, skipped, checksum: null };
}
