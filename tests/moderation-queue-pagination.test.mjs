// Every moderation work queue is bounded — real SQL regression.
//
// GET /api/moderation used to SELECT the whole `pending`, `needs_review`,
// `stale`, pending-correction, pending-edit and open moderation_queue sets with
// no LIMIT (only the published list was paginated). With 160k+ imported
// cameras the stale/needs_review sets alone can be enormous. Each queue is now
// keyset-paginated like the published list (FIFO `created_at ASC, id ASC`,
// page size 20, limit+1 probe) and the payload carries a whole-queue COUNT.
//
// Drives the REAL db/moderation.ts SQL against in-memory SQLite (see
// tests/moderation-published-pagination.test.mjs) and records the row count
// of every `.all()` so a removed LIMIT fails here even if the page is sliced
// afterwards. Fixtures are fictitious.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { cleanupRouteTree, loadTreeModule } from "./helpers/api-harness.mjs";
import { D1SqliteDatabase as D1 } from "./helpers/d1-sqlite.mjs";
import { applyDrizzleMigrations } from "./helpers/db-runtime-harness.mjs";
import { resetMockState } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

class RecordingD1 extends D1 {
  constructor() {
    super();
    this.selects = [];
  }

  prepare(sql) {
    const statement = super.prepare(sql);
    const originalAll = statement.all.bind(statement);
    statement.all = () => {
      const result = originalAll();
      this.selects.push({ sql, boundArgs: statement.boundArgs.slice(), count: result.results.length });
      return result;
    };
    return statement;
  }
}

let treeEnv = null;
let realModeration = null;

async function realDb() {
  if (!realModeration) {
    ({ env: treeEnv } = await loadTreeModule("cloudflare-workers.mjs"));
    realModeration = await loadTreeModule("db-real/moderation.mjs");
  }
  return { env: treeEnv, moderation: realModeration };
}

async function resetDb(env) {
  env.DB = new RecordingD1();
  await applyDrizzleMigrations(env.DB);
  for (const table of ["camera_edit_requests", "correction_requests", "moderation_queue", "cameras"]) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
}

// 3-way created_at ties inserted in REVERSE order, so a walk that followed
// insertion id instead of (created_at, id) would fail the order assertions.
function tiedTimestamps(count) {
  const stamps = [];
  for (let index = 0; index < count; index += 1) {
    stamps.push(`2026-03-01T00:${String(Math.floor(index / 3)).padStart(2, "0")}:00.000Z`);
  }
  return stamps.reverse();
}

async function seedCameras(env, status, count) {
  const insert =
    "INSERT INTO cameras (title, kind, latitude, longitude, status, source, updated, created_at) VALUES (?, 'Fixed dome', 41.9, 12.5, ?, 'Community report', ?, ?)";
  for (const [index, createdAt] of tiedTimestamps(count).entries()) {
    await env.DB.prepare(insert).bind(`${status} ${index}`, status, createdAt, createdAt).run();
  }
}

// Shared active host camera per fixture row (the open-report unique indexes
// allow one pending anonymous correction / one pending edit per camera).
async function hostCamera(env, title) {
  return (await env.DB.prepare(
    "INSERT INTO cameras (title, kind, latitude, longitude, status, source, updated, created_at) VALUES (?, 'Fixed dome', 41.9, 12.5, 'active', 'Community report', '2026-01-01', '2026-01-01T00:00:00.000Z') RETURNING id",
  ).bind(title).first()).id;
}

async function seedCorrections(env, count) {
  const insert =
    "INSERT INTO correction_requests (camera_id, issue_type, message, status, created_at) VALUES (?, 'location', ?, 'pending', ?)";
  for (const [index, createdAt] of tiedTimestamps(count).entries()) {
    const host = await hostCamera(env, `Correction host ${index}`);
    await env.DB.prepare(insert).bind(host, `Fictitious correction ${index}`, createdAt).run();
  }
}

async function seedEdits(env, count) {
  const editInsert =
    "INSERT INTO camera_edit_requests (camera_id, status, proposed_title, created_at, updated_at) VALUES (?, 'pending', ?, ?, ?)";
  for (const [index, createdAt] of tiedTimestamps(count).entries()) {
    const host = await hostCamera(env, `Edit host ${index}`);
    await env.DB.prepare(editInsert).bind(host, `Proposed ${index}`, createdAt, createdAt).run();
  }
}

async function expectedIds(env, sql) {
  return (await env.DB.prepare(sql).all()).results.map((row) => row.id);
}

// queue key -> [payload field, SQL that lists the full queue in FIFO order]
const queues = {
  pending: ["cameraReports", "SELECT id FROM cameras WHERE status = 'pending' ORDER BY created_at ASC, id ASC"],
  review: ["reviewCameras", "SELECT id FROM cameras WHERE status = 'needs_review' ORDER BY created_at ASC, id ASC"],
  stale: ["staleCameras", "SELECT id FROM cameras WHERE status = 'stale' ORDER BY created_at ASC, id ASC"],
  corrections: ["correctionRequests", "SELECT id FROM correction_requests WHERE status = 'pending' ORDER BY created_at ASC, id ASC"],
  edits: ["cameraEditRequests", "SELECT id FROM camera_edit_requests WHERE status = 'pending' ORDER BY created_at ASC, id ASC"],
};

async function seedAll(env) {
  await seedCameras(env, "pending", 45);
  await seedCameras(env, "needs_review", 42);
  await seedCameras(env, "stale", 41);
  await seedEdits(env, 23);
  await seedCorrections(env, 44);
}

test("every queue emits at most one page, its SELECT is LIMITed and the payload reports the whole-queue total", async () => {
  const { env, moderation } = await realDb();
  await resetDb(env);
  await seedAll(env);

  env.DB.selects = [];
  const queue = await moderation.listPendingModerationItems();
  const callSelects = env.DB.selects.slice();
  assert.deepEqual(queue.queueTotals, {
    pending: 45, published: 67, review: 42, stale: 41, corrections: 44, edits: 23,
  });
  for (const [key, [field, sql]] of Object.entries(queues)) {
    const ids = queue[field].map((row) => row.id);
    const all = await expectedIds(env, sql);
    assert.deepEqual(ids, all.slice(0, 20), `${key}: first page is the FIFO head`);
    const last = queue[field][19];
    assert.deepEqual(queue.queueNextCursors[key], { createdAt: last.createdAt, id: last.id }, `${key}: cursor from last emitted row`);
  }
  // No SELECT in the call (open-queue lookup included) may return more than a page + probe.
  for (const select of callSelects) {
    assert.ok(select.count <= 21, `a queue SELECT returned ${select.count} rows:\n${select.sql}`);
  }
  // queueItems only covers the emitted rows (5 queues x 20).
  assert.equal(queue.queueItems.length, 100);
});

test("paging each queue walks the next slices in stable FIFO order with no omissions or duplicates", async () => {
  const { env, moderation } = await realDb();
  await resetDb(env);
  await seedAll(env);

  for (const [key, [field, sql]] of Object.entries(queues)) {
    const all = await expectedIds(env, sql);
    const collected = [];
    let cursor;
    for (let pages = 0; ; pages += 1) {
      assert.ok(pages < 10, `${key}: the walk must terminate`);
      const queue = await moderation.listPendingModerationItems(undefined, cursor ? { [key]: cursor } : {});
      const ids = queue[field].map((row) => row.id);
      assert.ok(ids.length <= 20, `${key}: page of ${ids.length}`);
      assert.deepEqual(ids, all.slice(collected.length, collected.length + ids.length), `${key}: page ${pages} order`);
      collected.push(...ids);
      cursor = queue.queueNextCursors[key];
      if (!cursor) break;
    }
    assert.deepEqual(collected, all, `${key}: whole queue walked exactly once`);
  }
});

test("the open moderation_queue lookup is bounded to the emitted rows and keeps their badges", async () => {
  const { env, moderation } = await realDb();
  await resetDb(env);
  await seedCameras(env, "pending", 30);
  const pendingIds = await expectedIds(env, queues.pending[1]);
  // An open queue row for EVERY pending camera, escalated so it is recognisable.
  for (const id of pendingIds) {
    await env.DB.prepare(
      "INSERT INTO moderation_queue (entity, entity_id, state, sensitivity, requires_second_review, created_at, updated_at) VALUES ('camera', ?, 'escalated', 'urgent', 0, '2026-03-02', '2026-03-02')",
    ).bind(id).run();
  }
  env.DB.selects = [];
  const queue = await moderation.listPendingModerationItems();
  const lookup = env.DB.selects.find((select) => select.sql.includes("FROM moderation_queue q"));
  assert.ok(lookup, "the open queue lookup runs");
  assert.equal(lookup.count, 20, "only the 20 emitted cameras are looked up, not all 30 open rows");
  assert.ok(lookup.boundArgs.length <= 100, "stays under the D1 bound-parameter cap");
  assert.deepEqual(queue.queueItems.map((item) => item.entityId), pendingIds.slice(0, 20));
  assert.ok(queue.queueItems.every((item) => item.state === "escalated" && item.sensitivity === "urgent"));
});
