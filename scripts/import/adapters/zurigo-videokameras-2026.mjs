/**
 * Adapter ZURIGO — «Aktuelle Auflistung von Videokameras der Stadtverwaltung
 * Zürich» (Open Data Zürich, CC0 1.0).
 *
 * Source (census docs/data-sources/censimento-fonti.md § 3.1):
 *   https://data.stadt-zuerich.ch/dataset/prd_stez_liste_videokameras_stadtverwaltung
 *   CSV diretto: <dataset>/download/liste_videokameras_stadtverwaltung.csv
 *
 * Shape notes:
 * - The CSV rows are SITES (standort) with per-site camera COUNTS
 *   (anzahl_kameras_aussen/innen/gsa), not individual cameras. We emit ONE
 *   staged row per site (kind "Other / unknown": the source does not say
 *   dome/bullet/PTZ and we never invent it).
 * - No source-native id column → deterministic external_id (pipeline § 7.4).
 * - Privacy gate (§ 7.6): `verantwortliche_da` (data controller — may be a
 *   person), `aufbewahrungsdauer` and `rechtsgrundlage_url` are NOT imported.
 * - `bereich_detail_beschreibung` (monitored-area description) is non-personal
 *   → mapped to `description`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { cleanText, fetchWithRetry, hashExternalId, mapKind, parseCoord } from "./lib.mjs";

export const slug = "zurigo-videokameras-2026";

const DESCRIPTOR_PATH = fileURLToPath(new URL("../../../docs/data-sources/imports/zurigo-videokameras-2026.json", import.meta.url));

/** Hard cap on title/description length applied during parse. */
const TITLE_MAX = 90;
const DESCRIPTION_MAX = 500;

export function getDescriptor() {
  return JSON.parse(readFileSync(DESCRIPTOR_PATH, "utf8"));
}

/** Download URL derived from the CKAN dataset page (verified live 2026-08-05). */
export function csvUrl() {
  const descriptor = getDescriptor();
  return `${descriptor.source_url}/download/liste_videokameras_stadtverwaltung.csv`;
}

/**
 * Fetch the raw CSV payload. Returns { text, checksum } where checksum is the
 * sha256 of the payload (pipeline § 7.6 reproducibility).
 */
export async function fetchPayload() {
  const res = await fetchWithRetry(csvUrl(), { timeoutMs: 90000 });
  const text = await res.text();
  const checksum = createHash("sha256").update(text).digest("hex");
  return { text, checksum };
}

/**
 * Minimal RFC 4180 CSV parser (quoted fields, CRLF/LF, "" escapes, BOM).
 * Returns an array of objects keyed by the header row.
 */
export function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.length > 0) {
      rows.push(row);
      row = [];
    }
  };
  // Strip UTF-8 BOM.
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushField();
      pushRow();
    } else if (ch === "\r") {
      // ignore (CRLF handled at \n)
    } else {
      field += ch;
    }
  }
  // Trailing field/row (no final newline).
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((values) => {
    const obj = {};
    header.forEach((name, idx) => {
      obj[name.trim()] = (values[idx] ?? "").trim();
    });
    return obj;
  });
}

/**
 * Parse the raw CSV into canonical staged rows (§ 2):
 *   { title, kind, latitude, longitude, direction, address, description,
 *     external_id }
 * `source` / `import_batch_id` are runner-owned (FASE A) and not set here.
 */
export function parsePayload({ text } = {}) {
  const descriptor = getDescriptor();
  const rows = parseCsv(text);
  const staged = [];
  const skipped = { total: 0, reasons: [] };

  for (const raw of rows) {
    const title = cleanText(raw.standort_beschreibung, TITLE_MAX);
    const lat = parseCoord(raw.lat);
    const lon = parseCoord(raw.lon);
    if (!title) {
      skipped.total += 1;
      skipped.reasons.push("missing title");
      continue;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      skipped.total += 1;
      skipped.reasons.push("non-finite coordinates");
      continue;
    }

    // No kind info in this source → canonical "Other / unknown" (never invent).
    const { kind } = mapKind(null, descriptor.kind_map);

    const address = cleanText(raw.adresse_beschreibung, 180);
    const description = cleanText(raw.bereich_detail_beschreibung, DESCRIPTION_MAX);

    staged.push({
      title,
      kind,
      latitude: lat,
      longitude: lon,
      direction: null,
      address,
      description,
      // No source id → deterministic hash (pipeline § 7.4).
      external_id: hashExternalId(title, lat, lon),
    });
  }

  return { staged, skipped, checksum: null };
}

/** Export for tests: the CSV parser is exercised via parsePayload fixtures. */
export { parseCsv as _parseCsv };
