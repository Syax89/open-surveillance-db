/**
 * Automated retention sweep (ADR 0004 §3, ADR 0008 p.3, RETENTION_SCHEDULE.md).
 *
 * Runs as a Cloudflare Worker scheduled handler (see worker/index.ts and the
 * `triggers.crons` binding in wrangler.jsonc) on a daily cadence and enforces
 * the retention schedule that the legal documents define:
 *
 *   R1  pending reports               → hard delete after 90 days (created_at)
 *   R2  rejected reports              → hard delete after 30 days (decision date)
 *   R3  verified records              → needs_review at review_due_at, then
 *                                       `removed` after 6 months unverified
 *                                       (the review clocks themselves live in
 *                                       db/freshness.ts + runFreshnessSweep)
 *   R4  resolved correction requests  → archived in the audit log, then
 *                                       deleted after 2 years (RESOLUTION date)
 *   R6  photo evidence                → deleted with its record; orphan
 *                                       pending photos after 90 days; rejected
 *                                       photos after 30 days (R13: anchored on
 *                                       the photo reject event)
 *   R7  sessions                      → delete expired / revoked rows
 *   R15 auth rows                     → expired email-verification tokens
 *                                       (24h TTL) and lapsed WebAuthn
 *                                       challenge rows (10-min TTL) purged
 *                                       on expiry — the cron enforces the
 *                                       sweep the 0027/0028 migrations
 *                                       promised (review-ada-2 P3-1)
 *
 * Deliberately NOT purged here:
 *   R5  moderation_events             → append-only by design (BEFORE UPDATE /
 *                                       DELETE triggers in migration 0008).
 *                                       A 2-year archival path requires an
 *                                       archive table + migration and a
 *                                       separate decision; out of scope.
 *
 * Design notes:
 *  - The windows are FIXED legal values (RETENTION_SCHEDULE.md, ADR 0008):
 *    there is deliberately NO env knob to override them — an env override
 *    could silently extend a legally defined retention window. The "master
 *    12-month" clock of ADR 0008 p.3 is the freshness review interval
 *    (DEFAULT_REVIEW_INTERVAL_MONTHS in db/freshness.ts), not a retention
 *    constant here.
 *  - `cameras.updated` holds a human note, not a timestamp — so the R2
 *    "rejection decision date" is anchored on the moderation event
 *    (action='reject'), with `created_at` as fallback for legacy rows.
 *    The R4 "resolution date" is `correction_requests.resolved_at` (set by
 *    moderateCorrection on the approve/reject transition, backfilled by
 *    migration 0018), with `created_at` as documented fallback for legacy
 *    rows; R4 also ARCHIVES the request (an append-only audit event) in the
 *    same batch as the delete, per RETENTION_SCHEDULE.md R4 art. 5(2).
 *  - R1/R2 hard-deletes skip records with an OPEN APPEAL (moderation_appeals
 *    status pending/escalated — MODERATION_SLA §4/S5) or an ACTIVE LEGAL HOLD
 *    (audit event action='legal-hold' with no later 'legal-hold-release' —
 *    RETENTION_SCHEDULE.md §2). The hold convention is documented at
 *    HOLD_EXCLUSION_SQL below.
 *  - Destructive D1 work is done in `d1.batch(...)` transactions so a record,
 *    its queue items and its evidence are removed atomically; R2 (PHOTOS
 *    bucket) objects are deleted AFTER the D1 batch succeeds, best effort, so
 *    a bucket failure never orphanes the D1 rows (the objects stay reachable
 *    through the rows and the next run retries them).
 *  - Every per-record loop is isolated: a single record/chunk that fails is
 *    counted in `summary.failures` and skipped, so one bad row can never
 *    abort the whole sweep and block it forever (re-failing every day).
 *  - `now` is injectable for deterministic tests; `r2` (the PHOTOS bucket) is
 *    injectable so tests can assert object deletion without a binding.
 */

import { getD1 } from "./cameras";
import { runFreshnessSweep } from "./moderation";
import { addMonths } from "./freshness";
import { sweepExpiredWebAuthnChallenges } from "./passkeys";

// ---------------------------------------------------------------------------
// Policy constants (RETENTION_SCHEDULE.md / ADR 0004)
// ---------------------------------------------------------------------------

/** R1: non-verified `pending` reports expire after 90 days from submission. */
export const PENDING_RETENTION_DAYS = 90;
/** R2: `rejected` reports expire after 30 days from the rejection decision. */
export const REJECTED_RETENTION_DAYS = 30;
/** R3: a record not re-verified within 6 CALENDAR MONTHS of its review date is removed. */
export const UNVERIFIED_REMOVAL_MONTHS = 6;
/** R4: resolved correction/takedown requests are kept 2 years. */
export const CORRECTION_RETENTION_DAYS = 730;
/** R6: pending photo never linked to a record expires with the pending window. */
export const ORPHAN_PHOTO_RETENTION_DAYS = PENDING_RETENTION_DAYS;

/**
 * Cloudflare D1 caps bound parameters at 100 per query. Any `WHERE ... IN (?)`
 * built from user-collected ids must be chunked to this size (see the R6
 * photo deletion below).
 */
export const D1_MAX_BOUND_PARAMS = 100;

export type RetentionPolicy = {
  pendingDays: number;
  rejectedDays: number;
  unverifiedRemovalMonths: number;
  correctionDays: number;
  orphanPhotoDays: number;
};

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  pendingDays: PENDING_RETENTION_DAYS,
  rejectedDays: REJECTED_RETENTION_DAYS,
  unverifiedRemovalMonths: UNVERIFIED_REMOVAL_MONTHS,
  correctionDays: CORRECTION_RETENTION_DAYS,
  orphanPhotoDays: ORPHAN_PHOTO_RETENTION_DAYS,
};

/** Minimal R2 surface the sweep needs (the real PHOTOS bucket satisfies it). */
export type RetentionR2 = {
  delete(key: string): Promise<unknown>;
};

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export type RetentionSummary = {
  now: string;
  policy: RetentionPolicy;
  /** R3 part 1, from the reused freshness sweep. */
  scheduledExpiry: number;
  becameStale: number;
  /** R3 part 2: needs_review/stale records unverified for 6 months → removed. */
  unverifiedRemoved: number;
  /** R1: pending reports hard-deleted with their evidence. */
  pendingPurged: number;
  /** R2: rejected reports hard-deleted with their evidence. */
  rejectedPurged: number;
  /** R4: resolved correction requests older than 2 years. */
  correctionsPurged: number;
  /** R6: evidence deleted alongside its record + orphan/rejected photos. */
  photosDeleted: number;
  /** R6: PHOTOS bucket objects deleted (best effort). */
  r2ObjectsDeleted: number;
  /** R6: PHOTOS bucket objects the sweep FAILED to delete (orphaned after D1 rows were removed). */
  r2ObjectsFailed: number;
  /** R7: expired/revoked session rows removed. */
  sessionsPurged: number;
  /** R15: expired email-verification token rows removed (24h TTL, cron sweep). */
  emailTokensPurged: number;
  /** R15: expired WebAuthn challenge rows removed (10-min TTL, centralized in the cron). */
  challengesPurged: number;
  /** Records/chunks whose D1 or R2 step threw; the sweep skipped them and continued. */
  failures: number;
  /** Audit rows are append-only by design; never touched. */
  moderationEventsRetained: 0;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(nowIso: string, days: number): string {
  return new Date(Date.parse(nowIso) - days * 86_400_000).toISOString();
}

type D1 = Awaited<ReturnType<typeof getD1>>;

/**
 * SQL fragment appended to the R1/R2 camera SELECTs (whose FROM alias is `c`):
 * skip records with an open appeal or an active legal hold, so a hard delete
 * can never destroy data that the law still protects.
 *
 *  - Open appeal: a `moderation_appeals` row for the camera still `pending`
 *    or `escalated` (not finally decided). MODERATION_SLA §4/S5: an appeal can
 *    be filed up to 30 days after the decision and decided up to 14 days
 *    later, so an appeal can still be open when the R2 sweep fires at
 *    decision+30 days; purging then would destroy the record and its evidence
 *    irreversibly before the appeal is decided.
 *  - Active legal hold: an audit event `action='legal-hold'` for the camera
 *    with no later `action='legal-hold-release'` event. RETENTION_SCHEDULE.md
 *    §2: "Any pending litigation, complaint, or supervisory-authority inquiry
 *    suspends the relevant deletions until the matter is closed. The hold, its
 *    scope and its end date are recorded in the audit log." The audit trail is
 *    the only hold registry in the schema; a hold is raised (and later
 *    released) by ops writing those events on the append-only log.
 */
const HOLD_EXCLUSION_SQL = `
  AND NOT EXISTS (
    SELECT 1 FROM moderation_appeals a
    WHERE a.entity = 'camera' AND a.entity_id = c.id
      AND a.status IN ('pending', 'escalated')
  )
  AND NOT EXISTS (
    SELECT 1 FROM moderation_events lh
    WHERE lh.entity = 'camera' AND lh.entity_id = c.id
      AND lh.action = 'legal-hold'
      AND NOT EXISTS (
        SELECT 1 FROM moderation_events lhr
        WHERE lhr.entity = 'camera' AND lhr.entity_id = c.id
          AND lhr.action = 'legal-hold-release'
          AND lhr.created_at >= lh.created_at
      )
  )`;

/**
 * Delete the R2 objects for a set of storage keys, best effort: a bucket
 * failure must not abort the rest of the sweep. Keys whose object could not
 * be removed are counted so ops can follow up (the D1 rows are gone, so the
 * orphaned objects are unreachable either way).
 */
async function deleteR2Objects(
  r2: RetentionR2 | undefined,
  storageKeys: string[],
): Promise<{ deleted: number; failed: number }> {
  if (!r2 || storageKeys.length === 0) return { deleted: 0, failed: 0 };
  let deleted = 0;
  let failed = 0;
  for (const key of storageKeys) {
    try {
      await r2.delete(key);
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.error(`Retention: failed to delete R2 object ${key}`, error);
    }
  }
  return { deleted, failed };
}

/**
 * Select the storage keys of every photo of a record. The DELETE of the D1
 * rows happens inside the caller's `d1.batch(...)` so a record, its queue
 * items and its evidence are removed atomically (a failure rolls back all
 * three); the R2 objects are deleted AFTER the batch succeeds, best effort.
 */
async function selectPhotosForCamera(
  d1: D1,
  cameraId: number,
): Promise<{ id: number; storageKey: string }[]> {
  const photos = await d1
    .prepare("SELECT id, storage_key AS storageKey FROM photos WHERE camera_id = ?")
    .bind(cameraId)
    .all<{ id: number; storageKey: string }>();
  return photos.results;
}

/**
 * Hard-delete a camera record, its evidence and its open queue items, in one
 * atomic batch. Returns the number of photo rows and R2 objects removed.
 */
async function purgeCameraRecord(
  d1: D1,
  r2: RetentionR2 | undefined,
  cameraId: number,
  nowIso: string,
): Promise<{ photoRows: number; r2Deleted: number; r2Failed: number }> {
  const photos = await selectPhotosForCamera(d1, cameraId);
  await d1.batch([
    ...(photos.length > 0
      ? [d1.prepare("DELETE FROM photos WHERE camera_id = ?").bind(cameraId)]
      : []),
    d1.prepare("UPDATE moderation_queue SET state = 'closed', updated_at = ? WHERE entity = 'camera' AND entity_id = ? AND state != 'closed'").bind(nowIso, cameraId),
    d1.prepare("DELETE FROM cameras WHERE id = ?").bind(cameraId),
  ]);
  const { deleted, failed } = await deleteR2Objects(r2, photos.map((photo) => photo.storageKey));
  return { photoRows: photos.length, r2Deleted: deleted, r2Failed: failed };
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

/**
 * Run the full retention sweep. `now` defaults to the current instant and is
 * injectable for deterministic tests; `r2` defaults to nothing (no object
 * deletion) so the pure-D1 contract is testable without a bucket binding.
 */
export async function runRetentionSweep(
  now: string = new Date().toISOString(),
  options: { policy?: RetentionPolicy; r2?: RetentionR2 } = {},
): Promise<RetentionSummary> {
  const d1 = await getD1();
  const policy = options.policy ?? DEFAULT_RETENTION_POLICY;
  const r2 = options.r2;

  const summary: RetentionSummary = {
    now,
    policy,
    scheduledExpiry: 0,
    becameStale: 0,
    unverifiedRemoved: 0,
    pendingPurged: 0,
    rejectedPurged: 0,
    correctionsPurged: 0,
    photosDeleted: 0,
    r2ObjectsDeleted: 0,
    r2ObjectsFailed: 0,
    sessionsPurged: 0,
    emailTokensPurged: 0,
    challengesPurged: 0,
    failures: 0,
    moderationEventsRetained: 0,
  };

  // --- R3 part 1: reuse the freshness sweep (verified → needs_review → stale).
  const freshness = await runFreshnessSweep(now);
  summary.scheduledExpiry = freshness.scheduledExpiry;
  summary.becameStale = freshness.becameStale;

  // --- R3 part 2: needs_review/stale records unverified for 6 months → removed.
  // The 6-month clock starts at review_due_at; `stale` is only reached 90 days
  // past it, so `removed` strictly follows `stale`. Evidence is deleted with
  // the record (R6); the row stays as a `removed` tombstone (never public).
  // The window is CALENDAR months (addMonths), matching the freshness clocks
  // and the legal wording "6 months unverified" (review t_eed5f080).
  const unverifiedCutoff = addMonths(now, -policy.unverifiedRemovalMonths);
  const unverified = await d1
    .prepare(
      "SELECT id, status FROM cameras WHERE status IN ('needs_review', 'stale') AND review_due_at IS NOT NULL AND review_due_at < ?",
    )
    .bind(unverifiedCutoff)
    .all<{ id: number; status: string }>();
  for (const { id, status } of unverified.results) {
    try {
      const photos = await selectPhotosForCamera(d1, id);
      await d1.batch([
        ...(photos.length > 0
          ? [d1.prepare("DELETE FROM photos WHERE camera_id = ?").bind(id)]
          : []),
        d1
          .prepare("UPDATE cameras SET status = 'removed', updated = ? WHERE id = ?")
          .bind(now, id),
        d1
          .prepare(
            "INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, reviewer_id, actor_role, recused, escalated, second_reviewer_id, appeal_id, created_at) VALUES ('camera', ?, ?, 'removed', 'removed', 'inaccurate-or-outdated', ?, 'Retention sweep', NULL, NULL, 0, 0, NULL, NULL, ?)",
          )
          .bind(id, status, `Removed after ${policy.unverifiedRemovalMonths} months unverified (R3).`, now),
      ]);
      const { deleted, failed } = await deleteR2Objects(r2, photos.map((photo) => photo.storageKey));
      summary.photosDeleted += photos.length;
      summary.r2ObjectsDeleted += deleted;
      summary.r2ObjectsFailed += failed;
      summary.unverifiedRemoved += 1;
    } catch (error) {
      summary.failures += 1;
      console.error(`Retention: R3 removal failed for camera ${id}`, error);
    }
  }

  // --- R1: pending reports not verified within 90 days → hard delete + evidence.
  // Records under an open appeal or an active legal hold are exempt
  // (HOLD_EXCLUSION_SQL): a hard delete is irreversible, so the law-first rule
  // is to skip and retry on a later run.
  const pendingCutoff = daysAgo(now, policy.pendingDays);
  const pending = await d1
    .prepare(
      `SELECT c.id FROM cameras c
       WHERE c.status = 'pending' AND c.created_at < ?${HOLD_EXCLUSION_SQL}`,
    )
    .bind(pendingCutoff)
    .all<{ id: number }>();
  for (const { id } of pending.results) {
    try {
      const { photoRows, r2Deleted, r2Failed } = await purgeCameraRecord(d1, r2, id, now);
      summary.photosDeleted += photoRows;
      summary.r2ObjectsDeleted += r2Deleted;
      summary.r2ObjectsFailed += r2Failed;
      summary.pendingPurged += 1;
    } catch (error) {
      summary.failures += 1;
      console.error(`Retention: R1 purge failed for camera ${id}`, error);
    }
  }

  // --- R2: rejected reports expire 30 days after the rejection decision.
  // The decision date is the latest moderation event with action='reject';
  // legacy rows without an event fall back to created_at. Records under an
  // open appeal (filed up to decision+30d, decided up to +14d later per
  // MODERATION_SLA S5) or an active legal hold are exempt: the purge must not
  // destroy record + evidence while the appeal/hold is still open.
  const rejectedCutoff = daysAgo(now, policy.rejectedDays);
  const rejected = await d1
    .prepare(
      `SELECT c.id
      FROM cameras c
      LEFT JOIN (
        SELECT entity_id, MAX(created_at) AS decided_at
        FROM moderation_events
        WHERE entity = 'camera' AND action = 'reject'
        GROUP BY entity_id
      ) e ON e.entity_id = c.id
      WHERE c.status = 'rejected'
        AND COALESCE(e.decided_at, c.created_at) < ?${HOLD_EXCLUSION_SQL}`,
    )
    .bind(rejectedCutoff)
    .all<{ id: number }>();
  for (const { id } of rejected.results) {
    try {
      const { photoRows, r2Deleted, r2Failed } = await purgeCameraRecord(d1, r2, id, now);
      summary.photosDeleted += photoRows;
      summary.r2ObjectsDeleted += r2Deleted;
      summary.r2ObjectsFailed += r2Failed;
      summary.rejectedPurged += 1;
    } catch (error) {
      summary.failures += 1;
      console.error(`Retention: R2 purge failed for camera ${id}`, error);
    }
  }

  // --- R4: resolved correction requests are archived, then deleted, 2 years
  // after the RESOLUTION date (RETENTION_SCHEDULE.md R4: "2 years, Resolution
  // date" + "archive the entry in the internal audit log, then delete").
  // The anchor is resolved_at (set by moderateCorrection on the approve/reject
  // transition, backfilled by migration 0018 from the decision event); rows
  // without it fall back to created_at, the documented derogation for legacy
  // requests resolved before the column existed (same fallback pattern as the
  // R2/R6 legacy rows). A created_at anchor would purge BEFORE the legal floor
  // — created_at always precedes the resolution date. Only terminal states are
  // swept ('reviewed', 'rejected'): escalated requests stay 'pending' (not yet
  // resolved) and open requests are never touched.
  const correctionCutoff = daysAgo(now, policy.correctionDays);
  const corrections = await d1
    .prepare(
      `SELECT id, status, resolved_at AS resolvedAt
       FROM correction_requests
       WHERE status IN ('reviewed', 'rejected')
         AND COALESCE(resolved_at, created_at) < ?`,
    )
    .bind(correctionCutoff)
    .all<{ id: number; status: string; resolvedAt: string | null }>();
  for (const correction of corrections.results) {
    try {
      // Archive step (art. 5(2)): write an append-only audit event in the SAME
      // batch as the delete, so the purge cannot leave a gap in the trail.
      // The decision event (approve/reject) carries the resolution itself;
      // this event records the purge and its trigger, keeping the 2-year
      // accountability trail complete after the row is gone.
      await d1.batch([
        d1
          .prepare(
            "INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, reviewer_id, actor_role, recused, escalated, second_reviewer_id, appeal_id, created_at) VALUES ('correction', ?, ?, 'archived', 'archive', 'other', ?, 'Retention sweep', NULL, NULL, 0, 0, NULL, NULL, ?)",
          )
          .bind(
            correction.id,
            correction.status,
            `Correction request ${correction.id} purged under R4 (2-year retention from resolution date ${correction.resolvedAt ?? "unknown (legacy row)"}); archived before delete per RETENTION_SCHEDULE.md R4.`,
            now,
          ),
        d1.prepare("DELETE FROM correction_requests WHERE id = ?").bind(correction.id),
      ]);
      summary.correctionsPurged += 1;
    } catch (error) {
      summary.failures += 1;
      console.error(`Retention: R4 archive+delete failed for correction ${correction.id}`, error);
    }
  }

  // --- R6: orphan pending photos (never linked to a record) and rejected
  // photos (evidence a moderator refused) are removed from D1 and R2.
  // NOTE (asymmetry, pinned by tests): the orphan query REQUIRES
  // camera_id IS NULL — a pending photo linked to a record follows the record
  // lifecycle (R1/R2/R3) and is never swept alone. The rejected query has NO
  // camera_id filter: a rejected photo is removed 30 days after the reject
  // decision even if it is still linked to a live record, because rejected
  // evidence is never public and must not outlive its appeal window (R13).
  const orphanPhotos = await d1
    .prepare("SELECT id, storage_key AS storageKey FROM photos WHERE camera_id IS NULL AND status = 'pending' AND created_at < ?")
    .bind(daysAgo(now, policy.orphanPhotoDays))
    .all<{ id: number; storageKey: string }>();
  // R13: rejected photos expire 30 days after the rejection decision, not at
  // the next sweep — the decision date is the latest moderation event with
  // entity='photo' AND action='reject'; legacy rows without an event fall
  // back to created_at. Same anchor pattern as the camera R2 sweep above.
  const rejectedPhotos = await d1
    .prepare(
      `SELECT p.id, p.storage_key AS storageKey
      FROM photos p
      LEFT JOIN (
        SELECT entity_id, MAX(created_at) AS decided_at
        FROM moderation_events
        WHERE entity = 'photo' AND action = 'reject'
        GROUP BY entity_id
      ) e ON e.entity_id = p.id
      WHERE p.status = 'rejected'
        AND COALESCE(e.decided_at, p.created_at) < ?`,
    )
    .bind(daysAgo(now, policy.rejectedDays))
    .all<{ id: number; storageKey: string }>();
  const orphanAndRejected = [...orphanPhotos.results, ...rejectedPhotos.results];
  if (orphanAndRejected.length > 0) {
    // D1 caps bound parameters at 100 per query, so a single
    // `DELETE ... WHERE id IN (?, ...)` breaks once more than 100 photos
    // are pending removal (rejected evidence can pile up between runs).
    // Delete in chunks of at most 100 ids, and delete each chunk's R2
    // objects IMMEDIATELY after its D1 rows: if a later chunk fails, the
    // rows of the earlier chunks are already gone, so their R2 objects must
    // be gone too or they would be orphaned forever (the pre-fix code ran
    // deleteR2Objects only after the whole loop, leaking the objects of
    // every chunk deleted before the failing one). The failed chunk keeps
    // its D1 rows, so its objects stay reachable and the next run retries.
    const ids = orphanAndRejected.map((photo) => photo.id);
    for (let offset = 0; offset < ids.length; offset += D1_MAX_BOUND_PARAMS) {
      const chunk = orphanAndRejected.slice(offset, offset + D1_MAX_BOUND_PARAMS);
      const chunkIds = chunk.map((photo) => photo.id);
      const placeholders = chunkIds.map(() => "?").join(", ");
      try {
        await d1
          .prepare(`DELETE FROM photos WHERE id IN (${placeholders})`)
          .bind(...chunkIds)
          .run();
      } catch (error) {
        summary.failures += 1;
        console.error(`Retention: R6 chunk delete failed for ${chunkIds.length} photos`, error);
        continue;
      }
      const { deleted, failed } = await deleteR2Objects(r2, chunk.map((photo) => photo.storageKey));
      summary.photosDeleted += chunk.length;
      summary.r2ObjectsDeleted += deleted;
      summary.r2ObjectsFailed += failed;
    }
  }

  // --- R7: dead session rows (expired or revoked) are pure garbage collection.
  const sessions = await d1
    .prepare("DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL")
    .bind(now)
    .run() as { meta: { changes: number } };
  summary.sessionsPurged = sessions.meta.changes;

  // --- R15 (ADR 0020): expired auth-method rows are garbage collection too.
  // The 0027/0028 migrations promised an expiry sweep served by the
  // `expires_at` index; the cron is where that promise is enforced
  // (review-ada-2 P3-1). Email-verification tokens die 24h after issue
  // (R15: "deleted on use or expiry"); WebAuthn challenges after 10 minutes.
  // Both tables are TTL-bounded and small, so a single bounded DELETE is
  // enough — no chunking needed (the R7 session sweep follows the same
  // pattern). Failures are deliberately NOT counted here: a broken sweep
  // run is logged by the worker's scheduled handler and retried next run;
  // the rows are inert (lookups reject expired rows at read time), so a
  // failed sweep never breaks the request path.
  const emailTokens = (await d1
    .prepare("DELETE FROM email_verification_tokens WHERE expires_at < ?")
    .bind(now)
    .run()) as { meta: { changes: number } };
  summary.emailTokensPurged = emailTokens.meta.changes;

  // The WebAuthn challenge sweep already lives in db/passkeys.ts (exported,
  // TTL-bounded, `now`-injectable) and runs opportunistically on each begin
  // ceremony; the cron call below centralizes it so challenges are swept
  // even when no ceremony ever starts (the 10-minute TTL keeps the table
  // small, but the guarantee must not depend on traffic).
  summary.challengesPurged = await sweepExpiredWebAuthnChallenges(now);

  return summary;
}
