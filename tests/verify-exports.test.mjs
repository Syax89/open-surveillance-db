// Post-deploy export check (scripts/verify-exports.mjs, Workers OOM 2026-11):
// after a deploy both full exports must answer 200 with the COMPLETE public
// dataset. The script is exercised here against the real GET handler (paged
// db stub, more rows than one keyset page), and its completeness checks are
// pinned on truncated / duplicated / mismatched bodies.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { cleanupRouteTree, loadRoute } from "./helpers/api-harness.mjs";
import { resetMockState, stub } from "./helpers/mock-state.mjs";
import { checkCsvExport, checkGeoJsonExport, parseCsvRecords, verifyExports } from "../scripts/verify-exports.mjs";

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

function rows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: count * 2 - index * 2,
    title: index % 3 === 0 ? 'Quote "q", comma' : index % 3 === 1 ? "line\nbreak" : "=formula",
    kind: "PTZ",
    manufacturer: null,
    observedOn: "2026-01-01",
    publishManufacturer: 1,
    publishObservedOn: 1,
    address: index % 2 ? "-5 Main St" : null,
    latitude: -33.8688,
    longitude: 12.4936,
    direction: index % 4 ? 90 : null,
    status: "active",
    source: "Community report",
    updated: "2026-01-15T09:30:00.000Z",
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
  }));
}

async function routeFetch(dataset, { total = dataset.length } = {}) {
  stub("listPublicCameras", async (_filters, options = {}) => {
    let out = dataset;
    if (options.beforeId !== undefined) out = out.filter((row) => row.id < options.beforeId);
    return out.slice(0, options.limit);
  });
  stub("listPublicCamerasPage", async () => ({ records: dataset.slice(0, 1), total, nextOffset: null }));
  const { GET } = await loadRoute("app/api/cameras/route.mjs");
  return (url) => GET(new Request(url));
}

const quiet = { log: () => {}, attempts: 1, retryMs: 0 };

test("verifyExports passes when both streamed exports carry the complete multi-page dataset", async () => {
  const dataset = rows(2345);
  const result = await verifyExports("https://osdb.test", { ...quiet, fetch: await routeFetch(dataset) });
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.counts, { csv: 2345, geojson: 2345 });
});

test("verifyExports passes on an empty dataset", async () => {
  const result = await verifyExports("https://osdb.test", { ...quiet, fetch: await routeFetch([]) });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.counts, { csv: 0, geojson: 0 });
});

test("verifyExports fails when the exports hold fewer records than the public total", async () => {
  const result = await verifyExports("https://osdb.test", { ...quiet, fetch: await routeFetch(rows(10), { total: 11 }) });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => /CSV: 10 records, but the public list reports 11/.test(problem)));
  assert.ok(result.problems.some((problem) => /GEOJSON: 10 records, but the public list reports 11/.test(problem)));
});

test("verifyExports fails on a non-200 export and on a stream that breaks mid-body", async () => {
  const fetch503 = async (url) => (url.includes("format=csv") ? Response.json({ error: "Database unavailable" }, { status: 503 }) : (await routeFetch(rows(3)))(url));
  const failed = await verifyExports("https://osdb.test", { ...quiet, fetch: fetch503 });
  assert.ok(failed.problems.includes("CSV: HTTP 503, expected 200"));

  const broken = async (url) => {
    if (!url.includes("format=geojson")) return (await routeFetch(rows(3)))(url);
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"type":"FeatureCollection","features":['));
        controller.error(new Error("D1 went away"));
      },
    });
    return new Response(body, { headers: { "content-type": "application/json" } });
  };
  await assert.rejects(verifyExports("https://osdb.test", { ...quiet, fetch: broken }), /D1 went away/);
});

test("every request bypasses the worker cache with a verify stamp", async () => {
  const seen = [];
  const inner = await routeFetch(rows(2));
  await verifyExports("https://osdb.test/", { ...quiet, stamp: 42, fetch: (url) => (seen.push(url), inner(url)) });
  assert.deepEqual(seen, [
    "https://osdb.test/api/cameras?limit=1&verify=42",
    "https://osdb.test/api/cameras?format=csv&verify=42",
    "https://osdb.test/api/cameras?format=geojson&verify=42",
  ]);
});

test("checkCsvExport flags a body cut before the ODbL footer, duplicates and broken records", async () => {
  const fetch = await routeFetch(rows(5));
  const csv = await (await fetch("https://osdb.test/api/cameras?format=csv")).text();
  assert.deepEqual(checkCsvExport(csv).problems, []);
  assert.equal(checkCsvExport(csv).ids.length, 5);

  assert.match(checkCsvExport(csv.slice(0, csv.length - 40)).problems.join(), /ODbL footer/);
  const lines = csv.split("\n");
  const duplicated = [lines[0], lines[1], lines[1], ...lines.slice(2)].join("\n");
  assert.match(checkCsvExport(duplicated).problems.join(), /duplicate id/);
  assert.match(checkCsvExport(csv.replace('"10",', '"10","extra",')).problems.join(), /fields, expected 13/);
});

test("checkGeoJsonExport flags truncated JSON, missing licence and duplicates", async () => {
  const fetch = await routeFetch(rows(5));
  const geojson = await (await fetch("https://osdb.test/api/cameras?format=geojson")).text();
  assert.deepEqual(checkGeoJsonExport(geojson).problems, []);
  assert.match(checkGeoJsonExport(geojson.slice(0, -10)).problems.join(), /not valid JSON/);
  const parsed = JSON.parse(geojson);
  assert.match(checkGeoJsonExport(JSON.stringify({ ...parsed, license: undefined })).problems.join(), /license/);
  assert.match(checkGeoJsonExport(JSON.stringify({ ...parsed, features: [...parsed.features, parsed.features[0]] })).problems.join(), /duplicate id/);
});

test("parseCsvRecords handles quoted commas, doubled quotes and newlines", () => {
  assert.deepEqual(parseCsvRecords('"1","a,b","say ""hi""","x\ny"\n"2","","",""\n'), [
    ["1", "a,b", 'say "hi"', "x\ny"],
    ["2", "", "", ""],
  ]);
  assert.throws(() => parseCsvRecords('"1","open\n'), /unterminated/);
});
