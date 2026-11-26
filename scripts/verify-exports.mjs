#!/usr/bin/env node
/**
 * Post-deploy check for the full-dataset exports (Workers OOM, 2026-11).
 *
 * GET /api/cameras?format=csv and ?format=geojson must both answer 200 with
 * the COMPLETE public dataset. They are streamed from keyset-paged D1 reads
 * (a single SELECT of the ~273k-row public set exceeds both the 128 MB
 * isolate limit and D1's 50 MB query-result cap), so a 200 status alone
 * proves little: a page that fails mid-stream cuts the body short after the
 * headers were sent. This script therefore reads each body to the end and
 * checks that it is whole:
 *
 *   - CSV: exact header line, every record parses (RFC 4180, quoted
 *     newlines included) with 13 fields and a unique numeric id, and the
 *     ODbL footer is the last line (a truncated stream never has it);
 *   - GeoJSON: parses as a FeatureCollection with the ODbL `license` /
 *     `attribution` members and one Point feature per unique id;
 *   - completeness: both row counts equal `total` from the public JSON list
 *     (same visibility predicate, no filters) and both exports carry the
 *     same id set.
 *
 * Every URL carries a `verify=<timestamp>` parameter (ignored by the route)
 * so the worker cache answers a MISS and the streamed code path really runs.
 *
 * Usage:
 *   node scripts/verify-exports.mjs [baseUrl]     # default https://opensurveillancedb.org
 *
 * Env:
 *   VERIFY_EXPORTS_ATTEMPTS    attempts per request on network errors, 5xx
 *                              and 429 (default 3)
 *   VERIFY_EXPORTS_RETRY_MS    wait between attempts (default 20000)
 *   VERIFY_EXPORTS_TIMEOUT_MS  per-request timeout (default 300000)
 *
 * Exit code 0 = both exports complete; 1 = any check failed.
 */
import { pathToFileURL } from "node:url";
import { DATA_LICENSE_ID, DATA_LICENSE_NOTICE } from "../app/lib/data-license.ts";

export const CSV_HEADER = "id,title,kind,manufacturer,observed_on,status,source,updated,description,address,latitude,longitude,direction";
const CSV_FIELDS = CSV_HEADER.split(",").length;
const CSV_FOOTER = `# ${DATA_LICENSE_NOTICE}`;

/** RFC 4180 record parser for the export's always-quoted cells. */
export function parseCsvRecords(text) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("unterminated quoted cell (body cut short?)");
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/** Checks one CSV export body; returns its ids and the problems found. */
export function checkCsvExport(text) {
  const problems = [];
  const ids = [];
  if (!text.startsWith(`${CSV_HEADER}\n`)) problems.push("CSV: the header line is missing or changed");
  if (!text.endsWith(`\n${CSV_FOOTER}\n`)) {
    problems.push("CSV: the ODbL footer is not the last line (truncated body?)");
    return { ids, problems };
  }
  const body = text.slice(CSV_HEADER.length + 1, text.length - CSV_FOOTER.length - 2);
  let records;
  try {
    records = body === "" ? [] : parseCsvRecords(`${body}\n`);
  } catch (error) {
    problems.push(`CSV: ${error.message}`);
    return { ids, problems };
  }
  const seen = new Set();
  records.forEach((record, index) => {
    if (record.length !== CSV_FIELDS) {
      problems.push(`CSV: record ${index + 1} has ${record.length} fields, expected ${CSV_FIELDS}`);
      return;
    }
    const id = Number(record[0]);
    if (!Number.isSafeInteger(id) || id <= 0) problems.push(`CSV: record ${index + 1} has a non-numeric id ${JSON.stringify(record[0])}`);
    else if (seen.has(id)) problems.push(`CSV: duplicate id ${id}`);
    else {
      seen.add(id);
      ids.push(id);
    }
  });
  return { ids, problems };
}

/** Checks one GeoJSON export body; returns its ids and the problems found. */
export function checkGeoJsonExport(text) {
  const problems = [];
  const ids = [];
  let collection;
  try {
    collection = JSON.parse(text);
  } catch (error) {
    problems.push(`GeoJSON: the body is not valid JSON (truncated?): ${error.message}`);
    return { ids, problems };
  }
  if (collection?.type !== "FeatureCollection") problems.push("GeoJSON: type is not FeatureCollection");
  if (collection?.license !== DATA_LICENSE_ID) problems.push(`GeoJSON: license is ${JSON.stringify(collection?.license)}, expected ${DATA_LICENSE_ID}`);
  if (collection?.attribution !== DATA_LICENSE_NOTICE) problems.push("GeoJSON: the ODbL attribution is missing or changed");
  if (!Array.isArray(collection?.features)) {
    problems.push("GeoJSON: features is not an array");
    return { ids, problems };
  }
  const seen = new Set();
  collection.features.forEach((feature, index) => {
    const id = feature?.properties?.id;
    const coordinates = feature?.geometry?.coordinates;
    if (feature?.type !== "Feature" || feature?.geometry?.type !== "Point" || !Array.isArray(coordinates) || coordinates.length !== 2) {
      problems.push(`GeoJSON: feature ${index + 1} is not a Point feature`);
    }
    if (!Number.isSafeInteger(id) || id <= 0) problems.push(`GeoJSON: feature ${index + 1} has a non-numeric id`);
    else if (seen.has(id)) problems.push(`GeoJSON: duplicate id ${id}`);
    else {
      seen.add(id);
      ids.push(id);
    }
  });
  return { ids, problems };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches `url` and reads the WHOLE body, retrying network errors, 5xx and
 * 429 (a deploy may still be propagating). A body that fails mid-stream
 * counts as a network error.
 */
async function fetchWhole(fetchImpl, url, { attempts, retryMs, timeoutMs, log }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "osdb-verify-exports" } });
      const text = await response.text();
      const result = { status: response.status, headers: response.headers, text, ms: Date.now() - started };
      if ((response.status >= 500 || response.status === 429) && attempt < attempts) {
        log(`  ${url}: HTTP ${response.status}, retrying in ${retryMs} ms (${attempt}/${attempts})`);
        await sleep(retryMs);
        continue;
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        log(`  ${url}: ${error.message}, retrying in ${retryMs} ms (${attempt}/${attempts})`);
        await sleep(retryMs);
      }
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? "request failed"}`);
}

export async function verifyExports(baseUrl, options = {}) {
  const {
    fetch: fetchImpl = globalThis.fetch,
    attempts = 3,
    retryMs = 20_000,
    timeoutMs = 300_000,
    log = console.log,
    stamp = Date.now(),
  } = options;
  const base = baseUrl.replace(/\/+$/, "");
  const request = (path) => fetchWhole(fetchImpl, `${base}${path}${path.includes("?") ? "&" : "?"}verify=${stamp}`, { attempts, retryMs, timeoutMs, log });
  const problems = [];

  const list = await request("/api/cameras?limit=1");
  let total = null;
  if (list.status !== 200) problems.push(`JSON list: HTTP ${list.status}, expected 200`);
  else {
    try {
      total = JSON.parse(list.text).total;
    } catch {
      // reported below
    }
    if (!Number.isSafeInteger(total)) problems.push("JSON list: no numeric `total` to compare the exports with");
  }
  log(`public total: ${total ?? "unknown"}`);

  const exports = {};
  for (const [format, check, contentType] of [
    ["csv", checkCsvExport, "text/csv; charset=utf-8"],
    ["geojson", checkGeoJsonExport, "application/json"],
  ]) {
    const response = await request(`/api/cameras?format=${format}`);
    const label = format.toUpperCase();
    const bytes = Buffer.byteLength(response.text);
    log(`${label}: HTTP ${response.status}, ${bytes} bytes in ${response.ms} ms, X-OSDB-Cache=${response.headers.get("x-osdb-cache") ?? "-"}`);
    if (response.status !== 200) {
      problems.push(`${label}: HTTP ${response.status}, expected 200`);
      continue;
    }
    if (response.headers.get("content-type") !== contentType) problems.push(`${label}: Content-Type is ${response.headers.get("content-type")}, expected ${contentType}`);
    const result = check(response.text);
    problems.push(...result.problems);
    exports[format] = result.ids;
    log(`${label}: ${result.ids.length} records`);
    if (total !== null && Number.isSafeInteger(total) && result.problems.length === 0 && result.ids.length !== total) {
      problems.push(`${label}: ${result.ids.length} records, but the public list reports ${total} (incomplete export, or the dataset changed during the check: re-run)`);
    }
  }

  if (exports.csv && exports.geojson) {
    const csvIds = new Set(exports.csv);
    const missing = exports.geojson.filter((id) => !csvIds.has(id));
    if (missing.length > 0 || exports.csv.length !== exports.geojson.length) {
      problems.push(`CSV and GeoJSON disagree: ${exports.csv.length} vs ${exports.geojson.length} records, ${missing.length} GeoJSON ids missing from the CSV`);
    }
  }

  return { ok: problems.length === 0, total, counts: { csv: exports.csv?.length ?? null, geojson: exports.geojson?.length ?? null }, problems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.argv[2] ?? "https://opensurveillancedb.org";
  const number = (name, fallback) => (process.env[name] ? Number(process.env[name]) : fallback);
  console.log(`Verifying full exports on ${baseUrl}`);
  try {
    const result = await verifyExports(baseUrl, {
      attempts: number("VERIFY_EXPORTS_ATTEMPTS", 3),
      retryMs: number("VERIFY_EXPORTS_RETRY_MS", 20_000),
      timeoutMs: number("VERIFY_EXPORTS_TIMEOUT_MS", 300_000),
    });
    if (result.ok) {
      console.log(`OK: both exports answered 200 with the complete dataset (${result.total} records).`);
    } else {
      for (const problem of result.problems) console.error(`FAIL: ${problem}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
