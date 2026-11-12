// Directory / public-list performance guards (perf pass 2026-11).
//
// Three measured regressions, each pinned against the REAL code:
//   1. The default alphabetical directory page (now the natural order
//      `ORDER BY title_sort_key ASC, id DESC`) matched no index: full scan +
//      temp B-tree on every request. Migration 0047 adds (status,
//      title_sort_key, id DESC) (replacing 0046's NOCASE title index) and the
//      shared predicate collapses to `status = ?` outside
//      development; EXPLAIN QUERY PLAN of the exact SQL the db layer issues
//      must use that index with no "USE TEMP B-TREE".
//   2. The per-page count aggregates (confirmationCountsFor +
//      communityActionCountsFor) chunked their ids at 100 → ~40 D1 calls for
//      a 2000-record page. They now bind ONE json_each array each: ≤ 2
//      statements, identical counts.
//   3. The directory hook walked pages 1..N serially with count=true every
//      time: /directory?page=N cost N requests. It now jumps by offset (ONE
//      request per page) and counts only once per filter set.
//
// Fixtures are fictional — no personal data.
import assert from "node:assert/strict";
import test from "node:test";
import { titleSortKey } from "../scripts/import/title-sort-key.mjs";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  React,
  camerasApiResponse,
  installFetchMock,
  loadDomModule,
  renderWithLocale,
  setUrlState,
  setupDom,
} from "./helpers/dom-harness.mjs";

test.after(async () => cleanupDbRuntime());

/** A D1 adapter that records every prepared SQL string. */
function recordingDb() {
  const db = new D1SqliteDatabase();
  const statements = [];
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const statement = prepare(sql);
    const bind = statement.bind.bind(statement);
    statement.bind = (...args) => {
      statements.push({ sql, args });
      return bind(...args);
    };
    return statement;
  };
  return { db, statements };
}

async function freshRuntime() {
  const runtime = await loadDbRuntime();
  const { db, statements } = recordingDb();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  // Production behaviour: the demo gate is closed outside development.
  delete runtime.env.ENVIRONMENT;
  statements.length = 0;
  return { runtime, db, statements };
}

function seedCameras(db, count) {
  const insert = db.db.prepare(
    `INSERT INTO cameras (title, title_sort_key, kind, publish_manufacturer, publish_observed_on, notes, latitude, longitude, status, source, updated, description, review_interval_months, created_at, last_verified_at)
     VALUES (?, ?, 'Fixed dome', 0, 0, '', ?, ?, 'active', 'Community report', '2026-08-01T00:00:00.000Z', '', 12, '2026-08-01T00:00:00.000Z', ?)`,
  );
  db.db.exec("BEGIN");
  for (let i = 0; i < count; i += 1) {
    // Mixed case + duplicate titles so NOCASE ordering and the id tiebreak matter.
    const title = `${i % 2 ? "camera" : "Camera"} ${String(i % 700).padStart(4, "0")}`;
    // The key every application write path stores (raw INSERTs would get
    // the trigger's plain lower(title) fallback instead).
    insert.run(title, titleSortKey(title), 44 + i * 1e-4, 12 + i * 1e-4, i % 3 === 0 ? "2026-07-01T00:00:00.000Z" : null);
  }
  db.db.exec("COMMIT");
}

function planOf(db, { sql, args }) {
  return db.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map((row) => row.detail);
}

test("migration 0047 creates the (status, title_sort_key, id DESC) index and drops the unused NOCASE one", async () => {
  const { db } = await freshRuntime();
  const row = db.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'cameras_status_title_sort_key_idx'").get();
  assert.ok(row, "cameras_status_title_sort_key_idx must exist after the migrations");
  assert.match(row.sql, /\(\s*`status`\s*,\s*`title_sort_key`\s*,\s*`id`\s*DESC\s*\)/i);
  const old = db.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'cameras_status_title_nocase_idx'").get();
  assert.equal(old, undefined, "0046's NOCASE title index is dropped (no query orders by it any more)");
});

test("the alphabetical directory page (first + cursor) walks the index, no temp B-tree", async () => {
  const { runtime, db, statements } = await freshRuntime();
  seedCameras(db, 1500);

  const first = await runtime.cameras.listPublicCamerasPage({ sort: "alphabetical" }, { limit: 20, offset: 0, count: false });
  const firstSelect = statements.find((s) => /ORDER BY title_sort_key/.test(s.sql));
  assert.ok(firstSelect, "the page SELECT must be issued");
  const last = first.records.at(-1);
  statements.length = 0;
  const second = await runtime.cameras.listPublicCamerasPage(
    { sort: "alphabetical", after: { title: last.title, id: last.id } },
    { limit: 20, offset: 0, count: false },
  );
  const cursorSelect = statements.find((s) => /ORDER BY title_sort_key/.test(s.sql));

  for (const [label, statement] of [["first page", firstSelect], ["cursor page", cursorSelect]]) {
    const plan = planOf(db, statement).join(" | ");
    assert.match(plan, /USING (?:COVERING )?INDEX cameras_status_title_sort_key_idx/, `${label} must use the title index: ${plan}`);
    assert.doesNotMatch(plan, /TEMP B-TREE/, `${label} must not sort in a temp B-tree: ${plan}`);
  }
  assert.match(planOf(db, cursorSelect).join(" | "), /title_sort_key>\?/, "the cursor page must SEEK to the cursor key");

  // Same rows as the offset page and as an independent full sort.
  const expected = db.db
    .prepare("SELECT id FROM cameras WHERE status = 'active' ORDER BY title_sort_key ASC, id DESC LIMIT 40")
    .all()
    .map((row) => row.id);
  const byOffset = await runtime.cameras.listPublicCamerasPage({ sort: "alphabetical" }, { limit: 20, offset: 20, count: false });
  assert.deepEqual(first.records.map((r) => r.id), expected.slice(0, 20));
  assert.deepEqual(second.records.map((r) => r.id), expected.slice(20, 40), "cursor page 2 = rows 21..40");
  assert.deepEqual(byOffset.records.map((r) => r.id), expected.slice(20, 40), "offset page 2 = cursor page 2");
});

test("a 2000-record page computes its community counts in ≤ 2 statements with identical results", async () => {
  const { runtime, db, statements } = await freshRuntime();
  seedCameras(db, 2000);
  db.db.exec("INSERT INTO contributors (email, password_hash, created_at, updated_at) VALUES ('a@example.org', 'x', '2026-01-01', '2026-01-01'), ('b@example.org', 'x', '2026-01-01', '2026-01-01')");
  const types = ["like", "confirm", "gone", "problem", "privacy"];
  const action = db.db.prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)");
  db.db.exec("BEGIN");
  for (let id = 1; id <= 2000; id += 7) {
    // Contributor 1: one action per camera; contributor 2 on a subset. Half
    // the confirmations predate last_verified_at (decayed → not counted).
    const created = id % 2 ? "2026-06-01T00:00:00.000Z" : "2026-08-01T00:00:00.000Z";
    action.run(id, 1, types[id % 5], created, created);
    if (id % 3 === 0) action.run(id, 2, "confirm", created, created);
  }
  db.db.exec("COMMIT");

  statements.length = 0;
  const page = await runtime.cameras.listPublicCamerasPage(undefined, { limit: 2000, offset: 0, count: true });
  assert.equal(page.records.length, 2000);
  const countStatements = statements.filter((s) => /camera_community_actions/.test(s.sql));
  assert.ok(countStatements.length <= 2, `expected ≤ 2 count statements, got ${countStatements.length}`);
  assert.ok(statements.every((s) => s.args.length <= 100), "every statement stays under the D1 bound-parameter cap");

  // Reference: the pre-fix per-camera semantics, computed independently.
  const confirmRef = db.db.prepare(
    "SELECT COUNT(*) AS n FROM camera_community_actions cc JOIN cameras c ON c.id = cc.camera_id WHERE cc.camera_id = ? AND cc.action_type = 'confirm' AND (c.last_verified_at IS NULL OR cc.created_at >= c.last_verified_at)",
  );
  const actionRef = db.db.prepare("SELECT COUNT(DISTINCT contributor_id) AS n FROM camera_community_actions WHERE camera_id = ? AND action_type = ?");
  let nonZero = 0;
  for (const record of page.records) {
    assert.equal(record.confirmationCount, confirmRef.get(record.id).n, `confirmationCount of ${record.id}`);
    for (const [field, type] of [["usefulCount", "like"], ["confirmCount", "confirm"], ["goneCount", "gone"], ["problemCount", "problem"], ["privacyCount", "privacy"]]) {
      const expected = actionRef.get(record.id, type).n;
      assert.equal(record[field], expected, `${field} of ${record.id}`);
      if (expected) nonZero += 1;
    }
  }
  assert.ok(nonZero > 300, "the fixture exercises real counts, not only zeros");

  const sums = await runtime.communityActions.likeWeightSumsFor(page.records.map((r) => r.id));
  assert.equal(sums.size, db.db.prepare("SELECT COUNT(DISTINCT camera_id) AS n FROM camera_community_actions WHERE action_type = 'like'").get().n);
});

// ---------------------------------------------------------------------------
// Client: /directory?page=N
// ---------------------------------------------------------------------------

const RECORDS = Array.from({ length: 120 }, (_, i) => ({
  id: i + 1,
  title: `Record ${String(i + 1).padStart(3, "0")}`,
  kind: "Fixed dome",
  status: "active",
  latitude: 41.9 + i * 0.001,
  longitude: 12.49 + i * 0.0001,
  source: "Community report",
  updated: "2026-07-01",
  description: "Illustrative fixture record.",
  address: `Via Test ${i + 1}`,
}));

test("/directory?page=5 loads in ONE list request, and the total is counted once per filter set", async () => {
  const rtl = await setupDom();
  const { DirectoryTool } = await loadDomModule("app/components/tools/DirectoryTool.mjs");
  const calls = [];
  installFetchMock((input) => {
    const url = new URL(String(input), "https://osdb.test");
    if (url.pathname === "/api/cameras" && !url.searchParams.has("facets")) calls.push(url.searchParams);
    return camerasApiResponse(input, RECORDS);
  });
  try {
    await setUrlState("/directory?page=5");
    const { container } = await renderWithLocale(React.createElement(DirectoryTool));
    const titles = () => [...container.querySelectorAll("ul.record-list li h3")].map((n) => (n.textContent ?? "").trim());
    await rtl.waitFor(() => assert.equal(titles()[0], "Record 081"), { timeout: 5000 });
    assert.equal(titles().length, 20);
    assert.equal(calls.length, 1, `page 5 must cost one list request, got ${calls.length}`);
    assert.equal(calls[0].get("offset"), "80");
    assert.equal(calls[0].get("count"), "true", "the first request counts");
    assert.match(container.querySelector("#record-search-count")?.textContent ?? "", /120 public records found/);

    const nav = container.querySelector(".directory-pagination:not(.directory-pagination-top)");
    const [prev] = nav.querySelectorAll("button.pagination-button");
    await rtl.userEvent.click(prev);
    await rtl.waitFor(() => assert.equal(titles()[0], "Record 061"), { timeout: 5000 });
    assert.equal(calls.length, 2, "page 4 is one more request");
    assert.equal(calls[1].get("offset"), "60");
    assert.equal(calls[1].get("count"), "false", "the known total is reused: no second COUNT");
    assert.match(container.querySelector("#record-search-count")?.textContent ?? "", /120 public records found/);
  } finally {
    rtl.cleanup();
    const nav = await loadDomModule("node_modules/next/navigation.mjs");
    nav.__setNavState({ url: "/", pushed: [], replaced: [], replaceCalls: [] });
  }
});
