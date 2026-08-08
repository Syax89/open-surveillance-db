/**
 * Shared helpers for the import adapters (FASE B — kanban t_c338e9df).
 *
 * These are the per-source adapter building blocks: the canonical staged-row
 * shape, validation, kind/direction mapping, deterministic external_id
 * generation and polite fetching. The common RUNTIME (batch writing, full
 * cross-source dedup pass, rollback) is owned by the FASE A framework
 * (`scripts/import/` runner); the adapters here are the source-specific
 * front half that the runner consumes (see README.md in this directory).
 *
 * Design blueprint: docs/data-sources/normalizzazione-pipeline.md
 *   § 2 canonical row · § 3.4 kind mapping · § 3.5 direction parsing
 *   § 7.1 coordinate gates · § 7.2 minimum fields/title · § 7.4 external_id
 *   § 7.6 privacy/etiquette (User-Agent, no PII, throttling)
 */

import { createHash } from "node:crypto";

/** Canonical kind vocabulary (must match app/lib/camera-kinds.ts). */
export const CANONICAL_KINDS = [
  "Fixed dome",
  "Bullet",
  "PTZ",
  "Traffic / licence plate reader",
  "Other / unknown",
] ;

/** Domes are never directional (schema invariant, DOME_KIND). */
export const DOME_KIND = "Fixed dome";

/** Project User-Agent mandated by the pipeline design (§ 7.6 etiquette). */
export const USER_AGENT =
  "OpenSurveillanceDB/0.1 (+https://github.com/Syax89/open-surveillance-db; contact: privacy@opensurveillancedb.org)";

/** Max title length (schema constraint mirror, § 7.2). */
export const TITLE_MAX = 90;
/** Max address length (schema mirror, § 2). */
export const ADDRESS_MAX = 180;

/** Fold diacritics + lowercase, keep letters/digits (mirrors normalizeText). */
export function foldText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

/** Collapse whitespace and trim; null for empty strings. */
export function cleanText(value, max = 2000) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Parse a source coordinate: empty/blank strings and null/undefined → NaN
 * (never the origin!); everything else → Number(). Use before staging so a
 * blank coordinate is a parse-time skip, not a silent (0,0).
 */
export function parseCoord(value) {
  if (value === null || value === undefined) return NaN;
  const text = String(value).trim();
  if (text === "") return NaN;
  return Number(text);
}

/**
 * § 3.5 direction parsing → integer 0–359 or null.
 * Accepts numeric strings (incl. "360" → 0) and compass words in EN/DE/IT
 * (16-wind rose → sector centre rounded to integer degree).
 */
const COMPASS = {
  n: 0, nord: 0, north: 0,
  nne: 22.5, "nord-nord-est": 22.5, "north-north-east": 22.5,
  ne: 45, "nord-est": 45, northeast: 45, nordost: 45,
  ene: 67.5, "est-nord-est": 67.5, "east-north-east": 67.5,
  e: 90, est: 90, east: 90, osten: 90,
  ese: 112.5, "est-sud-est": 112.5, "east-south-east": 112.5,
  se: 135, "sud-est": 135, southeast: 135, suedost: 135, südost: 135,
  sse: 157.5, "sud-sud-est": 157.5, "south-south-east": 157.5,
  s: 180, sud: 180, south: 180, sueden: 180, süden: 180,
  ssw: 202.5, "sud-sud-ovest": 202.5, "south-south-west": 202.5,
  sw: 225, "sud-ovest": 225, southwest: 225, suedwest: 225, südwest: 225,
  wsw: 247.5, "ovest-sud-ovest": 247.5, "west-south-west": 247.5,
  w: 270, ovest: 270, west: 270, westen: 270,
  wnw: 292.5, "ovest-nord-ovest": 292.5, "west-north-west": 292.5,
  nw: 315, "nord-ovest": 315, northwest: 315, nordwest: 315,
  nnw: 337.5, "nord-nord-ovest": 337.5, "north-north-west": 337.5,
};

/**
 * Web Mercator (EPSG:3857) → WGS84. ArcGIS FeatureServers in Web Mercator
 * (wkid 102100/3857) espongono x/y in metri; la conversione è analitica
 * (sferica). Sanity: Washington DC x=-8569260 → -76.99, y=4706276 → 38.89.
 */
export function webMercatorToWgs84(x, y) {
  const lon = (x / 20037508.34) * 180;
  const lat = (Math.atan(Math.exp((y / 20037508.34) * Math.PI)) * 2 - Math.PI / 2) * (180 / Math.PI);
  return [Number(lat.toFixed(6)), Number(lon.toFixed(6))];
}

export function parseDirection(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toLocaleLowerCase();
  if (!text) return null;
  // Numeric: 0..359 (360 → 0).
  if (/^\d{1,3}$/.test(text)) {
    const num = Number.parseInt(text, 10);
    if (Number.isFinite(num) && num >= 0 && num <= 360) return num === 360 ? 0 : num;
    return null;
  }
  // Compass words (EN/IT/DE aliases).
  const degree = COMPASS[text];
  if (degree !== undefined) return Math.round(degree);
  return null;
}

/**
 * § 3.4 kind mapping: fold + lookup in the descriptor kind_map; unmapped
 * values → "Other / unknown" with a note (never invent, never store the raw
 * source string). `rawKind` null/undefined → "Other / unknown".
 */
export function mapKind(rawKind, kindMap) {
  if (rawKind === null || rawKind === undefined) return { kind: "Other / unknown", mapped: false };
  const key = foldText(String(rawKind)).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const canonical = kindMap[key];
  if (canonical) return { kind: canonical, mapped: true };
  return { kind: "Other / unknown", mapped: false };
}

/**
 * § 7.4 external_id generation: prefer a source-native id (prefixed by the
 * adapter); when the source has none, derive deterministically from
 * normalized title + raw coordinates so re-runs stay idempotent.
 */
export function hashExternalId(title, latitude, longitude) {
  const seed = `${foldText(title)}|${Number(latitude).toFixed(6)}|${Number(longitude).toFixed(6)}`;
  return createHash("sha1").update(seed).digest("hex").slice(0, 16);
}

/**
 * § 7.1/7.3/7.2 staged-row validation. Returns { ok, errors } — never throws.
 * Required: title, latitude, longitude, kind, external_id. Coordinates must be
 * finite WGS84 in range; (0,0) is rejected (treats it as "unknown") unless the
 * adapter whitelists it explicitly.
 */
export function validateStagedRow(row, { allowOrigin = false } = {}) {
  const errors = [];
  if (!row.title || typeof row.title !== "string") errors.push("missing title");
  else if (row.title.length > TITLE_MAX) errors.push(`title too long (${row.title.length} > ${TITLE_MAX})`);

  const lat = Number(row.latitude);
  const lon = Number(row.longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push(`invalid latitude ${row.latitude}`);
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) errors.push(`invalid longitude ${row.longitude}`);
  if (!allowOrigin && lat === 0 && lon === 0) errors.push("origin (0,0) coordinates");

  if (!CANONICAL_KINDS.includes(row.kind)) errors.push(`invalid kind ${JSON.stringify(row.kind)}`);

  if (row.direction !== null && row.direction !== undefined) {
    if (!Number.isInteger(row.direction) || row.direction < 0 || row.direction > 359) {
      errors.push(`invalid direction ${row.direction}`);
    }
  }
  if (row.kind === DOME_KIND && row.direction !== null && row.direction !== undefined) {
    errors.push("dome with direction (invariant)");
  }
  if (!row.external_id || typeof row.external_id !== "string") errors.push("missing external_id");

  return { ok: errors.length === 0, errors };
}

/**
 * Haversine distance in metres between two WGS84 points (mirror of the
 * project's distance primitive in app/lib — kept here so the offline dry-run
 * harness can run without the TS build; the FASE A runner uses the real
 * modules).
 */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Text similarity mirror (app/lib/duplicate-detection.ts textSimilarity):
 * Jaccard over folded tokens, with the ≥0.6 threshold band used by the
 * pipeline's Pass 2 rules.
 */
export function textSimilarity(left, right) {
  const fold = (v) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  const tokens = (v) => {
    const norm = fold(v);
    if (!norm) return new Set();
    return new Set(norm.split(" ").filter((t) => t.length > 2));
  };
  const lt = tokens(left);
  const rt = tokens(right);
  if (lt.size === 0 || rt.size === 0) return 0;
  let inter = 0;
  for (const t of lt) if (rt.has(t)) inter += 1;
  const union = lt.size + rt.size - inter;
  let score = union === 0 ? 0 : inter / union;
  const ln = fold(left);
  const rn = fold(right);
  if (ln.length >= 6 && (ln.includes(rn) || rn.includes(ln))) score = Math.max(score, 0.75);
  return score;
}

/**
 * Polite fetch: project User-Agent, timeout, retry with backoff on 429/5xx.
 * `retries` extra attempts after the first try. Throws on final failure.
 */
export async function fetchWithRetry(url, { retries = 2, timeoutMs = 60000, headers = {}, method = "GET", body } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { "User-Agent": USER_AGENT, ...headers },
        body,
        signal: controller.signal,
        redirect: "follow",
      });
      if (res.ok) return res;
      // Retryable server/rate-limit responses.
      if (res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
        lastError = new Error(`HTTP ${res.status} for ${url}`);
        await sleep(2000 * (attempt + 1) + Math.random() * 1000);
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      if (err.name === "AbortError") lastError = new Error(`timeout after ${timeoutMs}ms for ${url}`);
      else lastError = err;
      if (attempt < retries) await sleep(2000 * (attempt + 1) + Math.random() * 1000);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
