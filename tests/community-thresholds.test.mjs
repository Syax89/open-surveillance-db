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
    title: "Threshold camera",
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
    updated: "Test update",
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
    email: `contrib-${contributorSeq}-${crypto.randomUUID()}@example.org`,
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

async function makeVerifiedContributor(activeCameraCount = 1) {
  const contributorId = await insertContributor();
  for (let i = 0; i < activeCameraCount; i += 1) {
    await insertCamera({ contributorId, status: "active" });
  }
  return contributorId;
}

async function setCommunityAction(cameraId, contributorId, actionType, now = NOW) {
  return runtime.communityActions.setCommunityAction({
    cameraId, contributorId, actionType, now, env: runtime.env,
  });
}

// Upsert a community_settings knob (the seed 0037 already inserted every
// ADR 0021 default, so a bare INSERT would hit the UNIQUE constraint).
async function upsertSetting(key, value, updatedAt = NOW) {
  await db
    .prepare(
      "INSERT INTO community_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key, value, updatedAt)
    .run();
  runtime.communitySettings.resetCommunitySettingsCache();
}

// ---------------------------------------------------------------------------
// 1. like: ok, doesn't change status, feeds usefulCount
// ---------------------------------------------------------------------------

test("like action succeeds, does not change status, feeds usefulCount", async () => {
  const contributorId = await makeVerifiedContributor();
  const cameraId = await insertCamera();
  const result = await setCommunityAction(cameraId, contributorId, "like");
  assert.equal(result.kind, "ok");
  assert.equal(result.actionType, "like");
  assert.equal(result.counts.like, 1);

  const counts = await runtime.communityActions.communityActionCountsFor([cameraId]);
  assert.equal(counts.get(cameraId)?.like, 1);

  const camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "active", "like must not change status");
});

// ---------------------------------------------------------------------------
// 2. confirm: ok, refreshes last_verified_at; on active record doesn't change status
// ---------------------------------------------------------------------------

test("confirm action succeeds and refreshes last_verified_at", async () => {
  const contributorId = await makeVerifiedContributor();
  const cameraId = await insertCamera();
  const result = await setCommunityAction(cameraId, contributorId, "confirm");
  assert.equal(result.kind, "ok");
  assert.equal(result.actionType, "confirm");

  const camera = await db.prepare("SELECT status, last_verified_at AS lva FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "active", "a single confirm must not change status");
  assert.ok(camera.lva !== null, "last_verified_at must be refreshed");
});

// ---------------------------------------------------------------------------
// 3. gone threshold: 3 L1 contributors → removed
// ---------------------------------------------------------------------------

test("gone threshold: 3 L1 contributors trigger removal, event + consumption", async () => {
  const cameraId = await insertCamera();
  for (let i = 0; i < 3; i += 1) {
    const contributorId = await makeVerifiedContributor();
    const result = await setCommunityAction(cameraId, contributorId, "gone");
    assert.equal(result.kind, "ok");
  }

  const camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "removed", "3 L1 gone actions with 3 distinct contributors → removed");

  const events = await db
    .prepare("SELECT event_type AS eventType, detail AS detail FROM camera_lifecycle_events WHERE camera_id = ? ORDER BY created_at ASC, id ASC")
    .bind(cameraId)
    .all();
  const removedEvent = events.results.find((e) => e.eventType === "removed");
  assert.ok(removedEvent, "a removed event must exist");
  const detail = JSON.parse(removedEvent.detail);
  assert.deepEqual(detail.counts, { sum: 3, distinct: 3 }, "counts must be in the event detail");

  const spent = await db
    .prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE camera_id = ? AND action_type = 'gone'")
    .bind(cameraId)
    .first();
  assert.equal(Number(spent.n), 0, "gone actions must be consumed");

  const modEvents = await db
    .prepare("SELECT actor AS actor FROM moderation_events WHERE entity_id = ? AND action LIKE 'community-gone-%'")
    .bind(cameraId)
    .all();
  assert.ok(modEvents.results.length >= 1, "a moderation event with actor must exist");
  assert.ok(modEvents.results.some((e) => e.actor?.startsWith("community:")), "actor must be community:<id>");
});

// ---------------------------------------------------------------------------
// 4. gone below threshold: 2 contributors → status remains active
// ---------------------------------------------------------------------------

test("gone below threshold: 2 contributors do not trigger removal", async () => {
  const cameraId = await insertCamera();
  for (let i = 0; i < 2; i += 1) {
    const contributorId = await makeVerifiedContributor();
    await setCommunityAction(cameraId, contributorId, "gone");
  }
  const camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "active");

  const goneCount = await db
    .prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE camera_id = ? AND action_type = 'gone'")
    .bind(cameraId)
    .first();
  assert.equal(Number(goneCount.n), 2, "below-threshold gone actions are NOT consumed");
});

// ---------------------------------------------------------------------------
// 5. min-distinct: one L4 (weight 5, sum >= 3) but distinct = 1 < 3 → NOT removed
// ---------------------------------------------------------------------------

test("gone min-distinct gate: one L4 (weight 5) but only 1 distinct → NOT removed", async () => {
  const cameraId = await insertCamera();
  const contributorId = await makeVerifiedContributor(50);
  const result = await setCommunityAction(cameraId, contributorId, "gone");
  assert.equal(result.kind, "ok");

  const camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "active", "sum=5 >= 3 but distinct=1 < 3 → NOT removed per ADR §4.1");
});

// ---------------------------------------------------------------------------
// 6. L0: 3 L0 (0.25*3=0.75) → NOT removed; 12 L0 (3.0) with 12 distinct → removed
// ---------------------------------------------------------------------------

test("L0 contributors: 3 L0 (0.75) below threshold, 12 L0 (3.0) reach it", async () => {
  // This test isolates the L0 weight math (0.25 each); the per-record quota
  // (5/day) has its own dedicated test, so raise it out of the way here.
  await upsertSetting("quotas.perRecordPerDay", "20");
  const cameraId = await insertCamera();

  for (let i = 0; i < 3; i += 1) {
    const contributorId = await insertContributor();
    await setCommunityAction(cameraId, contributorId, "gone");
  }
  let camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "active", "3 L0 gone (0.75) below threshold");

  for (let i = 0; i < 9; i += 1) {
    const contributorId = await insertContributor();
    await setCommunityAction(cameraId, contributorId, "gone");
  }
  camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "removed", "12 L0 gone (3.0) with 12 distinct → removed");
});

// ---------------------------------------------------------------------------
// 7. problem: 3/2 → hidden reason problem + consumption + event hidden
// ---------------------------------------------------------------------------

test("problem threshold: 3 distinct (sum >= 3) trigger hidden reason=problem", async () => {
  const cameraId = await insertCamera();
  for (let i = 0; i < 3; i += 1) {
    const contributorId = await makeVerifiedContributor();
    const result = await setCommunityAction(cameraId, contributorId, "problem");
    assert.equal(result.kind, "ok");
  }

  const camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "hidden");

  const events = await db
    .prepare("SELECT event_type AS eventType, detail AS detail FROM camera_lifecycle_events WHERE camera_id = ? ORDER BY created_at ASC, id ASC")
    .bind(cameraId)
    .all();
  const hiddenEvent = events.results.find((e) => e.eventType === "hidden");
  assert.ok(hiddenEvent, "a hidden event must exist");
  const detail = JSON.parse(hiddenEvent.detail);
  assert.equal(detail.reason, "problem");
  assert.deepEqual(detail.counts, { sum: 3, distinct: 3 });

  const spent = await db
    .prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE camera_id = ? AND action_type = 'problem'")
    .bind(cameraId)
    .first();
  assert.equal(Number(spent.n), 0, "problem actions must be consumed");
});

// ---------------------------------------------------------------------------
// 8. privacy: 1 action → hidden immediate reason privacy
// ---------------------------------------------------------------------------

test("privacy threshold: 1 action triggers immediate hidden reason=privacy", async () => {
  const cameraId = await insertCamera();
  const contributorId = await makeVerifiedContributor();
  const result = await setCommunityAction(cameraId, contributorId, "privacy");
  assert.equal(result.kind, "ok");

  const camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "hidden");

  const events = await db
    .prepare("SELECT event_type AS eventType, detail AS detail FROM camera_lifecycle_events WHERE camera_id = ? ORDER BY created_at ASC, id ASC")
    .bind(cameraId)
    .all();
  const hiddenEvent = events.results.find((e) => e.eventType === "hidden");
  assert.ok(hiddenEvent);
  const detail = JSON.parse(hiddenEvent.detail);
  assert.equal(detail.reason, "privacy");
});

// ---------------------------------------------------------------------------
// 9. restore removed → active: 3 confirm distinct
// ---------------------------------------------------------------------------

test("restore removed → active: 3 confirm actions restore the record", async () => {
  const cameraId = await insertCamera({ status: "removed" });
  for (let i = 0; i < 3; i += 1) {
    const contributorId = await makeVerifiedContributor();
    const result = await setCommunityAction(cameraId, contributorId, "confirm");
    assert.equal(result.kind, "ok");
  }

  const camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "active", "3 confirm distinct must restore removed → active");

  const events = await db
    .prepare("SELECT event_type AS eventType FROM camera_lifecycle_events WHERE camera_id = ? AND event_type = 'restored'")
    .bind(cameraId)
    .all();
  assert.ok(events.results.length >= 1, "a restored event must exist");

  const confirmLeft = await db
    .prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE camera_id = ? AND action_type = 'confirm'")
    .bind(cameraId)
    .first();
  assert.equal(Number(confirmLeft.n), 0, "confirm actions must be consumed on restore");
});

// ---------------------------------------------------------------------------
// 10. restore hidden(problem) → active: 5 confirm distinct
// ---------------------------------------------------------------------------

test("restore hidden(problem) → active: 5 confirm distinct", async () => {
  const cameraId = await insertCamera({ status: "hidden" });
  await db
    .prepare(
      "INSERT INTO camera_lifecycle_events (camera_id, event_type, detail, created_at) VALUES (?, 'hidden', ?, ?)",
    )
    .bind(cameraId, JSON.stringify({ reason: "problem", counts: { sum: 3, distinct: 3 } }), "2026-07-01T00:00:00.000Z")
    .run();

  for (let i = 0; i < 5; i += 1) {
    const contributorId = await makeVerifiedContributor();
    await setCommunityAction(cameraId, contributorId, "confirm");
  }

  const camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "active", "5 confirm distinct must restore hidden → active");
});

// ---------------------------------------------------------------------------
// 11. cooldown privacy: hidden for privacy; within 7d restore blocked; after 7d ok
// ---------------------------------------------------------------------------

test("cooldown privacy: restore blocked within 7 days, allowed after", async () => {
  const hiddenAt = "2026-08-01T12:00:00.000Z";
  const cameraId = await insertCamera({ status: "hidden" });
  await db
    .prepare(
      "INSERT INTO camera_lifecycle_events (camera_id, event_type, detail, created_at) VALUES (?, 'hidden', ?, ?)",
    )
    .bind(cameraId, JSON.stringify({ reason: "privacy", counts: { distinct: 1 } }), hiddenAt)
    .run();

  const withinCooldown = new Date(Date.parse(hiddenAt) + 6 * 24 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 5; i += 1) {
    const contributorId = await makeVerifiedContributor();
    await setCommunityAction(cameraId, contributorId, "confirm", withinCooldown);
  }

  let camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "hidden", "within cooldown, 5 confirm must NOT restore");

  const afterCooldown = new Date(Date.parse(hiddenAt) + 8 * 24 * 60 * 60 * 1000).toISOString();
  const newContrib = await makeVerifiedContributor();
  await setCommunityAction(cameraId, newContrib, "confirm", afterCooldown);

  camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "active", "after cooldown, additional confirm must restore");
});

// ---------------------------------------------------------------------------
// 12. concurrency thresholds: race two gone actions → exactly one transition
// ---------------------------------------------------------------------------

test("concurrency thresholds: race two gone actions produces exactly one transition", async () => {
  const cameraId = await insertCamera();
  // Pre-seed 2 gone actions
  for (let i = 0; i < 2; i += 1) {
    const contributorId = await makeVerifiedContributor();
    await setCommunityAction(cameraId, contributorId, "gone");
  }

  const c1 = await makeVerifiedContributor();
  const c2 = await makeVerifiedContributor();

  const results = await Promise.allSettled([
    setCommunityAction(cameraId, c1, "gone"),
    setCommunityAction(cameraId, c2, "gone"),
  ]);

  const kinds = results.map((e) => (e.status === "fulfilled" ? e.value.kind : "rejected"));
  assert.ok(kinds.includes("ok"), "at least one must succeed");

  const camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "removed");

  const removedEvents = await db
    .prepare("SELECT COUNT(*) AS n FROM camera_lifecycle_events WHERE camera_id = ? AND event_type = 'removed'")
    .bind(cameraId)
    .first();
  assert.equal(Number(removedEvents.n), 1, "exactly one removed event must be emitted");

  const goneLeft = await db
    .prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE camera_id = ? AND action_type = 'gone'")
    .bind(cameraId)
    .first();
  assert.equal(Number(goneLeft.n), 0, "all gone actions must be consumed");
});

// ---------------------------------------------------------------------------
// 13. concurrency UNIQUE: two concurrent PUTs on same (camera, contributor)
// ---------------------------------------------------------------------------

test("concurrency UNIQUE: two concurrent setCommunityAction on same pair → one ok, one duplicate", async () => {
  const cameraId = await insertCamera();
  const contributorId = await makeVerifiedContributor();

  const results = await Promise.allSettled([
    setCommunityAction(cameraId, contributorId, "like"),
    setCommunityAction(cameraId, contributorId, "like"),
  ]);

  const kinds = results
    .map((e) => (e.status === "fulfilled" ? e.value.kind : `rejected:${e.reason?.message}`))
    .sort();
  assert.deepEqual(kinds, ["duplicate", "ok"]);

  const rows = await db
    .prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE camera_id = ? AND contributor_id = ?")
    .bind(cameraId, contributorId)
    .first();
  assert.equal(Number(rows.n), 1, "race must produce exactly one row");
});

// ---------------------------------------------------------------------------
// 14. daily quota: 20 actions, 21st → daily_quota_exceeded; trusted → 40
// ---------------------------------------------------------------------------

test("daily quota: 20 actions allowed, 21st blocked", async () => {
  const contributorId = await insertContributor();
  const targets = [];
  for (let i = 0; i < 20; i += 1) targets.push(await insertCamera());
  const extra = await insertCamera();

  for (const cameraId of targets) {
    const result = await setCommunityAction(cameraId, contributorId, "like", NOW);
    assert.equal(result.kind, "ok", `action ${targets.indexOf(cameraId) + 1} must be ok`);
  }

  const blocked = await setCommunityAction(extra, contributorId, "like", NOW);
  assert.equal(blocked.kind, "daily_quota_exceeded");
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test("trusted quota: verified contributor uses the trusted knob, not the base one", async () => {
  // The base knob (20) does not apply to a verified contributor: they get
  // quotas.actionsPerDayTrusted (40 default) instead. Prove the distinction
  // by lowering the BASE cap below the trusted one — a verified contributor
  // must still pass the base cap (proving the trusted knob wins).
  await upsertSetting("quotas.actionsPerDay", "5");
  const contributorId = await makeVerifiedContributor();
  const targets = [];
  for (let i = 0; i < 5; i += 1) targets.push(await insertCamera());

  for (const cameraId of targets) {
    const result = await setCommunityAction(cameraId, contributorId, "like", NOW);
    assert.equal(result.kind, "ok", `trusted contributor must ignore the base cap (action ${targets.indexOf(cameraId) + 1})`);
  }
});

test("trusted quota: verified contributor is capped at the trusted knob (default 40)", async () => {
  const contributorId = await makeVerifiedContributor();
  const targets = [];
  for (let i = 0; i < 40; i += 1) targets.push(await insertCamera());
  const extra = await insertCamera();

  for (const cameraId of targets) {
    const result = await setCommunityAction(cameraId, contributorId, "like", NOW);
    assert.equal(result.kind, "ok", `action ${targets.indexOf(cameraId) + 1} must be ok`);
  }

  const blocked = await setCommunityAction(extra, contributorId, "like", NOW);
  assert.equal(blocked.kind, "daily_quota_exceeded");
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test("trusted quota: verified contributor uses quotas.actionsPerDayTrusted from community_settings", async () => {
  // Set the trusted cap low via community_settings so it fires quickly
  await upsertSetting("quotas.actionsPerDayTrusted", "3");
  const contributorId = await makeVerifiedContributor();
  const extra = await insertCamera();

  for (let i = 0; i < 3; i += 1) {
    const cameraId = await insertCamera();
    const result = await setCommunityAction(cameraId, contributorId, "like", NOW);
    assert.equal(result.kind, "ok", `trusted action ${i + 1} must be ok`);
  }

  const blocked = await setCommunityAction(extra, contributorId, "like", NOW);
  assert.equal(blocked.kind, "daily_quota_exceeded");
});

// ---------------------------------------------------------------------------
// 15. per-record cap: 5 distinct actions, 6th → per_record_cap_exceeded
// ---------------------------------------------------------------------------

test("per-record cap: 5 distinct contributors, 6th blocked", async () => {
  const cameraId = await insertCamera();
  for (let i = 0; i < 5; i += 1) {
    const contributorId = await insertContributor();
    const result = await setCommunityAction(cameraId, contributorId, "like", NOW);
    assert.equal(result.kind, "ok");
  }

  const sixth = await insertContributor();
  const blocked = await setCommunityAction(cameraId, sixth, "like", NOW);
  assert.equal(blocked.kind, "per_record_cap_exceeded");
  assert.ok(blocked.retryAfterSeconds >= 1);
});

// ---------------------------------------------------------------------------
// 16. self-action: like/confirm on own → self_action; gone on own → ok
// ---------------------------------------------------------------------------

test("self-action gate: like and confirm on own record blocked, gone on own allowed", async () => {
  const ownerId = await makeVerifiedContributor();
  const cameraId = await insertCamera({ contributorId: ownerId });

  const likeResult = await setCommunityAction(cameraId, ownerId, "like");
  assert.equal(likeResult.kind, "self_action");

  const confirmResult = await setCommunityAction(cameraId, ownerId, "confirm");
  assert.equal(confirmResult.kind, "self_action");

  const goneResult = await setCommunityAction(cameraId, ownerId, "gone");
  assert.equal(goneResult.kind, "ok", "gone on own record is permitted");
});

// ---------------------------------------------------------------------------
// 17. events: no attribution in camera_lifecycle_events; moderation_events has actor
// ---------------------------------------------------------------------------

test("camera_lifecycle_events carries no personal attribution; moderation_events has actor", async () => {
  const cameraId = await insertCamera();
  for (let i = 0; i < 3; i += 1) {
    const contributorId = await makeVerifiedContributor();
    await setCommunityAction(cameraId, contributorId, "gone");
  }

  const events = await db.prepare("SELECT * FROM camera_lifecycle_events WHERE camera_id = ?").bind(cameraId).all();
  if (events.results.length > 0) {
    const columns = Object.keys(events.results[0]);
    for (const forbidden of ["actor", "contributor_id", "contributorId", "email"]) {
      assert.ok(!columns.includes(forbidden), `camera_lifecycle_events must not carry ${forbidden}`);
    }
  }

  const modEvents = await db
    .prepare("SELECT actor AS actor FROM moderation_events WHERE entity_id = ? AND action LIKE 'community-%'")
    .bind(cameraId)
    .all();
  assert.ok(modEvents.results.length >= 1);
  assert.ok(modEvents.results.some((e) => e.actor?.startsWith("community:")), "moderation_events must contain actor");
});

// ---------------------------------------------------------------------------
// 18. removeCommunityAction: toggles off, counts drop; not_found on absent; no status change
// ---------------------------------------------------------------------------

test("removeCommunityAction: removes action, counts decrease; not_found on absent; status unchanged", async () => {
  const contributorId = await makeVerifiedContributor();
  const cameraId = await insertCamera();

  const set = await setCommunityAction(cameraId, contributorId, "like");
  assert.equal(set.kind, "ok");
  assert.equal(set.counts.like, 1);

  const removed = await runtime.communityActions.removeCommunityAction({ cameraId, contributorId });
  assert.equal(removed.kind, "ok");

  const counts = await runtime.communityActions.communityActionCountsFor([cameraId]);
  assert.equal(counts.get(cameraId)?.like ?? 0, 0);

  const again = await runtime.communityActions.removeCommunityAction({ cameraId, contributorId });
  assert.equal(again.kind, "not_found");

  const camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "active", "removing an action must not change status");
});

test("removeCommunityAction does not change a removed status back", async () => {
  const cameraId = await insertCamera({ status: "removed" });
  const contributorId = await makeVerifiedContributor();

  // Insert an action that did not cause the removal
  await db
    .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, 'like', 1, ?, ?)")
    .bind(cameraId, contributorId, NOW, NOW)
    .run();

  const removed = await runtime.communityActions.removeCommunityAction({ cameraId, contributorId });
  assert.equal(removed.kind, "ok");

  const camera = await db.prepare("SELECT status FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.status, "removed", "removing a non-trigger action must not reverse status");
});

// ---------------------------------------------------------------------------
// 19. communityActionCountsFor: correct counts per type
// ---------------------------------------------------------------------------

test("communityActionCountsFor returns correct counts per type across records", async () => {
  const camA = await insertCamera();
  const camB = await insertCamera();
  const camC = await insertCamera();

  const c1 = await insertContributor();
  const c2 = await insertContributor();
  const c3 = await insertContributor();

  await db
    .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, 'like', 0.25, ?, ?)")
    .bind(camA, c1, NOW, NOW).run();
  await db
    .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, 'like', 1, ?, ?)")
    .bind(camA, c2, NOW, NOW).run();
  await db
    .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, 'like', 0.25, ?, ?)")
    .bind(camB, c1, NOW, NOW).run();
  await db
    .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, 'gone', 1, ?, ?)")
    .bind(camB, c3, NOW, NOW).run();

  const counts = await runtime.communityActions.communityActionCountsFor([camA, camB, camC]);
  assert.equal(counts.get(camA)?.like, 2);
  assert.equal(counts.get(camB)?.like, 1);
  assert.equal(counts.get(camB)?.gone, 1);
  assert.equal(counts.has(camC), false, "camC has no actions — absent, not zero");

  const empty = await runtime.communityActions.communityActionCountsFor([]);
  assert.equal(empty.size, 0);
});

// ---------------------------------------------------------------------------
// 20. eraseContributor extended: after erase, actions disappear
// ---------------------------------------------------------------------------

test("eraseContributor deletes all community actions of every type", async () => {
  const erased = await makeVerifiedContributor();
  const other = await makeVerifiedContributor();

  const camA = await insertCamera();
  const camB = await insertCamera();
  const camC = await insertCamera();

  await db
    .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, 'like', 1, ?, ?)")
    .bind(camA, erased, NOW, NOW).run();
  await db
    .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, 'gone', 0.25, ?, ?)")
    .bind(camB, erased, NOW, NOW).run();
  await db
    .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, 'problem', 1, ?, ?)")
    .bind(camC, erased, NOW, NOW).run();
  await db
    .prepare("INSERT INTO camera_community_actions (camera_id, contributor_id, action_type, weight, created_at, updated_at) VALUES (?, ?, 'confirm', 1, ?, ?)")
    .bind(camA, other, NOW, NOW).run();

  const result = await runtime.auth.eraseContributor(erased);
  assert.equal(result.deleted, true);
  assert.equal(result.deletedConfirmations, 3, "every action row of the erased account is hard-deleted");

  const mine = await db.prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE contributor_id = ?").bind(erased).first();
  assert.equal(Number(mine.n), 0, "no action survives erasure");
  const theirs = await db.prepare("SELECT COUNT(*) AS n FROM camera_community_actions WHERE contributor_id = ?").bind(other).first();
  assert.equal(Number(theirs.n), 1, "other contributor untouched");
});
