// Row normalisation to the canonical staged shape (FONTI PUBBLICHE FASE A,
// kanban t_6030d390; docs/data-sources/normalizzazione-pipeline.md §2/§3).
//
// Every adapter output row is normalised into ONE canonical staged row with
// the cameras-column contract: title, kind, manufacturer, address,
// latitude, longitude, direction, status='active', source='import:<slug>',
// notes (deterministic provenance), description, external_id, plus the raw
// source row for the report. Pure module — no bindings.

import { createHash } from "node:crypto";
import { mapKind } from "./kinds.mjs";
import { normalizeText } from "./text-similarity.mjs";
import { parseDirection } from "./geo.mjs";

/**
 * Deterministic external_id fallback (design §7.4): when the source has no
 * stable id, hash the normalised title + raw coordinates — stable across
 * re-runs, so idempotency survives even id-less datasets.
 */
export function generateExternalId(title, latitude, longitude, prefix = "") {
  const seed = `${normalizeText(title)}|${Number(latitude).toFixed(6)}|${Number(longitude).toFixed(6)}`;
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 16);
  return `${prefix}${hash}`;
}

/**
 * Title fallback chain (design §7.2): deterministic, ≤ 90 chars, no
 * invented claims. Order: explicit title → 'operator + surveillance
 * camera' (ENTITY names only — a person name is PII, dropped) →
 * 'Surveillance camera, <address>' → bare 'Surveillance camera' (last
 * resort). `||` (not `??`) so an empty staged title cascades to the raw
 * source name.
 */
export function generateTitle(raw, staged) {
  const text = String(staged.title || raw?.name || raw?.description || "").trim();
  if (text !== "") return text.slice(0, 90);
  const operator = String(raw?.operator ?? "").trim();
  if (operator !== "" && isEntityOperator(operator)) {
    return `${operator.slice(0, 60)} surveillance camera`.slice(0, 90);
  }
  if (staged.address) return `Surveillance camera, ${staged.address}`.slice(0, 90);
  return "Surveillance camera";
}

/**
 * Entity-vs-person heuristic for the operator fallback title (design §3.3/
 * §7.2): an operator is usable as a title only when it is a PUBLIC ENTITY
 * (municipality, police, company). A person-name shaped value ("Mario
 * Rossi", "Giuseppe Verdi") is PII — dropped from the title, never
 * ingested. Conservative: anything without an entity marker is treated as
 * a person and discarded.
 */
const ENTITY_MARKERS = [
  "comune", "citta", "città", "city", "stadt", "gemeinde", "municipal",
  "polizei", "polizia", "police", "gendarmerie",
  "department", "dipartimento", "ministero", "ministerium", "ministry",
  "ente", "azienda", "agenzia", "autorita", "autorità", "regione",
  "provincia", "consiglio", "vigili",
  "gmbh", "ag", "spa", "srl", "s.r.l.", "inc", "ltd", "llc", "holding",
  "universita", "università", "ospedale", "ferrovie", "infrastrutture",
];
export function isEntityOperator(value) {
  const text = String(value ?? "").trim();
  if (text === "") return false;
  // Acronym-style operators ("EWZ", "ACI", "ANAS") are entities.
  if (/^[A-Z]{2,6}$/.test(text)) return true;
  const folded = text.toLowerCase();
  return ENTITY_MARKERS.some((marker) => folded.includes(marker));
}

/**
 * Assemble an address from the common source field shapes (design §3.1/§3.3):
 * explicit `address` wins; otherwise join street + housenumber (+ city when
 * the descriptor allows it). ≤ 180 chars.
 */
export function assembleAddress(raw, descriptor = {}) {
  const direct = String(raw?.address ?? "").trim();
  if (direct !== "") return direct.slice(0, 180);
  const street = String(raw?.street ?? raw?.via ?? raw?.["addr:street"] ?? "").trim();
  const number = String(raw?.housenumber ?? raw?.civico ?? raw?.["addr:housenumber"] ?? "").trim();
  const city = String(raw?.city ?? raw?.comune ?? raw?.["addr:city"] ?? "").trim();
  const parts = [];
  if (street) parts.push(street);
  if (number) parts.push(number);
  if (city && descriptor.address_with_city !== false) parts.push(city);
  return parts.join(", ").slice(0, 180) || null;
}

/**
 * Normalise one raw adapter row into a canonical staged row. `descriptor`
 * is the validated source descriptor; `slug` is the batch slug.
 *
 * `raw` may be the adapter's own row shape; the adapter is responsible for
 * flattening its format into the common field names this function reads
 * (name, description, operator, address/street/housenumber/city,
 * latitude/longitude, direction, external_id, ...) — the adapter contract
 * in adapters/_contract.mjs documents that.
 *
 * Returns { row, problems: string[] } — `problems` are non-fatal report
 * notes (kind fallback, direction dropped for dome, etc.); hard validation
 * (missing coordinates, non-finite numbers, …) happens in validate.mjs and
 * turns the row into records_invalid, never a partial row.
 */
export function normalizeRow(raw, descriptor, slug) {
  const problems = [];

  // --- coordinates (raw WGS84; validation in validate.mjs) ---
  const latitude = toFiniteNumber(raw.latitude);
  const longitude = toFiniteNumber(raw.longitude);

  // --- kind (mapped; unmapped falls back to Other / unknown + note) ---
  const { kind, mapped } = mapKind(raw.kind, descriptor.kind_map);
  if (!mapped) problems.push(`kind ${JSON.stringify(raw.kind)} not in kind_map — stored as Other / unknown`);

  // --- direction (design §3.5) ---
  let direction = parseDirection(raw.direction);
  if (direction !== null && raw.direction !== undefined && raw.direction !== null && raw.direction !== "" && direction === null) {
    problems.push(`direction ${JSON.stringify(raw.direction)} not parseable — stored NULL`);
  }
  // Post-map invariant: domes never carry a direction (schema invariant).
  const isDome = kind === "Fixed dome";
  if (isDome) {
    if (direction !== null) {
      problems.push(`kind is Fixed dome — direction ${direction} forced to NULL (invariant)`);
    }
    direction = null;
  }

  // --- address + title (deterministic) ---
  const address = assembleAddress(raw, descriptor);

  // --- external_id (design §7.4): source id prefixed, or deterministic ---
  const prefix = descriptor.external_id_prefix ?? "";
  const rawId = raw.external_id ?? raw.id ?? raw["@id"];
  const externalId =
    rawId !== undefined && rawId !== null && String(rawId).trim() !== ""
      ? `${prefix}${String(rawId).trim()}`
      : generateExternalId(raw.name ?? "", latitude ?? 0, longitude ?? 0, prefix);

  const staged = {
    title: "", // filled by generateTitle below
    kind,
    manufacturer: raw.manufacturer ? String(raw.manufacturer).trim() : null,
    address,
    latitude,
    longitude,
    direction,
    status: "active", // D1: imports publish immediately, never confirmed
    source: `import:${slug}`,
    notes: `Imported from ${descriptor.source_name}, batch ${slug}`.slice(0, 500),
    description: raw.description ? String(raw.description).trim() : "",
    externalId,
    lastVerifiedAt: null, // D1 / ADR 0021 §9.1: "never confirmed" badge
    reviewIntervalMonths: 12, // schema default
    publishManufacturer: 0, // never public unless community sets the flag
    publishObservedOn: 0,
  };
  staged.title = generateTitle(raw, staged);
  return { row: staged, problems };
}

/** Parse a raw coordinate allowing comma decimals (Italian portals). */
function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const text = String(value).trim().replace(",", ".");
  if (text === "") return NaN;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}
