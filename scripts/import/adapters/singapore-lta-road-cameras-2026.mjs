/**
 * Adapter Singapore — LTA Road Camera collection (data.gov.sg).
 * Coda giurisdizioni pass v2 (2026-08-21, catalogo OK).
 *
 * Source: data.gov.sg dataset d_147f4906651f5b32925dfe6560296161
 * "LTA Road Camera" — GeoJSON Point con Name/Description.
 * Licence: Singapore Open Data Licence v1.0 — verified OK in catalog.
 *
 * - Fetch: poll-download data.gov.sg → URL S3 firmato → GeoJSON.
 * - Mapping: Name → title/external_id; Description → notes.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "singapore-lta-road-cameras-2026";

const DATASET_ID = "d_147f4906651f5b32925dfe6560296161";
const POLL_URL = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET_ID}/poll-download`;

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/singapore-lta-road-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const poll = await fetchWithRetry(POLL_URL);
  const j = await poll.json();
  if (j.code !== 0) throw new Error(`data.gov.sg poll-download error: ${j.errMsg ?? j.code}`);
  const res = await fetchWithRetry(j.data.url);
  const text = await res.text();
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse il GeoJSON LTA Road Camera in righe canonical. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    recordSkip("payload non-JSON");
    return { staged, skipped, checksum: null };
  }

  const features = data?.features ?? [];
  for (const f of features) {
    const p = f.properties ?? {};
    const geom = f.geometry ?? {};
    if (geom.type !== "Point" || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) {
      recordSkip("non-Point geometry");
      continue;
    }
    const lon = Number.parseFloat(geom.coordinates[0]);
    const lat = Number.parseFloat(geom.coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }
    const name = cleanText(String(p.Name ?? ""), 120);
    const desc = cleanText(String(p.Description ?? ""), 200);
    staged.push({
      title: name || `Singapore road camera ${staged.length + 1}`,
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes: desc || "LTA Road Camera (Land Transport Authority)",
      description: null,
      external_id: `sg-road:${name || staged.length + 1}`,
    });
  }

  return { staged, skipped, checksum: null };
}
