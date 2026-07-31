import { getD1, type CameraRecord } from "./cameras";
import type { CorrectionRequest } from "./corrections";

export type ModerationCameraRecord = CameraRecord;

export type PendingCameraReport = ModerationCameraRecord;
export type PendingCorrectionRequest = CorrectionRequest;

export type ModerationQueue = {
  cameraReports: PendingCameraReport[];
  publishedCameras: ModerationCameraRecord[];
  reviewCameras: ModerationCameraRecord[];
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
export type CorrectionModerationAction = "approve" | "reject" | "associate";

export const correctionOutcomes = [
  "kept",
  "corrected",
  "marked-stale",
  "removed",
  "escalated",
] as const;
export type CorrectionOutcome = (typeof correctionOutcomes)[number];

export type CorrectionModerationOptions = {
  outcome?: CorrectionOutcome;
  cameraId?: number;
};

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
  "CREATE TABLE IF NOT EXISTS correction_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, camera_id INTEGER, issue_type TEXT NOT NULL, message TEXT NOT NULL, contact TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, outcome TEXT)";
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
  const [cameraReports, publishedCameras, reviewCameras, correctionRequests, recentEvents] =
    await Promise.all([
    d1
      .prepare(
        "SELECT id, title, kind, manufacturer, observed_on AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, notes, latitude, longitude, status, source, updated, description, created_at AS createdAt FROM cameras WHERE status = ? ORDER BY created_at ASC, id ASC",
      )
      .bind("pending")
      .all<PendingCameraReport>(),
    d1
      .prepare(
        "SELECT id, title, kind, manufacturer, observed_on AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, notes, latitude, longitude, status, source, updated, description, created_at AS createdAt FROM cameras WHERE status = ? ORDER BY created_at ASC, id ASC",
      )
      .bind("verified")
      .all<CameraRecord>(),
    d1
      .prepare(
        "SELECT id, title, kind, manufacturer, observed_on AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, notes, latitude, longitude, status, source, updated, description, created_at AS createdAt FROM cameras WHERE status = ? ORDER BY created_at ASC, id ASC",
      )
      .bind("needs_review")
      .all<CameraRecord>(),
    // correction_requests rows expose outcome in the queue (null while pending).
    d1
      .prepare(
        "SELECT id, camera_id AS cameraId, issue_type AS issueType, message, contact, status, outcome, created_at AS createdAt FROM correction_requests WHERE status = ? ORDER BY created_at ASC, id ASC",
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
    correctionRequests: correctionRequests.results,
    recentEvents: recentEvents.results,
  };
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

  const publishMetadata = current.status === "pending" && action === "approve";
  const item = publishMetadata
    ? await d1
        .prepare(
          "UPDATE cameras SET status = ?, updated = ?, publish_manufacturer = ?, publish_observed_on = ? WHERE id = ? AND status = ? RETURNING id, title, kind, manufacturer, observed_on AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, notes, latitude, longitude, status, source, updated, description, created_at AS createdAt",
        )
        .bind(
          transition.newStatus,
          transition.updated,
          metadataPublication?.publishManufacturer ? 1 : 0,
          metadataPublication?.publishObservedOn ? 1 : 0,
          id,
          current.status,
        )
        .first<ModerationCameraRecord>()
    : await d1
        .prepare(
          "UPDATE cameras SET status = ?, updated = ? WHERE id = ? AND status = ? RETURNING id, title, kind, manufacturer, observed_on AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, notes, latitude, longitude, status, source, updated, description, created_at AS createdAt",
        )
        .bind(transition.newStatus, transition.updated, id, current.status)
        .first<ModerationCameraRecord>();
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

  return null;
}

export async function moderateCorrection(
  id: number,
  action: CorrectionModerationAction,
  reasonCode: ModerationReasonCode,
  note: string | null,
  options?: CorrectionModerationOptions,
): Promise<ModerationDecision<PendingCorrectionRequest> | null> {
  const d1 = await getModerationD1();
  const outcome = options?.outcome;
  const cameraId = options?.cameraId;
  if (action === "associate" && cameraId === undefined) return null;
  const status = action === "approve" ? "reviewed" : "rejected";

  const sets: string[] = [];
  const binds: (string | number)[] = [];
  if (action !== "associate") {
    sets.push("status = ?");
    binds.push(status);
  }
  if (cameraId !== undefined) {
    sets.push("camera_id = ?");
    binds.push(cameraId);
  }
  if (action === "approve" && outcome !== undefined) {
    sets.push("outcome = ?");
    binds.push(outcome);
  }
  binds.push(id);

  const item = await d1
    .prepare(
      `UPDATE correction_requests SET ${sets.join(", ")} WHERE id = ? AND status = 'pending' RETURNING id, camera_id AS cameraId, issue_type AS issueType, message, contact, status, outcome, created_at AS createdAt`,
    )
    .bind(...binds)
    .first<PendingCorrectionRequest>();
  if (!item) return null;

  const event =
    action === "associate"
      ? await createModerationEvent(d1, {
          entity: "correction",
          entityId: id,
          previousStatus: "pending",
          newStatus: "pending",
          action: "associate",
          reasonCode,
          note,
        })
      : await createModerationEvent(d1, {
          entity: "correction",
          entityId: id,
          previousStatus: "pending",
          newStatus: status,
          action,
          reasonCode,
          note,
        });

  if (action === "approve" && outcome !== undefined && item.cameraId !== null) {
    await applyCorrectionOutcome(d1, item.cameraId, outcome, reasonCode, note);
  }

  return { item, event };
}

async function applyCorrectionOutcome(
  d1: Awaited<ReturnType<typeof getModerationD1>>,
  cameraId: number,
  outcome: CorrectionOutcome,
  reasonCode: ModerationReasonCode,
  note: string | null,
): Promise<void> {
  const record = await d1
    .prepare("SELECT status FROM cameras WHERE id = ?")
    .bind(cameraId)
    .first<{ status: string }>();
  if (!record) return;

  if (outcome === "marked-stale") {
    // A credible correction sends a verified record back to needs_review while
    // it is reassessed (DATA_TRUST SLA).
    if (record.status !== "verified") return;
    await d1
      .prepare("UPDATE cameras SET status = 'needs_review', updated = ? WHERE id = ? AND status = 'verified'")
      .bind("Local moderation: correction marked record stale", cameraId)
      .run();
    await createModerationEvent(d1, {
      entity: "camera",
      entityId: cameraId,
      previousStatus: "verified",
      newStatus: "needs_review",
      action: "marked-stale",
      reasonCode,
      note,
    });
    return;
  }

  if (outcome === "removed") {
    await d1
      .prepare("UPDATE cameras SET status = 'removed', updated = ? WHERE id = ?")
      .bind("Local moderation: correction outcome removed the record", cameraId)
      .run();
    await createModerationEvent(d1, {
      entity: "camera",
      entityId: cameraId,
      previousStatus: record.status,
      newStatus: "removed",
      action: "removed",
      reasonCode,
      note,
    });
    return;
  }

  if (outcome === "corrected") {
    await d1
      .prepare("UPDATE cameras SET updated = ? WHERE id = ?")
      .bind("Local moderation: correction applied to record", cameraId)
      .run();
    await createModerationEvent(d1, {
      entity: "camera",
      entityId: cameraId,
      previousStatus: record.status,
      newStatus: record.status,
      action: "corrected",
      reasonCode,
      note,
    });
  }
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
