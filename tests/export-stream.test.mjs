// Streamed full-dataset exports (Workers OOM, 2026-11).
//
// Production logged `exceededMemory` (128 MB isolate limit) on
// GET /api/cameras?format=csv: both full exports read EVERY public row with
// one unbounded listPublicCameras() SELECT (~273k records) and built the
// whole body in memory. The route now walks listPublicCameras in keyset
// pages (`id < lastId ORDER BY id DESC LIMIT PUBLIC_CAMERAS_EXPORT_PAGE_SIZE`)
// and streams each page out.
//
// Contract pinned here:
//   1. a multi-page export (more rows than one page, a short last page, an
//      exact multiple of the page size, zero rows) produces EXACTLY the bytes
//      of the former in-memory implementation, frozen below as the reference;
//   2. the walk is keyset-paged: bounded limit, `beforeId` = last id of the
//      previous page, one pinned `now` for every page, filters unchanged;
//   3. the body is really streamed: pages are fetched as the reader pulls,
//      not all up front;
//   4. a first-page failure still answers 503; a later failure errors the
//      stream instead of serving a silently truncated 200 body;
//   5. the real SQL keyset walk returns exactly the unbounded list.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import { DATA_LICENSE_ID, DATA_LICENSE_NOTICE } from "../app/lib/data-license.ts";

const PAGE_SIZE = 1000; // mirror of PUBLIC_CAMERAS_EXPORT_PAGE_SIZE (db/cameras.ts)

beforeEach(() => resetMockState());
after(async () => {
  await cleanupRouteTree();
  await cleanupDbRuntime();
});

const camerasRoute = () => loadRoute("app/api/cameras/route.mjs");

// ---------------------------------------------------------------------------
// Reference: the in-memory export bodies exactly as app/api/cameras/route.ts
// built them before streaming (verbatim copy, do not "fix" — it is the
// byte-compatibility oracle).
// ---------------------------------------------------------------------------

function referenceCsvCell(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? `"${String(value)}"` : '""';
  }
  const text = value == null ? "" : String(value);
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function referenceCsv(records) {
  const header = ["id", "title", "kind", "manufacturer", "observed_on", "status", "source", "updated", "description", "address", "latitude", "longitude", "direction"];
  const rows = records.map((record) => [record.id, record.title, record.kind, record.manufacturer, record.observedOn, record.status, record.source, record.updated, record.description, record.address, record.latitude, record.longitude, record.direction].map(referenceCsvCell).join(","));
  return `${header.join(",")}\n${rows.join("\n")}\n# ${DATA_LICENSE_NOTICE}\n`;
}

function referenceGeoJsonResponse(records) {
  return Response.json({ type: "FeatureCollection", license: DATA_LICENSE_ID, attribution: DATA_LICENSE_NOTICE, features: records.map((record) => ({ type: "Feature", geometry: { type: "Point", coordinates: [record.longitude, record.latitude] }, properties: { id: record.id, title: record.title, kind: record.kind, manufacturer: record.manufacturer, observedOn: record.observedOn, status: record.status, source: record.source, updated: record.updated, description: record.description, direction: record.direction } })) });
}

// ---------------------------------------------------------------------------
// Fixtures: newest-first rows (the order listPublicCameras returns) with
// gaps in the ids and every value class the CSV escaping and JSON encoding
// care about.
// ---------------------------------------------------------------------------

const TEXTS = [
  "Plain title",
  "=SUM(A1:A2)",
  "+plus",
  "-minus",
  "@at",
  "\tTab-led",
  "\rCR-led",
  'He said "hi", ok',
  "comma, inside",
  "line\nbreak",
  "Café — ü 中文 🎥",
  "",
  null,
];

function fixtureRows(count) {
  const rows = [];
  let id = count * 3 + 17;
  for (let index = 0; index < count; index += 1) {
    const text = (offset) => TEXTS[(index + offset) % TEXTS.length];
    const row = {
      id,
      title: text(0) ?? `Camera ${index}`,
      kind: index % 5 === 0 ? "Fixed dome" : "PTZ",
      manufacturer: text(1),
      observedOn: index % 4 === 0 ? null : "2026-01-01",
      publishManufacturer: 1,
      publishObservedOn: 1,
      address: text(2),
      latitude: index % 2 === 0 ? -33.8688 : 41.9004,
      longitude: index % 3 === 0 ? -73.98 : 12.4936,
      direction: index % 5 === 0 ? null : (index * 37) % 360,
      status: "active",
      source: index % 7 === 0 ? "import:osm" : "Community report",
      updated: "2026-01-15T09:30:00.000Z",
      description: text(3) ?? "",
      lastVerifiedAt: null,
      reviewDueAt: null,
      reviewIntervalMonths: 12,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    // A row without the key at all: JSON.stringify must drop it the same
    // way in both implementations.
    if (index === 3) delete row.direction;
    rows.push(row);
    id -= 1 + (index % 3); // gaps: keyset paging must not assume dense ids
  }
  return rows;
}

// A listPublicCameras stub that honours the keyset page request like the db.
function pagedListStub(rows) {
  return async (_filters, options = {}) => {
    let out = rows;
    if (options.beforeId !== undefined) out = out.filter((row) => row.id < options.beforeId);
    return options.limit === undefined ? out : out.slice(0, options.limit);
  };
}

const bytes = async (response) => Buffer.from(await response.arrayBuffer());

for (const count of [2 * PAGE_SIZE + 37, 2 * PAGE_SIZE, 1, 0]) {
  test(`CSV export of ${count} rows is byte-identical to the former in-memory body`, async () => {
    const rows = fixtureRows(count);
    stub("listPublicCameras", pagedListStub(rows));
    const { GET } = await camerasRoute();
    const response = await GET(apiRequest("/api/cameras?format=csv"));
    assert.equal(response.status, 200);
    const actual = await bytes(response);
    const expected = Buffer.from(referenceCsv(rows), "utf8");
    assert.equal(actual.toString("utf8"), expected.toString("utf8"));
    assert.ok(actual.equals(expected), "the streamed CSV bytes must equal the in-memory reference");
    // ceil(count / page) pages, plus one empty page when count is an exact
    // multiple of the page size (a full page may have a successor).
    assert.equal(callArgs("listPublicCameras").length, Math.floor(count / PAGE_SIZE) + 1);
  });

  test(`GeoJSON export of ${count} rows is byte-identical to the former in-memory body`, async () => {
    const rows = fixtureRows(count);
    stub("listPublicCameras", pagedListStub(rows));
    const { GET } = await camerasRoute();
    const response = await GET(apiRequest("/api/cameras?format=geojson"));
    assert.equal(response.status, 200);
    const reference = referenceGeoJsonResponse(rows);
    assert.equal(response.headers.get("content-type"), reference.headers.get("content-type"), "same Content-Type as Response.json");
    const actual = await bytes(response);
    const expected = await bytes(reference);
    assert.equal(actual.toString("utf8"), expected.toString("utf8"));
    assert.ok(actual.equals(expected), "the streamed GeoJSON bytes must equal the in-memory reference");
    assert.equal(callArgs("listPublicCameras").length, Math.floor(count / PAGE_SIZE) + 1);
  });
}

test("the export walk is keyset-paged with bounded pages, one pinned `now` and unchanged filters", async () => {
  const rows = fixtureRows(2 * PAGE_SIZE + 37);
  stub("listPublicCameras", pagedListStub(rows));
  const { GET } = await camerasRoute();
  await bytes(await GET(apiRequest("/api/cameras?format=csv&kind=PTZ&freshness=90d&limit=abc")));

  const calls = callArgs("listPublicCameras");
  assert.equal(calls.length, 3);
  const nows = new Set(calls.map(([, options]) => options.now));
  assert.equal(nows.size, 1, "every page shares one review-window/freshness boundary");
  for (const [filters, options] of calls) {
    assert.deepEqual(filters, { kind: "PTZ", freshness: "90d" }, "the export filters are unchanged");
    assert.equal(options.limit, PAGE_SIZE, "no export call may be unbounded");
  }
  assert.equal(calls[0][1].beforeId, undefined, "page 1 starts at the newest id");
  assert.equal(calls[1][1].beforeId, rows[PAGE_SIZE - 1].id, "page 2 continues after page 1's last id");
  assert.equal(calls[2][1].beforeId, rows[2 * PAGE_SIZE - 1].id, "page 3 continues after page 2's last id");
});

test("both exports keep their download, cache and purge headers", async () => {
  stub("listPublicCameras", pagedListStub(fixtureRows(3)));
  const { GET } = await camerasRoute();
  const csv = await GET(apiRequest("/api/cameras?format=csv"));
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(csv.headers.get("content-disposition"), "attachment; filename=opensurveillancedb-cameras.csv");
  assert.equal(csv.headers.get("cache-control"), "public, s-maxage=86400");
  assert.equal(csv.headers.get("cache-tag"), "cameras-export");
  const geojson = await GET(apiRequest("/api/cameras?format=geojson"));
  assert.equal(geojson.headers.get("content-type"), "application/json");
  assert.equal(geojson.headers.get("content-disposition"), "attachment; filename=opensurveillancedb-cameras.geojson");
  assert.equal(geojson.headers.get("cache-control"), "public, s-maxage=86400");
  assert.equal(geojson.headers.get("cache-tag"), "cameras-export");
});

test("the export body is streamed: later pages are fetched only as the reader pulls", async () => {
  stub("listPublicCameras", pagedListStub(fixtureRows(4 * PAGE_SIZE + 1)));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?format=csv"));
  assert.equal(callArgs("listPublicCameras").length, 1, "only the first page is read before the Response is returned");

  const reader = response.body.getReader();
  let chunks = 0;
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
    chunks += 1;
    assert.ok(
      callArgs("listPublicCameras").length <= chunks + 1,
      `at most one page ahead of the reader (read ${chunks} chunks, fetched ${callArgs("listPublicCameras").length} pages)`,
    );
  }
  assert.equal(chunks, 5, "one chunk per page");
  assert.equal(callArgs("listPublicCameras").length, 5);
});

test("a database failure on the first page still answers 503 (no half-open stream)", async () => {
  stub("listPublicCameras", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?format=geojson"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Database unavailable" });
});

test("a database failure on a later page errors the stream instead of truncating silently", async () => {
  const rows = fixtureRows(PAGE_SIZE + 5);
  const list = pagedListStub(rows);
  stub("listPublicCameras", async (filters, options) => {
    if (options?.beforeId !== undefined) throw new Error("D1 went away");
    return list(filters, options);
  });
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?format=csv"));
  assert.equal(response.status, 200, "the headers were already committed with page 1");
  await assert.rejects(response.text(), /D1 went away/, "the client must see a failed transfer, never a complete-looking file");
});

// ---------------------------------------------------------------------------
// Real SQL: the keyset walk over the actual query returns exactly the rows
// (and order) of the unbounded list it replaces.
// ---------------------------------------------------------------------------

test("real SQL: walking listPublicCameras by keyset pages equals the unbounded list", async () => {
  const runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  delete runtime.env.ENVIRONMENT;
  const { cameras } = runtime;

  const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
  for (let index = 0; index < 23; index += 1) {
    const { id } = await cameras.createPendingCamera({
      title: `Keyset camera ${index}`,
      kind: index % 3 === 0 ? "Fixed dome" : "PTZ",
      manufacturer: null,
      observedOn: null,
      address: `Via ${index}`,
      notes: "",
      latitude: 41.9 + index / 1000,
      longitude: 12.49 + index / 1000,
    });
    // A mix of public, non-public and freshness states; a few deletions
    // leave id gaps.
    const status = index % 4 === 3 ? "pending" : "active";
    await db.prepare("UPDATE cameras SET status = ?, last_verified_at = ? WHERE id = ?").bind(status, index % 2 === 0 ? recent : old, id).run();
    if (index % 6 === 5) await db.prepare("DELETE FROM cameras WHERE id = ?").bind(id).run();
  }

  const now = new Date().toISOString();
  for (const filters of [{}, { kind: "PTZ" }, { freshness: "30d" }, { kind: "Fixed dome", freshness: "30d" }]) {
    const full = await cameras.listPublicCameras(filters, { now });
    const walked = [];
    let beforeId;
    for (;;) {
      const page = await cameras.listPublicCameras(filters, { now, limit: 4, ...(beforeId === undefined ? {} : { beforeId }) });
      assert.ok(page.length <= 4, "a page never exceeds its limit");
      walked.push(...page);
      if (page.length < 4) break;
      beforeId = page[page.length - 1].id;
    }
    assert.ok(full.length > 0, `the fixture has public rows for ${JSON.stringify(filters)}`);
    assert.deepEqual(walked, full, `keyset walk == unbounded list for ${JSON.stringify(filters)}`);
  }

  // The db boundary clamps an oversized page to the export page size.
  const clamped = await cameras.listPublicCameras({}, { now, limit: 1_000_000 });
  assert.ok(clamped.length <= cameras.PUBLIC_CAMERAS_EXPORT_PAGE_SIZE);
  assert.equal(cameras.PUBLIC_CAMERAS_EXPORT_PAGE_SIZE, PAGE_SIZE, "the route mock mirrors the real page size");
});
