// ADR 0008 demo gate (audit CTO #7, task t_d7a4b99b).
//
// The guarantee "demo mai esportati" (ADR 0008 decision 1 / retention
// schedule R12) used to rest on the manual pre-launch purge alone — no gate
// in code. This suite pins the code gate added by t_d7a4b99b:
//
//   publicCameraPredicate() excludes `status='demo'` records from EVERY
//   public read unless the deployment explicitly declares
//   ENVIRONMENT=development (fail-closed default, same convention as the
//   moderation demo actor selector, worker-configuration.d.ts).
//
// The three export surfaces named by the task all run through the gated
// functions, so a single predicate change closes all of them:
//   - CSV export   -> listPublicCameras          (GET /api/cameras?format=csv)
//   - GeoJSON      -> listPublicCameras / listPublicCamerasInBbox
//   - JSON list API-> listPublicCamerasPage      (GET /api/cameras)
// The two secondary public surfaces that duplicate the camera predicate
// inline are gated the same way (same helper, same clause):
//   - confirmation -> setConfirmation            (PUT /api/cameras/[id]/confirmation)
// Tests run the REAL db layer (real SQL against in-memory D1 delivered by
// the real Drizzle migrations), exactly like the deployed Workers runtime.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFile(path.join(root, relativePath), "utf8");

let runtime;
let cameras;
let db;

async function seedActiveAndDemo() {
  // Two pending reports, then the reserved statuses are applied directly —
  // mirroring the H3 reality that demo records are never seeded at runtime
  // (migrations only) and the 'demo' status survives only as a legacy row.
  const active = await cameras.createPendingCamera({
    title: "Verified export record",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    address: "Via Roma 1",
    notes: "",
    latitude: 41.9005,
    longitude: 12.4937,
  });
  const demo = await cameras.createPendingCamera({
    title: "Demo export record",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    address: "Via Roma 2",
    notes: "",
    latitude: 41.901,
    longitude: 12.494,
  });
  await db.prepare("UPDATE cameras SET status = 'active' WHERE id = ?").bind(active.id).run();
  await db.prepare("UPDATE cameras SET status = 'demo' WHERE id = ?").bind(demo.id).run();
  return { activeId: active.id, demoId: demo.id };
}

beforeEach(async () => {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  cameras = runtime.cameras;
  // The runtime env is fresh per test (the harness env object is shared, so
  // each test starts from the fail-closed default: ENVIRONMENT unset).
  delete runtime.env.ENVIRONMENT;
});

after(async () => cleanupDbRuntime());

// ---------------------------------------------------------------------------
// Fail-closed default (ENVIRONMENT unset = production, per worker-configuration.d.ts)
// ---------------------------------------------------------------------------

test("unset ENVIRONMENT excludes demo records from the export source (CSV/GeoJSON full list)", async () => {
  const { activeId, demoId } = await seedActiveAndDemo();

  const records = await cameras.listPublicCameras();
  assert.ok(records.some((record) => record.id === activeId), "active records stay public");
  assert.ok(
    !records.some((record) => record.id === demoId),
    "demo records must never cross the export source outside ENVIRONMENT=development",
  );
  assert.ok(
    records.every((record) => record.status !== "demo"),
    "no demo record may appear in the full public list (CSV/GeoJSON snapshot source)",
  );
});

test("unset ENVIRONMENT excludes demo records from the GeoJSON bbox surface", async () => {
  const { activeId, demoId } = await seedActiveAndDemo();

  const bbox = await cameras.listPublicCamerasInBbox({ west: 12.4, south: 41.8, east: 12.6, north: 42.0 });
  assert.ok(bbox.some((record) => record.id === activeId), "active markers stay public");
  assert.ok(!bbox.some((record) => record.id === demoId), "demo markers must not appear in production");
});

test("unset ENVIRONMENT excludes demo records from the by-id lookup and the JSON list API", async () => {
  const { activeId, demoId } = await seedActiveAndDemo();

  assert.ok(await cameras.getPublicCameraById(activeId), "active by-id lookup still resolves");
  assert.equal(await cameras.getPublicCameraById(demoId), null, "demo by-id lookup must fail in production");

  const page = await cameras.listPublicCamerasPage({}, { limit: 10, offset: 0 });
  assert.equal(page.total, 1, "the JSON list API total must not count demo records");
  assert.ok(page.records.some((record) => record.id === activeId));
  assert.ok(!page.records.some((record) => record.id === demoId));
});

// ---------------------------------------------------------------------------
// Secondary public surfaces duplicating the camera predicate inline
// ---------------------------------------------------------------------------

test("unset ENVIRONMENT fails closed for the confirmation toggle on a demo record", async () => {
  const { demoId } = await seedActiveAndDemo();

  // Level gate requires a verified contribution; the camera-public check
  // runs BEFORE the gate, so camera_not_public proves the demo gate closed
  // the write path regardless of contributor state.
  const result = await runtime.confirmations.setConfirmation({
    cameraId: demoId,
    contributorId: 1,
    now: "2026-08-03T00:00:00.000Z",
  });
  assert.equal(result.kind, "camera_not_public", "no confirmation can be written on demo data in production");
});

test("ENVIRONMENT=development keeps demo confirmations public", async () => {
  runtime.env.ENVIRONMENT = "development";
  try {
    const { demoId } = await seedActiveAndDemo();

    const confirm = await runtime.confirmations.setConfirmation({
      cameraId: demoId,
      contributorId: 1,
      now: "2026-08-03T00:00:00.000Z",
    });
    // In development the demo record passes the public check, so the result
    // is decided by the later anti-gaming layers (level gate), never
    // camera_not_public — the gate is open for the prototype.
    assert.notEqual(confirm.kind, "camera_not_public", "demo confirmations must not be blocked in development");
  } finally {
    delete runtime.env.ENVIRONMENT;
  }
});

// ---------------------------------------------------------------------------
// Explicit environments
// ---------------------------------------------------------------------------

test("ENVIRONMENT=production excludes demo records (same gate as the unset default)", async () => {
  runtime.env.ENVIRONMENT = "production";
  const { activeId, demoId } = await seedActiveAndDemo();

  const records = await cameras.listPublicCameras();
  assert.ok(records.some((record) => record.id === activeId));
  assert.ok(!records.some((record) => record.id === demoId));
});

test("ENVIRONMENT=development keeps demo records public (local prototype)", async () => {
  runtime.env.ENVIRONMENT = "development";
  const { activeId, demoId } = await seedActiveAndDemo();

  const records = await cameras.listPublicCameras();
  assert.ok(records.some((record) => record.id === activeId));
  assert.ok(records.some((record) => record.id === demoId), "the prototype demo seed stays visible in development");
});

// ---------------------------------------------------------------------------
// Static contract: the gate lives in the shared predicate, never per-route
// ---------------------------------------------------------------------------

test("the demo gate is wired into publicCameraPredicate and reads ENVIRONMENT=development", async () => {
  const camerasSource = await readSource("db/cameras.ts");

  assert.match(
    camerasSource,
    /export\s+function\s+demoRecordsPublic\s*\(\s*\)\s*:\s*boolean\s*\{\s*return\s+env\.ENVIRONMENT\s*===\s*["']development["']/,
    "demoRecordsPublic must enable demo visibility only for ENVIRONMENT=development",
  );
  assert.match(
    camerasSource,
    /publicCameraPredicate[\s\S]*?demoRecordsPublic\(\)\s*\?\s*["']\s*["']\s*:\s*["']\s*AND\s+status\s+!=\s*['"]demo['"]\s*["']/,
    "the shared predicate must append the demo gate clause outside development",
  );
  assert.match(
    camerasSource,
    /status\s+IN\s*\(\s*\$\{placeholders\}\)[\s\S]*status\s*=\s*['"]demo['"]\s*OR\s+review_due_at\s+IS\s+NULL/,
    "the predicate keeps the demo carve-out for the development surface (regression guard)",
  );

  // The three export surfaces must keep delegating to the gated db functions
  // (never hand-write their own status whitelist).
  const routeSource = await readSource("app/api/cameras/route.ts");
  const csvExport = routeSource.slice(routeSource.indexOf('format === "csv"'));
  const geojsonExport = routeSource.slice(routeSource.indexOf('format === "geojson"'));
  assert.match(csvExport, /listPublicCameras\(/, "the CSV export must read through the gated full list");
  assert.match(geojsonExport, /listPublicCameras\(/, "the GeoJSON export must read through the gated full list");

  // The secondary public surface duplicates the camera predicate inline,
  // so it must reuse the SAME helper and gate clause (never a stale copy).
  const confirmationsSource = await readSource("db/confirmations.ts");
  assert.match(
    confirmationsSource,
    /import\s*\{[^}]*demoRecordsPublic[^}]*\}\s*from\s*["']\.\/cameras["']/,
    "db/confirmations.ts must reuse the shared demo gate helper",
  );
  assert.match(
    confirmationsSource,
    /demoRecordsPublic\(\)\s*\?\s*["']\s*["']\s*:\s*["']\s*AND\s+status\s+!=\s*['"]demo['"]\s*["']/,
    "the confirmation public-check must append the demo gate clause outside development",
  );
});
