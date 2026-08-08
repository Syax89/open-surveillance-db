// Retention sweep contract (ADR 0004 §3, ADR 0008 p.3, RETENTION_SCHEDULE.md).
//
// Runs the REAL db/retention.ts against the REAL migration SQL replayed on an
// in-memory D1 adapter (same harness as auth-d1 / db-public-contracts), with
// `now` injectable so every R1-R7 window is exercised deterministically.
//
// Coverage map (review t_91d0644f):
//   R1  pending reports hard-deleted after PENDING_RETENTION_DAYS
//   R2  rejected reports purged REJECTED_RETENTION_DAYS after the reject
//       decision, falling back to created_at for legacy rows without an event
//   R4  resolved correction requests purged after CORRECTION_RETENTION_DAYS
//   R7  expired / revoked sessions purged
//   R15 expired email-verification tokens + lapsed WebAuthn challenges
//       purged by the cron sweep (review-ada-2 P3-1)
//   R16 stale failed-login counters (login_attempts) purged after
//       LOGIN_ATTEMPT_RETENTION_DAYS of inactivity; rows under an ACTIVE lock
//       are never swept; >100 stale rows drain across multiple bounded rounds
//   atomicity: purgeCameraRecord closes the camera's queue items and deletes
//       the camera in one d1.batch (regression: rows were deleted before the
//       batch). Photo evidence (former R6/R13) was removed with the photo
//       upload feature (migration 0043) — see PR "remove photo upload".
//
// ADR 0021 § 2.2 (community pivot): the cron NEVER transitions record
// status — the old freshness sweep (verified → needs_review → stale) and the
// former R3 (needs_review/stale → `removed` after 6 months unverified) are
// retired and deliberately not exercised here.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
} from "./helpers/db-runtime-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFile(path.join(root, relativePath), "utf8");

let runtime;

beforeEach(async () => {
  if (!runtime) runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
});

after(async () => cleanupDbRuntime());

const NOW = "2026-08-01T00:00:00.000Z";
const day = 86_400_000;
const daysBefore = (days) => new Date(Date.parse(NOW) - days * day).toISOString();

// ---------------------------------------------------------------------------
// Fixture helpers (direct SQL, mirroring what the app would have written)
// ---------------------------------------------------------------------------

async function insertCamera({ title, status, createdAt, reviewDueAt = null }) {
  await runtime.env.DB.prepare(
    `INSERT INTO cameras (title, kind, address, notes, latitude, longitude, status, source, updated, description, created_at, review_due_at)
     VALUES (?, 'Fixed dome', NULL, '', 41.9, 12.5, ?, 'test', 'test', '', ?, ?)`,
  )
    .bind(title, status, createdAt, reviewDueAt)
    .run();
  const row = await runtime.env.DB.prepare("SELECT id FROM cameras WHERE title = ?").bind(title).first();
  return row.id;
}

async function insertRejectEvent(cameraId, createdAt) {
  const row = await runtime.env.DB.prepare(
    `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, created_at)
     VALUES ('camera', ?, 'pending', 'rejected', 'reject', 'privacy-or-safety-concern', 'test', 'Test Reviewer', ?)
     RETURNING id`,
  )
    .bind(cameraId, createdAt)
    .first();
  return row.id;
}

// A resolved correction request: terminal status ('reviewed' by default) with
// the resolution timestamp the app now writes (moderateCorrection sets
// resolved_at on the approve/reject transition). Open requests pass
// status='pending' and resolvedAt=null.
async function insertCorrection({ createdAt, resolvedAt = null, status = "reviewed", outcome = "kept" }) {
  const row = await runtime.env.DB.prepare(
    `INSERT INTO correction_requests (camera_id, issue_type, message, contact, status, outcome, resolved_at, created_at)
     VALUES (NULL, 'takedown', 'test', NULL, ?, ?, ?, ?)
     RETURNING id`,
  )
    .bind(status, outcome, resolvedAt, createdAt)
    .first();
  return row.id;
}

// An appeal against the camera's moderation decision. status mirrors the app:
// pending → upheld | dismissed | escalated. Only 'pending'/'escalated' (not
// finally decided) must block the R1/R2 purge. The appellant FK is satisfied
// with a throwaway users row (FK enforcement is ON in the D1 adapter).
async function insertAppeal({ entity = "camera", entityId, decisionEventId, status = "pending" }) {
  const user = await runtime.env.DB.prepare(
    "INSERT INTO users (email, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES (?, 'Appellant', 'contributor', 1, 0, ?, ?) RETURNING id",
  )
    .bind(`appellant-${Math.random()}@example.com`, NOW, NOW)
    .first();
  await runtime.env.DB.prepare(
    `INSERT INTO moderation_appeals (entity, entity_id, decision_event_id, appellant_id, reason, status, created_at)
     VALUES (?, ?, ?, ?, 'test appeal', ?, ?)`,
  )
    .bind(entity, entityId, decisionEventId, user.id, status, NOW)
    .run();
}

// A legal-hold audit event for a camera (RETENTION_SCHEDULE.md §2 convention,
// documented at HOLD_EXCLUSION_SQL in db/retention.ts): 'legal-hold' raises
// the hold, 'legal-hold-release' lifts it. A hold never changes the record
// status, so previous_status/new_status mirror the current one.
async function insertHoldEvent(cameraId, action, createdAt, status = "rejected") {
  await runtime.env.DB.prepare(
    `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, created_at)
     VALUES ('camera', ?, ?, ?, ?, 'other', 'test hold', 'Ops', ?)`,
  )
    .bind(cameraId, status, status, action, createdAt)
    .run();
}

async function insertSession({ expiresAt, revokedAt = null }) {
  await runtime.env.DB.prepare(
    "INSERT INTO contributors (email, password_hash, created_at, updated_at) VALUES (?, 'x', ?, ?)",
  )
    .bind(`contrib-${Math.random()}@example.com`, NOW, NOW)
    .run();
  const { lastRowId } = await runtime.env.DB.prepare(
    "INSERT INTO sessions (contributor_id, token_hash, csrf_token, created_at, expires_at, revoked_at) VALUES ((SELECT id FROM contributors ORDER BY id DESC LIMIT 1), ?, 'csrf', ?, ?, ?)",
  )
    .bind(`token-${Math.random()}`, NOW, expiresAt, revokedAt)
    .run();
  return lastRowId;
}

// An email-verification token row (migration 0027 + purpose column 0031).
// Creates its contributor like insertSession does (FK enforcement is ON).
async function insertEmailToken({ expiresAt, usedAt = null }) {
  await runtime.env.DB.prepare(
    "INSERT INTO contributors (email, password_hash, created_at, updated_at) VALUES (?, 'x', ?, ?)",
  )
    .bind(`token-contrib-${Math.random()}@example.com`, NOW, NOW)
    .run();
  const { lastRowId } = await runtime.env.DB.prepare(
    "INSERT INTO email_verification_tokens (contributor_id, token_hash, purpose, created_at, expires_at, used_at) VALUES ((SELECT id FROM contributors ORDER BY id DESC LIMIT 1), ?, 'verify', ?, ?, ?)",
  )
    .bind(`token-hash-${Math.random()}`, NOW, expiresAt, usedAt)
    .run();
  return lastRowId;
}

// A WebAuthn challenge row (migration 0028). `contributorId` stays NULL for
// public login ceremonies — the real /login/begin stores no binding.
async function insertChallenge({ expiresAt, usedAt = null, userHandle = null }) {
  const { lastRowId } = await runtime.env.DB.prepare(
    "INSERT INTO webauthn_challenges (challenge_hash, kind, contributor_id, user_handle, created_at, expires_at, used_at) VALUES (?, 'login', NULL, ?, ?, ?, ?)",
  )
    .bind(`challenge-hash-${Math.random()}`, userHandle, NOW, expiresAt, usedAt)
    .run();
  return lastRowId;
}

// A failed-login counter row (migration 0016, ADR 0016). Hash-only by design:
// `emailKey` is the SHA-256 of the normalised email; the sweep anchors on
// window_start and must never delete a row with an ACTIVE lock.
async function insertLoginAttempt({ emailKey, windowStart, lockedUntil = null }) {
  await runtime.env.DB.prepare(
    `INSERT INTO login_attempts (email_key, failed_count, window_start, locked_until, lockout_level)
     VALUES (?, 1, ?, ?, 0)`,
  )
    .bind(emailKey, windowStart, lockedUntil)
    .run();
}

async function count(table, where = "1=1", ...args) {
  const row = await runtime.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)
    .bind(...args)
    .first();
  return row.n;
}

// A D1 wrapper that makes the Nth .run() of statements whose SQL contains
// `sqlSubstring` throw — simulates a transient D1 failure to prove the sweep
// isolates per record / per chunk (a failure must not abort the whole run).
function makeFailOnNthRun(db, sqlSubstring, nthRun) {
  let runCount = 0;
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      if (!sql.includes(sqlSubstring)) return statement;
      const originalRun = statement.run.bind(statement);
      statement.run = () => {
        runCount += 1;
        if (runCount === nthRun) throw new Error(`simulated D1 failure on: ${sql}`);
        return originalRun();
      };
      return statement;
    },
    batch(statements) {
      return db.batch(statements);
    },
    exec(sql) {
      return db.exec(sql);
    },
  };
}

// ---------------------------------------------------------------------------
// R1 — pending reports
// ---------------------------------------------------------------------------

test("R1: pending reports older than 90 days are hard-deleted", async () => {
  const oldId = await insertCamera({ title: "Old pending", status: "pending", createdAt: daysBefore(100) });
  const freshId = await insertCamera({ title: "Fresh pending", status: "pending", createdAt: daysBefore(10) });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.pendingPurged, 1);
  assert.equal(await count("cameras", "id = ?", oldId), 0, "the old pending report must be gone");
  assert.equal(await count("cameras", "id = ?", freshId), 1, "a recent pending report must survive");
});

// ---------------------------------------------------------------------------
// R2 — rejected reports
// ---------------------------------------------------------------------------

test("R2: rejected reports are purged 30 days after the reject decision", async () => {
  const expired = await insertCamera({ title: "Rejected long ago", status: "rejected", createdAt: daysBefore(200) });
  const recent = await insertCamera({ title: "Rejected recently", status: "rejected", createdAt: daysBefore(200) });
  await insertRejectEvent(expired, daysBefore(40));
  await insertRejectEvent(recent, daysBefore(10));

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 1, "only the rejection older than 30 days may be purged");
  assert.equal(await count("cameras", "id = ?", expired), 0);
  assert.equal(await count("cameras", "id = ?", recent), 1);
});

test("R2: legacy rejected rows without a moderation event fall back to created_at", async () => {
  const legacyExpired = await insertCamera({ title: "Legacy rejected old", status: "rejected", createdAt: daysBefore(100) });
  const legacyFresh = await insertCamera({ title: "Legacy rejected fresh", status: "rejected", createdAt: daysBefore(10) });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 1);
  assert.equal(await count("cameras", "id = ?", legacyExpired), 0, "legacy row without event uses created_at");
  assert.equal(await count("cameras", "id = ?", legacyFresh), 1);
});

test("R2: the purge closes open moderation_queue items atomically", async () => {
  const id = await insertCamera({ title: "Rejected with queue", status: "rejected", createdAt: daysBefore(100) });
  await insertRejectEvent(id, daysBefore(40));
  await runtime.env.DB.prepare(
    "INSERT INTO moderation_queue (entity, entity_id, state, created_at, updated_at) VALUES ('camera', ?, 'open', ?, ?)",
  )
    .bind(id, NOW, NOW)
    .run();

  await runtime.retention.runRetentionSweep(NOW);

  const leftover = await runtime.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM moderation_queue WHERE entity = 'camera' AND entity_id = ? AND state != 'closed'",
  )
    .bind(id)
    .first();
  assert.equal(leftover.n, 0, "no open queue item may survive the purge");
});

// ---------------------------------------------------------------------------
// R4 — resolved correction requests
// ---------------------------------------------------------------------------

test("R4: resolved correction requests are purged 2 years after the RESOLUTION date", async () => {
  // Resolution 800 days ago → past the 2-year floor → purged.
  await insertCorrection({ createdAt: daysBefore(900), resolvedAt: daysBefore(800) });
  // Created 900 days ago but resolved only 100 days ago → still inside the
  // floor → must survive (regression: a created_at anchor purged it EARLY).
  await insertCorrection({ createdAt: daysBefore(900), resolvedAt: daysBefore(100) });
  // Open request: never resolved → never purged.
  await insertCorrection({ createdAt: daysBefore(900), status: "pending", resolvedAt: null, outcome: null });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.correctionsPurged, 1, "only the request past its resolution+2y floor");
  assert.equal(await count("correction_requests"), 2, "the recently resolved and the open request survive");
});

test("R4: rejected corrections (outcome NULL) are purged too — resolution+2y", async () => {
  // The pre-fix predicate (`outcome IS NOT NULL`) never matched rejected
  // requests (only approve sets outcome), so they accumulated forever.
  await insertCorrection({ createdAt: daysBefore(900), resolvedAt: daysBefore(800), status: "rejected", outcome: null });
  await insertCorrection({ createdAt: daysBefore(900), resolvedAt: daysBefore(100), status: "rejected", outcome: null });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.correctionsPurged, 1, "a rejected request is resolved: covered by the 2-year floor");
  assert.equal(await count("correction_requests"), 1, "the recently rejected request survives");
});

test("R4: legacy rows without resolved_at fall back to created_at (documented derogation)", async () => {
  // Rows resolved before migration 0018 have resolved_at = NULL (backfill
  // covers only rows with a decision event; the fixture simulates the rest).
  await insertCorrection({ createdAt: daysBefore(800), resolvedAt: null });
  await insertCorrection({ createdAt: daysBefore(100), resolvedAt: null });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.correctionsPurged, 1, "legacy fallback mirrors the R2/R6 pattern");
  assert.equal(await count("correction_requests"), 1);
});

test("R4: the purge ARCHIVES an audit event in the same batch as the delete", async () => {
  const id = await insertCorrection({ createdAt: daysBefore(900), resolvedAt: daysBefore(800) });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.correctionsPurged, 1);
  const event = await runtime.env.DB.prepare(
    "SELECT entity, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, actor FROM moderation_events WHERE entity = 'correction' AND action = 'archive'",
  )
    .first();
  assert.ok(event, "an archive event must be written before the delete (art. 5(2))");
  assert.equal(event.entityId, id);
  assert.equal(event.previousStatus, "reviewed");
  assert.equal(event.newStatus, "archived");
  assert.equal(event.actor, "Retention sweep");
  assert.equal(await count("correction_requests", "id = ?", id), 0, "the row is deleted after archiving");
});

// ---------------------------------------------------------------------------
// Appeals / legal hold — R1/R2 purge exclusions (P1, consolidated review)
// ---------------------------------------------------------------------------

test("R2: a rejected camera with a PENDING appeal survives the purge (P1)", async () => {
  // MODERATION_SLA S5: an appeal can still be open at decision+30d (filed at
  // +29d, decided up to +14d later); purging would destroy record + evidence
  // irreversibly while the appeal is pending.
  const appealed = await insertCamera({ title: "Appealed", status: "rejected", createdAt: daysBefore(200) });
  const eventId = await insertRejectEvent(appealed, daysBefore(40));
  await insertAppeal({ entityId: appealed, decisionEventId: eventId, status: "pending" });
  const normal = await insertCamera({ title: "No appeal", status: "rejected", createdAt: daysBefore(200) });
  await insertRejectEvent(normal, daysBefore(40));

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 1, "only the record without an open appeal");
  assert.equal(await count("cameras", "id = ?", appealed), 1, "the appealed record must survive");
  assert.equal(await count("cameras", "id = ?", normal), 0);
});

test("R2: an ESCALATED appeal still blocks the purge (not finally decided)", async () => {
  const escalated = await insertCamera({ title: "Appeal escalated", status: "rejected", createdAt: daysBefore(200) });
  const eventId = await insertRejectEvent(escalated, daysBefore(40));
  await insertAppeal({ entityId: escalated, decisionEventId: eventId, status: "escalated" });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 0);
  assert.equal(await count("cameras", "id = ?", escalated), 1);
});

test("R2: a finally DECIDED appeal (dismissed) does not block the purge", async () => {
  const decided = await insertCamera({ title: "Appeal dismissed", status: "rejected", createdAt: daysBefore(200) });
  const eventId = await insertRejectEvent(decided, daysBefore(40));
  await insertAppeal({ entityId: decided, decisionEventId: eventId, status: "dismissed" });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 1);
  assert.equal(await count("cameras", "id = ?", decided), 0);
});

test("R2: a camera under ACTIVE legal hold survives the purge (RETENTION_SCHEDULE §2)", async () => {
  const held = await insertCamera({ title: "Legal hold", status: "rejected", createdAt: daysBefore(200) });
  await insertRejectEvent(held, daysBefore(40));
  await insertHoldEvent(held, "legal-hold", daysBefore(20));

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 0, "the hold suspends the deletion");
  assert.equal(await count("cameras", "id = ?", held), 1);
});

test("R2: a RELEASED legal hold no longer blocks the purge", async () => {
  const released = await insertCamera({ title: "Hold released", status: "rejected", createdAt: daysBefore(200) });
  await insertRejectEvent(released, daysBefore(40));
  await insertHoldEvent(released, "legal-hold", daysBefore(60));
  await insertHoldEvent(released, "legal-hold-release", daysBefore(10));

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.rejectedPurged, 1, "the matter is closed: the 30-day clock resumes");
  assert.equal(await count("cameras", "id = ?", released), 0);
});

test("R1: a pending camera under legal hold survives the pending purge", async () => {
  const held = await insertCamera({ title: "Pending held", status: "pending", createdAt: daysBefore(100) });
  await insertHoldEvent(held, "legal-hold", daysBefore(50), "pending");
  const normal = await insertCamera({ title: "Pending normal", status: "pending", createdAt: daysBefore(100) });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.pendingPurged, 1);
  assert.equal(await count("cameras", "id = ?", held), 1, "held record survives");
  assert.equal(await count("cameras", "id = ?", normal), 0);
});

// ---------------------------------------------------------------------------
// R7 — sessions
// ---------------------------------------------------------------------------

test("R2: a failing record is isolated — the sweep continues and counts it (review t_eed5f080 #2)", async () => {
  // Two expired rejected cameras; the FIRST purge (DELETE FROM cameras) fails.
  const a = await insertCamera({ title: "Rejected A", status: "rejected", createdAt: daysBefore(200) });
  const b = await insertCamera({ title: "Rejected B", status: "rejected", createdAt: daysBefore(200) });
  await insertRejectEvent(a, daysBefore(40));
  await insertRejectEvent(b, daysBefore(40));

  const failingDb = makeFailOnNthRun(runtime.env.DB, "DELETE FROM cameras WHERE id = ?", 1);
  runtime.env.DB = failingDb;

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.failures, 1, "the failing record is counted, not fatal");
  assert.equal(summary.rejectedPurged, 1, "the other record is still purged");
  assert.equal(await count("cameras", "id = ?", a), 1, "the failing record survives for retry");
  assert.equal(await count("cameras", "id = ?", b), 0);
});

test("R7: expired and revoked sessions are purged, live ones survive", async () => {
  await insertSession({ expiresAt: daysBefore(1) });
  await insertSession({ expiresAt: daysBefore(1), revokedAt: daysBefore(5) });
  await insertSession({ expiresAt: daysAfter(30) });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.sessionsPurged, 2);
  assert.equal(await count("sessions"), 1, "the live session survives");
});

// ---------------------------------------------------------------------------
// R15 — expired auth-method rows (review-ada-2 P3-1)
// ---------------------------------------------------------------------------

test("R15: expired email-verification tokens are purged, live ones survive (P3-1)", async () => {
  await insertEmailToken({ expiresAt: daysBefore(1) }); // expired → purged
  await insertEmailToken({ expiresAt: daysBefore(1), usedAt: daysBefore(2) }); // used + expired → purged
  await insertEmailToken({ expiresAt: daysAfter(1) }); // live → survives

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.emailTokensPurged, 2, "both expired rows are removed");
  assert.equal(await count("email_verification_tokens"), 1, "the live token survives");
});

test("R15: lapsed WebAuthn challenges are swept by the cron (P3-1)", async () => {
  await insertChallenge({ expiresAt: daysBefore(1) }); // expired → purged
  await insertChallenge({ expiresAt: daysBefore(1), usedAt: daysBefore(2) }); // used + expired → purged
  await insertChallenge({ expiresAt: daysAfter(1) }); // live → survives

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.challengesPurged, 2, "both expired challenges are removed");
  assert.equal(await count("webauthn_challenges"), 1, "the live challenge survives");
});

// ---------------------------------------------------------------------------
// R16 — stale failed-login counters (audit finding 5 / review-ada P3-10)
// ---------------------------------------------------------------------------

test("R16: stale login_attempts rows are purged after 30 days, fresh ones survive", async () => {
  await insertLoginAttempt({ emailKey: "stale", windowStart: daysBefore(31) }); // past the cutoff → purged
  await insertLoginAttempt({ emailKey: "boundary", windowStart: daysBefore(30) }); // exactly 30d → survives (strict <)
  await insertLoginAttempt({ emailKey: "fresh", windowStart: daysBefore(1) }); // live counter → survives
  await insertLoginAttempt({ emailKey: "future", windowStart: daysAfter(1) }); // defensive → survives

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.loginAttemptsPurged, 1, "only the row past the 30-day cutoff is removed");
  assert.equal(await count("login_attempts"), 3);
  assert.equal(await count("login_attempts", "email_key = 'stale'"), 0);
  assert.equal(await count("login_attempts", "email_key = 'fresh'"), 1, "an active counter is untouched");
});

test("R16: an ACTIVE lock is never swept even when window_start is stale", async () => {
  await insertLoginAttempt({
    emailKey: "locked",
    windowStart: daysBefore(60), // stale by the window…
    lockedUntil: daysAfter(1), // …but the account is LOCKED right now
  });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.loginAttemptsPurged, 0, "deleting an active lock would disable the lockout");
  assert.equal(await count("login_attempts", "email_key = 'locked'"), 1, "the lock survives");
});

test("R16: an expired lock with a stale window is swept", async () => {
  await insertLoginAttempt({
    emailKey: "expired-lock",
    windowStart: daysBefore(60),
    lockedUntil: daysBefore(5), // lock already over → dead row
  });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.loginAttemptsPurged, 1);
  assert.equal(await count("login_attempts", "email_key = 'expired-lock'"), 0);
});

test("R16: the bounded sweep drains >100 stale rows across multiple rounds in one run", async () => {
  for (let i = 0; i < 250; i += 1) {
    await insertLoginAttempt({ emailKey: `stale-${i}`, windowStart: daysBefore(31 + (i % 5)) });
  }
  await insertLoginAttempt({ emailKey: "fresh", windowStart: daysBefore(1) });

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.loginAttemptsPurged, 250, "every stale row across batches is purged");
  assert.equal(await count("login_attempts"), 1, "only the fresh row survives");
});

// ---------------------------------------------------------------------------
// R12 — demo records (QA#4 finding B)
// ---------------------------------------------------------------------------

test("R12: demo records are purged outside development (QA#4 finding B)", async () => {
  // Fail-closed default: ENVIRONMENT unset behaves as production.
  delete runtime.env.ENVIRONMENT;
  const demo = await insertCamera({ title: "Demo A", status: "demo", createdAt: daysBefore(200) });
  const verified = await insertCamera({ title: "Verified B", status: "active", createdAt: daysBefore(200) });
  // A rejected record near its R2 cutoff must NOT be confused with a demo row:
  // the reject decision is recent, so R2 leaves it alone and only R12 is
  // entitled to touch `demo` rows anyway.
  const rejected = await insertCamera({ title: "Rejected C", status: "rejected", createdAt: daysBefore(200) });
  await insertRejectEvent(rejected, daysBefore(5));

  const summary = await runtime.retention.runRetentionSweep(NOW);

  assert.equal(summary.demoRecordsPurged, 1, "the demo record is hard-deleted");
  assert.equal(await count("cameras", "id = ?", demo), 0, "the demo row is gone");
  assert.equal(await count("cameras", "id = ?", verified), 1, "non-demo records are untouched");
  assert.equal(await count("cameras", "title = 'Rejected C'"), 1, "rejected records are NOT swept by R12 (no time window applies)");
  assert.equal(summary.rejectedPurged, 0, "the R2 sweep needs the 30-day reject window, not the demo purge");
  assert.equal(summary.failures, 0);
});

test("R12: ENVIRONMENT=development keeps the illustrative demo rows (local seed guard)", async () => {
  const previous = runtime.env.ENVIRONMENT;
  runtime.env.ENVIRONMENT = "development";
  try {
    const demo = await insertCamera({ title: "Demo Dev", status: "demo", createdAt: daysBefore(200) });

    const summary = await runtime.retention.runRetentionSweep(NOW);

    assert.equal(summary.demoRecordsPurged, 0, "no R12 purge in development");
    assert.equal(await count("cameras", "id = ?", demo), 1, "the illustrative seed survives locally");
  } finally {
    if (previous === undefined) delete runtime.env.ENVIRONMENT;
    else runtime.env.ENVIRONMENT = previous;
  }
});

function daysAfter(days) {
  return new Date(Date.parse(NOW) + days * day).toISOString();
}

// ---------------------------------------------------------------------------
// Atomicity (MINORE 1) + D1 bound cap (BLOCKER 2) — static guarantees
// ---------------------------------------------------------------------------

test("purgeCameraRecord closes the queue items and deletes the camera in one d1.batch", async () => {
  const retention = await readSource("db/retention.ts");
  const purgeStart = retention.indexOf("async function purgeCameraRecord");
  const purgeEnd = retention.indexOf("// ---", purgeStart);
  const purge = retention.slice(purgeStart, purgeEnd);

  assert.match(
    purge,
    /d1\.batch\(\[/,
    "the destructive work must be one atomic batch",
  );
  assert.ok(
    purge.indexOf('"UPDATE moderation_queue SET state = \'closed\'') < purge.indexOf("DELETE FROM cameras WHERE id = ?"),
    "the queue items must be closed inside the batch, before the camera row",
  );
});

test("R16 deletion chunks against the D1 100-bound-parameter cap", async () => {
  const retention = await readSource("db/retention.ts");
  const r16Start = retention.indexOf("// --- R16");
  const r16End = retention.indexOf("// --- QA F5");
  const r16 = retention.slice(r16Start, r16End);

  assert.match(retention, /D1_MAX_BOUND_PARAMS\s*=\s*100/, "the D1 cap must be an explicit constant");
  assert.match(
    r16,
    /LIMIT \$\{D1_MAX_BOUND_PARAMS\}/,
    "each round must select at most 100 rows so the DELETE always fits one statement",
  );
  assert.match(
    r16,
    /round < LOGIN_ATTEMPT_SWEEP_MAX_ROUNDS/,
    "the sweep must be bounded so a pathological flood cannot make one run spin forever",
  );
});

test("the R3 unverified removal is gone from the sweep (ADR 0021 § 2.2)", async () => {
  const retention = await readSource("db/retention.ts");
  assert.doesNotMatch(retention, /unverifiedCutoff|UNVERIFIED_REMOVAL_MONTHS|needs_review[\s\S]*'removed'/, "no timer may transition needs_review/stale records to removed");
  assert.doesNotMatch(retention, /runFreshnessSweep/, "the sweep no longer reuses the retired freshness sweep");
});
