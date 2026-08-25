/**
 * OSM country adapter factory (CEO 2026-08-07, state-by-state scan):
 * parameterises the proven Italia adapter (osm-surveillance-italia-2026)
 * for any country. Country adapters are one-liners on top of this:
 *
 *   createOsmCountryAdapter({
 *     slug: "osm-surveillance-austria-2026",
 *     iso3166: "AT",
 *     bbox: [9.5, 46.3, 17.2, 49.1],          // [w, s, e, n]
 *     descriptorPath: fileURLToPath(new URL("../../../docs/data-sources/imports/osm-surveillance-austria-2026.json", import.meta.url)),
 *     grid: { nx: 3, ny: 2 },                 // chunk grid for rate-limit etiquette
 *   })
 *
 * Behaviour is identical to the Italia adapter: chunked Overpass queries
 * with sleep/retry/fallback instances, the same tag mapping
 * (camera:type→kind, surveillance:type=alpr→Traffic reader, guard→skip,
 * camera:direction→direction, operator→notes only for public entities,
 * addr:*→address), external_id "osm:<type>/<id>" and the same hard
 * filters (surveillance=indoor, surveillance:type=guard skipped).
 *
 * Local-file mode: pass `localSourcePath` (path to a JSON file shaped
 * {elements: [{type,id,lat,lon,tags} | {type,id,center:{lat,lon},tags}]},
 * e.g. a Geofabrik PBF filtered extract). When set, fetchPayload ignores
 * Overpass entirely and reads the file (JSON.parse + sha256 checksum of
 * the file content); bbox/grid stay unused in this mode.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  cleanText, fetchWithRetry, mapKind, parseCoord, parseDirection, sleep,
} from "./lib.mjs";

export function createOsmCountryAdapter({
  slug,
  iso3166,
  bbox,
  descriptorPath,
  grid = { nx: 3, ny: 2 },
  localSourcePath = null,
}) {
  function getDescriptor() {
    return JSON.parse(readFileSync(descriptorPath, "utf8"));
  }

  /** Split bbox into an nx×ny grid of chunks ([s, w, n, e]). */
  function chunkBbox() {
    const [w, s, e, n] = bbox;
    const dLon = (e - w) / grid.nx;
    const dLat = (n - s) / grid.ny;
    const chunks = [];
    for (let iy = 0; iy < grid.ny; iy += 1) {
      for (let ix = 0; ix < grid.nx; ix += 1) {
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

  /** Build the Overpass QL query for one chunk (intersected with the country admin area). */
  function buildQuery(chunk, { timeout = 120 } = {}) {
    const [s, w, n, e] = chunk.map((v) => v.toFixed(4));
    const area = `area.${iso3166.toLowerCase()}`;
    return [
      `[out:json][timeout:${timeout}];`,
      `area["ISO3166-1"="${iso3166}"][admin_level=2]->.${iso3166.toLowerCase()};`,
      "(",
      `node["man_made"="surveillance"]["surveillance"~"^(public|outdoor)$"](${area})(${s},${w},${n},${e});`,
      `way["man_made"="surveillance"]["surveillance"~"^(public|outdoor)$"](${area})(${s},${w},${n},${e});`,
      ");",
      "out center;",
    ].join("\n");
  }

  /** Run one chunk query against the first instance that answers. */
  async function runChunkQuery(query, { instances, timeoutMs = 75000, attemptsPerInstance = 1 } = {}) {
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
   * Fetch the whole dataset. In local-file mode (localSourcePath set) reads
   * the JSON extract from disk and returns {elements, checksum} without any
   * network; otherwise the chunked Overpass path below.
   */
  async function fetchPayload({ onChunk } = {}) {
    if (localSourcePath) {
      let raw;
      try {
        raw = readFileSync(localSourcePath, "utf8");
      } catch (err) {
        throw new Error(
          `[${slug}] local OSM source file missing or unreadable: ${localSourcePath} (${err.code ?? err.message})`,
          { cause: err },
        );
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        throw new Error(
          `[${slug}] local OSM source file is not valid JSON: ${localSourcePath} (${err.message})`,
          { cause: err },
        );
      }
      const elements = parsed.elements ?? [];
      const checksum = createHash("sha256").update(raw).digest("hex");
      return { elements, checksum };
    }

    const descriptor = getDescriptor();
    const instances = descriptor.overpass_instances;
    const chunks = chunkBbox();
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
    /\b(comune|comuni|city|cities|municipal|municipality|town|borough|polizia|police|politie|polizei|carabinieri|vigili|guardia|guardie|stadt|gemeinde|kanton|kantons|regione|region|provincia|province|county|council|ministero|minister|ministerio|ufficio|uffici|servizio|servizi|amministraz|amt|departement|consorzio|autorit|agency|agenzia|azienda|societ|ente|enti|comunit|unione|landes|landkreis|district|departement|sezione|protezione|civile|metropolitana|comunale|municipale)\b/i;

  function looksLikeEntityOperator(value) {
    if (!value) return false;
    const text = String(value).trim();
    if (!text) return false;
    if (/^[A-ZÀ-Ž][A-ZÀ-Ž0-9&.\- ]{2,}$/.test(text)) return true;
    if (ENTITY_HINTS.test(text)) return true;
    if (/\b(GmbH|SpA|Srl|AG|SA|e\.V|EV|Ltd|Limited|SARL|SL|S\.A\.|KG|OHG|UG)\b/i.test(text)) return true;
    if (/\d/.test(text)) return true;
    return false;
  }

  /** Parse Overpass elements into canonical staged rows. */
  function parsePayload({ elements } = {}) {
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

      // Hard filter (safety net on top of the query).
      if (String(tags.surveillance ?? "").toLocaleLowerCase() === "indoor") {
        recordSkip("surveillance=indoor");
        continue;
      }
      if (String(tags["surveillance:type"] ?? "").toLocaleLowerCase() === "guard") {
        recordSkip("surveillance:type=guard");
        continue;
      }

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

      const externalId = `${externalPrefix}${el.type}/${el.id}`;

      let kindResult = mapKind(tags["camera:type"], kindMap);
      const survType = String(tags["surveillance:type"] ?? "").toLocaleLowerCase();
      if (survType === "alpr") {
        kindResult = { kind: surveillanceTypeMap.alpr ?? "Traffic / licence plate reader", mapped: true };
      }

      let direction = parseDirection(tags["camera:direction"]);
      if (kindResult.kind === "Fixed dome") direction = null;

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

      const street = cleanText(tags["addr:street"], 100);
      const number = cleanText(tags["addr:housenumber"], 10);
      const city = cleanText(tags["addr:city"], 60);
      let address = null;
      if (street) {
        address = `${street}${number ? ` ${number}` : ""}${city ? `, ${city}` : ""}`.slice(0, 180);
      } else if (city) {
        address = city;
      }

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

  return { slug, getDescriptor, fetchPayload, parsePayload, chunkBbox, buildQuery };
}
