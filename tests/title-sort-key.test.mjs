// Natural (numeric-aware) "alphabetical" order — migration 0047.
//
// `ORDER BY title COLLATE NOCASE` was lexicographic ("Telecamera 1, 10, 100,
// 2"). D1 cannot register custom collations, so the order is served from a
// precomputed `cameras.title_sort_key` (app/lib/title-sort-key.ts). This
// suite locks:
//   1. the key function itself, and its parity with the plain-JS twin used
//      by the import runner AND with the recursive-CTE backfill in 0047;
//   2. the real DB layer: "2" before "10", keyset pagination on
//      (title_sort_key, id) stable across a page boundary even with ties,
//      the A–Z initial seek, old (after_title, after_id) cursors still valid;
//   3. every write path stores the full key: submissions (createCamera,
//      createPendingCamera), owner edits (pending direct edit), approved
//      edit requests, and the import runner;
//   4. the real GET /api/cameras?sort=alphabetical route end to end.

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { apiRequest, cleanupRouteTree, loadLibModule, responseBody } from "./helpers/api-harness.mjs";
import { cleanupE2ETree, e2eEnv, loadE2ERoute } from "./helpers/e2e-harness.mjs";
import { runImport } from "../scripts/import/runner.mjs";
import { titleSortKey as importTitleSortKey } from "../scripts/import/title-sort-key.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRIZZLE_DIR = path.join(root, "drizzle");
const NOW = "2026-08-01T12:00:00.000Z";

after(async () => {
  await cleanupDbRuntime();
  await cleanupRouteTree();
  await cleanupE2ETree();
});

const keyLib = () => loadLibModule("title-sort-key");

// Titles that exercise every branch of the key: digit runs at the start,
// middle and end, several runs, leading zeros, runs of >= 10 digits, mixed
// case, non-ASCII letters (kept verbatim), punctuation, the empty string.
const EDGE_TITLES = [
  "Telecamera 1", "Telecamera 2", "Telecamera 10", "telecamera 100", "TELECAMERA 101",
  "007 Gate", "Via Roma 5/7", "Cam 01", "Cam 1", "x1234567890y", "x123456789012y",
  "École 3 Via 12b", "ÀÉ zz", "Ünter 9", "Ponte_2", "a-b.c 3d4e", "", "  9 spazi", "Z", "z",
];

// ---------------------------------------------------------------------------
// 1. Key function + parity
// ---------------------------------------------------------------------------

test("titleSortKey: ASCII case fold + digit runs zero-padded to 10", async () => {
  const { titleSortKey, TITLE_SORT_DIGIT_WIDTH } = await keyLib();
  assert.equal(TITLE_SORT_DIGIT_WIDTH, 10);
  assert.equal(titleSortKey("Telecamera 10"), "telecamera 0000000010");
  assert.equal(titleSortKey("Via Roma 5/7"), "via roma 0000000005/0000000007");
  assert.equal(titleSortKey("x123456789012y"), "x123456789012y", "runs of >= 10 digits are kept as-is");
  assert.equal(titleSortKey("École"), "École", "non-ASCII letters are not folded (matches SQLite NOCASE)");
  assert.ok(titleSortKey("Telecamera 2") < titleSortKey("Telecamera 10"), '"2" sorts before "10"');
  assert.ok(titleSortKey("telecamera 2") < titleSortKey("TELECAMERA 10"), "case does not affect the order");
});

test("compareByTitleSortKey orders naturally and breaks ties by id DESC (the server ORDER BY)", async () => {
  const { compareByTitleSortKey } = await keyLib();
  const rows = [
    { id: 1, title: "Telecamera 10" }, { id: 2, title: "Telecamera 2" }, { id: 3, title: "telecamera 2" },
    { id: 4, title: "Telecamera 1" }, { id: 5, title: "Telecamera 100" },
  ];
  assert.deepEqual(rows.slice().sort(compareByTitleSortKey).map((r) => r.id), [4, 3, 2, 1, 5]);
});

test("the import runner's plain-JS twin is identical to app/lib/title-sort-key.ts", async () => {
  const { titleSortKey } = await keyLib();
  const alphabet = "aZ09 _-éÉ/.x";
  const random = Array.from({ length: 500 }, (_, i) => {
    let s = "";
    for (let j = 0; j < (i % 23); j += 1) s += alphabet[(i * 7 + j * 13 + ((i * j) % 5)) % alphabet.length];
    return s;
  });
  for (const title of [...EDGE_TITLES, ...random]) {
    assert.equal(importTitleSortKey(title), titleSortKey(title), JSON.stringify(title));
  }
});

test("migration 0047 backfills existing rows with exactly the JS key (recursive CTE parity)", async () => {
  const { titleSortKey } = await keyLib();
  const db = new D1SqliteDatabase();
  const files = (await readdir(DRIZZLE_DIR)).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort();
  const pre = files.filter((name) => name < "0047_");
  const post = files.filter((name) => name >= "0047_");
  for (const file of pre) db.exec(await readFile(path.join(DRIZZLE_DIR, file), "utf8"));
  for (const title of EDGE_TITLES) {
    await db
      .prepare("INSERT INTO cameras (title, kind, latitude, longitude, status, source, updated, created_at) VALUES (?, 'PTZ', 44, 12, 'active', 'Community report', ?, ?)")
      .bind(title, NOW, NOW)
      .run();
  }
  for (const file of post) db.exec(await readFile(path.join(DRIZZLE_DIR, file), "utf8"));
  const rows = (await db.prepare("SELECT title, title_sort_key AS key FROM cameras").all()).results;
  assert.equal(rows.length, EDGE_TITLES.length);
  for (const row of rows) assert.equal(row.key, titleSortKey(row.title), JSON.stringify(row.title));
  const tmp = await db.prepare("SELECT name FROM sqlite_master WHERE name = '_title_sort_key_backfill'").first();
  assert.equal(tmp, null, "the backfill scratch table is dropped");
});

// ---------------------------------------------------------------------------
// 2. Real DB layer: order, pagination, A–Z seek
// ---------------------------------------------------------------------------

async function freshRuntime() {
  const runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  return { runtime, db };
}

async function seedTitles(titles) {
  const { runtime, db } = await freshRuntime();
  for (const title of titles) {
    await runtime.cameras.createCamera({
      title, kind: "PTZ", manufacturer: null, observedOn: null, address: "", notes: "", latitude: 44.1, longitude: 12.2,
    });
  }
  return { runtime, db };
}

async function walkAlphabetical(cameras, limit, extra = {}) {
  const seen = [];
  let after;
  for (let guard = 0; guard < 100; guard += 1) {
    const filters = { sort: "alphabetical", ...extra, ...(after ? { after } : {}) };
    const page = await cameras.listPublicCamerasPage(filters, { limit, offset: 0, count: false });
    seen.push(...page.records);
    if (page.records.length < limit) return seen;
    const last = page.records[page.records.length - 1];
    after = { title: last.title, id: last.id };
  }
  throw new Error("walk did not terminate");
}

test("DB: sort=alphabetical is natural ('2' before '10', '10' before '100')", async () => {
  const { runtime } = await seedTitles(["Telecamera 10", "Telecamera 100", "Telecamera 2", "Telecamera 1", "Telecamera 101", "telecamera 3"]);
  const page = await runtime.cameras.listPublicCamerasPage({ sort: "alphabetical" }, { limit: 50, offset: 0 });
  assert.deepEqual(
    page.records.map((r) => r.title),
    ["Telecamera 1", "Telecamera 2", "telecamera 3", "Telecamera 10", "Telecamera 100", "Telecamera 101"],
  );
});

test("DB: keyset pagination across a page boundary is stable, including ties on the key", async () => {
  // 25 numbered titles plus a block of identical and case-only-different
  // titles (equal keys) that straddles the page boundary at limit 7.
  const titles = [
    ...Array.from({ length: 25 }, (_, i) => `Telecamera ${i + 1}`),
    "Telecamera 5", "TELECAMERA 5", "telecamera 5", "Telecamera 05",
  ];
  const { runtime } = await seedTitles(titles);
  const full = (await runtime.cameras.listPublicCamerasPage({ sort: "alphabetical" }, { limit: 500, offset: 0 })).records;
  assert.equal(full.length, titles.length);
  const walked = await walkAlphabetical(runtime.cameras, 7);
  assert.deepEqual(walked.map((r) => r.id), full.map((r) => r.id), "cursor walk == single-page order (no skips, no repeats)");
  assert.equal(new Set(walked.map((r) => r.id)).size, titles.length);
  // The tied block is ordered by id DESC and is contiguous.
  const tiedIds = walked.filter((r) => /^telecamera 0?5$/i.test(r.title)).map((r) => r.id);
  assert.equal(tiedIds.length, 5);
  assert.deepEqual(tiedIds, tiedIds.slice().sort((a, b) => b - a), "ties broken by id DESC");
  // Natural order overall.
  assert.deepEqual(
    walked.map((r) => Number(r.title.replace(/\D+/g, ""))),
    walked.map((r) => Number(r.title.replace(/\D+/g, ""))).slice().sort((a, b) => a - b),
  );
});

test("DB: a cursor in the middle of a tie resumes exactly after that row", async () => {
  const { runtime } = await seedTitles(["Cam 2", "Cam 2", "Cam 2", "Cam 10"]);
  const full = (await runtime.cameras.listPublicCamerasPage({ sort: "alphabetical" }, { limit: 10, offset: 0 })).records;
  const middle = full[1];
  const rest = (await runtime.cameras.listPublicCamerasPage(
    { sort: "alphabetical", after: { title: middle.title, id: middle.id } },
    { limit: 10, offset: 0 },
  )).records;
  assert.deepEqual(rest.map((r) => r.id), full.slice(2).map((r) => r.id));
});

test("DB: the cursor title is matched case-insensitively (old after_title cursors stay valid)", async () => {
  const { runtime } = await seedTitles(["Telecamera 1", "Telecamera 2", "Telecamera 10"]);
  const full = (await runtime.cameras.listPublicCamerasPage({ sort: "alphabetical" }, { limit: 10, offset: 0 })).records;
  const rest = (await runtime.cameras.listPublicCamerasPage(
    { sort: "alphabetical", after: { title: "TELECAMERA 2", id: full[1].id } },
    { limit: 10, offset: 0 },
  )).records;
  assert.deepEqual(rest.map((r) => r.title), ["Telecamera 10"]);
});

test("DB: the A–Z initial seek still works (case-insensitive, natural order inside the letter)", async () => {
  const { runtime } = await seedTitles(["Stazione 10", "stazione 2", "Semaforo", "Telecamera 1", "Ásti 1", "1 Via"]);
  const s = (await runtime.cameras.listPublicCamerasPage({ sort: "alphabetical", initial: "S" }, { limit: 50, offset: 0 })).records;
  assert.deepEqual(s.map((r) => r.title), ["Semaforo", "stazione 2", "Stazione 10"]);
  const t = (await runtime.cameras.listPublicCamerasPage({ sort: "alphabetical", initial: "T" }, { limit: 50, offset: 0 }));
  assert.deepEqual(t.records.map((r) => r.title), ["Telecamera 1"]);
  assert.equal(t.total, 1);
  const a = (await runtime.cameras.listPublicCamerasPage({ sort: "alphabetical", initial: "A" }, { limit: 50, offset: 0 })).records;
  assert.deepEqual(a, [], "a non-ASCII initial is not an A (same as the old NOCASE LIKE)");
  const z = (await runtime.cameras.listPublicCamerasPage({ sort: "alphabetical", initial: "Z" }, { limit: 50, offset: 0 })).records;
  assert.deepEqual(z, []);
});

// ---------------------------------------------------------------------------
// 3. Every write path stores the full key
// ---------------------------------------------------------------------------

async function storedKey(db, id) {
  return (await db.prepare("SELECT title_sort_key AS key FROM cameras WHERE id = ?").bind(id).first()).key;
}

test("write paths: createCamera and createPendingCamera store the natural key", async () => {
  const { runtime, db } = await freshRuntime();
  const input = { kind: "PTZ", manufacturer: null, observedOn: null, address: "", notes: "", latitude: 44.1, longitude: 12.2 };
  const active = await runtime.cameras.createCamera({ ...input, title: "Telecamera 7" });
  const pending = await runtime.cameras.createPendingCamera({ ...input, title: "Varco 12" });
  assert.equal(await storedKey(db, active.id), "telecamera 0000000007");
  assert.equal(await storedKey(db, pending.id), "varco 0000000012");
});

test("write paths: an owner edit of a pending record re-keys the title", async () => {
  const { runtime, db } = await freshRuntime();
  const contributorId = (await db
    .prepare("INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at) VALUES (?, NULL, 'x', ?, ?) RETURNING id")
    .bind("sortkey-owner@example.org", NOW, NOW)
    .first()).id;
  const camera = await runtime.cameras.createPendingCamera({
    title: "Telecamera 1", kind: "PTZ", manufacturer: null, observedOn: null, address: "", notes: "",
    latitude: 44.1, longitude: 12.2, contributorId,
  });
  const result = await runtime.cameraEdits.applyCameraEdit({ cameraId: camera.id, contributorId, fields: { title: "Telecamera 20" }, now: NOW });
  assert.equal(result.kind, "direct_applied");
  assert.equal(await storedKey(db, camera.id), "telecamera 0000000020");
  // A non-title edit leaves the key alone.
  await runtime.cameraEdits.applyCameraEdit({ cameraId: camera.id, contributorId, fields: { notes: "pole" }, now: NOW });
  assert.equal(await storedKey(db, camera.id), "telecamera 0000000020");
});

test("write paths: approving an edit request applies the proposed title's key", async () => {
  const { runtime, db } = await freshRuntime();
  const ownerId = (await db
    .prepare("INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at) VALUES (?, NULL, 'x', ?, ?) RETURNING id")
    .bind("sortkey-editor@example.org", NOW, NOW)
    .first()).id;
  const cameraId = (await db
    .prepare(
      `INSERT INTO cameras (title, title_sort_key, kind, latitude, longitude, status, source, updated, contributor_id, last_verified_at, review_due_at, created_at)
       VALUES ('Telecamera 3', 'telecamera 0000000003', 'PTZ', 44.1, 12.2, 'active', 'Community report', ?, ?, ?, '2027-08-01T00:00:00.000Z', ?) RETURNING id`,
    )
    .bind(NOW, ownerId, NOW, NOW)
    .first()).id;
  db.exec(`
    INSERT INTO users (id, email, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES
      (2, 'record@osdb.test', 'Demo Record Reviewer', 'moderator', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    INSERT INTO reviewers (id, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES
      (2, 'Demo Record Reviewer', 'record_reviewer', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');
  `);

  // A non-title request keeps the key untouched on approval.
  const notesOnly = await runtime.cameraEdits.applyCameraEdit({ cameraId, contributorId: ownerId, fields: { notes: "pole" }, now: NOW });
  assert.equal(notesOnly.kind, "edit_request_created");
  assert.equal((await runtime.moderation.moderateCameraEdit(notesOnly.editRequest.id, "approve", "verified-public-infrastructure", null, { actorId: 2 })).kind, "ok");
  assert.equal(await storedKey(db, cameraId), "telecamera 0000000003");

  const created = await runtime.cameraEdits.applyCameraEdit({ cameraId, contributorId: ownerId, fields: { title: "Telecamera 30" }, now: NOW });
  assert.equal(created.kind, "edit_request_created");
  assert.equal(await storedKey(db, cameraId), "telecamera 0000000003", "no change before approval");
  const decided = await runtime.moderation.moderateCameraEdit(created.editRequest.id, "approve", "verified-public-infrastructure", null, { actorId: 2 });
  assert.equal(decided.kind, "ok");
  const row = await db.prepare("SELECT title, title_sort_key AS key FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.deepEqual({ ...row }, { title: "Telecamera 30", key: "telecamera 0000000030" });
});

test("write paths: the import runner stores the natural key on inserted rows", async () => {
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  const summary = await runImport(db, {
    slug: "fixture",
    descriptor: {
      slug: "fixture",
      source_name: "Fixture Open Data (test)",
      format: "geojson",
      license: "ODbL 1.0",
      license_url: "https://opendatacommons.org/licenses/odbl/1-0/",
      source_url: "https://example.invalid/fixture",
      attribution_text: "© Fixture",
      external_id_prefix: "fix:",
    },
    payload: [
      { name: "Varco 9", kind: "dome", latitude: 45.1, longitude: 9.1, external_id: "k9" },
      { name: "Varco 10", kind: "ptz", latitude: 45.3, longitude: 9.3, external_id: "k10" },
    ],
    options: { apply: true },
  });
  assert.equal(summary.counts.inserted, 2);
  const rows = (await db.prepare("SELECT title, title_sort_key AS key FROM cameras WHERE source = 'import:fixture' ORDER BY title_sort_key").all()).results;
  assert.equal(rows.length, 2);
  for (const row of rows) assert.equal(row.key, importTitleSortKey(row.title));
  assert.match(rows[0].key, /0000000009$/, "Varco 9 sorts before Varco 10");
  assert.match(rows[1].key, /0000000010$/);
});

test("raw INSERTs without a key fall back to the case-folded title (migration 0047 trigger)", async () => {
  const { db } = await freshRuntime();
  const id = (await db
    .prepare("INSERT INTO cameras (title, kind, latitude, longitude, status, source, updated, created_at) VALUES ('Seed CAM', 'PTZ', 44, 12, 'active', 'Development seed', ?, ?) RETURNING id")
    .bind(NOW, NOW)
    .first()).id;
  assert.equal(await storedKey(db, id), "seed cam");
});

// ---------------------------------------------------------------------------
// 4. Real route: GET /api/cameras?sort=alphabetical
// ---------------------------------------------------------------------------

test("API: GET /api/cameras?sort=alphabetical is natural and its after_title/after_id cursor pages cleanly", async () => {
  const env = await e2eEnv();
  env.DB = new D1SqliteDatabase();
  await applyDrizzleMigrations(env.DB);
  const titles = ["Telecamera 10", "Telecamera 2", "Telecamera 1", "Telecamera 100", "Telecamera 20", "Telecamera 3"];
  for (const title of titles) {
    await env.DB
      .prepare("INSERT INTO cameras (title, title_sort_key, kind, latitude, longitude, status, source, updated, created_at) VALUES (?, ?, 'PTZ', 44, 12, 'active', 'Community report', ?, ?)")
      .bind(title, importTitleSortKey(title), NOW, NOW)
      .run();
  }
  const route = await loadE2ERoute("app/api/cameras/route.mjs");
  const first = await responseBody(await route.GET(apiRequest("/api/cameras?sort=alphabetical&limit=4")));
  assert.deepEqual(first.records.map((r) => r.title), ["Telecamera 1", "Telecamera 2", "Telecamera 3", "Telecamera 10"]);
  const last = first.records.at(-1);
  const query = new URLSearchParams({ sort: "alphabetical", limit: "4", after_title: last.title, after_id: String(last.id) });
  const second = await responseBody(await route.GET(apiRequest(`/api/cameras?${query}`)));
  assert.deepEqual(second.records.map((r) => r.title), ["Telecamera 20", "Telecamera 100"]);
});
