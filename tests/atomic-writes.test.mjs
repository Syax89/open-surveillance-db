// P1-2 atomic write path: every logical decision must be ONE d1.batch so a
// crash between an entity/state UPDATE and the append-only audit INSERT can
// never corrupt the audit trail or leave the queue open for a terminal entity.
//
// These tests run the REAL db layer against the REAL migrations on an
// in-memory D1 adapter (same harness as tests/appeals.test.mjs), then inject
// a failure on the Nth batched statement whose SQL matches a substring and
// assert the WHOLE batch rolled back: no status change, no event, no queue
// mutation. Each scenario pins one crash-window class:
//
//   - moderateCamera   : camera UPDATE + decision event + queue close
//   - fileAppeal       : appeal INSERT + appeal-filed event
//   - decideAppeal     : appeal UPDATE + decision event
//   - moderatePhoto    : photo UPDATE + photo event
//   - linkExternalIdentity : identity link + merge-request burn
//   - applyPasswordReset   : hash rotate + session revoke + email verify
//   - runFreshnessSweep    : verified -> needs_review + scheduled-expiry event
//
// Plus one happy-path assertion that the batch read-backs (RETURNING rows)
// keep the pre-batch response shape.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime, seedDemoIdentities } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase as D1 } from "./helpers/d1-sqlite.mjs";

let env;
let cameras;
let moderation;
let appeals;
let auth;
let oidc;
let photos;

const CONTRIBUTOR_USER_ID = 6; // Demo Contributor (migration 0010 seed)
const INTAKE = { id: 1, displayName: "Demo Intake Reviewer", role: "intake_reviewer", active: 1 };
const RECORD = { id: 2, displayName: "Demo Record Reviewer", role: "record_reviewer", active: 1 };
const SENIOR = { id: 3, displayName: "Demo Senior Moderator", role: "senior_moderator", active: 1 };

const NOW = "2026-08-02T08:00:00.000Z";
const dayMs = 86_400_000;

beforeEach(async () => {
  ({ env, cameras, moderation, appeals, auth, oidc, photos } = await loadDbRuntime());
  env.DB = new D1();
  await applyDrizzleMigrations(env.DB);
  // Migration 0017 removes the demo seed; this suite pins the workflow on the
  // real demo identities (reviewers 1/2/3, contributor user 6), so it
  // provisions them explicitly like a deploy would before opening the DB.
  await seedDemoIdentities(env.DB);
});

after(async () => cleanupDbRuntime());

/**
 * Wrap `db` so the Nth call (across a whole d1.batch) to a statement whose SQL
 * contains `sqlSubstring` THROWS. Both run() AND all() are wrapped because
 * RETURNING statements execute via all() in the harness while plain UPDATEs
 * execute via run(). first() is deliberately left untouched so pre-batch
 * SELECTs still work.
 */
function makeFailOnNthBatchStatement(db, sqlSubstring, nth) {
  let matchCount = 0;
  const wrapped = Object.create(db);
  wrapped.prepare = (sql) => {
    const statement = db.prepare(sql);
    if (!String(sql).includes(sqlSubstring)) return statement;
    const originalRun = statement.run.bind(statement);
    const originalAll = statement.all.bind(statement);
    const throwOnNth = (original) => (...args) => {
      matchCount += 1;
      if (matchCount === nth) {
        throw new Error(`simulated D1 batch failure on: ${sql}`);
      }
      return original(...args);
    };
    statement.run = throwOnNth(originalRun);
    statement.all = throwOnNth(originalAll);
    return statement;
  };
  return wrapped;
}

async function submitPending() {
  return cameras.createPendingCamera({
    title: "Atomic write target",
    kind: "Fixed dome",
    manufacturer: "Acme",
    observedOn: "2026-07-01",
    address: "Via Roma 1",
    notes: "private",
    latitude: 41.9005,
    longitude: 12.4937,
  });
}

test("moderateCamera rolls back the whole decision batch when the event INSERT fails", async () => {
  const record = await submitPending();

  env.DB = makeFailOnNthBatchStatement(env.DB, "moderation_events", 1);
  await assert.rejects(
    moderation.moderateCamera(record.id, "reject", "insufficient-evidence", null, undefined, {
      actorId: INTAKE.id,
    }),
    /simulated D1 batch failure/,
  );

  const camera = await env.DB.prepare("SELECT status FROM cameras WHERE id = ?").bind(record.id).first();
  assert.equal(camera.status, "pending", "the camera UPDATE must roll back with the failed event");
  const events = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE entity = 'camera' AND entity_id = ?")
    .bind(record.id)
    .first();
  assert.equal(events.n, 0, "no audit event may survive a rolled-back decision");
  const closed = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM moderation_queue WHERE entity = 'camera' AND entity_id = ? AND state = 'closed'")
    .bind(record.id)
    .first();
  assert.equal(closed.n, 0, "the queue must not be closed for a rolled-back decision");
});

test("fileAppeal rolls back the appeal INSERT and its event when the event INSERT fails", async () => {
  const record = await submitPending();
  await moderation.moderateCamera(record.id, "reject", "insufficient-evidence", null, undefined, {
    actorId: INTAKE.id,
  });
  const decision = await env.DB
    .prepare("SELECT id FROM moderation_events WHERE entity = 'camera' AND entity_id = ? AND action = 'reject'")
    .bind(record.id)
    .first();

  env.DB = makeFailOnNthBatchStatement(env.DB, "moderation_events", 1);
  await assert.rejects(
    appeals.fileAppeal({
      entity: "camera",
      entityId: record.id,
      decisionEventId: decision.id,
      appellantId: CONTRIBUTOR_USER_ID,
      reason: "The camera is on a public street.",
    }),
    /simulated D1 batch failure/,
  );

  const appealsRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM moderation_appeals").first();
  assert.equal(appealsRow.n, 0, "the appeal row must roll back with the failed event");
  const filed = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE action = 'appeal-filed'")
    .first();
  assert.equal(filed.n, 0, "no appeal-filed event may survive");
});

test("decideAppeal (dismiss) rolls back the decision when the event INSERT fails", async () => {
  const record = await submitPending();
  await moderation.moderateCamera(record.id, "reject", "insufficient-evidence", null, undefined, {
    actorId: INTAKE.id,
  });
  const decision = await env.DB
    .prepare("SELECT id FROM moderation_events WHERE entity = 'camera' AND entity_id = ? AND action = 'reject'")
    .bind(record.id)
    .first();
  const filed = await appeals.fileAppeal({
    entity: "camera",
    entityId: record.id,
    decisionEventId: decision.id,
    appellantId: CONTRIBUTOR_USER_ID,
    reason: "The camera is on a public street.",
  });
  assert.equal(filed.kind, "ok");

  env.DB = makeFailOnNthBatchStatement(env.DB, "moderation_events", 1);
  await assert.rejects(
    appeals.decideAppeal({ id: filed.appeal.id, decision: "dismiss", reviewer: SENIOR, note: "No basis." }),
    /simulated D1 batch failure/,
  );

  const row = await env.DB
    .prepare("SELECT status FROM moderation_appeals WHERE id = ?")
    .bind(filed.appeal.id)
    .first();
  assert.equal(row.status, "pending", "the appeal must stay pending when the decision batch rolls back");
});

test("moderatePhoto rolls back the photo UPDATE when the event INSERT fails", async () => {
  await env.DB
    .prepare(
      `INSERT INTO photos (id, camera_id, contributor_id, storage_key, mime_type, width, height, size_bytes, status, exif_stripped, redaction_confirmed, created_at, updated_at)
       VALUES (11, NULL, NULL, 'photos/fixture.jpg', 'image/jpeg', 64, 48, 128, 'pending', 1, 0, '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z')`,
    )
    .run();

  env.DB = makeFailOnNthBatchStatement(env.DB, "moderation_events", 1);
  await assert.rejects(
    photos.moderatePhoto(11, "approve", true, "verified-public-infrastructure", "Subject visible", 2),
    /simulated D1 batch failure/,
  );

  const photo = await env.DB.prepare("SELECT status FROM photos WHERE id = 11").first();
  assert.equal(photo.status, "pending", "the photo UPDATE must roll back with the failed event");
  const events = await env.DB.prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE entity = 'photo'").first();
  assert.equal(events.n, 0, "no photo event may survive a rolled-back decision");
});

test("linkExternalIdentity rolls back the identity link when the merge-request burn fails", async () => {
  const profile = await auth.createContributor({
    email: "existing@example.org",
    displayName: "Existing",
    password: "supersecret123",
  });
  const { rawToken } = await oidc.createOidcMergeRequest({
    provider: "github",
    externalSub: "98765",
    contributorId: profile.id,
    emailVerified: true,
    now: NOW,
  });

  env.DB = makeFailOnNthBatchStatement(env.DB, "oidc_merge_requests", 1);
  await assert.rejects(
    oidc.linkExternalIdentity(rawToken, "github", "98765", NOW),
    /simulated D1 batch failure/,
  );

  const contributor = await env.DB
    .prepare("SELECT auth_provider AS authProvider, email_verified_at AS emailVerifiedAt FROM contributors WHERE id = ?")
    .bind(profile.id)
    .first();
  assert.equal(contributor.authProvider, "password", "the identity link must roll back with the failed burn");
  assert.equal(contributor.emailVerifiedAt, null, "the verification stamp must roll back too");
  const request = await env.DB.prepare("SELECT used_at AS usedAt FROM oidc_merge_requests").first();
  assert.equal(request.usedAt, null, "the merge request must stay unused after the rollback");
});

test("applyPasswordReset rolls back rotate + revoke + verify when the verify UPDATE fails", async () => {
  const profile = await auth.createContributor({
    email: "reset@example.org",
    displayName: "Reset",
    password: "supersecret123",
  });
  await auth.createSession(profile.id, { now: NOW });
  const before = await env.DB
    .prepare("SELECT password_hash AS passwordHash FROM contributors WHERE id = ?")
    .bind(profile.id)
    .first();

  env.DB = makeFailOnNthBatchStatement(env.DB, "email_verified_at", 1);
  await assert.rejects(
    auth.applyPasswordReset(profile.id, "brand-new-password1", NOW),
    /simulated D1 batch failure/,
  );

  const contributor = await env.DB
    .prepare("SELECT password_hash AS passwordHash, email_verified_at AS emailVerifiedAt FROM contributors WHERE id = ?")
    .bind(profile.id)
    .first();
  assert.equal(contributor.passwordHash, before.passwordHash, "the hash must not rotate when the batch rolls back");
  assert.equal(contributor.emailVerifiedAt, null, "email must stay unverified after the rollback");
  const revoked = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM sessions WHERE contributor_id = ? AND revoked_at IS NOT NULL")
    .bind(profile.id)
    .first();
  assert.equal(revoked.n, 0, "no session may be revoked when the batch rolls back");
});

test("runFreshnessSweep rolls back the status UPDATE when the scheduled-expiry event fails", async () => {
  const record = await submitPending();
  const approved = await moderation.moderateCamera(record.id, "approve", "verified-public-infrastructure", null);
  assert.equal(approved.item.status, "verified");
  assert.ok(approved.item.reviewDueAt, "approval must schedule the next review");

  const pastDue = new Date(new Date(approved.item.reviewDueAt).getTime() + dayMs).toISOString();
  env.DB = makeFailOnNthBatchStatement(env.DB, "moderation_events", 1);
  await assert.rejects(
    moderation.runFreshnessSweep(pastDue),
    /simulated D1 batch failure/,
  );

  const camera = await env.DB.prepare("SELECT status FROM cameras WHERE id = ?").bind(record.id).first();
  assert.equal(camera.status, "verified", "the sweep UPDATE must roll back with the failed event");
  const expired = await env.DB
    .prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE entity = 'camera' AND entity_id = ? AND action = 'scheduled-expiry'")
    .bind(record.id)
    .first();
  assert.equal(expired.n, 0, "no scheduled-expiry event may survive the rollback");
});

test("decision batch read-backs return the item, event and queue (happy path)", async () => {
  const record = await submitPending();
  const decision = await moderation.moderateCamera(record.id, "approve", "verified-public-infrastructure", null, undefined, {
    actorId: RECORD.id,
  });

  assert.equal(decision.kind, "ok");
  assert.equal(decision.item.status, "verified", "the RETURNING item must carry the new status");
  assert.equal(typeof decision.event.id, "number", "the RETURNING event must carry its row id");
  assert.equal(decision.event.entityId, record.id);
  assert.equal(decision.event.newStatus, "verified");
  assert.equal(decision.event.actorRole, "record_reviewer");
  assert.equal(decision.queue.entity, "camera");
  assert.equal(decision.queue.entityId, record.id);
});
