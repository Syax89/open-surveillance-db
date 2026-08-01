// QA contract — H1 (t_69891619) regression gate: the `associate` role check.
//
// Runs the REAL db/moderation.ts SQL against a fresh in-memory D1 through the
// D1 adapter (no db-layer stub): the route → db → roleAllowsAction chain that
// PR #187's original client/route tests mocked away. The `associate` action
// (link a still-pending correction request to a record without deciding) must
// be permitted for the record-facing roles (record_reviewer, senior_moderator)
// and forbidden for every other reviewer role (intake_reviewer,
// privacy_safety_lead, administrator).
//
// Background: QA rejected PR #187 (head eced3648) because `associate` was
// missing from rolePermissions → 403 for every role while the UI still
// offered "Link to record". This test pins the matrix server-side so a
// regression is caught by CI (the client tests mock the PATCH fetch with 200
// and therefore never exercised the real gate).

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { D1SqliteDatabase as D1 } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
  seedDemoIdentities,
} from "./helpers/db-runtime-harness.mjs";

let env = null;
let cameras = null;
let moderation = null;

beforeEach(async () => {
  ({ env, cameras, moderation } = await loadDbRuntime());
  env.DB = new D1();
  await applyDrizzleMigrations(env.DB);
  // Migration 0017 removes the demo seed; this suite pins the role matrix on
  // the real demo reviewers (1 intake, 2 record, 3 senior, 4 privacy lead,
  // 5 administrator), so it provisions them explicitly like a deploy would.
  await seedDemoIdentities(env.DB);
});

after(async () => cleanupDbRuntime());

async function makePendingCorrection(cameraId) {
  return env.DB.prepare(
    "INSERT INTO correction_requests (camera_id, issue_type, message, contact, status, outcome, resolved_at, created_at) VALUES (?, ?, ?, ?, 'pending', NULL, NULL, ?) RETURNING id",
  ).bind(cameraId, "inaccurate", "Fixture correction message", null, "2026-07-01T00:00:00.000Z").first();
}

async function makePendingCamera() {
  return cameras.createPendingCamera({
    title: `Associate target camera ${Math.random().toString(36).slice(2, 8)}`,
    kind: "Fixed dome",
    manufacturer: "Fixture",
    observedOn: null,
    address: "Via Fixture 1",
    notes: "",
    latitude: 44.1,
    longitude: 12.2,
  });
}

async function associateAs(actorId, correctionId, cameraId) {
  return moderation.moderateCorrection(
    correctionId,
    "associate",
    "insufficient-evidence",
    null,
    { cameraId },
    { actorId },
  );
}

test("associate succeeds for record_reviewer and senior_moderator", async () => {
  // One fresh camera + correction per role so the assertions are unambiguous
  // (migration 0024: at most one open anonymous correction per camera).
  const cases = [
    { role: "record_reviewer", actorId: 2 },
    { role: "senior_moderator", actorId: 3 },
  ];
  for (const { role, actorId } of cases) {
    const camera = await makePendingCamera();
    const correction = await makePendingCorrection(camera.id);
    const result = await associateAs(actorId, correction.id, camera.id);

    assert.equal(result.kind, "ok", `${role} must be allowed to associate`);
    assert.equal(result.item.status, "pending", "associate must not decide the request");
    assert.equal(result.item.cameraId, camera.id, "associate must link the record");
    assert.equal(result.event.action, "associate", "the audit trail records the action");
  }
});

test("associate is forbidden for intake_reviewer, privacy_safety_lead and administrator", async () => {
  const cases = [
    { role: "intake_reviewer", actorId: 1 },
    { role: "privacy_safety_lead", actorId: 4 },
    { role: "administrator", actorId: 5 },
  ];
  for (const { role, actorId } of cases) {
    const camera = await makePendingCamera();
    const correction = await makePendingCorrection(camera.id);
    const result = await associateAs(actorId, correction.id, camera.id);
    assert.equal(result.kind, "forbidden", `${role} must NOT be allowed to associate`);
  }
});
