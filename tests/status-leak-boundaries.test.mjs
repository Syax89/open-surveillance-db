// Wave B — status leak boundaries across UI/API/GeoJSON.
//
// Wave A (tests/publication-boundaries.test.mjs, tests/db-public-contracts
// .test.mjs) established the public read boundary with static guarantees and
// runtime checks for the verified/demo whitelist. Wave B closes the loop:
//
//   1. SINGLE SOURCE OF TRUTH: the public status whitelist lives in exactly
//      one place — PUBLIC_CAMERA_STATUSES in app/lib/public-status.ts — and
//      every surface derives from it:
//        - db/cameras.ts builds its SQL predicate from it (listPublicCameras
//          and getPublicCameraById share publicCameraPredicate());
//        - db/freshness.ts isPubliclyCurrent() gates on it;
//        - the client filters and labels records with it.
//   2. RUNTIME real-SQL boundary on an in-memory D1: seeding one record per
//      known status (including `stale`, which the earlier suites did not
//      exercise) must yield EXACTLY the whitelisted statuses — for the list,
//      the by-id lookup, and the nearby search.
//   3. CLIENT hardening: the public UI never renders a raw non-public status
//      string and drops non-whitelisted records before any component can
//      display them (defense in depth behind the API boundary).

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { applyDrizzleMigrations } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase as D1 } from "./helpers/d1-sqlite.mjs";
import { cleanupRouteTree, loadLib, loadTreeModule } from "./helpers/api-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFile(path.join(root, relativePath), "utf8");

after(async () => cleanupRouteTree());

// Every status the camera lifecycle can produce (see db/moderation.ts
// getCameraTransition and the moderation queue). Only the whitelisted ones
// may ever cross the public boundary.
const KNOWN_STATUSES = [
  "pending",
  "verified",
  "demo",
  "needs_review",
  "stale",
  "rejected",
  "removed",
];

const INSERT_COLUMNS =
  "INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, status, source, updated, description, created_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id";

async function insertCamera(d1, status, overrides = {}) {
  return d1
    .prepare(INSERT_COLUMNS)
    .bind(
      overrides.title ?? `Record ${status}`,
      overrides.kind ?? "Fixed dome",
      null,
      null,
      overrides.address ?? null,
      "",
      overrides.latitude ?? 44.1,
      overrides.longitude ?? 12.2,
      status,
      "Community report",
      overrides.updated ?? "2026-01-01T00:00:00.000Z",
      overrides.description ?? "",
      "2026-01-01T00:00:00.000Z",
    )
    .first();
}

// ---------------------------------------------------------------------------
// 1. Single source of truth
// ---------------------------------------------------------------------------

test("PUBLIC_CAMERA_STATUSES is the single whitelist: exactly verified and demo", async () => {
  const shared = await readSource("app/lib/public-status.ts");
  const match = shared.match(/export\s+const\s+PUBLIC_CAMERA_STATUSES\s*=\s*\[([^\]]*)\]\s*as\s+const/);
  assert.ok(match, "the shared module must declare PUBLIC_CAMERA_STATUSES as a const array");

  const statuses = [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((entry) => entry[1]);
  assert.deepEqual(
    statuses,
    ["verified", "demo"],
    "only verified and demo may be public; any new public status must be a deliberate change here",
  );
});

test("both public SQL queries derive the status whitelist from the shared predicate", async () => {
  const cameras = await readSource("db/cameras.ts");
  const shared = await readSource("app/lib/public-status.ts");

  assert.match(
    cameras,
    /import\s*\{[^}]*\bPUBLIC_CAMERA_STATUSES\b[^}]*\}\s*from\s*["'][^"']*app\/lib\/public-status["']/,
    "db/cameras.ts must import the shared whitelist",
  );
  assert.match(
    cameras,
    /export\s+function\s+publicCameraPredicate\s*\(/,
    "a shared predicate builder must exist in db/cameras.ts",
  );
  assert.match(
    cameras,
    /PUBLIC_CAMERA_STATUSES\.map/,
    "the predicate must generate its placeholders from the shared constant",
  );

  const listStart = cameras.indexOf("export async function listPublicCameras");
  const listEnd = cameras.indexOf("export async function createPendingCamera", listStart);
  const list = cameras.slice(listStart, listEnd);
  assert.match(list, /publicCameraPredicate\(/, "the list query must use the shared predicate");
  assert.doesNotMatch(
    list,
    /status\s+IN\s*\(\s*['"](?:verified|demo)['"]/,
    "the list query must not hand-write the status whitelist",
  );

  const byId = cameras.slice(cameras.indexOf("export async function getPublicCameraById"));
  assert.match(byId, /publicCameraPredicate\(/, "the by-id lookup must use the shared predicate");
  assert.doesNotMatch(
    byId,
    /status\s+IN\s*\(\s*['"](?:verified|demo)['"]/,
    "the by-id lookup must not hand-write the status whitelist",
  );

  assert.match(
    cameras,
    /parameters:\s*\[\.\.\.PUBLIC_CAMERA_STATUSES\b[^\]]*\]/,
    "the predicate must bind the whitelisted statuses as parameters (never concatenated)",
  );

  assert.match(
    shared,
    /publicStatusLabel/,
    "the shared module must also provide the safe label helper used by the client",
  );
});

test("isPubliclyCurrent gates on the same shared whitelist", async () => {
  const freshness = await readSource("db/freshness.ts");
  assert.match(
    freshness,
    /import\s*\{[^}]*\bPUBLIC_CAMERA_STATUSES\b[^}]*\}\s*from\s*["'][^"']*app\/lib\/public-status["']/,
    "db/freshness.ts must import the shared whitelist",
  );
  assert.match(
    freshness,
    /PUBLIC_CAMERA_STATUSES\s+as\s+readonly\s+string\[\]\)\.includes\(record\.status\)/,
    "isPubliclyCurrent must reject any status outside the shared whitelist",
  );
});

// ---------------------------------------------------------------------------
// 2. Runtime real-SQL boundary on an in-memory D1
// ---------------------------------------------------------------------------

async function realDb() {
  const { env } = await loadTreeModule("cloudflare-workers.mjs");
  const cameras = await loadTreeModule("db-real/cameras.mjs");
  const moderation = await loadTreeModule("db-real/moderation.mjs");
  return { env, cameras, moderation };
}

async function seedAllStatuses() {
  const { env } = await realDb();
  env.DB = new D1();
  await applyDrizzleMigrations(env.DB);
  await env.DB.prepare("DELETE FROM cameras").run();
  const ids = {};
  for (const status of KNOWN_STATUSES) {
    const row = await insertCamera(env.DB, status);
    ids[status] = row.id;
  }
  return ids;
}

test("runtime: listPublicCameras returns exactly the whitelisted statuses (real SQL)", async () => {
  const { cameras } = await realDb();
  const ids = await seedAllStatuses();

  const records = await cameras.listPublicCameras();
  const returned = records.filter((record) => record.source === "Community report");
  assert.deepEqual(
    returned.map((record) => record.status).sort(),
    ["demo", "verified"],
    `no record outside PUBLIC_CAMERA_STATUSES may cross the boundary (got: ${returned
      .map((record) => record.status)
      .join(", ")})`,
  );
  const returnedIds = returned.map((record) => record.id).sort();
  assert.deepEqual(
    returnedIds,
    [ids.demo, ids.verified].sort(),
    "the returned rows must be exactly the seeded verified and demo records",
  );
});

test("runtime: getPublicCameraById resolves only whitelisted statuses (real SQL)", async () => {
  const { cameras } = await realDb();
  const ids = await seedAllStatuses();

  for (const status of ["verified", "demo"]) {
    const record = await cameras.getPublicCameraById(ids[status]);
    assert.ok(record, `${status} must resolve through the public by-id lookup`);
    assert.equal(record.status, status);
  }
  for (const status of ["pending", "needs_review", "stale", "rejected", "removed"]) {
    const record = await cameras.getPublicCameraById(ids[status]);
    assert.equal(record, null, `${status} must never resolve through the public by-id lookup`);
  }
});

test("runtime: the nearby search also stays behind the whitelist (real SQL)", async () => {
  const { cameras } = await realDb();
  await seedAllStatuses();

  const nearby = await cameras.findNearbyPublicCameras(44.1, 12.2, 500);
  const titles = nearby.map((record) => record.title);
  assert.ok(titles.includes("Record verified"), "verified records must be searchable");
  assert.ok(titles.includes("Record demo"), "demo records must be searchable");
  for (const status of ["pending", "needs_review", "stale", "rejected", "removed"]) {
    assert.ok(!titles.includes(`Record ${status}`), `${status} records must never be searchable`);
  }
});

test("runtime: a whitelisted status still respects the freshness window (real SQL)", async () => {
  const { env, cameras } = await realDb();
  env.DB = new D1();
  await applyDrizzleMigrations(env.DB);
  await env.DB.prepare("DELETE FROM cameras").run();

  const fresh = await insertCamera(env.DB, "verified", { title: "Fresh verified", updated: "2026-07-01T00:00:00.000Z" });
  await env.DB.prepare("UPDATE cameras SET last_verified_at = '2026-07-01T00:00:00.000Z', review_due_at = '2026-07-02T00:00:00.000Z', review_interval_months = 12 WHERE id = ?").bind(fresh.id).run();

  const inWindow = await cameras.listPublicCameras("2026-07-01T12:00:00.000Z");
  assert.ok(inWindow.some((record) => record.id === fresh.id), "inside the review window the record is public");

  const pastDue = await cameras.listPublicCameras("2026-07-03T00:00:00.000Z");
  assert.ok(!pastDue.some((record) => record.id === fresh.id), "past the review window the record must drop out");

  const byIdPast = await cameras.getPublicCameraById(fresh.id, "2026-07-03T00:00:00.000Z");
  assert.equal(byIdPast, null, "the by-id lookup must apply the same freshness window");
});

// ---------------------------------------------------------------------------
// 3. Client hardening (runtime on the real client modules)
// ---------------------------------------------------------------------------

test("client: isPublicStatus whitelists only verified and demo", async () => {
  const { isPublicStatus } = await loadLib("app/lib/public-status.mjs");
  assert.equal(isPublicStatus("verified"), true);
  assert.equal(isPublicStatus("demo"), true);
  for (const status of ["pending", "needs_review", "stale", "rejected", "removed", ""]) {
    assert.equal(isPublicStatus(status), false, `${status} must not be client-whitelisted`);
  }
});

test("client: publicStatusLabel never renders a non-public status verbatim", async () => {
  const { publicStatusLabel } = await loadLib("app/lib/public-status.mjs");
  const labels = { verified: "Verified", demo: "Illustrative record" };

  assert.equal(publicStatusLabel(labels, "verified", "Status"), "Verified");
  assert.equal(publicStatusLabel(labels, "demo", "Status"), "Illustrative record");
  assert.equal(
    publicStatusLabel(labels, "needs_review", "Status"),
    "Status",
    "an internal status must fall back to the neutral label, never the raw value",
  );
  assert.equal(publicStatusLabel(labels, "stale", "Status"), "Status");
  assert.equal(publicStatusLabel(labels, "pending", "Status"), "Status");
  assert.equal(publicStatusLabel(labels, "unknown-future-status", "Status"), "Status");
  assert.equal(publicStatusLabel({}, "verified", "Status"), "Status", "missing label falls back too");
});

test("client: publicRecords drops non-whitelisted records before rendering", async () => {
  const { publicRecords } = await loadLib("app/lib/records.mjs");
  const makeRecord = (status) => ({
    id: 1,
    title: "X",
    kind: "Dome",
    status,
    latitude: 44.1,
    longitude: 12.2,
    source: "Community report",
    updated: "2026-01-01T00:00:00.000Z",
    description: "",
  });

  const mixed = ["verified", "demo", "pending", "stale", "removed"].map(makeRecord);
  const filtered = publicRecords(mixed);
  assert.deepEqual(
    filtered.map((record) => record.status),
    ["verified", "demo"],
    "only whitelisted records may reach the components",
  );
  assert.deepEqual(publicRecords([]), []);
});

// ---------------------------------------------------------------------------
// 4. Static UI guards: the public pages never render a raw status fallback
// ---------------------------------------------------------------------------

test("the homepage filters through publicRecords and labels via the safe helper", async () => {
  const page = await readSource("app/page.tsx");
  assert.match(page, /publicRecords\(/, "the homepage must filter records through the client whitelist");
  assert.match(page, /setRecords\(publicRecords\(/, "API data must be filtered before entering state");
  assert.doesNotMatch(
    page,
    /\?\?\s*(?:camera|selectedCamera)\.status/,
    "the homepage must never fall back to rendering a raw status value",
  );
  assert.match(page, /publicStatusLabel\(statuses,\s*(?:camera|selectedCamera)\.status,\s*t\.unknown\)/, "status labels must come from the safe helper");
});

test("the record page labels via the safe helper and never appends a raw status", async () => {
  const page = await readSource("app/records/[id]/page.tsx");
  assert.match(page, /publicRecords\(/, "the record page must filter records through the client whitelist");
  assert.match(page, /publicStatusLabel\(statuses,\s*record\.status,\s*t\.statusFallback\)/, "record status must come from the safe helper");
  assert.doesNotMatch(page, /\$\{t\.statusFallback\}[^}]*record\.status/, "the record page must not append the raw status to the fallback");
  assert.doesNotMatch(page, /statuses\[record\.status\]\s*\?\?\s*record\.status/, "the record page must not render a raw status value");
});

test("the map marker applies a status class only for whitelisted statuses", async () => {
  const map = await readSource("app/components/SurveillanceMap.tsx");
  assert.match(map, /import\s*\{[^}]*\bisPublicStatus\b[^}]*\}\s*from\s*["'][^"']*lib\/public-status["']/);
  assert.match(map, /isPublicStatus\(camera\.status\)/, "the marker class must be guarded by the whitelist");
  assert.doesNotMatch(map, /osm-camera-marker\s+\$\{camera\.status\}/, "the raw status must not reach the marker class");
});
