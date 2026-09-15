/**
 * Adapter Hong Kong — TD traffic snapshot cameras (CCTV + traffic detectors).
 * Coda giurisdizioni pass v2 (2026-08-21, catalogo OK).
 *
 * Source: data.gov.hk dataset hk-td-tis_2-traffic-snapshot-images, resource
 * "Traffic Camera Locations (English)". ~1013 telecamere con key, region,
 * district, description, coordinate WGS84 e URL immagine.
 * Licence: data.gov.hk Terms of Use (https://data.gov.hk/en/terms-agreement)
 * — reuse with attribution; verified OK in catalog.
 *
 * - Fetch: CSV UTF-16LE da static.data.gov.hk.
 * - Mapping: description → title; key → external_id; region/district → notes.
 * - Aggiornato ogni 2 minuti dalla fonte (locations stabili).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanText, fetchWithRetry } from "./lib.mjs";

export const slug = "hong-kong-td-traffic-cameras-2026";

const CSV_URL = "https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.csv";

export function getDescriptor() {
  return JSON.parse(readFileSync(new URL("../../../docs/data-sources/imports/hong-kong-td-traffic-cameras-2026.json", import.meta.url), "utf8"));
}

export async function fetchPayload() {
  const res = await fetchWithRetry(CSV_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = new TextDecoder("utf-16le").decode(buf);
  const hasher = createHash("sha256");
  hasher.update(text);
  return { text, checksum: hasher.digest("hex") };
}

/** Parse il CSV tab-separated (UTF-16 → UTF-8) in righe canonical. */
export function parsePayload({ text } = {}) {
  const staged = [];
  const skipped = { total: 0, reasons: {} };
  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  if (!text) return { staged, skipped, checksum: null };

  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { staged, skipped, checksum: null };
  const header = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const get = (k) => (cols[idx[k]] ?? "").trim();

    const key = get("key");
    const lat = Number.parseFloat(get("latitude"));
    const lon = Number.parseFloat(get("longitude"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      recordSkip("non-finite/out-of-range/zero coordinates");
      continue;
    }
    const desc = cleanText(get("description"), 160).replace(/\s*\[\w+\]\s*$/, "").trim();
    const region = cleanText(get("region"), 60);
    const district = cleanText(get("district"), 60);
    const url = get("url");

    staged.push({
      title: (desc || `Hong Kong traffic camera ${key}`).slice(0, 90),
      kind: "Traffic / licence plate reader",
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      direction: null,
      address: null,
      notes: [region, district].filter(Boolean).join(" / ") || "Hong Kong Transport Department CCTV",
      description: url ? `Snapshot: ${url}` : null,
      external_id: `hk-td:${key}`,
    });
  }

  return { staged, skipped, checksum: null };
}
