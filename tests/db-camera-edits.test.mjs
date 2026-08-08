// Database-boundary tests for db/camera-edits.ts (QA review P1-3: module
// coverage 76.45%, functions 77.78% — the published-path no-op, the
// non-terminal/non-published fallthrough, the missing-camera path, and the
// whole getCameraEditView owner-view surface were not exercised at the db
// layer).
//
// These run the REAL db/camera-edits.ts against the REAL migration SQL on an
// in-memory D1 adapter (same harness as tests/auth-d1.test.mjs). The route
// mapping of these results to HTTP codes is covered by tests/api-edit.test.mjs
// (Part 1 with the db layer stubbed); this suite pins the SQL truths:
//
//   - applyCameraEdit on a missing camera      -> camera_not_found
//   - published no-op edit                     -> no_changes, NO event
//   - non-terminal, non-published status       -> status_blocked, no write
//   - getCameraEditView owner view             -> ok + open editRequest | null
//   - getCameraEditView non-owner published    -> not_owner
//   - getCameraEditView non-owner hidden       -> not_found (fail-closed)
//   - getCameraEditView missing camera         -> not_found
//
// No personal data: all fixtures are fictional; the clock is injected.

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
} from "./helpers/db-runtime-harness.mjs";

let runtime;
let db;
let cameraEdits;

async function freshDb() {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  cameraEdits = runtime.cameraEdits;
}

after(async () => cleanupDbRuntime());

const NOW = "2026-08-01T12:00:00.000Z";

let contributorSeq = 0;

async function insertContributor(overrides = {}) {
  contributorSeq += 1;
  const row = {
    email: `camera-edits-contrib-${contributorSeq}-${crypto.randomUUID()}@example.org`,
    displayName: null,
    passwordHash: "pbkdf2$210000$test$fixture",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
  return (await db
    .prepare("INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(row.email, row.displayName, row.passwordHash, row.createdAt, row.updatedAt)
    .first()).id;
}

async function insertCamera(overrides = {}) {
  const row = {
    title: "Edit-flow camera",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    publishManufacturer: 0,
    publishObservedOn: 0,
    address: null,
    notes: "",
    latitude: 44.1,
    longitude: 12.2,
    status: "pending",
    source: "Community report",
    updated: "Submitted just now",
    description: "",
    lastVerifiedAt: null,
    reviewDueAt: null,
    reviewIntervalMonths: 12,
    contributorId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
  return (await db
    .prepare(
      `INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, status, source, updated, description, last_verified_at, review_due_at, review_interval_months, contributor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      row.title, row.kind, row.manufacturer, row.observedOn, row.publishManufacturer, row.publishObservedOn,
      row.address, row.notes, row.latitude, row.longitude, row.status, row.source, row.updated, row.description,
      row.lastVerifiedAt, row.reviewDueAt, row.reviewIntervalMonths, row.contributorId, row.createdAt,
    )
    .first()).id;
}

async function moderationEventCount(entity, entityId, action) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE entity = ? AND entity_id = ? AND action = ?")
    .bind(entity, entityId, action)
    .first();
  return Number(row.n);
}

// ---------------------------------------------------------------------------
// applyCameraEdit — error paths previously uncovered at the db layer
// ---------------------------------------------------------------------------

test("applyCameraEdit on a missing camera answers camera_not_found", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const result = await cameraEdits.applyCameraEdit({
    cameraId: 99999, contributorId: ownerId, fields: { title: "New title" }, now: NOW,
  });
  assert.equal(result.kind, "camera_not_found");
});

test("applyCameraEdit published no-op answers no_changes and writes NO event (anti-farming)", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const cameraId = await insertCamera({
    contributorId: ownerId, status: "active", title: "Same title",
    lastVerifiedAt: NOW, reviewDueAt: "2027-08-01T00:00:00.000Z",
  });

  // The route parser converts null/undefined to "skip" before the db layer,
  // so a no-op at db level is a field whose value matches the stored row.
  const result = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId, fields: { title: "Same title" }, now: NOW,
  });
  assert.equal(result.kind, "no_changes");

  // No edit-request row, no queue row, no audit event.
  const requests = await db
    .prepare("SELECT COUNT(*) AS n FROM camera_edit_requests WHERE camera_id = ?")
    .bind(cameraId)
    .first();
  assert.equal(Number(requests.n), 0, "a no-op must not open an edit request");
  assert.equal(await moderationEventCount("camera", cameraId, "edit_applied"), 0);
});

test("applyCameraEdit on a non-terminal, non-published status answers status_blocked with no write", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  // `demo` is the seed-only status that is neither pending, nor published,
  // nor terminal — the fallthrough branch of applyCameraEdit.
  const cameraId = await insertCamera({ contributorId: ownerId, status: "demo" });

  const result = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId, fields: { title: "New title" }, now: NOW,
  });
  assert.equal(result.kind, "status_blocked");

  const camera = await db.prepare("SELECT title FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.title, "Edit-flow camera", "no write on a blocked status");
  assert.equal(await moderationEventCount("camera", cameraId, "edit_applied"), 0);
});

// ---------------------------------------------------------------------------
// getCameraEditView — the C6 owner view, previously only stubbed at route
// ---------------------------------------------------------------------------

test("getCameraEditView returns the full owner row with no open request", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const cameraId = await insertCamera({ contributorId: ownerId, title: "My camera" });

  const result = await cameraEdits.getCameraEditView(cameraId, ownerId);
  assert.equal(result.kind, "ok");
  assert.equal(result.record.id, cameraId);
  assert.equal(result.record.title, "My camera");
  assert.equal(result.record.contributorId, ownerId, "the owner view includes the attribution");
  assert.equal(result.editRequest, null);
});

test("getCameraEditView includes the open pending edit request when one exists", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const cameraId = await insertCamera({
    contributorId: ownerId, status: "active", title: "Old title",
    lastVerifiedAt: NOW, reviewDueAt: "2027-08-01T00:00:00.000Z",
  });

  // Open an edit request the real way (published path), then view it.
  const created = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId, fields: { title: "Proposed title" }, now: NOW,
  });
  assert.equal(created.kind, "edit_request_created");

  const result = await cameraEdits.getCameraEditView(cameraId, ownerId);
  assert.equal(result.kind, "ok");
  assert.equal(result.editRequest.id, created.editRequest.id);
  assert.equal(result.editRequest.status, "pending");
  assert.equal(result.editRequest.cameraId, cameraId);
});

test("getCameraEditView answers not_owner for a published record owned by someone else", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const otherId = await insertContributor();
  const cameraId = await insertCamera({
    contributorId: ownerId, status: "active",
    lastVerifiedAt: NOW, reviewDueAt: "2027-08-01T00:00:00.000Z",
  });

  const result = await cameraEdits.getCameraEditView(cameraId, otherId);
  assert.equal(result.kind, "not_owner");
});

test("getCameraEditView answers not_found for a hidden record viewed by a non-owner", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const otherId = await insertContributor();
  // pending is never public: a non-owner must not learn it exists.
  const cameraId = await insertCamera({ contributorId: ownerId, status: "pending" });

  const result = await cameraEdits.getCameraEditView(cameraId, otherId);
  assert.equal(result.kind, "not_found");
});

test("getCameraEditView answers not_found for a missing camera", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const result = await cameraEdits.getCameraEditView(99999, ownerId);
  assert.equal(result.kind, "not_found");
});

test("getCameraEditView answers not_found for an anonymous pending record", async () => {
  await freshDb();
  const anyContributorId = await insertContributor();
  const cameraId = await insertCamera({ contributorId: null, status: "pending" });

  const result = await cameraEdits.getCameraEditView(cameraId, anyContributorId);
  assert.equal(result.kind, "not_found", "an anonymous record has no owner to unlock the view");
});

// ---------------------------------------------------------------------------
// Position edits (t_775c8400) — parse contract + 5-decimal normalisation
// ---------------------------------------------------------------------------

test("parseEditableEditFields normalises valid coordinates to 5 decimals", () => {
  const parsed = cameraEdits.parseEditableEditFields({ latitude: 44.493811532, longitude: 12.342539001 });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.payload.fields.latitude, 44.49381);
  assert.equal(parsed.payload.fields.longitude, 12.34254);
});

test("parseEditableEditFields rejects out-of-range coordinates with 422 naming the field", () => {
  for (const [name, body] of [
    ["latitude above 90", { latitude: 90.1, longitude: 12.3 }],
    ["latitude below -90", { latitude: -90.5, longitude: 12.3 }],
    ["longitude above 180", { latitude: 44.1, longitude: 180.2 }],
    ["longitude below -180", { latitude: 44.1, longitude: -181 }],
    ["non-number latitude", { latitude: "44.1", longitude: 12.3 }],
  ]) {
    const parsed = cameraEdits.parseEditableEditFields(body);
    assert.equal(parsed.ok, false, `${name} must be rejected`);
    assert.equal(parsed.status, 422, `${name} must answer 422 (distinct from the 400 whitelist violations)`);
    assert.match(parsed.error, /latitude|longitude/, `${name} error must name the field`);
  }
});

test("parseEditableEditFields rejects a half-move (latitude without longitude)", () => {
  const parsed = cameraEdits.parseEditableEditFields({ latitude: 44.1 });
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /together/, "a half-move must be rejected with the together contract");
});

test("applyCameraEdit pending: an unchanged position (within 5-decimal precision) is a no-op", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  // Stored at higher precision than the edit UI (imported-style row).
  const cameraId = await insertCamera({ contributorId: ownerId, latitude: 44.493811532, longitude: 12.342539001 });

  // The client always echoes the position it loaded; rounded to 5 decimals
  // it equals the stored value, so the edit must be a no-op (anti-farming).
  const result = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId,
    fields: { latitude: 44.49381, longitude: 12.34254 },
    now: NOW,
  });
  assert.equal(result.kind, "no_changes", "a 5-decimal-identical position must not produce a phantom move");
  assert.equal(await moderationEventCount("camera", cameraId, "edit_applied"), 0);
});
