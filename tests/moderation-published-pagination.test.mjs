// Published moderation-queue pagination — real SQL regression.
//
// The protected GET /api/moderation queue used to SELECT every `active`
// camera row with no LIMIT, serialising the whole published set on each
// request. The published path is now keyset-paginated (FIFO `created_at ASC,
// id ASC`, fixed page size 20) with a limit+1 probe.
//
// This suite drives the REAL db/moderation.ts SQL against a fresh in-memory
// SQLite database (like tests/moderation-events.test.mjs) and instruments the
// adapter so it can prove the active SELECT returns at most 21 rows BEFORE the
// response emits 20 — a removed LIMIT would make the recorded row count blow
// past 21 and fail here, which merely asserting `publishedCameras.length === 20`
// would not catch.
//
// Fixtures are fictitious: synthetic camera rows, no personal data.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { cleanupRouteTree, loadTreeModule } from "./helpers/api-harness.mjs";
import { D1SqliteDatabase as D1 } from "./helpers/d1-sqlite.mjs";
import { applyDrizzleMigrations } from "./helpers/db-runtime-harness.mjs";
import { resetMockState } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

// D1 adapter that records the SQL, bound arguments and result length of every
// `.all()` call, so the test can inspect the real active-camera SELECT.
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
      this.selects.push({
        sql,
        boundArgs: statement.boundArgs.slice(),
        count: result.results.length,
      });
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
  await env.DB.prepare("DELETE FROM cameras").run();
}

/** The published (active) SELECTs recorded by the adapter, in call order. */
function activeSelects(env) {
  return env.DB.selects.filter(
    (select) => select.sql.includes("FROM cameras WHERE status = ?") && select.boundArgs[0] === "active",
  );
}

async function activeRows(env) {
  return (await env.DB.prepare(
    "SELECT id, created_at AS createdAt FROM cameras WHERE status = 'active' ORDER BY created_at ASC, id ASC",
  ).all()).results;
}

/**
 * Seed `count` fictitious active cameras with 3-way timestamp ties inserted in
 * NON-chronological order, plus a few other-status rows. Returns nothing; the
 * expected FIFO order is derived independently via activeRows().
 */
async function seedPublished(env, count) {
  const insert =
    "INSERT INTO cameras (title, kind, latitude, longitude, status, source, updated, created_at) VALUES (?, 'Fixed dome', 41.9, 12.5, 'active', 'Community report', ?, ?)";
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const bucket = Math.floor(index / 3);
    const createdAt = `2026-03-01T00:${String(bucket).padStart(2, "0")}:00.000Z`;
    rows.push({ title: `Published ${index}`, createdAt });
  }
  // Reverse insertion: ids increase while created_at decreases, so the walk
  // must follow created_at (not insertion id) to be correct.
  for (const row of rows.reverse()) {
    await env.DB.prepare(insert).bind(row.title, row.createdAt, row.createdAt).run();
  }
  // Non-active rows must never appear on the published pages.
  const otherInsert =
    "INSERT INTO cameras (title, kind, latitude, longitude, status, source, updated, created_at) VALUES (?, 'Fixed dome', 41.9, 12.5, ?, 'Community report', ?, ?)";
  for (const [index, status] of ["pending", "needs_review", "stale"].entries()) {
    const createdAt = `2026-03-01T00:00:0${index}.000Z`;
    await env.DB.prepare(otherInsert).bind(`Other ${status}`, status, createdAt, createdAt).run();
  }
}

test("the published page walks bounded FIFO pages with ties, no omissions/duplicates and a null last cursor", async () => {
  const { env, moderation } = await realDb();
  await resetDb(env);
  await seedPublished(env, 45);

  const expectedIds = (await activeRows(env)).map((row) => row.id);

  const collected = [];
  const pageSizes = [];
  let cursor;
  let pages = 0;
  for (;;) {
    const queue = await moderation.listPendingModerationItems(cursor);
    const ids = queue.publishedCameras.map((camera) => camera.id);
    assert.ok(ids.length <= 20, "a page emits at most 20 rows");
    pageSizes.push(ids.length);
    assert.deepEqual(
      ids,
      expectedIds.slice(collected.length, collected.length + ids.length),
      `page ${pages} must follow the FIFO created_at/id ordering`,
    );
    collected.push(...ids);
    pages += 1;

    if (!queue.publishedNextCursor) {
      assert.equal(pages, 3, "45 records walk in exactly 20 + 20 + 5");
      break;
    }
    assert.equal(ids.length, 20, "a page with a next cursor is a full page");
    const last = queue.publishedCameras[queue.publishedCameras.length - 1];
    assert.deepEqual(
      queue.publishedNextCursor,
      { createdAt: last.createdAt, id: last.id },
      "the next cursor comes from the LAST EMITTED row",
    );
    cursor = queue.publishedNextCursor;
    assert.ok(pages < 10, "the walk must terminate");
  }

  assert.deepEqual(collected, expectedIds, "no omissions and no duplicates across the walk");
  assert.deepEqual(pageSizes, [20, 20, 5]);

  // The recorded SQL proves the bound: one active SELECT per call, each at
  // most page-size + 1 rows, and the full pages actually fetched the probe row.
  const selects = activeSelects(env);
  assert.equal(selects.length, 3, "one active SELECT per page request");
  for (const select of selects) {
    assert.ok(select.count <= 21, `active SELECT returned ${select.count} rows (> 21 means the LIMIT regressed)`);
  }
  assert.deepEqual(selects.map((select) => select.count), [21, 21, 5], "full pages probe with a limit+1 row");
});

test("the published cursor is bound as SQL parameters, never interpolated", async () => {
  const { env, moderation } = await realDb();
  await resetDb(env);
  await seedPublished(env, 45);

  const first = await moderation.listPendingModerationItems();
  const cursor = first.publishedNextCursor;
  assert.ok(cursor, "the first page must expose a next cursor");

  await moderation.listPendingModerationItems(cursor);

  const [cursorSelect] = activeSelects(env).slice(1);
  assert.ok(cursorSelect, "the second call must run one active SELECT");
  assert.match(cursorSelect.sql, /created_at > \?/);
  assert.match(cursorSelect.sql, /created_at = \? AND id > \?/);
  // Both ordering keys are bound; the id is bound as a number.
  assert.deepEqual(cursorSelect.boundArgs, ["active", cursor.createdAt, cursor.createdAt, cursor.id, 21]);
});

test("the next page does not depend on the cursor row still existing", async () => {
  const { env, moderation } = await realDb();
  await resetDb(env);
  await seedPublished(env, 45);

  const allIds = (await activeRows(env)).map((row) => row.id);
  const first = await moderation.listPendingModerationItems();
  const cursor = first.publishedNextCursor;
  const cursorIndex = allIds.indexOf(cursor.id);
  const expectedAfter = allIds.slice(cursorIndex + 1, cursorIndex + 21);

  // Delete the anchor row the cursor points at: a keyset predicate re-reads
  // only the bound VALUES, so the following page must be unchanged.
  await env.DB.prepare("DELETE FROM cameras WHERE id = ?").bind(cursor.id).run();

  const second = await moderation.listPendingModerationItems(cursor);
  assert.deepEqual(second.publishedCameras.map((camera) => camera.id), expectedAfter);
});

test("the next page does not depend on the cursor row remaining active", async () => {
  const { env, moderation } = await realDb();
  await resetDb(env);
  await seedPublished(env, 45);

  const allIds = (await activeRows(env)).map((row) => row.id);
  const first = await moderation.listPendingModerationItems();
  const cursor = first.publishedNextCursor;
  const cursorIndex = allIds.indexOf(cursor.id);
  const expectedAfter = allIds.slice(cursorIndex + 1, cursorIndex + 21);

  // Move the anchor out of `active`: the cursor row is now excluded from the
  // active set, yet the predicate (pure value comparison) is unaffected.
  await env.DB.prepare("UPDATE cameras SET status = 'stale' WHERE id = ?").bind(cursor.id).run();

  const second = await moderation.listPendingModerationItems(cursor);
  assert.deepEqual(second.publishedCameras.map((camera) => camera.id), expectedAfter);
});

test("a queue smaller than one page emits everything with a null next cursor", async () => {
  const { env, moderation } = await realDb();
  await resetDb(env);
  await seedPublished(env, 7);

  const expectedIds = (await activeRows(env)).map((row) => row.id);
  const queue = await moderation.listPendingModerationItems();
  assert.deepEqual(queue.publishedCameras.map((camera) => camera.id), expectedIds);
  assert.equal(queue.publishedNextCursor, null);
  assert.deepEqual(activeSelects(env).map((select) => select.count), [7]);
});
