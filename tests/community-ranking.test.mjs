// FASE 2 (ADR 0021, kanban t_a9f23581) — ranking ordinabile.
// Directory: listPublicCamerasPage(filters.sort) con D1 reale.
//   sort=useful        → ORDER BY SUM(weight) dei like DESC (ADR §10.1)
//   sort=recent        → updated DESC, id DESC
//   sort=confirmations → last_verified_at IS NULL (in fondo), last_verified_at DESC
//   default            → id DESC (INVARIANTE preesistente, mai rotto dal sort)
// I conteggi esposti restano COUNT(DISTINCT), mai pesi (privacy by design).

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";

const NOW = "2026-08-01T12:00:00.000Z";

let runtime;
let db;

beforeEach(async () => {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  runtime.communitySettings.resetCommunitySettingsCache();
});

after(async () => cleanupDbRuntime());

let contributorSeq = 0;

async function insertCamera(overrides = {}) {
  const row = {
    title: "Ranking camera",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    publishManufacturer: 0,
    publishObservedOn: 0,
    address: null,
    notes: "",
    latitude: 44.1,
    longitude: 12.2,
    status: "active",
    source: "Community report",
    updated: "2026-08-01T00:00:00.000Z",
    description: "",
    lastVerifiedAt: null,
    reviewDueAt: null,
    reviewIntervalMonths: 12,
    contributorId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
  const result = await db
    .prepare(
      `INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, status, source, updated, description, last_verified_at, review_due_at, review_interval_months, contributor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      row.title, row.kind, row.manufacturer, row.observedOn,
      row.publishManufacturer, row.publishObservedOn, row.address,
      row.notes, row.latitude, row.longitude, row.status,
      row.source, row.updated, row.description, row.lastVerifiedAt,
      row.reviewDueAt, row.reviewIntervalMonths, row.contributorId,
      row.createdAt,
    )
    .first();
  return result.id;
}

async function insertContributor(overrides = {}) {
  contributorSeq += 1;
  const row = {
    email: `rank-${contributorSeq}-${crypto.randomUUID()}@example.org`,
    displayName: null,
    passwordHash: "pbkdf2$210000$test$fixture",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
  const result = await db
    .prepare("INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(row.email, row.displayName, row.passwordHash, row.createdAt, row.updatedAt)
    .first();
  return result.id;
}

// A contributor whose verified-contribution count yields a target trust level:
// activeCameraCount active records owned → level via deriveLevel (L1=1, L2=5, ...).
async function makeContributorAtLevel(activeCameraCount) {
  const contributorId = await insertContributor();
  for (let i = 0; i < activeCameraCount; i += 1) {
    await insertCamera({ contributorId, status: "active" });
  }
  return contributorId;
}

async function setLike(cameraId, contributorId, now = NOW) {
  return runtime.communityActions.setCommunityAction({
    cameraId, contributorId, actionType: "like", now, env: runtime.env,
  });
}

function ids(records) {
  return records.map((record) => record.id);
}

// ---------------------------------------------------------------------------
// 1. sort=useful → SUM(weight) dei like DESC (id DESC come tiebreaker)
// ---------------------------------------------------------------------------

test("sort=useful orders by total like weight descending", async () => {
  // L1 (weight 1) e L2 (weight 2): le loro camere di proprietà (0 like)
  // finiscono in fondo; le target con like pesano in testa.
  const l1 = await makeContributorAtLevel(1);
  const l2 = await makeContributorAtLevel(5);
  const light = await insertCamera();   // 1 like L1 → sum 1
  const heavy = await insertCamera();   // 1 like L2 → sum 2
  const top = await insertCamera();     // L1 + L2   → sum 3
  const none = await insertCamera();    // 0 like    → sum 0

  assert.equal((await setLike(light, l1)).kind, "ok");
  assert.equal((await setLike(heavy, l2)).kind, "ok");
  assert.equal((await setLike(top, l1)).kind, "ok");
  assert.equal((await setLike(top, l2)).kind, "ok");

  const page = await runtime.cameras.listPublicCamerasPage({ sort: "useful" }, { limit: 50, offset: 0 });
  const ordered = ids(page.records);

  // Le prime quattro posizioni: top(3), heavy(2), light(1), none(0).
  assert.deepEqual(ordered.slice(0, 4), [top, heavy, light, none]);
});

test("sort=useful tiebreaks equal weight with id descending (stable invariant)", async () => {
  const l1a = await makeContributorAtLevel(1);
  const l1b = await makeContributorAtLevel(1);
  const first = await insertCamera();   // like L1 → sum 1
  const second = await insertCamera();  // like L1 → sum 1

  assert.equal((await setLike(first, l1a)).kind, "ok");
  assert.equal((await setLike(second, l1b)).kind, "ok");

  const page = await runtime.cameras.listPublicCamerasPage({ sort: "useful" }, { limit: 50, offset: 0 });
  // A parità di peso: id DESC → second (più recente) prima di first.
  const indexFirst = ids(page.records).indexOf(first);
  const indexSecond = ids(page.records).indexOf(second);
  assert.ok(indexSecond < indexFirst, "equal weight must tiebreak by id DESC");
});

test("sort=useful exposes only distinct counts, never weights (privacy by design)", async () => {
  const l1 = await makeContributorAtLevel(1);
  const cameraId = await insertCamera();
  await setLike(cameraId, l1);

  const page = await runtime.cameras.listPublicCamerasPage({ sort: "useful" }, { limit: 50, offset: 0 });
  const record = page.records.find((entry) => entry.id === cameraId);
  assert.equal(record.usefulCount, 1, "public payload must be a distinct count");
  assert.ok(!("usefulWeight" in record), "weights must never be exposed in the payload");
});

// ---------------------------------------------------------------------------
// 2. sort=recent → updated DESC, id DESC
// ---------------------------------------------------------------------------

test("sort=recent orders by updated descending", async () => {
  const older = await insertCamera({ updated: "2026-07-01T00:00:00.000Z" });
  const newer = await insertCamera({ updated: "2026-08-01T00:00:00.000Z" });
  const newest = await insertCamera({ updated: "2026-08-10T00:00:00.000Z" });

  const page = await runtime.cameras.listPublicCamerasPage({ sort: "recent" }, { limit: 50, offset: 0 });
  const ordered = ids(page.records);
  assert.ok(ordered.indexOf(newest) < ordered.indexOf(newer), "newest first");
  assert.ok(ordered.indexOf(newer) < ordered.indexOf(older), "then newer, then older");
});

// ---------------------------------------------------------------------------
// 3. sort=confirmations → last_verified_at DESC, mai confermati in fondo
// ---------------------------------------------------------------------------

test("sort=confirmations puts confirmed records first and never-confirmed last", async () => {
  const never = await insertCamera({ lastVerifiedAt: null });
  const oldConfirm = await insertCamera({ lastVerifiedAt: "2026-06-01T00:00:00.000Z" });
  const recentConfirm = await insertCamera({ lastVerifiedAt: "2026-08-01T00:00:00.000Z" });

  const page = await runtime.cameras.listPublicCamerasPage({ sort: "confirmations" }, { limit: 50, offset: 0 });
  const ordered = ids(page.records);
  assert.ok(ordered.indexOf(recentConfirm) < ordered.indexOf(oldConfirm), "most recent confirmation first");
  assert.ok(ordered.indexOf(oldConfirm) < ordered.indexOf(never), "never-confirmed records sort to the bottom");
});

// ---------------------------------------------------------------------------
// 4. default (nessun sort) → id DESC, invariante preesistente
// ---------------------------------------------------------------------------

test("no sort keeps the id DESC invariant", async () => {
  const a = await insertCamera();
  const b = await insertCamera();
  const c = await insertCamera();
  const page = await runtime.cameras.listPublicCamerasPage(undefined, { limit: 50, offset: 0 });
  assert.deepEqual(ids(page.records).slice(0, 3), [c, b, a]);
});

// ---------------------------------------------------------------------------
// 5. unknown sort at the db boundary → default (whitelist, no raw inlining)
// ---------------------------------------------------------------------------

test("unknown sort falls back to the id DESC default at the db boundary", async () => {
  const a = await insertCamera();
  const b = await insertCamera();
  const page = await runtime.cameras.listPublicCamerasPage(
    { sort: "injection; DROP TABLE cameras" },
    { limit: 50, offset: 0 },
  );
  assert.deepEqual(ids(page.records).slice(0, 2), [b, a], "unknown sort must not reach SQL");
});
