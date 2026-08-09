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

/**
 * EPSG:2248 (NAD83 / Maryland, Lambert Conformal Conic, US survey feet)
 * → WGS84. Usato da CitiWatch Baltimore e ATVES (wkid 2248/102685).
 * Validato 2026-08-08 vs Nominatim: 6000 Hillen Rd → 39.3615/-76.5801
 * (reale 39.3615/-76.5803, ~20m).
 */
export function lcc2248ToWgs84(x, y) {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const e = Math.sqrt(2 * f - f * f);
  const lat0 = (37.66666666666666 * Math.PI) / 180;
  const lat1 = (39.45 * Math.PI) / 180;
  const lat2 = (38.3 * Math.PI) / 180;
  const lon0 = (-77 * Math.PI) / 180;
  const X0 = 400000.0;
  const Y0 = 0.0;
  const FT2M = 1200.0 / 3937.0;
  const X = x * FT2M;
  const Y = y * FT2M;
  const m = (phi) => Math.cos(phi) / Math.sqrt(1 - e * e * Math.sin(phi) ** 2);
  const t = (phi) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) ** (e / 2);
  const m1 = m(lat1), m2 = m(lat2), t0 = t(lat0), t1 = t(lat1), t2 = t(lat2);
  const n = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
  const F = m1 / (n * t1 ** n);
  const rho0 = a * F * t0 ** n;
  const dx = X - X0, dy = rho0 - Y;
  const rho = Math.hypot(dx, dy) * Math.sign(n);
  const theta = Math.atan2(dx, dy);
  const tt = (rho / (a * F)) ** (1 / n);
  let phi = Math.PI / 2 - 2 * Math.atan(tt);
  for (let i = 0; i < 8; i++) {
    const s = Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(tt * ((1 - e * s) / (1 + e * s)) ** (e / 2));
  }
  const lon = lon0 + theta / n;
  return [Number((phi * 180 / Math.PI).toFixed(6)), Number((lon * 180 / Math.PI).toFixed(6))];
}

/**
 * EPSG:2926 (NAD83 / Washington State Plane North, Lambert Conformal
 * Conic, US survey feet) → WGS84. Usato da King County traffic cameras
 * (wkid 2926). Parametri: lat_0=47, lat_1=48.73333..., lat_2=47.5,
 * lon_0=-120.83333, x_0=500000 ftUS, y_0=0.
 * Validato 2026-08-09 vs coordinate note: 116th Ave NE / NE 124th St →
 * ~47.71/-122.20 (King County, WA).
 */
export function lcc2926ToWgs84(x, y) {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const e = Math.sqrt(2 * f - f * f);
  const lat0 = (47.0 * Math.PI) / 180;
  const lat1 = (48.73333333333333 * Math.PI) / 180;
  const lat2 = (47.5 * Math.PI) / 180;
  const lon0 = (-120.8333333333333 * Math.PI) / 180;
  const X0 = 500000.0001016001;
  const Y0 = 0.0;
  const FT2M = 1200.0 / 3937.0;
  const X = x * FT2M;
  const Y = y * FT2M;
  const m = (phi) => Math.cos(phi) / Math.sqrt(1 - e * e * Math.sin(phi) ** 2);
  const t = (phi) => Math.tan(Math.PI / 4 - phi / 2) / ((1 - e * Math.sin(phi)) / (1 + e * Math.sin(phi))) ** (e / 2);
  const m1 = m(lat1), m2 = m(lat2), t0 = t(lat0), t1 = t(lat1), t2 = t(lat2);
  const n = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
  const F = m1 / (n * t1 ** n);
  const rho0 = a * F * t0 ** n;
  const dx = X - X0, dy = rho0 - Y;
  const rho = Math.hypot(dx, dy) * Math.sign(n);
  const theta = Math.atan2(dx, dy);
  const tt = (rho / (a * F)) ** (1 / n);
  let phi = Math.PI / 2 - 2 * Math.atan(tt);
  for (let i = 0; i < 8; i++) {
    const s = Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(tt * ((1 - e * s) / (1 + e * s)) ** (e / 2));
  }
  const lon = lon0 + theta / n;
  return [Number((phi * 180 / Math.PI).toFixed(6)), Number((lon * 180 / Math.PI).toFixed(6))];
}

/**
 * EPSG:2193 (NZGD2000 / New Zealand Transverse Mercator 2000) → WGS84.
 * Usato da Wellington City Council CCTV (wkid 2193).
 * Parametri: lon_0=173, k=0.9996, x_0=1600000, y_0=10000000, GRS80.
 * Validato 2026-08-09: Wakefield/Blair St (1749339, 5427234) →
 * ~-41.291/174.779 (Wellington).
 */
export function nztm2193ToWgs84(x, y) {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const e = Math.sqrt(2 * f - f * f);
  const k0 = 0.9996;
  const lon0 = (173.0 * Math.PI) / 180;
  const X0 = 1600000.0;
  const Y0 = 10000000.0;
  const E = x - X0;
  const N = y - Y0;
  const ep2 = (e * e) / (1 - e * e);
  const m = N / k0;
  const mu = m / (a * (1 - e * e / 4 - 3 * e ** 4 / 64 - 5 * e ** 6 / 256));
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  let phi = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  for (let i = 0; i < 5; i++) {
    const s = Math.sin(phi);
    const c = Math.cos(phi);
    const t2 = Math.tan(phi) ** 2;
    const n2 = ep2 * c * c;
    const r = a * (1 - e * e) / (1 - e * e * s * s) ** 1.5;
    const M = a * ((1 - e * e / 4 - 3 * e ** 4 / 64 - 5 * e ** 6 / 256) * phi
      - (3 * e * e / 8 + 3 * e ** 4 / 32 + 45 * e ** 6 / 1024) * Math.sin(2 * phi)
      + (15 * e ** 4 / 256 + 45 * e ** 6 / 1024) * Math.sin(4 * phi)
      - (35 * e ** 6 / 3072) * Math.sin(6 * phi));
    const d = (N - k0 * M) / (k0 * r);
    phi = phi - (d * (1 + d * d * (t2 - n2) / 2 + d ** 3 * (5 + 3 * t2 + 10 * n2 - 4 * n2 * n2 - 9 * ep2) / 24)) / (1 + t2 - n2);
  }
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const t2 = Math.tan(phi) ** 2;
  const n2 = ep2 * c * c;
  const rn = a / Math.sqrt(1 - e * e * s * s);
  const rm = rn * (1 - e * e) / (1 - e * e * s * s);
  const T = t2, C = n2, A = (E / (k0 * rn));
  const lon = lon0 + (A - (1 + 2 * T + C) * A ** 3 / 6 + (5 - 2 * C + 28 * T - 3 * C * C + 8 * ep2 + 24 * T * T) * A ** 5 / 120) / c;
  const lat = phi - (rm * Math.tan(phi) / rn) * (A * A / 2 - (5 + 3 * T + 10 * C - 4 * C * C - 9 * ep2) * A ** 4 / 24 + (61 + 90 * T + 298 * C + 45 * T * T - 252 * ep2 - 3 * C * C) * A ** 6 / 720);
  return [Number((lat * 180 / Math.PI).toFixed(6)), Number((lon * 180 / Math.PI).toFixed(6))];
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

/**
 * Fetch TUTTE le feature di un ArcGIS FeatureServer layer (paginazione
 * resultOffset/resultRecordCount). Ritorna l'array di feature grezze.
 * Il chiamante decide conversione coordinate/attributi (vedi
 * webMercatorToWgs84 per i layer in EPSG:3857).
 */
export async function fetchArcGisFeatures(fsUrl, { page = 200, headers = {} } = {}) {
  const all = [];
  let offset = 0;
  for (;;) {
    const url = `${fsUrl}/query?where=1%3D1&outFields=*&resultOffset=${offset}&resultRecordCount=${page}&f=json`;
    const res = await fetchWithRetry(url, { headers });
    const data = await res.json();
    if (data?.error) throw new Error(`ArcGIS error ${data.error.code}: ${data.error.message}`);
    const feats = data?.features ?? [];
    if (!feats.length) break;
    all.push(...feats);
    if (feats.length < page) break;
    offset += page;
  }
  return all;
}
