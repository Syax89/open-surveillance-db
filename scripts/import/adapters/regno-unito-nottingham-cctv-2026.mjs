/**
 * Adapter Regno Unito — Nottingham City Council CCTV cameras (CCTV and
 * Traffic Control Cameras). Ricerca fonti 2026-10-21 (verificato first-hand).
 *
 * Source: FeatureServer CCTV_Cameras layer 83 — 562 feature, SR nativo
 * EPSG:27700 (British National Grid), capabilities Query,Extract.
 * Licence: OGL v3 + «Contains OS data © Crown copyright and database
 * right» (item metadata, verificato 2026-10-21).
 *
 * - Fetch: query paginata con outSR=4326 (reproiezione server-side: il BNG
 *   richiederebbe una conversione con datum shift OSGB36 fatta in casa).
 * - DIFETTO DEL SORGENTE: gli attributi `Lat` e `Long` sono INVERTITI in
 *   tutte le 562 righe (la latitudine sta dentro `Long`). L'adapter usa
 *   SOLO la geometria (x = longitudine, y = latitudine): gli attributi
 *   Lat/Long non vengono mai letti.
 * - Mapping: Location → title/address; Type → kind; ControlRm → notes.
 * - Skip fail-closed: postazioni senza camera («Redeployable - No
 *   Camera») ed edilizia sociale («NCH Housing», fuori scope).
 * - external_id = "nottingham-cctv:<OBJECTID>".
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchArcGisFeatures } from "./lib.mjs";

export const slug = "regno-unito-nottingham-cctv-2026";

const FS = "https://services.arcgis.com/yvqphKcf9bBSnjX1/arcgis/rest/services/CCTV_Cameras/FeatureServer/83";

/** Finestra di validazione Nottingham (estensione reale 52.897–53.017 / −1.235…−1.115). */
const BOUNDS = { minLat: 52.7, maxLat: 53.2, minLon: -1.45, maxLon: -0.95 };

/**
 * Mappa statica Type → kind canonico. I valori non elencati cadono su
 * 'Other / unknown': un import non inventa mai un kind (kinds.mjs).
 * Nota: «Reployable - Camera Present» è un typo del sorgente, riportato
 * verbatim; «Redeployable - No Camera» è invece skippata (postazione
 * senza camera).
 */
const KIND_BY_TYPE = new Map([
  ["Traffic Control Cameras", "Traffic / licence plate reader"],
  ["Red Light Camera", "Traffic / licence plate reader"],
  ["ANPR - Number Plates", "Traffic / licence plate reader"],
  ["Truvelo Speed Camera", "Traffic / licence plate reader"],
  ["SPEC Cameras", "Traffic / licence plate reader"],
  ["Public Open Space (Fixed)", "Other / unknown"],
  ["Public Open Space with Help Point", "Other / unknown"],
  ["Reployable - Camera Present", "Other / unknown"],
]);

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/regno-unito-nottingham-cctv-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const data = await fetchArcGisFeatures(FS, { page: 500, outSR: 4326 });
  const hasher = createHash("sha256");
  hasher.update(JSON.stringify(data));
  return { data, checksum: hasher.digest("hex") };
}

/** Parse ArcGIS features (geometria in WGS84, outSR=4326) in righe canonical. */
export function parsePayload({ data } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!Array.isArray(data)) return { staged, skipped, checksum: null };

  for (const f of data) {
    const a = f.attributes ?? {};
    const g = f.geometry ?? {};
    if (g.x == null || g.y == null) {
      recordSkip("no point geometry");
      continue;
    }
    // SOLO geometria: gli attributi Lat/Long del sorgente sono invertiti.
    const latitude = Number(g.y);
    const longitude = Number(g.x);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 ||
      (latitude === 0 && longitude === 0)
    ) {
      recordSkip("coordinates out of range or zero");
      continue;
    }
    if (latitude < BOUNDS.minLat || latitude > BOUNDS.maxLat || longitude < BOUNDS.minLon || longitude > BOUNDS.maxLon) {
      recordSkip("coordinates outside Nottingham bounds");
      continue;
    }

    const type = cleanText(a.Type, 80);
    if (type === "Redeployable - No Camera") {
      recordSkip("mounting position without camera");
      continue;
    }
    if (type === "NCH Housing") {
      recordSkip("housing estate camera excluded (scope, fail-closed)");
      continue;
    }

    const location = cleanText(a.Location, 90);
    const fallbackId = a.CameraNum || a.ColumnNum || a.OBJECTID;
    const controlRm = cleanText(a.ControlRm, 80);

    staged.push({
      title: location ?? cleanText(`Nottingham CCTV ${fallbackId ?? ""}`, 90),
      kind: KIND_BY_TYPE.get(type) ?? "Other / unknown",
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      direction: null,
      address: cleanText(a.Location, 180),
      notes: [type, controlRm].filter(Boolean).join(" · ") || null,
      description: null,
      external_id: `nottingham-cctv:${a.OBJECTID}`,
    });
  }

  return { staged, skipped, checksum: null };
}
