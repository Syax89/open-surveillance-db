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

const localModerator = "Local moderator";

/**
 * The `correction_requests` and `moderation_events` tables and their indexes
 * are applied by the Drizzle migrations in `drizzle/`; this function performs
 * no runtime bootstrap.
 */
async function getModerationD1() {
  return getD1();
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
