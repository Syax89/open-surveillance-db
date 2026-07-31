import { getD1, type CameraRecord } from "./cameras";
import type { CorrectionRequest } from "./corrections";
import { DEFAULT_REVIEW_INTERVAL_MONTHS, STALE_GRACE_DAYS, addDays, computeReviewDueAt } from "./freshness";

export type ModerationCameraRecord = CameraRecord;

export type PendingCameraReport = ModerationCameraRecord;
export type PendingCorrectionRequest = CorrectionRequest;

export type ModerationQueue = {
  cameraReports: PendingCameraReport[];
  publishedCameras: ModerationCameraRecord[];
  reviewCameras: ModerationCameraRecord[];
  staleCameras: ModerationCameraRecord[];
  correctionRequests: PendingCorrectionRequest[];
  recentEvents: ModerationEvent[];
};

export type ModerationEntity = "camera" | "correction";
export type CameraModerationAction =
  | "approve"
  | "reject"
  | "hide"
  | "mark-stale"
  | "reverify";
export type CorrectionModerationAction = "approve" | "reject";

export const moderationReasonCodes = [
  "verified-public-infrastructure",
  "insufficient-evidence",
  "duplicate",
  "private-or-sensitive-location",
  "inaccurate-or-outdated",
  "privacy-or-safety-concern",
  "other",
] as const;

export type ModerationReasonCode = (typeof moderationReasonCodes)[number];

export type ModerationEvent = {
  id: number;
  entity: ModerationEntity;
  entityId: number;
  previousStatus: string;
  newStatus: string;
  action: string;
  reasonCode: ModerationReasonCode;
  note: string | null;
  actor: string;
  createdAt: string;
};

export type ModerationDecision<T> = {
  item: T;
  event: ModerationEvent;
};

export type MetadataPublicationChoices = {
  publishManufacturer: boolean;
  publishObservedOn: boolean;
};

const createCorrectionRequestsTable =
  "CREATE TABLE IF NOT EXISTS correction_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, camera_id INTEGER, issue_type TEXT NOT NULL, message TEXT NOT NULL, contact TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL)";
const createCorrectionRequestsStatusIndex =
  "CREATE INDEX IF NOT EXISTS correction_requests_status_idx ON correction_requests(status)";
const createModerationEventsTable =
  "CREATE TABLE IF NOT EXISTS moderation_events (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, entity_id INTEGER NOT NULL, previous_status TEXT NOT NULL, new_status TEXT NOT NULL, action TEXT NOT NULL, reason_code TEXT NOT NULL, note TEXT, actor TEXT NOT NULL, created_at TEXT NOT NULL)";
const createModerationEventsCreatedAtIndex =
  "CREATE INDEX IF NOT EXISTS moderation_events_created_at_idx ON moderation_events(created_at DESC, id DESC)";
const localModerator = "Local moderator";

async function getModerationD1() {
  const d1 = await getD1();
  await d1.batch([
    d1.prepare(createCorrectionRequestsTable),
    d1.prepare(createCorrectionRequestsStatusIndex),
    d1.prepare(createModerationEventsTable),
    d1.prepare(createModerationEventsCreatedAtIndex),
  ]);
  return d1;
}

export async function listPendingModerationItems(): Promise<ModerationQueue> {
  const d1 = await getModerationD1();
  // Lazy freshness sweep: before the queue is read, records whose review
  // window elapsed are moved to `needs_review` (scheduled expiry) and records
  // not re-confirmed within the grace period are labelled `stale`. Public
  // routes never depend on this sweep: listPublicCameras() enforces the same
  // freshness boundary at read time.
  await runFreshnessSweep();
  const cameraColumns =
    "id, title, kind, manufacturer, observed_on AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, notes, latitude, longitude, status, source, updated, description, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, created_at AS createdAt";
  const [cameraReports, publishedCameras, reviewCameras, staleCameras, correctionRequests, recentEvents] =
    await Promise.all([
    d1
      .prepare(
        `SELECT ${cameraColumns} FROM cameras WHERE status = ? ORDER BY created_at ASC, id ASC`,
      )
      .bind("pending")
      .all<PendingCameraReport>(),
    d1
      .prepare(
        `SELECT ${cameraColumns} FROM cameras WHERE status = ? ORDER BY created_at ASC, id ASC`,
      )
      .bind("verified")
      .all<CameraRecord>(),
    d1
      .prepare(
        `SELECT ${cameraColumns} FROM cameras WHERE status = ? ORDER BY created_at ASC, id ASC`,
      )
      .bind("needs_review")
      .all<CameraRecord>(),
    d1
      .prepare(
        `SELECT ${cameraColumns} FROM cameras WHERE status = ? ORDER BY created_at ASC, id ASC`,
      )
      .bind("stale")
      .all<CameraRecord>(),
    d1
      .prepare(
        "SELECT id, camera_id AS cameraId, issue_type AS issueType, message, contact, status, created_at AS createdAt FROM correction_requests WHERE status = ? ORDER BY created_at ASC, id ASC",
      )
      .bind("pending")
      .all<PendingCorrectionRequest>(),
    d1
      .prepare(
        "SELECT id, entity, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, reason_code AS reasonCode, note, actor, created_at AS createdAt FROM moderation_events ORDER BY created_at DESC, id DESC LIMIT ?",
      )
      .bind(50)
      .all<ModerationEvent>(),
    ]);

  return {
    cameraReports: cameraReports.results,
    publishedCameras: publishedCameras.results,
    reviewCameras: reviewCameras.results,
    staleCameras: staleCameras.results,
    correctionRequests: correctionRequests.results,
    recentEvents: recentEvents.results,
  };
}

/**
 * Scheduled-expiry sweep (docs/workstreams/DATA_TRUST.md "Review and expiry
 * clocks"): a `verified` record whose review window elapsed moves to
 * `needs_review`; a `needs_review` record still unconfirmed STALE_GRACE_DAYS
 * days after its scheduled review becomes `stale`. Every transition writes a
 * moderation event (action `scheduled-expiry` / `expiry-not-reconfirmed`).
 */
export async function runFreshnessSweep(nowIso: string = new Date().toISOString()): Promise<{ scheduledExpiry: number; becameStale: number }> {
  const d1 = await getModerationD1();
  const staleThreshold = addDays(nowIso, -STALE_GRACE_DAYS);

  const due = await d1
    .prepare("SELECT id FROM cameras WHERE status = 'verified' AND review_due_at IS NOT NULL AND review_due_at < ?")
    .bind(nowIso)
    .all<{ id: number }>();
  for (const { id } of due.results) {
    await d1
      .prepare("UPDATE cameras SET status = 'needs_review', updated = ? WHERE id = ?")
      .bind("Local moderation: scheduled review due", id)
      .run();
    await createModerationEvent(d1, {
      entity: "camera",
      entityId: id,
      previousStatus: "verified",
      newStatus: "needs_review",
      action: "scheduled-expiry",
      reasonCode: "inaccurate-or-outdated",
      note: "Review window elapsed; re-verification required before the record can be public again.",
    });
  }

  const unconfirmed = await d1
    .prepare("SELECT id FROM cameras WHERE status = 'needs_review' AND review_due_at IS NOT NULL AND review_due_at < ?")
    .bind(staleThreshold)
    .all<{ id: number }>();
  for (const { id } of unconfirmed.results) {
    await d1
      .prepare("UPDATE cameras SET status = 'stale', updated = ? WHERE id = ?")
      .bind("Local moderation: not re-confirmed within the review grace period", id)
      .run();
    await createModerationEvent(d1, {
      entity: "camera",
      entityId: id,
      previousStatus: "needs_review",
      newStatus: "stale",
      action: "expiry-not-reconfirmed",
      reasonCode: "inaccurate-or-outdated",
      note: `No re-verification within ${STALE_GRACE_DAYS} days of the scheduled review.`,
    });
  }

  return { scheduledExpiry: due.results.length, becameStale: unconfirmed.results.length };
}

export async function moderateCamera(
  id: number,
  action: CameraModerationAction,
  reasonCode: ModerationReasonCode,
  note: string | null,
  metadataPublication?: MetadataPublicationChoices,
): Promise<ModerationDecision<ModerationCameraRecord> | null> {
  const d1 = await getModerationD1();
  const current = await d1
    .prepare("SELECT status FROM cameras WHERE id = ?")
    .bind(id)
    .first<{ status: string }>();
  if (!current) return null;

  const transition = getCameraTransition(current.status, action);
  if (!transition) return null;

  const nowIso = new Date().toISOString();
  // Approval and re-verification both restart the freshness clocks: the record
  // is considered re-verified as of now, and its next review is due in
  // DEFAULT_REVIEW_INTERVAL_MONTHS (standard confidence, DATA_TRUST clocks).
  const refreshClock = action === "approve" || action === "reverify";
  const selectColumns =
    "id, title, kind, manufacturer, observed_on AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, notes, latitude, longitude, status, source, updated, description, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, created_at AS createdAt";
  const publishMetadata = current.status === "pending" && action === "approve";

  let item: ModerationCameraRecord | null = null;
  if (publishMetadata) {
    item = await d1
      .prepare(
        `UPDATE cameras SET status = ?, updated = ?, publish_manufacturer = ?, publish_observed_on = ?, last_verified_at = ?, review_due_at = ?, review_interval_months = ? WHERE id = ? AND status = ? RETURNING ${selectColumns}`,
      )
      .bind(
        transition.newStatus,
        transition.updated,
        metadataPublication?.publishManufacturer ? 1 : 0,
        metadataPublication?.publishObservedOn ? 1 : 0,
        nowIso,
        computeReviewDueAt(nowIso, DEFAULT_REVIEW_INTERVAL_MONTHS),
        DEFAULT_REVIEW_INTERVAL_MONTHS,
        id,
        current.status,
      )
      .first<ModerationCameraRecord>();
  } else if (refreshClock) {
    item = await d1
      .prepare(
        `UPDATE cameras SET status = ?, updated = ?, last_verified_at = ?, review_due_at = ?, review_interval_months = ? WHERE id = ? AND status = ? RETURNING ${selectColumns}`,
      )
      .bind(
        transition.newStatus,
        transition.updated,
        nowIso,
        computeReviewDueAt(nowIso, DEFAULT_REVIEW_INTERVAL_MONTHS),
        DEFAULT_REVIEW_INTERVAL_MONTHS,
        id,
        current.status,
      )
      .first<ModerationCameraRecord>();
  } else {
    item = await d1
      .prepare(
        `UPDATE cameras SET status = ?, updated = ? WHERE id = ? AND status = ? RETURNING ${selectColumns}`,
      )
      .bind(transition.newStatus, transition.updated, id, current.status)
      .first<ModerationCameraRecord>();
  }
  if (!item) return null;

  const event = await createModerationEvent(d1, {
    entity: "camera",
    entityId: id,
    previousStatus: current.status,
    newStatus: transition.newStatus,
    action,
    reasonCode,
    note,
  });
  return { item, event };
}

function getCameraTransition(
  previousStatus: string,
  action: CameraModerationAction,
): { newStatus: string; updated: string } | null {
  if (previousStatus === "pending") {
    if (action === "approve") {
      return { newStatus: "verified", updated: "Local moderation: approved and verified" };
    }
    if (action === "reject") {
      return { newStatus: "rejected", updated: "Local moderation: rejected" };
    }
    if (action === "hide") {
      return { newStatus: "removed", updated: "Local moderation: hidden from public listing" };
    }
  }

  if (previousStatus === "verified") {
    if (action === "mark-stale") {
      return {
        newStatus: "needs_review",
        updated: "Local moderation: marked stale and queued for review",
      };
    }
    if (action === "hide") {
      return { newStatus: "removed", updated: "Local moderation: hidden from public listing" };
    }
  }

  if (previousStatus === "needs_review") {
    if (action === "reverify") {
      return { newStatus: "verified", updated: "Local moderation: re-verified" };
    }
    if (action === "hide") {
      return { newStatus: "removed", updated: "Local moderation: hidden from public listing" };
    }
  }

  if (previousStatus === "stale") {
    if (action === "reverify") {
      return { newStatus: "verified", updated: "Local moderation: re-verified" };
    }
    if (action === "hide") {
      return { newStatus: "removed", updated: "Local moderation: hidden from public listing" };
    }
  }

  return null;
}

export async function moderateCorrection(
  id: number,
  action: CorrectionModerationAction,
  reasonCode: ModerationReasonCode,
  note: string | null,
): Promise<ModerationDecision<PendingCorrectionRequest> | null> {
  const d1 = await getModerationD1();
  const status = action === "approve" ? "reviewed" : "rejected";

  const item = await d1
    .prepare(
      "UPDATE correction_requests SET status = ? WHERE id = ? AND status = 'pending' RETURNING id, camera_id AS cameraId, issue_type AS issueType, message, contact, status, created_at AS createdAt",
    )
    .bind(status, id)
    .first<PendingCorrectionRequest>();
  if (!item) return null;

  const event = await createModerationEvent(d1, {
    entity: "correction",
    entityId: id,
    previousStatus: "pending",
    newStatus: status,
    action,
    reasonCode,
    note,
  });
  return { item, event };
}

async function createModerationEvent(
  d1: Awaited<ReturnType<typeof getModerationD1>>,
  event: Omit<ModerationEvent, "id" | "actor" | "createdAt">,
): Promise<ModerationEvent> {
  const createdAt = new Date().toISOString();
  const result = await d1
    .prepare(
      "INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id, entity, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, reason_code AS reasonCode, note, actor, created_at AS createdAt",
    )
    .bind(
      event.entity,
      event.entityId,
      event.previousStatus,
      event.newStatus,
      event.action,
      event.reasonCode,
      event.note,
      localModerator,
      createdAt,
    )
    .first<ModerationEvent>();

  if (!result) throw new Error("Moderation event could not be recorded");
  return result;
}

export type PublicCameraRevision = {
  id: number;
  entityId: number;
  previousStatus: string;
  newStatus: string;
  action: string;
  createdAt: string;
};

/**
 * Reviewed public change summary for a camera record: the lifecycle
 * transitions a moderator applied (approved, marked stale, re-verified,
 * removed), oldest first. This is the public revision history described in
 * docs/FUTURE_ROADMAP.md (Horizon 1). It deliberately projects only
 * non-identifying fields: the private audit columns (actor, note,
 * reason_code) never leave this boundary, so contributor and moderator
 * identities and internal notes are never published.
 */
export async function listPublicCameraRevisions(cameraId: number): Promise<PublicCameraRevision[]> {
  const d1 = await getModerationD1();
  const result = await d1
    .prepare(
      "SELECT id, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, created_at AS createdAt FROM moderation_events WHERE entity = 'camera' AND entity_id = ? ORDER BY created_at ASC, id ASC",
    )
    .bind(cameraId)
    .all<PublicCameraRevision>();
  return result.results;
}
