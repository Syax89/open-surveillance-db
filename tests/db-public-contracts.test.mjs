// H3 — Public API contract tests.
//
// Two layers:
//  1. DB-layer integration: the REAL db/cameras.ts, db/corrections.ts and
//     db/moderation.ts SQL runs against a fresh in-memory SQLite through the
//     D1 adapter (tests/helpers/d1-sqlite.mjs). These lock the public data
//     boundary documented in docs/DATA_DICTIONARY.md: only verified/demo
//     records, notes never selected, manufacturer/observedOn conditional on
//     their publish flags, fresh-DB schema from Drizzle migrations (no
//     runtime demo seed), nearby distance semantics.
//  2. Route-layer contract lock-downs that complement tests/api-cameras
//     (which stubs the db layer): full GeoJSON property set, CSV field set,
//     no version identifier on live exports (docs/EXPORT_VERSIONING.md:
//     versioned exports are a proposal, not current behaviour).

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
import { D1SqliteDatabase as D1 } from "./helpers/d1-sqlite.mjs";
import { applyDrizzleMigrations } from "./helpers/db-runtime-harness.mjs";
import { resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

// ---------------------------------------------------------------------------
// Real DB layer
// ---------------------------------------------------------------------------

let treeEnv = null;
let realCameras = null;
let realCorrections = null;
let realModeration = null;

async function realDb() {
  if (!realCameras) {
    ({ env: treeEnv } = await loadTreeModule("cloudflare-workers.mjs"));
    realCameras = await loadTreeModule("db-real/cameras.mjs");
    realCorrections = await loadTreeModule("db-real/corrections.mjs");
    realModeration = await loadTreeModule("db-real/moderation.mjs");
  }
  return { env: treeEnv, cameras: realCameras, corrections: realCorrections, moderation: realModeration };
}

// Fresh in-memory DB with the schema applied from the real Drizzle
// migrations. correction_requests / moderation_events start empty by
// construction on a fresh D1; the cameras table is wiped so each test
// controls its own fixture data.
async function resetDb({ env }) {
  env.DB = new D1();
  // H3: the schema comes from the real Drizzle migrations (fresh-DB contract);
  // getD1() is a pure binding passthrough and bootstraps nothing.
  await applyDrizzleMigrations(env.DB);
  await env.DB.prepare("DELETE FROM cameras").run();
}

const insertCameraColumns =
  "INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, status, source, updated, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, title, kind, manufacturer, observed_on AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, notes, latitude, longitude, status, source, updated, description, created_at AS createdAt";

async function insertCamera(env, overrides = {}) {
  const row = {
    title: "Contract camera",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    publishManufacturer: 0,
    publishObservedOn: 0,
    address: null,
    notes: "",
    latitude: 44.1,
    longitude: 12.2,
    status: "verified",
    source: "Community report",
    updated: "Test update",
    description: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  return env.DB.prepare(insertCameraColumns).bind(
    row.title,
    row.kind,
    row.manufacturer,
    row.observedOn,
    row.publishManufacturer,
    row.publishObservedOn,
    row.address,
    row.notes,
    row.latitude,
    row.longitude,
    row.status,
    row.source,
    row.updated,
    row.description,
    row.createdAt,
  ).first();
}

test("a fresh database starts empty: no demo records are seeded at runtime", async () => {
  const { env, cameras } = await realDb();
  env.DB = new D1();
  // H3: the schema comes from the real Drizzle migrations; a fresh DB starts
  // with zero records — demo records were previously seeded here at runtime.
  await applyDrizzleMigrations(env.DB);
  const records = await cameras.listPublicCameras();
  assert.equal(records.length, 0, "no demo records may be seeded at runtime (H3)");
});

test("the public camera query returns only verified and demo records", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  const statuses = ["pending", "needs_review", "rejected", "removed", "stale", "verified", "demo"];
  for (const status of statuses) {
    await insertCamera(env, { title: `Record ${status}`, status });
  }

  const records = await cameras.listPublicCameras();
  const returned = records.filter((record) => record.source === "Community report");
  assert.deepEqual(
    returned.map((record) => record.status).sort(),
    ["demo", "verified"],
    "pending/needs_review/rejected/removed/stale must never cross the public boundary",
  );
});

test("the public camera query never selects the private notes field", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  await insertCamera(env, { title: "Sensitive", status: "verified", notes: "INTAKE SECRET" });

  const [record] = await cameras.listPublicCameras();
  assert.equal(record.title, "Sensitive");
  assert.equal("notes" in record, false, "notes must be absent from public records");
  // The exact public field set is schema-driven: the freshness columns
  // (last_verified_at, review_due_at, review_interval_months) are part of
  // the public surface once the freshness feature is in the schema, and
  // absent before it (the PR head may predate it even when main has it).
  const tableInfo = await env.DB.prepare("PRAGMA table_info(cameras)").all();
  const hasFreshness = tableInfo.results.some((column) => column.name === "last_verified_at");
  const expectedKeys = [
    "address",
    "createdAt",
    "description",
    "id",
    "kind",
    ...(hasFreshness ? ["lastVerifiedAt"] : []),
    "latitude",
    "longitude",
    "manufacturer",
    "observedOn",
    "publishManufacturer",
    "publishObservedOn",
    ...(hasFreshness ? ["reviewDueAt", "reviewIntervalMonths"] : []),
    "source",
    "status",
    "title",
    "updated",
  ];
  assert.deepEqual(Object.keys(record).sort(), expectedKeys);
});

test("manufacturer and observedOn are conditional on their publish flags", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  await insertCamera(env, {
    title: "Private meta",
    manufacturer: "Acme Corp",
    observedOn: "2026-05-01",
    publishManufacturer: 0,
    publishObservedOn: 0,
  });
  await insertCamera(env, {
    title: "Public meta",
    manufacturer: "VendorCorp",
    observedOn: "2026-06-01",
    publishManufacturer: 1,
    publishObservedOn: 1,
  });

  const records = await cameras.listPublicCameras();
  const byTitle = Object.fromEntries(records.map((record) => [record.title, record]));
  assert.equal(byTitle["Private meta"].manufacturer, null, "manufacturer hidden until the moderator opts in");
  assert.equal(byTitle["Private meta"].observedOn, null, "observedOn hidden until the moderator opts in");
  assert.equal(byTitle["Public meta"].manufacturer, "VendorCorp");
  assert.equal(byTitle["Public meta"].observedOn, "2026-06-01");
});

test("the public camera list orders by id descending", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  const created = [];
  for (let index = 0; index < 3; index += 1) {
    created.push(await insertCamera(env, { title: `Ordered ${index}` }));
  }

  const records = (await cameras.listPublicCameras()).filter((record) => record.source === "Community report");
  assert.deepEqual(
    records.map((record) => record.id),
    [created[2].id, created[1].id, created[0].id],
  );
});

test("createPendingCamera stores a private pending record with publication flags off", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  const record = await cameras.createPendingCamera({
    title: "  New cam  ",
    kind: "PTZ",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "intake note",
    latitude: 44.12,
    longitude: 12.23,
  });

  assert.equal(record.status, "pending");
  assert.equal(record.source, "Community report");
  assert.equal(record.updated, "Submitted just now");
  assert.equal(record.publishManufacturer, 0);
  assert.equal(record.publishObservedOn, 0);
  assert.equal(record.address, null, "empty address is stored as null");
  assert.equal(record.notes, "intake note");
  assert.match(record.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

  const publicRecords = await cameras.listPublicCameras();
  assert.equal(publicRecords.some((item) => item.id === record.id), false, "a pending report is never public");
});

test("findNearbyPublicCameras computes distance, filters by radius and sorts ascending", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  // 0.0001° latitude ≈ 11 m, 0.001° ≈ 111 m, 0.01° ≈ 1.1 km (WGS84).
  await insertCamera(env, { title: "Near", latitude: 44.101 });
  await insertCamera(env, { title: "Closer", latitude: 44.1001 });
  await insertCamera(env, { title: "Far", latitude: 44.11 });
  await insertCamera(env, { title: "Pending far", latitude: 44.2, status: "pending" });

  const within200 = await cameras.findNearbyPublicCameras(44.1, 12.2, 200);
  const titles = within200.map((record) => record.title);
  assert.deepEqual(titles, ["Closer", "Near"], "sorted by ascending distance, pending records excluded");
  for (const record of within200) {
    assert.equal(typeof record.distanceMeters, "number");
    assert.ok(record.distanceMeters > 0 && record.distanceMeters <= 200);
  }
  const closerDistance = within200.find((record) => record.title === "Closer").distanceMeters;
  const nearDistance = within200.find((record) => record.title === "Near").distanceMeters;
  assert.ok(closerDistance < nearDistance, "the closer point must have the smaller distance");
  assert.ok(closerDistance < 100, "~11 m point within 100 m");
  assert.ok(nearDistance > 100 && nearDistance <= 200, "~111 m point beyond 100 m but inside the 200 m radius");

  const within100 = await cameras.findNearbyPublicCameras(44.1, 12.2, 100);
  assert.deepEqual(within100.map((record) => record.title), ["Closer"], "the ~111 m point is outside a 100 m radius");
});

test("findNearbyPublicCameras computes distance on raw coordinates but projects rounded ones", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  // 0.00014° latitude ≈ 15.6 m (WGS84): stored with full raw precision so
  // rounding to 4 decimals (~10 m, ADR 0008) would change the computed
  // distance (44.1001 ≈ 11.1 m). The duplicate check must measure against
  // the exact stored position, then round only in the public projection.
  await insertCamera(env, { title: "Raw precise", latitude: 44.10014, longitude: 12.2 });

  const nearby = await cameras.findNearbyPublicCameras(44.1, 12.2, 200);
  assert.equal(nearby.length, 1);
  const record = nearby[0];
  // Distance from the true raw position (~15.6 m), not the rounded one (~11.1 m).
  assert.ok(record.distanceMeters > 14 && record.distanceMeters < 17, `raw distance expected ~15.6 m, got ${record.distanceMeters}`);
  // Public projection still rounds: the exact position never leaves the module.
  assert.equal(record.latitude, 44.1001, "response latitude must be rounded to ~10 m (ADR 0008)");
  assert.equal(record.longitude, 12.2);
});

test("findNearbyPublicCameras keeps a raw-inside candidate that would round outside the radius", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  // 0.00065° ≈ 72.3 m: inside the 75 m radius on raw coordinates, but its
  // rounded position (44.1007 ≈ 77.8 m) would fall OUTSIDE the radius. The
  // duplicate check must filter on the true distance so a real nearby record
  // is never missed at the boundary (false negative).
  await insertCamera(env, { title: "Boundary raw", latitude: 44.10065, longitude: 12.2 });

  const within75 = await cameras.findNearbyPublicCameras(44.1, 12.2, 75);
  assert.deepEqual(within75.map((record) => record.title), ["Boundary raw"], "raw distance 72.3 m must stay inside the 75 m radius");
  assert.ok(within75[0].distanceMeters < 75, `raw distance must be < 75 m, got ${within75[0].distanceMeters}`);
});

test("createCorrectionRequest stores a pending private request", async () => {
  const { env, cameras, corrections } = await realDb();
  await resetDb({ env, cameras });
  const camera = await insertCamera(env, { title: "Correction target" });

  const request = await corrections.createCorrectionRequest({
    cameraId: camera.id,
    issueType: "inaccurate details",
    message: "The kind label is wrong",
    contact: "someone@example.invalid",
  });
  assert.equal(request.status, "pending");
  assert.equal(request.cameraId, camera.id);
  assert.equal(request.issueType, "inaccurate details");
  assert.equal(request.message, "The kind label is wrong");
  assert.equal(request.contact, "someone@example.invalid");

  const anonymous = await corrections.createCorrectionRequest({
    cameraId: null,
    issueType: "no longer present",
    message: "Removed last month",
    contact: "",
  });
  assert.equal(anonymous.contact, null, "empty contact is stored as null");
  assert.equal(anonymous.cameraId, null);
});

test("moderation approval with publication choices makes metadata public", async () => {
  const { env, cameras, moderation } = await realDb();
  await resetDb({ env, cameras });
  const pending = await cameras.createPendingCamera({
    title: "Meta cam",
    kind: "Fixed dome",
    manufacturer: "Acme",
    observedOn: "2026-04-04",
    address: "Via X",
    notes: "",
    latitude: 44.1,
    longitude: 12.2,
  });

  await moderation.moderateCamera(pending.id, "approve", "verified-public-infrastructure", null, {
    publishManufacturer: true,
    publishObservedOn: false,
  });
  const published = await cameras.listPublicCameras();
  const record = published.find((item) => item.id === pending.id);
  assert.equal(record.status, "verified");
  assert.equal(record.manufacturer, "Acme", "manufacturer published after moderator opt-in");
  assert.equal(record.observedOn, null, "observedOn stays private without opt-in");
});

// ---------------------------------------------------------------------------
// Route-layer contract lock-downs
// ---------------------------------------------------------------------------

const cameraFixture = {
  id: 1,
  title: "Sample camera",
  kind: "Fixed dome",
  manufacturer: "Acme",
  observedOn: "2026-01-01",
  publishManufacturer: 1,
  publishObservedOn: 0,
  address: "Via Roma 1",
  latitude: 41.9004,
  longitude: 12.4936,
  status: "verified",
  source: "Community report",
  updated: "Local moderation: approved and verified",
  description: "Corner traffic lights",
  createdAt: "2026-01-01T00:00:00.000Z",
};

test("live exports carry no version identifier (versioned releases are a proposal)", async () => {
  stub("listPublicCameras", async () => [cameraFixture]);
  const { GET } = await loadRoute("app/api/cameras/route.mjs");
  const response = await GET(apiRequest("/api/cameras"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  for (const key of ["version", "datasetVersion", "schemaVersion"]) {
    assert.equal(key in body, false, `live JSON export must not carry a "${key}" identifier yet`);
  }
  const csvResponse = await GET(apiRequest("/api/cameras?format=csv"));
  const csv = await responseBody(csvResponse);
  assert.doesNotMatch(csv, /version/i, "live CSV export must not carry a version column");
});

test("GeoJSON properties carry exactly the documented field set", async () => {
  stub("listPublicCameras", async () => [cameraFixture]);
  const { GET } = await loadRoute("app/api/cameras/route.mjs");
  const response = await GET(apiRequest("/api/cameras?format=geojson"));
  const body = await responseBody(response);
  const properties = body.features[0].properties;

  assert.deepEqual(properties, {
    id: 1,
    title: "Sample camera",
    kind: "Fixed dome",
    manufacturer: "Acme",
    observedOn: "2026-01-01",
    status: "verified",
    source: "Community report",
    updated: "Local moderation: approved and verified",
    description: "Corner traffic lights",
  });
  assert.deepEqual(body.features[0].geometry, { type: "Point", coordinates: [12.4936, 41.9004] });
});

test("CSV omits createdAt and the publish flags and is newline-terminated", async () => {
  stub("listPublicCameras", async () => [cameraFixture]);
  const { GET } = await loadRoute("app/api/cameras/route.mjs");
  const csv = await responseBody(await GET(apiRequest("/api/cameras?format=csv")));

  assert.ok(csv.endsWith("\n"), "CSV rows must be newline-terminated");
  const header = csv.split("\n")[0];
  for (const forbidden of ["createdAt", "publishManufacturer", "publishObservedOn", "notes"]) {
    assert.equal(header.includes(forbidden), false, `CSV header must not contain ${forbidden}`);
  }
  assert.equal(csv.includes("createdAt"), false);
});

test("unknown format values including uppercase variants fall back to JSON", async () => {
  stub("listPublicCameras", async () => [cameraFixture]);
  const { GET } = await loadRoute("app/api/cameras/route.mjs");
  for (const format of ["CSV", "GeoJSON", "xml", ""]) {
    const query = format ? `?format=${format}` : "";
    const response = await GET(apiRequest(`/api/cameras${query}`));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    const body = await responseBody(response);
    assert.ok(Array.isArray(body.records), `format=${format || "(default)"} must fall back to the JSON list`);
  }
});
