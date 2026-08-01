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
 *   R4  resolved correction requests  → delete after 2 years (created_at)
 *   R6  photo evidence                → deleted with its record; orphan
 *                                       pending photos after 90 days; rejected
 *                                       photos after 30 days (R13: anchored on
 *                                       the photo reject event)
 *   R7  sessions                      → delete expired / revoked rows
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
          .bind("Retention: unverified past the 6-month removal window", id),
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
  const pendingCutoff = daysAgo(now, policy.pendingDays);
  const pending = await d1
    .prepare("SELECT id FROM cameras WHERE status = 'pending' AND created_at < ?")
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
  // legacy rows without an event fall back to created_at.
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
        AND COALESCE(e.decided_at, c.created_at) < ?`,
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

  // --- R4: resolved correction requests older than 2 years → delete.
  // `outcome IS NOT NULL` marks a resolved request (the queue lists only
  // pending ones). created_at is the only stored timestamp; using it is
  // conservative (never earlier than the legal 2-year floor).
  const correctionCutoff = daysAgo(now, policy.correctionDays);
  const corrections = await d1
    .prepare("DELETE FROM correction_requests WHERE outcome IS NOT NULL AND created_at < ?")
    .bind(correctionCutoff)
    .run() as { meta: { changes: number } };
  summary.correctionsPurged = corrections.meta.changes;

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

  return summary;
}
