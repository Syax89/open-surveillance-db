// Anti-gaming DB layer for community verifications (ADR 0018 §5, C1).
//
// DB-layer integration tests against the REAL db/confirmations.ts SQL on a
// fresh in-memory SQLite (schema from the real Drizzle migrations 0000-0023).
// The route-level HTTP contract is covered separately in
// tests/api-confirmations.test.mjs; this suite pins the six anti-gaming
// layers at the database boundary, exactly like photo-pending-quota.test.mjs
// pins the photo quota:
//
//   1. structural UNIQUE (SQL level + race -> exactly one row);
//   2. level gate (>= 1 verified contribution, never pending) + self-verify;
//   3. camera public predicate (status + review window, demo carve-out);
//   4. daily per-account quota as D1 state (20/day, 40 trusted) + window reset;
//   5. per-record cap (5 distinct contributors/day, 6th -> 429);
//   6. decay (created_at >= last_verified_at) + re-verification renewal.
// Plus confirmationCountsFor (one GROUP BY IN, no N+1), removeConfirmation
// and the extended eraseContributor (GDPR art. 17, ADR 0018 §6.2).
//
// No personal data: all fixtures are fictional; the clock is injected.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";

const NOW = "2026-08-01T12:00:00.000Z";

let runtime;
let db;
let confirmations;

beforeEach(async () => {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  confirmations = runtime.confirmations;
});

after(async () => cleanupDbRuntime());

let contributorSeq = 0;

// Raw INSERT of a camera with every NOT NULL column (nullable metadata uses
// its fixture default). `status` defaults to verified (public, no review
// window when reviewDueAt stays null).
async function insertCamera(overrides = {}) {
  const row = {
    title: "Anti-gaming camera",
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
      row.lastVerifiedAt,
      row.reviewDueAt,
      row.reviewIntervalMonths,
      row.contributorId,
      row.createdAt,
    )
    .first();
  return result.id;
}

// Raw INSERT of a contributor (email is unique per fixture).
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

// A contributor who clears the level gate: owns one verified camera.
async function makeVerifiedContributor() {
  const contributorId = await insertContributor();
  await insertCamera({ contributorId, status: "verified" });
  return contributorId;
}

async function insertConfirmation(cameraId, contributorId, createdAt) {
  await db
    .prepare("INSERT INTO camera_confirmations (camera_id, contributor_id, created_at) VALUES (?, ?, ?)")
    .bind(cameraId, contributorId, createdAt)
    .run();
}

async function setConfirmation(cameraId, contributorId, now = NOW) {
  return confirmations.setConfirmation({ cameraId, contributorId, now, env: runtime.env });
}

// ---------------------------------------------------------------------------
// 1. Structural UNIQUE
// ---------------------------------------------------------------------------

test("the UNIQUE (camera_id, contributor_id) constraint rejects a second row at the SQL level", async () => {
  const cameraId = await insertCamera();
  const contributorId = await insertContributor();
  await insertConfirmation(cameraId, contributorId, "2026-08-01T12:00:00.000Z");
  assert.throws(
    () => {
      db.prepare("INSERT INTO camera_confirmations (camera_id, contributor_id, created_at) VALUES (?, ?, ?)")
        .bind(cameraId, contributorId, "2026-08-01T12:00:00.000Z")
        .run();
    },
    /UNIQUE/i,
    "the second raw INSERT must trip the SQLite unique constraint",
  );
});

test("setConfirmation: first PUT ok, second PUT duplicate", async () => {
  const contributorId = await makeVerifiedContributor();
  const cameraId = await insertCamera();
  const first = await setConfirmation(cameraId, contributorId);
  assert.equal(first.kind, "ok");
  const second = await setConfirmation(cameraId, contributorId);
  assert.equal(second.kind, "duplicate");
});

test("race: two concurrent setConfirmation calls yield exactly one row", async () => {
  const contributorId = await makeVerifiedContributor();
  const cameraId = await insertCamera();
  const results = await Promise.allSettled([
    setConfirmation(cameraId, contributorId),
    setConfirmation(cameraId, contributorId),
  ]);
  const kinds = results
    .map((entry) => (entry.status === "fulfilled" ? entry.value.kind : `rejected:${entry.reason?.message}`))
    .sort();
  assert.deepEqual(kinds, ["duplicate", "ok"]);
  const rows = await db
    .prepare("SELECT COUNT(*) AS n FROM camera_confirmations WHERE camera_id = ? AND contributor_id = ?")
    .bind(cameraId, contributorId)
    .first();
  assert.equal(Number(rows.n), 1, "the race must produce exactly one row");
});

// ---------------------------------------------------------------------------
// 2. Level gate + self-verify
// ---------------------------------------------------------------------------

test("level gate: only verified contributions unlock the confirm toggle", async () => {
  const camPublic = await insertCamera();
  const gateMin = 1;

  const zeroCameras = await insertContributor();
  const g0 = await setConfirmation(camPublic, zeroCameras);
  assert.equal(g0.kind, "level_gate", "a contributor with no verified camera is gated");

  const pendingOnly = await insertContributor();
  await insertCamera({ contributorId: pendingOnly, status: "pending" });
  const gPending = await setConfirmation(camPublic, pendingOnly);
  assert.equal(gPending.kind, "level_gate", "a pending camera does NOT unlock the gate");

  const verified = await makeVerifiedContributor();
  const gOk = await setConfirmation(camPublic, verified);
  assert.equal(gOk.kind, "ok", "one verified contribution unlocks the gate");
  assert.equal(gOk.count, 1);
  assert.ok(gateMin >= 1);
});

test("self-verification is rejected", async () => {
  const owner = await makeVerifiedContributor();
  const ownedCamera = await insertCamera({ contributorId: owner });
  const result = await setConfirmation(ownedCamera, owner);
  assert.equal(result.kind, "self_verify");
});

// ---------------------------------------------------------------------------
// 3. Public predicate
// ---------------------------------------------------------------------------

test("only publicly current cameras can be confirmed", async (t) => {
  // beforeEach (fresh DB) runs before every subtest too, so each case builds
  // its own fixtures.
  for (const status of ["pending", "rejected", "removed"]) {
    await t.test(`status ${status}`, async () => {
      const verifier = await makeVerifiedContributor();
      const cameraId = await insertCamera({ status });
      const result = await setConfirmation(cameraId, verifier);
      assert.equal(result.kind, "camera_not_public");
    });
  }
  await t.test("verified but review-due in the past", async () => {
    const verifier = await makeVerifiedContributor();
    const cameraId = await insertCamera({ status: "verified", reviewDueAt: "2026-01-01T00:00:00.000Z" });
    const result = await setConfirmation(cameraId, verifier);
    assert.equal(result.kind, "camera_not_public");
  });
  await t.test("demo stays public without a review window", async () => {
    const verifier = await makeVerifiedContributor();
    const cameraId = await insertCamera({ status: "demo" });
    const result = await setConfirmation(cameraId, verifier);
    assert.equal(result.kind, "ok");
  });
});

// ---------------------------------------------------------------------------
// 4. Daily quota (D1 state) + 5. per-record cap
// ---------------------------------------------------------------------------

test("daily quota: 20/day, the 21st answers 429 and the window resets after 24h", async () => {
  // The base daily cap CONFIRMATIONS_DAILY_MAX defaults to 20, but a
  // contributor who clears the level gate is trusted and is capped by the
  // trusted knob (default 40). Pin the trusted cap to 20 so the D1-state
  // daily quota is the binding layer at exactly 20, as the acceptance
  // criteria specify (20 ok, 21st 429, window resets after 24h).
  runtime.env.CONFIRMATIONS_DAILY_MAX_TRUSTED = "20";
  const verifier = await makeVerifiedContributor();
  const targets = [];
  for (let index = 0; index < 20; index += 1) targets.push(await insertCamera());
  const extra = await insertCamera();

  for (const cameraId of targets) {
    const result = await setConfirmation(cameraId, verifier, NOW);
    assert.equal(result.kind, "ok");
  }

  const blocked = await setConfirmation(extra, verifier, NOW);
  assert.equal(blocked.kind, "daily_quota_exceeded");
  assert.ok(blocked.retryAfterSeconds >= 1, "Retry-After must be positive");

  const later = new Date(Date.parse(NOW) + 24 * 60 * 60 * 1000 + 1).toISOString();
  const reset = await setConfirmation(extra, verifier, later);
  assert.equal(reset.kind, "ok", "past the 24h window the 20 confirmations no longer count");
});

test("trusted quota: a verified contributor is capped by CONFIRMATIONS_DAILY_MAX_TRUSTED, a separate knob", async () => {
  runtime.env.CONFIRMATIONS_DAILY_MAX_TRUSTED = "3";
  const verifier = await makeVerifiedContributor();
  const blockedCam = await insertCamera();
  for (let index = 0; index < 3; index += 1) {
    const cameraId = await insertCamera();
    const result = await setConfirmation(cameraId, verifier, NOW);
    assert.equal(result.kind, "ok", `trusted confirmation ${index + 1} must be ok`);
  }
  const blocked = await setConfirmation(blockedCam, verifier, NOW);
  assert.equal(blocked.kind, "daily_quota_exceeded", "the 4th trusted confirmation trips the trusted cap");
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test("per-record cap: 5 distinct contributors, the 6th answers 429", async () => {
  runtime.env.CONFIRMATIONS_PER_RECORD_DAILY_MAX = "5";
  const target = await insertCamera();
  for (let index = 0; index < 5; index += 1) {
    const verifier = await makeVerifiedContributor();
    const result = await setConfirmation(target, verifier, NOW);
    assert.equal(result.kind, "ok", `confirmation ${index + 1} must be ok`);
  }
  const sixth = await makeVerifiedContributor();
  const blocked = await setConfirmation(target, sixth, NOW);
  assert.equal(blocked.kind, "per_record_cap_exceeded");
  assert.ok(blocked.retryAfterSeconds >= 1);
});

// ---------------------------------------------------------------------------
// 6. Decay + confirmationCountsFor (GROUP BY IN, no N+1)
// ---------------------------------------------------------------------------

test("decay: confirmations before last_verified_at do not count; a re-verified record renews", async () => {
  const cameraId = await insertCamera({ status: "verified", lastVerifiedAt: "2026-08-10T00:00:00.000Z" });
  const first = await insertContributor();
  const second = await insertContributor();

  await insertConfirmation(cameraId, first, "2026-08-01T00:00:00.000Z");
  assert.equal(await confirmations.recordConfirmationCount(cameraId), 0, "pre-window confirmations are decayed");

  await insertConfirmation(cameraId, second, "2026-08-15T00:00:00.000Z");
  assert.equal(await confirmations.recordConfirmationCount(cameraId), 1);

  // Re-verify: last_verified_at moves later, the 2026-08-15 confirmation is
  // now outside the window and the record's count renews to zero.
  await db.prepare("UPDATE cameras SET last_verified_at = ? WHERE id = ?").bind("2026-08-20T00:00:00.000Z", cameraId).run();
  assert.equal(await confirmations.recordConfirmationCount(cameraId), 0, "a re-verified record renews its confirmations");

  const third = await insertContributor();
  await insertConfirmation(cameraId, third, "2026-08-21T00:00:00.000Z");
  assert.equal(await confirmations.recordConfirmationCount(cameraId), 1);
});

test("confirmationCountsFor aggregates in one GROUP BY with decay", async () => {
  const camA = await insertCamera({ lastVerifiedAt: "2026-08-10T00:00:00.000Z" });
  const camB = await insertCamera();
  const camC = await insertCamera({ lastVerifiedAt: "2026-08-10T00:00:00.000Z" });
  const one = await insertContributor();
  const two = await insertContributor();

  // A: both confirmations after lastVerifiedAt -> 2.
  await insertConfirmation(camA, one, "2026-08-15T00:00:00.000Z");
  await insertConfirmation(camA, two, "2026-08-16T00:00:00.000Z");
  // B: no decay (last_verified_at NULL) -> 2.
  await insertConfirmation(camB, one, "2026-08-01T00:00:00.000Z");
  await insertConfirmation(camB, two, "2026-08-02T00:00:00.000Z");
  // C: confirmation before lastVerifiedAt -> decayed -> absent.
  await insertConfirmation(camC, one, "2026-08-01T00:00:00.000Z");

  const counts = await confirmations.confirmationCountsFor([camA, camB, camC]);
  assert.equal(counts.get(camA), 2);
  assert.equal(counts.get(camB), 2);
  assert.equal(counts.has(camC), false, "a fully decayed camera is absent, not zero");

  assert.equal((await confirmations.confirmationCountsFor([])).size, 0, "empty input -> empty Map");
  assert.equal((await confirmations.confirmationCountsFor([999999])).size, 0, "unknown ids -> absent");
  assert.equal(await confirmations.recordConfirmationCount(camC), 0, "a fully decayed record reads as 0");
});

test("removeConfirmation decrements the decayed count and answers not_found when missing", async () => {
  const verifier = await makeVerifiedContributor();
  const cameraId = await insertCamera();
  const set = await setConfirmation(cameraId, verifier);
  assert.equal(set.kind, "ok");
  assert.equal(set.count, 1);

  const removed = await confirmations.removeConfirmation({ cameraId, contributorId: verifier });
  assert.equal(removed.kind, "ok");
  assert.equal(removed.count, 0);

  const again = await confirmations.removeConfirmation({ cameraId, contributorId: verifier });
  assert.equal(again.kind, "not_found");
});

// ---------------------------------------------------------------------------
// Erasure (GDPR art. 17, ADR 0018 §6.2)
// ---------------------------------------------------------------------------

test("eraseContributor deletes verifications and de-attributes community data", async () => {
  const erased = await makeVerifiedContributor();
  const other = await makeVerifiedContributor();
  const target = await insertCamera();

  const set = await setConfirmation(target, erased);
  assert.equal(set.kind, "ok");

  await db
    .prepare("INSERT INTO camera_edit_requests (camera_id, contributor_id, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)")
    .bind(target, erased, "2026-08-01T09:00:00.000Z", "2026-08-01T09:00:00.000Z")
    .run();
  await db
    .prepare("INSERT INTO correction_requests (camera_id, issue_type, message, status, contributor_id, created_at) VALUES (?, 'inaccurate', 'metadata wrong', 'pending', ?, ?)")
    .bind(target, erased, "2026-08-01T09:00:00.000Z")
    .run();

  const owned = await db.prepare("SELECT id FROM cameras WHERE contributor_id = ?").bind(erased).first();
  assert.ok(owned, "the erased contributor owns a verified camera");

  const result = await runtime.auth.eraseContributor(erased);
  assert.equal(result.deleted, true);
  assert.equal(result.deletedConfirmations, 1, "verifications given are hard-deleted (own data)");
  assert.equal(result.deattributedCorrections, 1, "corrections are de-attributed, never deleted");
  assert.equal(result.deattributedReports, 1, "owned reports are de-attributed (ADR 0013 pattern)");

  const confirmationsLeft = await db.prepare("SELECT COUNT(*) AS n FROM camera_confirmations WHERE contributor_id = ?").bind(erased).first();
  assert.equal(Number(confirmationsLeft.n), 0, "no verification row survives the erasure");

  const edits = await db.prepare("SELECT contributor_id AS cid FROM camera_edit_requests").all();
  assert.equal(edits.results.length, 1, "the edit-request row survives for the audit trail");
  assert.equal(edits.results[0].cid, null, "its contributor link is severed, not deleted");

  const corrections = await db.prepare("SELECT contributor_id AS cid FROM correction_requests").all();
  assert.equal(corrections.results.length, 1, "the correction row survives");
  assert.equal(corrections.results[0].cid, null, "its contributor link is severed, not deleted");

  const contributorGone = await db.prepare("SELECT COUNT(*) AS n FROM contributors WHERE id = ?").bind(erased).first();
  assert.equal(Number(contributorGone.n), 0, "the contributor row is hard-deleted");

  const cameraKept = await db.prepare("SELECT contributor_id AS cid FROM cameras WHERE id = ?").bind(owned.id).first();
  assert.equal(cameraKept.cid, null, "the record survives, de-attributed");

  // The other contributor is untouched.
  const untouched = await db.prepare("SELECT COUNT(*) AS n FROM contributors WHERE id = ?").bind(other).first();
  assert.equal(Number(untouched.n), 1);
});
