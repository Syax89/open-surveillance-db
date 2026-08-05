/**
 * Adapter OSM — OpenStreetMap `man_made=surveillance` nodes/ways over Italy,
 * via the Overpass API (ODbL 1.0, attribution "© OpenStreetMap contributors").
 *
 * Source (census docs/data-sources/censimento-fonti.md § 3.4; design
 * normalizzazione-pipeline.md § 3.3):
 *   wiki https://wiki.openstreetmap.org/wiki/Key:surveillance
 *   Overpass https://overpass-api.de (public instances)
 *
 * Design decisions:
 * - Query: node+way ["man_made"="surveillance"]["surveillance"~"^(public|outdoor)$"]
 *   (task FASE B: surveillance=public; design § 3.3: exclude indoor — the
 *   regex covers both).
 * - RATE LIMIT etiquette (§ 7.6 + census § 3.4): the Italy bbox is split into
 *   a grid of chunks (default 4×3 = 12); one query per chunk with
 *   overpass_sleep_ms between requests, retry/backoff on 429/504, timeout per
 *   query from the descriptor, and a fallback instance list.
 * - Tag mapping (design § 3.3/3.4 + task spec):
 *     camera:type         → kind     (dome→Fixed dome, fixed→Bullet,
 *                                      panning→PTZ)
 *     surveillance:type   → kind override (alpr→Traffic reader; guard→skip)
 *     camera:direction    → direction (degrees or compass word)
 *     operator            → notes "Operatore: <entità>" ONLY when it looks
 *                                      like a public entity — never a person
 *                                      (§ 7.6 no-PII)
 *     addr:street/housenumber/city → address
 * - external_id = "osm:<type>/<id>" (e.g. "osm:node/672557313").
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  cleanText, fetchWithRetry, mapKind, parseCoord, parseDirection, sleep,
} from "./lib.mjs";

export const slug = "osm-surveillance-italia-2026";

const DESCRIPTOR_PATH = fileURLToPath(new URL("../../../docs/data-sources/imports/osm-surveillance-italia-2026.json", import.meta.url));

/** Italy bbox (lon min, lat min, lon max, lat max) — covers mainland + islands. */
export const ITALY_BBOX = [6.5, 35.4, 19.0, 47.2];

export function getDescriptor() {
  return JSON.parse(readFileSync(DESCRIPTOR_PATH, "utf8"));
}

/**
 * Split a bbox into an nx×ny grid of chunk bboxes (S,W,E,N order for Overpass
 * is (south, west, north, east); we return [s, w, n, e]).
 */
export function chunkBbox(bbox, nx, ny) {
  const [w, s, e, n] = bbox;
  const dLon = (e - w) / nx;
  const dLat = (n - s) / ny;
  const chunks = [];
  for (let iy = 0; iy < ny; iy += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      chunks.push([
        s + iy * dLat,
        w + ix * dLon,
        s + (iy + 1) * dLat,
        w + (ix + 1) * dLon,
      ]);
    }
  }
  return chunks;
}

/** Build the Overpass QL query for one bbox chunk (intersected with the
 *  Italy admin area, so only elements inside the real border are returned). */
export function buildQuery(bbox, { timeout = 120, surveillanceValues = ["public", "outdoor"], areaSet = "it" } = {}) {
  const [s, w, n, e] = bbox.map((v) => v.toFixed(4));
  const valueRe = surveillanceValues.join("|");
  const area = areaSet ? `(area.${areaSet})` : "";
  return [
    "[out:json][timeout:" + timeout + "];",
    `area["ISO3166-1"="IT"][admin_level=2]->.${areaSet};`,
    "(",
    `node["man_made"="surveillance"]["surveillance"~"^(${valueRe})$"]${area}(${s},${w},${n},${e});`,
    `way["man_made"="surveillance"]["surveillance"~"^(${valueRe})$"]${area}(${s},${w},${n},${e});`,
    ");",
    "out center;",
  ].join("\n");
}

/**
 * Run one chunk query against the first instance that answers. Returns the
 * parsed JSON body. Retries 429/504 with backoff (fetchWithRetry) and moves
 * to the next instance after repeated failures.
 */
export async function runChunkQuery(query, { instances, timeoutMs = 120000, attemptsPerInstance = 2 } = {}) {
  let lastError;
  for (const instance of instances) {
    try {
      const res = await fetchWithRetry(instance, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeoutMs,
        retries: attemptsPerInstance,
      });
      const body = await res.json();
      if (body?.remark && !body.elements) {
        throw new Error(`Overpass remark: ${body.remark}`);
      }
      return body;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("all Overpass instances failed");
}

/**
 * Fetch the whole dataset: chunked queries over the Italy bbox with throttle
 * between chunks. Returns { elements, checksum } (checksum over the raw
 * response bodies, § 7.6).
 */
export async function fetchPayload({ onChunk } = {}) {
  const descriptor = getDescriptor();
  const instances = descriptor.overpass_instances;
  const nx = 4;
  const ny = 3;
  const chunks = chunkBbox(ITALY_BBOX, nx, ny);
  const elements = [];
  const seen = new Set();
  const hasher = createHash("sha256");
  const timeout = descriptor.overpass_timeout ?? 120;
  const sleepMs = descriptor.overpass_sleep_ms ?? 3000;

  for (let idx = 0; idx < chunks.length; idx += 1) {
    const query = buildQuery(chunks[idx], { timeout });
    const body = await runChunkQuery(query, { instances, timeoutMs: (timeout + 15) * 1000 });
    hasher.update(query);
    hasher.update(JSON.stringify(body));
    let chunkCount = 0;
    for (const el of body.elements ?? []) {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) continue; // chunk overlap safety
      seen.add(key);
      elements.push(el);
      chunkCount += 1;
    }
    if (onChunk) onChunk({ idx: idx + 1, total: chunks.length, elements: chunkCount, sleepMs });
    if (idx < chunks.length - 1) await sleep(sleepMs);
  }

  return { elements, checksum: hasher.digest("hex") };
}

/** Heuristic: does the operator value look like a public entity (not a person)? */
const ENTITY_HINTS =
  /\b(comune|comuni|city|cities|municipal|municipality|town|borough|polizia|police|politie|polizei|carabinieri|vigili|guardia|guardie|stadt|gemeinde|kanton|regione|region|provincia|province|county|council|ministero|minister|ministerio|ministero|ufficio|uffici|servizio|servizi|amministraz|amt|departement|consorzio|autorit|agency|agenzia|azienda|societ|ente|enti|comunit|unione|landes|district|departement|sezione|protezione|civile|metropolitana|comunale|municipale)\b/i;

export function looksLikeEntityOperator(value) {
  if (!value) return false;
  const text = String(value).trim();
  if (!text) return false;
  // All-caps acronym (EWZ, ATAC, …) → entity.
  if (/^[A-ZÀ-Ž][A-ZÀ-Ž0-9&.\- ]{2,}$/.test(text)) return true;
  // Keyword match → entity.
  if (ENTITY_HINTS.test(text)) return true;
  // Two+ words with no person pattern → treat as entity only when a digit or
  // a legal-form suffix is present (GmbH, SpA, Srl, AG, SA, e.V., …).
  if (/\b(GmbH|SpA|Srl|AG|SA|e\.V|EV|Ltd|Limited|SARL|SL|S\.A\.)\b/i.test(text)) return true;
  if (/\d/.test(text)) return true;
  return false;
}

/**
 * Parse Overpass elements into canonical staged rows.
 * Returns { staged, skipped, checksum } with per-reason skip counters.
 */
export function parsePayload({ elements } = {}) {
  const descriptor = getDescriptor();
  const kindMap = descriptor.kind_map ?? {};
  const surveillanceTypeMap = descriptor.surveillance_type_map ?? {};
  const externalPrefix = descriptor.external_id_prefix ?? "";
  const staged = [];
  const skipped = { total: 0, reasons: {} };

  const recordSkip = (reason) => {
    skipped.total += 1;
    skipped.reasons[reason] = (skipped.reasons[reason] ?? 0) + 1;
  };

  for (const el of elements ?? []) {
    const tags = el.tags ?? {};

    // Hard filter (safety net on top of the query): indoor is out of scope,
    // and surveillance:type=guard is not a camera (design § 3.3).
    if (String(tags.surveillance ?? "").toLocaleLowerCase() === "indoor") {
      recordSkip("surveillance=indoor");
      continue;
    }
    if (String(tags["surveillance:type"] ?? "").toLocaleLowerCase() === "guard") {
      recordSkip("surveillance:type=guard");
      continue;
    }

    // Coordinates: nodes carry lat/lon; ways come with `center` (out center).
    let lat = parseCoord(el.lat);
    let lon = parseCoord(el.lon);
    if (!Number.isFinite(lat) && el.center) {
      lat = parseCoord(el.center.lat);
      lon = parseCoord(el.center.lon);
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      recordSkip("no coordinates");
      continue;
    }

    // external_id: osm:node/12345 (design § 3.3).
    const externalId = `${externalPrefix}${el.type}/${el.id}`;

    // Kind: camera:type map, overridden by surveillance:type (ALPR).
    let kindResult = mapKind(tags["camera:type"], kindMap);
    const survType = String(tags["surveillance:type"] ?? "").toLocaleLowerCase();
    if (survType === "alpr") {
      kindResult = { kind: surveillanceTypeMap.alpr ?? "Traffic / licence plate reader", mapped: true };
    }

    // Direction: numeric degrees or compass word; dome → NULL (invariant).
    let direction = parseDirection(tags["camera:direction"]);
    if (kindResult.kind === "Fixed dome") direction = null;

    // Title (§ 7.2): name → operator+surveillance camera → street → generic.
    let title = cleanText(tags.name, 90);
    if (!title) {
      const operator = cleanText(tags.operator, 90);
      if (operator && looksLikeEntityOperator(operator)) {
        title = `${operator} surveillance camera`.slice(0, 90);
      } else {
        const street = cleanText(tags["addr:street"], 60);
        const number = cleanText(tags["addr:housenumber"], 10);
        if (street) {
          title = `Surveillance camera, ${street}${number ? ` ${number}` : ""}`.slice(0, 90);
        } else {
          title = "Surveillance camera";
        }
      }
    }

    // Address: addr:street + housenumber + city.
    const street = cleanText(tags["addr:street"], 100);
    const number = cleanText(tags["addr:housenumber"], 10);
    const city = cleanText(tags["addr:city"], 60);
    let address = null;
    if (street) {
      address = `${street}${number ? ` ${number}` : ""}${city ? `, ${city}` : ""}`.slice(0, 180);
    } else if (city) {
      address = city;
    }

    // Notes: operator only when it is a public entity (never a person, § 7.6).
    let notes = null;
    const operator = cleanText(tags.operator, 200);
    if (operator && looksLikeEntityOperator(operator)) {
      notes = `Operatore: ${operator}`.slice(0, 200);
    }

    staged.push({
      title,
      kind: kindResult.kind,
      latitude: Number(lat),
      longitude: Number(lon),
      direction,
      address,
      notes,
      description: null,
      external_id: externalId,
    });
  }

  return { staged, skipped, checksum: null };
}
