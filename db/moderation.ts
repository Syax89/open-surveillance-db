import type { D1PreparedStatement } from "cloudflare:workers";
import { getD1, type CameraRecord } from "./cameras";
import type { CorrectionRequest } from "./corrections";
import { listPendingPhotos, type PendingPhotoReport } from "./photos";
import { DEFAULT_REVIEW_INTERVAL_MONTHS, STALE_GRACE_DAYS, addDays, computeReviewDueAt } from "./freshness";

export type ModerationCameraRecord = CameraRecord;

export type PendingCameraReport = ModerationCameraRecord;
export type PendingCorrectionRequest = CorrectionRequest;

/**
 * A pending community edit request for the moderation queue (ADR 0018 §4,
 * C3). The proposed-* columns are the per-column diff the contributor sent
 * (NULL = column unchanged); the current-* columns are the camera's stored
 * values at queue-read time so the reviewer can diff old/new in one payload.
 * `cameraStatus`/`current*` are NULL when the target camera was removed
 * (camera_edit_requests.camera_id is ON DELETE SET NULL).
 */
export type PendingEditRequest = {
  id: number;
  cameraId: number | null;
  contributorId: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  proposedTitle: string | null;
  proposedKind: string | null;
  proposedAddress: string | null;
  proposedNotes: string | null;
  proposedManufacturer: string | null;
  proposedObservedOn: string | null;
  proposedDescription: string | null;
  currentTitle: string | null;
  currentKind: string | null;
  currentAddress: string | null;
  currentNotes: string | null;
  currentManufacturer: string | null;
  currentObservedOn: string | null;
  currentDescription: string | null;
  cameraStatus: string | null;
};

export type ModerationQueue = {
  cameraReports: PendingCameraReport[];
  publishedCameras: ModerationCameraRecord[];
  reviewCameras: ModerationCameraRecord[];
  staleCameras: ModerationCameraRecord[];
  correctionRequests: PendingCorrectionRequest[];
  // Community edit requests awaiting a moderator decision (ADR 0018 §4, C3).
  // Each row is a per-column diff against the editable whitelist; the
  // moderator applies or discards it via moderateCameraEdit.
  cameraEditRequests: PendingEditRequest[];
  photoReports: PendingPhotoReport[];
  recentEvents: ModerationEvent[];
  reviewers: Reviewer[];
  queueItems: ModerationQueueItem[];
};

export type ModerationEntity = "camera" | "correction" | "photo" | "camera_edit";
export type CameraModerationAction =
  | "approve"
  | "reject"
  | "hide"
  | "mark-stale"
  | "reverify"
  | "escalate";
export type CorrectionModerationAction = "approve" | "reject" | "associate" | "escalate";

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
  "requires-senior-review",
  "other",
] as const;

export type ModerationReasonCode = (typeof moderationReasonCodes)[number];

// ---------------------------------------------------------------------------
// Reviewer roles and separation of duties (docs/workstreams/DATA_TRUST.md
// "Roles and separation of duties"). No authentication is enforced in the
// local prototype: the API requires an explicit named actor for every
// decision and the dashboard makes the choice visible. Real authentication is
// a separate public-alpha ticket; the schema already supports it (reviewers +
// MFA flag, demo seed removable by migration).
// ---------------------------------------------------------------------------

export const reviewerRoles = [
  "intake_reviewer",
  "record_reviewer",
  "senior_moderator",
  "privacy_safety_lead",
  "administrator",
] as const;

export type ReviewerRole = (typeof reviewerRoles)[number];

export type Reviewer = {
  id: number;
  displayName: string;
  role: ReviewerRole;
  active: number;
  mfaEnabled: number;
  createdAt: string;
  updatedAt: string;
};

export type ModerationContext = {
  actorId: number;
  sensitivity?: "standard" | "sensitive" | "urgent";
  assigneeId?: number;
  recused?: boolean;
  requiresSecondReview?: boolean;
};

export type ModerationResult<T> =
  | { kind: "ok"; item: T; event: ModerationEvent; queue: ModerationQueueItem }
  | { kind: "recused"; item: T; event: ModerationEvent; queue: ModerationQueueItem }
  | {
      kind: "second_review_pending";
      item: T;
      event: ModerationEvent;
      queue: ModerationQueueItem;
    }
  | { kind: "not_found" }
  | { kind: "camera_not_found" }
  | { kind: "forbidden" }
  | { kind: "actor_not_found" }
  | { kind: "actor_inactive" }
  | { kind: "second_review_same_reviewer" }
  | { kind: "escalation_requires_note" };

/** Legacy decision shape, kept as an alias for callers of the pre-Wave-B API. */
export type ModerationDecision<T> = { item: T; event: ModerationEvent };

export type QueueState = "queued" | "assigned" | "second_review" | "escalated" | "closed";
export const queueSensitivities = ["standard", "sensitive", "urgent"] as const;
export type QueueSensitivity = (typeof queueSensitivities)[number];

export type ModerationQueueItem = {
  id: number | null;
  entity: ModerationEntity;
  entityId: number;
  state: QueueState;
  assigneeId: number | null;
  sensitivity: QueueSensitivity;
  requiresSecondReview: number;
  secondReviewerId: number | null;
  escalationReason: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: string | null;
  secondReviewer: string | null;
};

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
  reviewerId: number | null;
  actorRole: ReviewerRole | null;
  recused: number;
  escalated: number;
  secondReviewerId: number | null;
  appealId: number | null;
  createdAt: string;
};

export type MetadataPublicationChoices = {
  publishManufacturer: boolean;
  publishObservedOn: boolean;
};

// ---------------------------------------------------------------------------
// Role → action matrix. `approve` (publishing a normal record) is reserved to
// record reviewers and senior moderators; intake reviewers may triage
// (reject/hide) but never publish; the administrator may only escalate.
//
// `associate` (H1 correction → record outcome, t_69891619) links a still
// pending correction request to a record without deciding it. It is granted
// to the same record-facing roles that may `approve` — pointing a request at
// a specific record steers the eventual outcome, so it stays out of the
// intake reviewer's triage-only set (ADR 0009: intake may triage but never
// publish). The parser has always whitelisted `associate` for corrections;
// this matrix entry is what actually gates it server-side.
// ---------------------------------------------------------------------------

const rolePermissions: Record<ReviewerRole, ReadonlySet<string>> = {
  intake_reviewer: new Set<string>(["reject", "hide", "escalate"]),
  record_reviewer: new Set<string>(["approve", "reject", "hide", "mark-stale", "reverify", "associate", "escalate"]),
  senior_moderator: new Set<string>(["approve", "reject", "hide", "mark-stale", "reverify", "associate", "escalate"]),
  privacy_safety_lead: new Set<string>(["hide", "escalate"]),
  administrator: new Set<string>(["escalate"]),
};

// Only these roles may approve a camera or a correction request.
const approvalRoles: ReadonlySet<ReviewerRole> = new Set<ReviewerRole>(["record_reviewer", "senior_moderator"]);

// Only these roles may resolve an escalated item.
const escalationResolverRoles: ReadonlySet<ReviewerRole> = new Set<ReviewerRole>([
  "senior_moderator",
  "privacy_safety_lead",
]);

// These decisions on a sensitive/flagged item require a second reviewer.
// Emergency `hide` intentionally stays single-person (DATA_TRUST: emergency
// hiding does not require two reviewers, but it is reviewed retrospectively).
const secondReviewActions: ReadonlySet<string> = new Set(["approve", "reject", "reverify"]);

function roleAllowsAction(role: ReviewerRole, action: string): boolean {
  if (!rolePermissions[role].has(action)) return false;
  if (action === "approve" && !approvalRoles.has(role)) return false;
  return true;
}

const localModerator = "Local moderator";

/**
 * The schema (reviewers, moderation_queue, moderation_events columns,
 * append-only triggers) is applied exclusively by the Drizzle migrations in
 * `drizzle/` (wrangler d1 migrations apply). This function performs no
 * runtime bootstrap and seeds no demo data at runtime.
 */
async function getModerationD1() {
  return getD1();
}

export type ModerationD1 = Awaited<ReturnType<typeof getModerationD1>>;

/**
 * One statement result from `d1.batch(...)`. The `cloudflare:workers` type
 * declares `batch` as `Promise<unknown[]>`, so read-backs cast through this
 * shape (P1-2 atomic write path): a RETURNING statement populates `results`,
 * everything else only `meta`.
 */
type D1BatchResult = {
  success: boolean;
  results: Record<string, unknown>[];
  meta: { changes: number; lastRowId: number };
};

/**
 * Reopens an entity's moderation queue item after an upheld appeal (the old
 * row is `closed`, so the partial unique index permits a fresh open row).
 * The reopened item returns to `queued` for a fresh decision by a different
 * reviewer.
 */
export async function reopenQueueForItem(
  entity: ModerationEntity,
  entityId: number,
): Promise<ModerationQueueItem> {
  const d1 = await getModerationD1();
  return getOrCreateQueueItem(d1, entity, entityId, {});
}

const cameraColumns =
  "id, title, kind, manufacturer, observed_on AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, notes, latitude, longitude, status, source, updated, description, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, created_at AS createdAt";

const queueSelect = [
  "q.id",
  "q.entity",
  "q.entity_id AS entityId",
  "q.state",
  "q.assignee_id AS assigneeId",
  "q.sensitivity",
  "q.requires_second_review AS requiresSecondReview",
  "q.second_reviewer_id AS secondReviewerId",
  "q.escalation_reason AS escalationReason",
  "q.created_at AS createdAt",
  "q.updated_at AS updatedAt",
  "a.display_name AS assignee",
  "s.display_name AS secondReviewer",
].join(", ");

const queueJoin =
  "FROM moderation_queue q LEFT JOIN reviewers a ON a.id = q.assignee_id LEFT JOIN reviewers s ON s.id = q.second_reviewer_id";

async function loadCamera(d1: ModerationD1, id: number): Promise<ModerationCameraRecord | null> {
  return d1
    .prepare(`SELECT ${cameraColumns} FROM cameras WHERE id = ?`)
    .bind(id)
    .first<ModerationCameraRecord>();
}

async function listReviewers(d1: ModerationD1, onlyActive: boolean): Promise<Reviewer[]> {
  const result = await d1
    .prepare(
      `SELECT id, display_name AS displayName, role, active, mfa_enabled AS mfaEnabled, created_at AS createdAt, updated_at AS updatedAt FROM reviewers${
        onlyActive ? " WHERE active = 1" : ""
      } ORDER BY role, display_name`,
    )
    .all<Reviewer>();
  return result.results;
}

async function getReviewerById(d1: ModerationD1, id: number): Promise<Reviewer | null> {
  return d1
    .prepare(
      "SELECT id, display_name AS displayName, role, active, mfa_enabled AS mfaEnabled, created_at AS createdAt, updated_at AS updatedAt FROM reviewers WHERE id = ?",
    )
    .bind(id)
    .first<Reviewer>();
}

async function findOpenQueueItem(
  d1: ModerationD1,
  entity: ModerationEntity,
  entityId: number,
): Promise<ModerationQueueItem | null> {
  return d1
    .prepare(
      `SELECT ${queueSelect} ${queueJoin} WHERE q.entity = ? AND q.entity_id = ? AND q.state != 'closed'`,
    )
    .bind(entity, entityId)
    .first<ModerationQueueItem>();
}

async function getOrCreateQueueItem(
  d1: ModerationD1,
  entity: ModerationEntity,
  entityId: number,
  options: { sensitivity?: ModerationContext["sensitivity"]; assigneeId?: number; requiresSecondReview?: boolean },
): Promise<ModerationQueueItem> {
  const existing = await findOpenQueueItem(d1, entity, entityId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const sensitivity = options.sensitivity ?? "standard";
  const requiresSecondReview =
    options.requiresSecondReview === true || sensitivity !== "standard" ? 1 : 0;
  // SQLite RETURNING cannot reference table aliases, so the fresh row is
  // returned with plain column names; assignee/second reviewer names are
  // NULL for a new queue item and filled by later read-backs.
  const created = await d1
    .prepare(
      `INSERT INTO moderation_queue (entity, entity_id, state, assignee_id, sensitivity, requires_second_review, second_reviewer_id, escalation_reason, created_at, updated_at)
       VALUES (?, ?, 'queued', ?, ?, ?, NULL, NULL, ?, ?)
       RETURNING id, entity, entity_id AS entityId, state, assignee_id AS assigneeId, sensitivity, requires_second_review AS requiresSecondReview, second_reviewer_id AS secondReviewerId, escalation_reason AS escalationReason, created_at AS createdAt, updated_at AS updatedAt, NULL AS assignee, NULL AS secondReviewer`,
    )
    .bind(
      entity,
      entityId,
      options.assigneeId ?? null,
      sensitivity,
      requiresSecondReview,
      now,
      now,
    )
    .first<ModerationQueueItem>();
  if (!created) throw new Error("Moderation queue item could not be created");
  return created;
}

/**
 * Statement builder for the queue state UPDATE. The `AND state != 'closed'`
 * guard mirrors the partial unique index: a closed queue row is never
 * touched again, so a late decision on an already-closed item is a no-op
 * instead of re-opening history (P1-2).
 */
function buildQueueStateStatement(
  d1: ModerationD1,
  queueId: number,
  state: QueueState,
  extra: { secondReviewerId?: number | null; escalationReason?: string | null } = {},
): D1PreparedStatement {
  const now = new Date().toISOString();
  return d1
    .prepare(
      `UPDATE moderation_queue SET state = ?, updated_at = ?, second_reviewer_id = COALESCE(?, second_reviewer_id), escalation_reason = COALESCE(?, escalation_reason) WHERE id = ? AND state != 'closed'`,
    )
    .bind(
      state,
      now,
      extra.secondReviewerId ?? null,
      extra.escalationReason ?? null,
      queueId,
    );
}

/**
 * Statement builder for the queue readback SELECT (SQLite cannot JOIN inside
 * RETURNING, so the reviewer display names are read back separately).
 */
function buildQueueReadbackStatement(d1: ModerationD1, queueId: number): D1PreparedStatement {
  return d1
    .prepare(`SELECT ${queueSelect} ${queueJoin} WHERE q.id = ?`)
    .bind(queueId);
}

export async function updateQueueState(
  d1: ModerationD1,
  queueId: number,
  state: QueueState,
  extra: { secondReviewerId?: number | null; escalationReason?: string | null } = {},
): Promise<ModerationQueueItem> {
  const result = (await buildQueueStateStatement(d1, queueId, state, extra).run()) as {
    meta: { changes: number };
  };
  if (result.meta.changes === 0) throw new Error("Moderation queue item could not be updated");
  const updated = await buildQueueReadbackStatement(d1, queueId).first<ModerationQueueItem>();
  if (!updated) throw new Error("Moderation queue item could not be updated");
  return updated;
}

function synthesizedQueueItem(
  entity: ModerationEntity,
  entityId: number,
  createdAt: string,
): ModerationQueueItem {
  return {
    id: null,
    entity,
    entityId,
    state: "queued",
    assigneeId: null,
    sensitivity: "standard",
    requiresSecondReview: 0,
    secondReviewerId: null,
    escalationReason: null,
    createdAt,
    updatedAt: createdAt,
    assignee: null,
    secondReviewer: null,
  };
}

export async function listPendingModerationItems(): Promise<ModerationQueue> {
  const d1 = await getModerationD1();
  // Lazy freshness sweep: before the queue is read, records whose review
  // window elapsed are moved to `needs_review` (scheduled expiry) and records
  // not re-confirmed within the grace period are labelled `stale`. Public
  // routes never depend on this sweep: listPublicCameras() enforces the same
  // freshness boundary at read time.
  await runFreshnessSweep();
  const [cameraReports, publishedCameras, reviewCameras, staleCameras, correctionRequests, cameraEditRequests, recentEvents, reviewers, openQueueItems] =
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
      // correction_requests rows expose outcome in the queue (null while pending).
      d1
        .prepare(
          "SELECT id, camera_id AS cameraId, issue_type AS issueType, message, contact, status, outcome, created_at AS createdAt FROM correction_requests WHERE status = ? ORDER BY created_at ASC, id ASC",
        )
        .bind("pending")
        .all<PendingCorrectionRequest>(),
      // Community edit requests (entity camera_edit): pending diff rows with
      // the camera's current values joined in, so the review UI diffs
      // old/new without a second round-trip per row. One query, no N+1.
      d1
        .prepare(
          `SELECT er.id, er.camera_id AS cameraId, er.contributor_id AS contributorId, er.status,
                  er.proposed_title AS proposedTitle, er.proposed_kind AS proposedKind,
                  er.proposed_address AS proposedAddress, er.proposed_notes AS proposedNotes,
                  er.proposed_manufacturer AS proposedManufacturer, er.proposed_observed_on AS proposedObservedOn,
                  er.proposed_description AS proposedDescription,
                  er.created_at AS createdAt, er.updated_at AS updatedAt,
                  c.title AS currentTitle, c.kind AS currentKind, c.address AS currentAddress,
                  c.notes AS currentNotes, c.manufacturer AS currentManufacturer,
                  c.observed_on AS currentObservedOn, c.description AS currentDescription,
                  c.status AS cameraStatus
           FROM camera_edit_requests er LEFT JOIN cameras c ON c.id = er.camera_id
           WHERE er.status = 'pending'
           ORDER BY er.created_at ASC, er.id ASC`,
        )
        .all<PendingEditRequest>(),
      d1
        .prepare(
          `SELECT id, entity, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, reason_code AS reasonCode, note, actor, reviewer_id AS reviewerId, actor_role AS actorRole, recused, escalated, second_reviewer_id AS secondReviewerId, appeal_id AS appealId, created_at AS createdAt FROM moderation_events ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .bind(50)
        .all<ModerationEvent>(),
      listReviewers(d1, true),
      d1
        .prepare(`SELECT ${queueSelect} ${queueJoin} WHERE q.state != 'closed' ORDER BY q.updated_at DESC`)
        .all<ModerationQueueItem>(),
    ]);

  const queueByKey = new Map(
    openQueueItems.results.map((item) => [`${item.entity}:${item.entityId}`, item]),
  );
  const queueItems: ModerationQueueItem[] = [
    ...cameraReports.results.map((camera) =>
      queueByKey.get(`camera:${camera.id}`) ?? synthesizedQueueItem("camera", camera.id, camera.createdAt),
    ),
    ...reviewCameras.results.map((camera) =>
      queueByKey.get(`camera:${camera.id}`) ?? synthesizedQueueItem("camera", camera.id, camera.createdAt),
    ),
    ...staleCameras.results.map((camera) =>
      queueByKey.get(`camera:${camera.id}`) ?? synthesizedQueueItem("camera", camera.id, camera.createdAt),
    ),
    ...correctionRequests.results.map((correction) =>
      queueByKey.get(`correction:${correction.id}`) ??
      synthesizedQueueItem("correction", correction.id, correction.createdAt),
    ),
    ...cameraEditRequests.results.map((editRequest) =>
      queueByKey.get(`camera_edit:${editRequest.id}`) ??
      synthesizedQueueItem("camera_edit", editRequest.id, editRequest.createdAt),
    ),
  ];

  return {
    cameraReports: cameraReports.results,
    publishedCameras: publishedCameras.results,
    reviewCameras: reviewCameras.results,
    staleCameras: staleCameras.results,
    correctionRequests: correctionRequests.results,
    cameraEditRequests: cameraEditRequests.results,
    photoReports: await listPendingPhotos(),
    recentEvents: recentEvents.results,
    reviewers: reviewers,
    queueItems,
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
  const dueStatements: D1PreparedStatement[] = [];
  for (const { id } of due.results) {
    // UPDATE + guarded event pair: the event only lands when the UPDATE
    // actually moved the record (same atomic pair as the decision batches).
    dueStatements.push(
      d1.prepare("UPDATE cameras SET status = 'needs_review', updated = ? WHERE id = ?").bind(nowIso, id),
      buildGuardedEventStatement(
        d1,
        {
          entity: "camera",
          entityId: id,
          previousStatus: "verified",
          newStatus: "needs_review",
          action: "scheduled-expiry",
          reasonCode: "inaccurate-or-outdated",
          note: "Review window elapsed; re-verification required before the record can be public again.",
        },
        "cameras",
        id,
        "needs_review",
      ),
    );
  }

  const unconfirmed = await d1
    .prepare("SELECT id FROM cameras WHERE status = 'needs_review' AND review_due_at IS NOT NULL AND review_due_at < ?")
    .bind(staleThreshold)
    .all<{ id: number }>();
  const unconfirmedStatements: D1PreparedStatement[] = [];
  for (const { id } of unconfirmed.results) {
    unconfirmedStatements.push(
      d1.prepare("UPDATE cameras SET status = 'stale', updated = ? WHERE id = ?").bind(nowIso, id),
      buildGuardedEventStatement(
        d1,
        {
          entity: "camera",
          entityId: id,
          previousStatus: "needs_review",
          newStatus: "stale",
          action: "expiry-not-reconfirmed",
          reasonCode: "inaccurate-or-outdated",
          note: `No re-verification within ${STALE_GRACE_DAYS} days of the scheduled review.`,
        },
        "cameras",
        id,
        "stale",
      ),
    );
  }

  // Flush in chunks of at most 100 statements (50 records) — the D1 batch cap.
  const statements = [...dueStatements, ...unconfirmedStatements];
  for (let offset = 0; offset < statements.length; offset += 100) {
    await d1.batch(statements.slice(offset, offset + 100));
  }

  return { scheduledExpiry: due.results.length, becameStale: unconfirmed.results.length };
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/** Minimal reviewer identity the event recorder needs (id, display name, role). */
export type ReviewerAttribution = {
  id: number;
  displayName: string;
  role: string;
};

export type ModerationEventInput = Omit<
  ModerationEvent,
  "id" | "actor" | "createdAt" | "reviewerId" | "actorRole" | "recused" | "escalated" | "secondReviewerId" | "appealId"
> & {
  reviewer?: Reviewer | ReviewerAttribution | null;
  /** Free-text actor override for events recorded outside the reviewer
   * workflow (e.g. a contributor's own pending-record edit). Defaults to the
   * reviewer display name, then the fixed "Local moderator" actor. */
  actor?: string;
  recused?: boolean;
  escalated?: boolean;
  secondReviewerId?: number | null;
  appealId?: number | null;
};

/**
 * Public recorder for the append-only audit trail. `db/appeals.ts` and other
 * moderation-adjacent modules reuse it so every moderation action lands in
 * `moderation_events` through the same immutable path.
 */
export async function recordModerationEvent(
  d1: ModerationD1,
  event: ModerationEventInput,
): Promise<ModerationEvent> {
  return createModerationEvent(d1, event);
}

/**
 * Statement builder for the append-only audit event. Kept as the single source
 * of the INSERT ... RETURNING SQL so decision batches can include the event
 * atomically (P1-2) instead of awaiting a second write after the entity
 * UPDATE. `createdAt` is fixed at build time, same as the old createModerationEvent.
 */
export function buildModerationEventStatement(
  d1: ModerationD1,
  event: ModerationEventInput,
): D1PreparedStatement {
  const createdAt = new Date().toISOString();
  return d1
    .prepare(
      `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, reviewer_id, actor_role, recused, escalated, second_reviewer_id, appeal_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, entity, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, reason_code AS reasonCode, note, actor, reviewer_id AS reviewerId, actor_role AS actorRole, recused, escalated, second_reviewer_id AS secondReviewerId, appeal_id AS appealId, created_at AS createdAt`,
    )
    .bind(
      event.entity,
      event.entityId,
      event.previousStatus,
      event.newStatus,
      event.action,
      event.reasonCode,
      event.note,
      event.actor ?? event.reviewer?.displayName ?? localModerator,
      event.reviewer?.id ?? null,
      event.reviewer?.role ?? null,
      event.recused ? 1 : 0,
      event.escalated ? 1 : 0,
      event.secondReviewerId ?? null,
      event.appealId ?? null,
      createdAt,
    );
}

/**
 * Guarded audit-event INSERT for decision batches (P1-2 atomic write path).
 * Same columns as buildModerationEventStatement, but the row is built with
 * `INSERT ... SELECT ... WHERE EXISTS` so the event only lands when the
 * entity's row already carries the decision's `expectedStatus` — i.e. the
 * UPDATE that ran just before this statement in the same batch actually
 * applied. A double-moderation race (UPDATE matched 0 rows) leaves the
 * EXISTS check on the pre-decision status and no event is recorded.
 */
function buildGuardedEventStatement(
  d1: ModerationD1,
  event: ModerationEventInput,
  guardTable: string,
  guardId: number,
  expectedStatus: string,
): D1PreparedStatement {
  const createdAt = new Date().toISOString();
  return d1
    .prepare(
      `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, reviewer_id, actor_role, recused, escalated, second_reviewer_id, appeal_id, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM ${guardTable} WHERE id = ? AND status = ?)
       RETURNING id, entity, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, reason_code AS reasonCode, note, actor, reviewer_id AS reviewerId, actor_role AS actorRole, recused, escalated, second_reviewer_id AS secondReviewerId, appeal_id AS appealId, created_at AS createdAt`,
    )
    .bind(
      event.entity,
      event.entityId,
      event.previousStatus,
      event.newStatus,
      event.action,
      event.reasonCode,
      event.note,
      event.actor ?? event.reviewer?.displayName ?? localModerator,
      event.reviewer?.id ?? null,
      event.reviewer?.role ?? null,
      event.recused ? 1 : 0,
      event.escalated ? 1 : 0,
      event.secondReviewerId ?? null,
      event.appealId ?? null,
      createdAt,
      guardId,
      expectedStatus,
    );
}

async function createModerationEvent(
  d1: ModerationD1,
  event: ModerationEventInput,
): Promise<ModerationEvent> {
  const result = await buildModerationEventStatement(d1, event).first<ModerationEvent>();
  if (!result) throw new Error("Moderation event could not be recorded");
  return result;
}

/**
 * Records a decision and updates the queue/entity state. Returns a
 * discriminated result; see `ModerationResult`.
 *
 * `context` is required on the API path (the route validates `actorId`). When
 * omitted (legacy direct callers: tests, the freshness sweep) the decision is
 * recorded with the fixed "Local moderator" actor and no role/queue
 * enforcement, matching the pre-Wave-B contract. The entity status changes
 * only when the decision is final: recusals, escalations and first-review
 * steps of a two-person review never alter `cameras.status`.
 */
export async function moderateCamera(
  id: number,
  action: CameraModerationAction,
  reasonCode: ModerationReasonCode,
  note: string | null,
  metadataPublication?: MetadataPublicationChoices,
  context?: ModerationContext,
): Promise<ModerationResult<ModerationCameraRecord>> {
  const d1 = await getModerationD1();

  const reviewer = context ? await getReviewerById(d1, context.actorId) : null;
  if (context && !reviewer) return { kind: "actor_not_found" };
  if (reviewer && reviewer.active !== 1) return { kind: "actor_inactive" };
  if (reviewer && !roleAllowsAction(reviewer.role, action)) return { kind: "forbidden" };

  const current = await d1
    .prepare("SELECT status FROM cameras WHERE id = ?")
    .bind(id)
    .first<{ status: string }>();
  if (!current) return { kind: "not_found" };

  const queue = context
    ? await getOrCreateQueueItem(d1, "camera", id, {
        sensitivity: context.sensitivity,
        assigneeId: context.assigneeId,
        requiresSecondReview: context.requiresSecondReview,
      })
    : synthesizedQueueItem("camera", id, new Date().toISOString());

  // An escalated item may only be resolved by a senior moderator / privacy
  // lead (or re-escalated); everyone else is locked out of further actions.
  if (context && queue.state === "escalated" && action !== "escalate" && !escalationResolverRoles.has(reviewer!.role)) {
    return { kind: "forbidden" };
  }

  // Recusal: record the disclosure, never change the record.
  if (context?.recused === true) {
    const event = await createModerationEvent(d1, {
      entity: "camera",
      entityId: id,
      previousStatus: current.status,
      newStatus: current.status,
      action,
      reasonCode,
      note,
      reviewer,
      recused: true,
      escalated: false,
      secondReviewerId: null,
    });
    return { kind: "recused", item: (await loadCamera(d1, id))!, event, queue };
  }

  // Escalation: route to a senior moderator / privacy lead without changing
  // the record. The note becomes the escalation reason and is mandatory.
  if (action === "escalate") {
    if (!context) return { kind: "forbidden" };
    if (!note) return { kind: "escalation_requires_note" };
    // One batch: escalate the queue + record the intent event + read back the
    // queue state. The intent event is a plain INSERT (no status guard — it
    // records the decision intent, not a status transition).
    const results = (await d1.batch([
      buildQueueStateStatement(d1, queue.id!, "escalated", { escalationReason: note }),
      buildModerationEventStatement(d1, {
        entity: "camera",
        entityId: id,
        previousStatus: current.status,
        newStatus: current.status,
        action,
        reasonCode,
        note,
        reviewer,
        recused: false,
        escalated: true,
        secondReviewerId: null,
      }),
      buildQueueReadbackStatement(d1, queue.id!),
    ])) as D1BatchResult[];
    const event = results[1].results?.[0] as ModerationEvent;
    const updatedQueue = (results[2].results?.[0] as ModerationQueueItem | undefined) ?? queue;
    return { kind: "ok", item: (await loadCamera(d1, id))!, event, queue: updatedQueue };
  }

  const transition = getCameraTransition(current.status, action);
  if (!transition) return { kind: "not_found" };

  const needsSecondReview =
    context !== undefined &&
    secondReviewActions.has(action) &&
    (queue.requiresSecondReview === 1 || queue.sensitivity !== "standard");

  if (needsSecondReview && queue.state !== "second_review") {
    // First reviewer acts: record the intent; the status is not final yet.
    const results = (await d1.batch([
      buildModerationEventStatement(d1, {
        entity: "camera",
        entityId: id,
        previousStatus: current.status,
        newStatus: current.status,
        action,
        reasonCode,
        note,
        reviewer,
        recused: false,
        escalated: false,
        secondReviewerId: null,
      }),
      buildQueueStateStatement(d1, queue.id!, "second_review"),
      buildQueueReadbackStatement(d1, queue.id!),
    ])) as D1BatchResult[];
    const event = results[0].results?.[0] as ModerationEvent;
    const updatedQueue = (results[2].results?.[0] as ModerationQueueItem | undefined) ?? queue;
    return {
      kind: "second_review_pending",
      item: (await loadCamera(d1, id))!,
      event,
      queue: updatedQueue,
    };
  }

  let secondReviewerId: number | null = null;
  if (needsSecondReview) {
    const first = await d1
      .prepare(
        "SELECT reviewer_id AS reviewerId FROM moderation_events WHERE entity = ? AND entity_id = ? AND action = ? AND reviewer_id IS NOT NULL ORDER BY id DESC LIMIT 1",
      )
      .bind("camera", id, action)
      .first<{ reviewerId: number }>();
    if (first && first.reviewerId === reviewer!.id) {
      return { kind: "second_review_same_reviewer" };
    }
    secondReviewerId = first?.reviewerId ?? null;
  }

  const nowIso = new Date().toISOString();
  // Approval and re-verification both restart the freshness clocks: the record
  // is considered re-verified as of now, and its next review is due in
  // DEFAULT_REVIEW_INTERVAL_MONTHS (standard confidence, DATA_TRUST clocks).
  const refreshClock = action === "approve" || action === "reverify";
  const publishMetadata = current.status === "pending" && action === "approve";

  const transitionStatement = buildCameraTransitionStatement(
    d1,
    id,
    current.status,
    transition,
    nowIso,
    publishMetadata,
    refreshClock,
    metadataPublication,
  );
  // The decision event is guarded on the record's post-decision status: it
  // only lands when the UPDATE above actually applied (P1-2 race guard).
  const eventStatement = buildGuardedEventStatement(
    d1,
    {
      entity: "camera",
      entityId: id,
      previousStatus: current.status,
      newStatus: transition.newStatus,
      action,
      reasonCode,
      note,
      reviewer,
      recused: false,
      escalated: false,
      secondReviewerId,
    },
    "cameras",
    id,
    transition.newStatus,
  );

  if (context) {
    // ONE batch: camera UPDATE, guarded event, queue close, queue readback.
    const results = (await d1.batch([
      transitionStatement,
      eventStatement,
      buildQueueStateStatement(d1, queue.id!, "closed", {
        secondReviewerId: secondReviewerId ?? (needsSecondReview ? reviewer!.id : null),
      }),
      buildQueueReadbackStatement(d1, queue.id!),
    ])) as D1BatchResult[];
    const item = results[0].results?.[0] as ModerationCameraRecord | undefined;
    if (!item) return { kind: "not_found" };
    const event = results[1].results?.[0] as ModerationEvent;
    const updatedQueue = (results[3].results?.[0] as ModerationQueueItem | undefined) ?? queue;
    return { kind: "ok", item, event, queue: updatedQueue };
  }

  // Legacy / no-context path: the queue stays the synthesized item.
  const results = (await d1.batch([transitionStatement, eventStatement])) as D1BatchResult[];
  const item = results[0].results?.[0] as ModerationCameraRecord | undefined;
  if (!item) return { kind: "not_found" };
  const event = results[1].results?.[0] as ModerationEvent;
  return { kind: "ok", item, event, queue };
}

/**
 * Statement builder for the camera status UPDATE in the final decision batch.
 * Same three variants as the pre-batch code (pending+approve publishes
 * metadata; approve/reverify refresh the freshness clocks; anything else only
 * flips the status), each with the `WHERE id = ? AND status = <current>`
 * guard and RETURNING the full camera columns.
 */
function buildCameraTransitionStatement(
  d1: ModerationD1,
  id: number,
  currentStatus: string,
  transition: { newStatus: string; updated: string },
  nowIso: string,
  publishMetadata: boolean,
  refreshClock: boolean,
  metadataPublication?: MetadataPublicationChoices,
): D1PreparedStatement {
  if (publishMetadata) {
    return d1
      .prepare(
        `UPDATE cameras SET status = ?, updated = ?, publish_manufacturer = ?, publish_observed_on = ?, last_verified_at = ?, review_due_at = ?, review_interval_months = ? WHERE id = ? AND status = ? RETURNING ${cameraColumns}`,
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
        currentStatus,
      );
  }
  if (refreshClock) {
    return d1
      .prepare(
        `UPDATE cameras SET status = ?, updated = ?, last_verified_at = ?, review_due_at = ?, review_interval_months = ? WHERE id = ? AND status = ? RETURNING ${cameraColumns}`,
      )
      .bind(
        transition.newStatus,
        transition.updated,
        nowIso,
        computeReviewDueAt(nowIso, DEFAULT_REVIEW_INTERVAL_MONTHS),
        DEFAULT_REVIEW_INTERVAL_MONTHS,
        id,
        currentStatus,
      );
  }
  return d1
    .prepare(
      `UPDATE cameras SET status = ?, updated = ? WHERE id = ? AND status = ? RETURNING ${cameraColumns}`,
    )
    .bind(transition.newStatus, transition.updated, id, currentStatus);
}

function getCameraTransition(
  previousStatus: string,
  action: CameraModerationAction,
): { newStatus: string; updated: string } | null {
  // Every transition writes a comparable ISO timestamp into `updated` (never
  // a human-readable label): the directory ordering and freshness windows
  // depend on parseable values, and the descriptive text lives in the
  // moderation event note, not in `updated` (P1-2).
  const nowIso = new Date().toISOString();
  if (previousStatus === "pending") {
    if (action === "approve") {
      return { newStatus: "verified", updated: nowIso };
    }
    if (action === "reject") {
      return { newStatus: "rejected", updated: nowIso };
    }
    if (action === "hide") {
      return { newStatus: "removed", updated: nowIso };
    }
  }

  if (previousStatus === "verified") {
    if (action === "mark-stale") {
      return {
        newStatus: "needs_review",
        updated: nowIso,
      };
    }
    if (action === "hide") {
      return { newStatus: "removed", updated: nowIso };
    }
  }

  if (previousStatus === "needs_review") {
    if (action === "reverify") {
      return { newStatus: "verified", updated: nowIso };
    }
    if (action === "hide") {
      return { newStatus: "removed", updated: nowIso };
    }
  }

  if (previousStatus === "stale") {
    if (action === "reverify") {
      return { newStatus: "verified", updated: nowIso };
    }
    if (action === "hide") {
      return { newStatus: "removed", updated: nowIso };
    }
  }

  return null;
}

function getCorrectionTransition(action: CorrectionModerationAction): { newStatus: string } | null {
  if (action === "approve") return { newStatus: "reviewed" };
  if (action === "reject") return { newStatus: "rejected" };
  if (action === "associate") return { newStatus: "pending" };
  return null;
}

async function loadCorrection(d1: ModerationD1, id: number): Promise<PendingCorrectionRequest | null> {
  return d1
    .prepare(
      "SELECT id, camera_id AS cameraId, issue_type AS issueType, message, contact, status, outcome, created_at AS createdAt FROM correction_requests WHERE id = ?",
    )
    .bind(id)
    .first<PendingCorrectionRequest>();
}

/**
 * Same contract as `moderateCamera`, for correction requests. `options`
 * carries the correction-specific outcome/association (existing behaviour);
 * `context` carries the named actor and queue workflow state.
 */
export async function moderateCorrection(
  id: number,
  action: CorrectionModerationAction,
  reasonCode: ModerationReasonCode,
  note: string | null,
  options?: CorrectionModerationOptions,
  context?: ModerationContext,
): Promise<ModerationResult<PendingCorrectionRequest>> {
  const d1 = await getModerationD1();
  const now = new Date().toISOString();
  const outcome = options?.outcome;
  const cameraId = options?.cameraId;
  if (action === "associate" && cameraId === undefined) return { kind: "not_found" };

  const reviewer = context ? await getReviewerById(d1, context.actorId) : null;
  if (context && !reviewer) return { kind: "actor_not_found" };
  if (reviewer && reviewer.active !== 1) return { kind: "actor_inactive" };
  if (reviewer && !roleAllowsAction(reviewer.role, action)) return { kind: "forbidden" };

  const current = await d1
    .prepare("SELECT status, camera_id AS cameraId FROM correction_requests WHERE id = ?")
    .bind(id)
    .first<{ status: string; cameraId: number | null }>();
  if (!current) return { kind: "not_found" };

  // The route validates cameraId as a positive integer, but existence must
  // be checked here: otherwise an UPDATE could link the correction to a
  // non-existent camera (orphan data) and an approve outcome on it would
  // silently apply to nothing. Escalate never persists camera_id, so it is
  // exempt (the parser allows the field on any action for uniformity).
  if (cameraId !== undefined && action !== "escalate") {
    const camera = await d1
      .prepare("SELECT id FROM cameras WHERE id = ?")
      .bind(cameraId)
      .first<{ id: number }>();
    if (!camera) return { kind: "camera_not_found" };
  }

  const queue = context
    ? await getOrCreateQueueItem(d1, "correction", id, {
        sensitivity: context.sensitivity,
        assigneeId: context.assigneeId,
        requiresSecondReview: context.requiresSecondReview,
      })
    : synthesizedQueueItem("correction", id, new Date().toISOString());

  if (context && queue.state === "escalated" && action !== "escalate" && !escalationResolverRoles.has(reviewer!.role)) {
    return { kind: "forbidden" };
  }

  if (context?.recused === true) {
    const event = await createModerationEvent(d1, {
      entity: "correction",
      entityId: id,
      previousStatus: current.status,
      newStatus: current.status,
      action,
      reasonCode,
      note,
      reviewer,
      recused: true,
      escalated: false,
      secondReviewerId: null,
    });
    return {
      kind: "recused",
      item: (await loadCorrection(d1, id))!,
      event,
      queue,
    };
  }

  if (action === "escalate") {
    if (!context) return { kind: "forbidden" };
    if (!note) return { kind: "escalation_requires_note" };
    // ONE batch: queue escalate + intent event + queue readback.
    const results = (await d1.batch([
      buildQueueStateStatement(d1, queue.id!, "escalated", { escalationReason: note }),
      buildModerationEventStatement(d1, {
        entity: "correction",
        entityId: id,
        previousStatus: current.status,
        newStatus: current.status,
        action,
        reasonCode,
        note,
        reviewer,
        recused: false,
        escalated: true,
        secondReviewerId: null,
      }),
      buildQueueReadbackStatement(d1, queue.id!),
    ])) as D1BatchResult[];
    const event = results[1].results?.[0] as ModerationEvent;
    const updatedQueue = (results[2].results?.[0] as ModerationQueueItem | undefined) ?? queue;
    return { kind: "ok", item: (await loadCorrection(d1, id))!, event, queue: updatedQueue };
  }

  const transition = getCorrectionTransition(action);
  if (!transition) return { kind: "not_found" };

  const needsSecondReview =
    context !== undefined &&
    secondReviewActions.has(action) &&
    (queue.requiresSecondReview === 1 || queue.sensitivity !== "standard");

  if (needsSecondReview && queue.state !== "second_review") {
    const results = (await d1.batch([
      buildModerationEventStatement(d1, {
        entity: "correction",
        entityId: id,
        previousStatus: current.status,
        newStatus: current.status,
        action,
        reasonCode,
        note,
        reviewer,
        recused: false,
        escalated: false,
        secondReviewerId: null,
      }),
      buildQueueStateStatement(d1, queue.id!, "second_review"),
      buildQueueReadbackStatement(d1, queue.id!),
    ])) as D1BatchResult[];
    const event = results[0].results?.[0] as ModerationEvent;
    const updatedQueue = (results[2].results?.[0] as ModerationQueueItem | undefined) ?? queue;
    return {
      kind: "second_review_pending",
      item: (await loadCorrection(d1, id))!,
      event,
      queue: updatedQueue,
    };
  }

  let secondReviewerId: number | null = null;
  if (needsSecondReview) {
    const first = await d1
      .prepare(
        "SELECT reviewer_id AS reviewerId FROM moderation_events WHERE entity = ? AND entity_id = ? AND action = ? AND reviewer_id IS NOT NULL ORDER BY id DESC LIMIT 1",
      )
      .bind("correction", id, action)
      .first<{ reviewerId: number }>();
    if (first && first.reviewerId === reviewer!.id) {
      return { kind: "second_review_same_reviewer" };
    }
    secondReviewerId = first?.reviewerId ?? null;
  }

  const status = action === "approve" ? "reviewed" : "rejected";
  const sets: string[] = [];
  const binds: (string | number)[] = [];
  if (action !== "associate") {
    sets.push("status = ?");
    binds.push(status);
    // R4 anchor (migration 0018): the 2-year retention floor for a resolved
    // request starts at the resolution date, not created_at — see
    // RETENTION_SCHEDULE.md R4. Set it on the same transition that leaves the
    // pending state, so the audit log (decision event) and the column agree.
    sets.push("resolved_at = ?");
    binds.push(now);
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

  // ONE batch: correction UPDATE, the guarded decision event, optional
  // camera-outcome statements, queue close, queue readback. Everything is
  // atomic, so a crash cannot leave the audit trail half-written. The decision
  // event comes BEFORE the outcome statements so the audit trail preserves the
  // historical insertion order (decision event first, then the outcome events),
  // exactly like the pre-batch code wrote them.
  const statements: D1PreparedStatement[] = [
    d1
      .prepare(
        `UPDATE correction_requests SET ${sets.join(", ")} WHERE id = ? AND status = 'pending' RETURNING id, camera_id AS cameraId, issue_type AS issueType, message, contact, status, outcome, created_at AS createdAt`,
      )
      .bind(...binds),
  ];

  const eventIndex = statements.length;
  statements.push(
    buildGuardedEventStatement(
      d1,
      action === "associate"
        ? {
            entity: "correction",
            entityId: id,
            previousStatus: "pending",
            newStatus: "pending",
            action: "associate",
            reasonCode,
            note,
            reviewer,
            recused: false,
            escalated: false,
            secondReviewerId: null,
          }
        : {
            entity: "correction",
            entityId: id,
            previousStatus: current.status,
            newStatus: status,
            action,
            reasonCode,
            note,
            reviewer,
            recused: false,
            escalated: false,
            secondReviewerId,
          },
      "correction_requests",
      id,
      action === "associate" ? "pending" : status,
    ),
  );

  // The outcome targets the correction's effective camera: the explicitly
  // linked one (options.cameraId) when given, otherwise the request's stored
  // link. buildCorrectionOutcomeStatements re-reads the camera and returns []
  // for no-ops, so the batch shape stays correct either way.
  const effectiveCameraId = cameraId !== undefined ? cameraId : current.cameraId;
  if (action === "approve" && outcome !== undefined && effectiveCameraId !== null) {
    statements.push(...(await buildCorrectionOutcomeStatements(d1, effectiveCameraId, outcome, reasonCode, note, now)));
  }

  let readbackIndex: number | null = null;
  if (context) {
    statements.push(
      buildQueueStateStatement(d1, queue.id!, "closed", {
        secondReviewerId: secondReviewerId ?? (needsSecondReview ? reviewer!.id : null),
      }),
      buildQueueReadbackStatement(d1, queue.id!),
    );
    readbackIndex = statements.length - 1;
  }

  const results = (await d1.batch(statements)) as D1BatchResult[];
  const item = results[0].results?.[0] as PendingCorrectionRequest | undefined;
  if (!item) return { kind: "not_found" };
  const event = results[eventIndex].results?.[0] as ModerationEvent;
  const updatedQueue =
    context && readbackIndex !== null
      ? (results[readbackIndex].results?.[0] as ModerationQueueItem | undefined) ?? queue
      : queue;
  return { kind: "ok", item, event, queue: updatedQueue };
}

export type CameraEditModerationAction = "approve" | "reject";

/**
 * Community edit-request decision (ADR 0018 §4, C3). `approve` applies the
 * per-column diff to `cameras` and records `edit_applied`; `reject` discards
 * the diff and records `edit_rejected`. Both close the entity's
 * `moderation_queue` row (entity `camera_edit`, entity_id = the edit-request
 * id) and mark the request terminal. Idempotent: re-approving an approved
 * request (or re-rejecting a rejected one) answers `ok` with the previously
 * recorded event and never re-applies the diff; a cross transition answers
 * `not_found`. The camera's freshness clocks and status are never touched —
 * only the whitelist columns change.
 */
export async function moderateCameraEdit(
  id: number,
  action: CameraEditModerationAction,
  reasonCode: ModerationReasonCode,
  note: string | null,
  context?: ModerationContext,
): Promise<ModerationResult<CameraEditDecisionItem>> {
  const d1 = await getModerationD1();
  if (action !== "approve" && action !== "reject") return { kind: "forbidden" };

  const reviewer = context ? await getReviewerById(d1, context.actorId) : null;
  if (context && !reviewer) return { kind: "actor_not_found" };
  if (reviewer && reviewer.active !== 1) return { kind: "actor_inactive" };
  if (reviewer && !roleAllowsAction(reviewer.role, action)) return { kind: "forbidden" };

  const current = await d1
    .prepare(
      "SELECT id, camera_id AS cameraId, contributor_id AS contributorId, status, created_at AS createdAt, updated_at AS updatedAt FROM camera_edit_requests WHERE id = ?",
    )
    .bind(id)
    .first<{ id: number; cameraId: number | null; contributorId: number | null; status: string; createdAt: string; updatedAt: string }>();
  if (!current) return { kind: "not_found" };

  const queue = context
    ? await getOrCreateQueueItem(d1, "camera_edit", id, {
        sensitivity: context.sensitivity,
        assigneeId: context.assigneeId,
        requiresSecondReview: context.requiresSecondReview,
      })
    : synthesizedQueueItem("camera_edit", id, current.createdAt);

  if (context && queue.state === "escalated" && !escalationResolverRoles.has(reviewer!.role)) {
    return { kind: "forbidden" };
  }

  // Recusal: record the disclosure, never touch the request or the camera.
  if (context?.recused === true) {
    const event = await createModerationEvent(d1, {
      entity: "camera_edit",
      entityId: id,
      previousStatus: current.status,
      newStatus: current.status,
      action,
      reasonCode,
      note,
      reviewer,
      recused: true,
      escalated: false,
      secondReviewerId: null,
    });
    return { kind: "recused", item: (await loadEditRequestItem(d1, id))!, event, queue };
  }

  // Idempotence: a terminal request re-decided the same way answers ok with
  // the original event — no double apply, no duplicate audit row. A terminal
  // request decided the OTHER way is an invalid transition.
  if (current.status !== "pending") {
    if (current.status === "approved" && action === "approve") {
      const event = await loadLastEditEvent(d1, id, "edit_applied");
      if (event) return { kind: "ok", item: (await loadEditRequestItem(d1, id))!, event, queue };
    }
    if (current.status === "rejected" && action === "reject") {
      const event = await loadLastEditEvent(d1, id, "edit_rejected");
      if (event) return { kind: "ok", item: (await loadEditRequestItem(d1, id))!, event, queue };
    }
    return { kind: "not_found" };
  }

  const needsSecondReview =
    context !== undefined &&
    secondReviewActions.has(action) &&
    (queue.requiresSecondReview === 1 || queue.sensitivity !== "standard");

  if (needsSecondReview && queue.state !== "second_review") {
    // ONE batch: intent event + queue transition + queue readback.
    const results = (await d1.batch([
      buildModerationEventStatement(d1, {
        entity: "camera_edit",
        entityId: id,
        previousStatus: current.status,
        newStatus: current.status,
        action,
        reasonCode,
        note,
        reviewer,
        recused: false,
        escalated: false,
        secondReviewerId: null,
      }),
      buildQueueStateStatement(d1, queue.id!, "second_review"),
      buildQueueReadbackStatement(d1, queue.id!),
    ])) as D1BatchResult[];
    const event = results[0].results?.[0] as ModerationEvent;
    const updatedQueue = (results[2].results?.[0] as ModerationQueueItem | undefined) ?? queue;
    return {
      kind: "second_review_pending",
      item: (await loadEditRequestItem(d1, id))!,
      event,
      queue: updatedQueue,
    };
  }

  let secondReviewerId: number | null = null;
  if (needsSecondReview) {
    const first = await d1
      .prepare(
        "SELECT reviewer_id AS reviewerId FROM moderation_events WHERE entity = ? AND entity_id = ? AND action = ? AND reviewer_id IS NOT NULL ORDER BY id DESC LIMIT 1",
      )
      .bind("camera_edit", id, action)
      .first<{ reviewerId: number }>();
    if (first && first.reviewerId === reviewer!.id) {
      return { kind: "second_review_same_reviewer" };
    }
    secondReviewerId = first?.reviewerId ?? null;
  }

  const nowIso = new Date().toISOString();
  const newStatus = action === "approve" ? "approved" : "rejected";
  const eventAction = action === "approve" ? "edit_applied" : "edit_rejected";

  // ONE batch: [approve only] camera COALESCE diff, the request UPDATE, the
  // guarded decision event (guarded on the request's new terminal status, so
  // it only lands when the UPDATE actually decided the request), then queue
  // close + readback. Everything commits atomically.
  const statements: D1PreparedStatement[] = [];

  if (action === "approve") {
    // The target must still be published-editable at decision time: a camera
    // removed (or re-edited past the queue) while the request sat in the
    // queue must not receive a stale diff. Verify before applying.
    if (current.cameraId === null) return { kind: "not_found" };
    const camera = await d1
      .prepare("SELECT status FROM cameras WHERE id = ?")
      .bind(current.cameraId)
      .first<{ status: string }>();
    if (!camera || !PUBLISHED_EDITABLE_CAMERA_STATUSES.has(camera.status)) {
      return { kind: "not_found" };
    }
    // COALESCE(proposed, current): a NULL proposed column means "unchanged"
    // and keeps the stored value. Only the whitelist columns are touched —
    // status, contributor_id, source, publish_*, freshness clocks stay put.
    statements.push(
      d1
        .prepare(
          `UPDATE cameras SET
             title = COALESCE((SELECT proposed_title FROM camera_edit_requests WHERE id = ?), title),
             kind = COALESCE((SELECT proposed_kind FROM camera_edit_requests WHERE id = ?), kind),
             address = COALESCE((SELECT proposed_address FROM camera_edit_requests WHERE id = ?), address),
             notes = COALESCE((SELECT proposed_notes FROM camera_edit_requests WHERE id = ?), notes),
             manufacturer = COALESCE((SELECT proposed_manufacturer FROM camera_edit_requests WHERE id = ?), manufacturer),
             observed_on = COALESCE((SELECT proposed_observed_on FROM camera_edit_requests WHERE id = ?), observed_on),
             description = COALESCE((SELECT proposed_description FROM camera_edit_requests WHERE id = ?), description),
             updated = ?
           WHERE id = ?`,
        )
        .bind(id, id, id, id, id, id, id, nowIso, current.cameraId),
    );
  }

  statements.push(
    d1
      .prepare(
        "UPDATE camera_edit_requests SET status = ?, decided_by = ?, decision_note = ?, decided_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
      )
      .bind(newStatus, reviewer?.id ?? null, note, nowIso, nowIso, id),
  );

  const eventIndex = statements.length;
  statements.push(
    buildGuardedEventStatement(
      d1,
      {
        entity: "camera_edit",
        entityId: id,
        previousStatus: "pending",
        newStatus,
        action: eventAction,
        reasonCode,
        note,
        reviewer,
        recused: false,
        escalated: false,
        secondReviewerId,
      },
      "camera_edit_requests",
      id,
      newStatus,
    ),
  );

  let updatedQueue = queue;
  if (context) {
    statements.push(
      buildQueueStateStatement(d1, queue.id!, "closed", {
        secondReviewerId: secondReviewerId ?? (needsSecondReview ? reviewer!.id : null),
      }),
      buildQueueReadbackStatement(d1, queue.id!),
    );
  }

  const results = (await d1.batch(statements)) as D1BatchResult[];
  const event = results[eventIndex].results?.[0] as ModerationEvent;
  if (context) {
    updatedQueue = (results[results.length - 1].results?.[0] as ModerationQueueItem | undefined) ?? queue;
  }

  return { kind: "ok", item: (await loadEditRequestItem(d1, id))!, event, queue: updatedQueue };
}

/** Camera statuses a pending edit-request diff may be applied to. */
const PUBLISHED_EDITABLE_CAMERA_STATUSES = new Set(["verified", "needs_review", "stale"]);

async function loadEditRequestItem(
  d1: ModerationD1,
  id: number,
): Promise<CameraEditDecisionItem | null> {
  return d1
    .prepare(
      "SELECT id, camera_id AS cameraId, contributor_id AS contributorId, status, decided_by AS decidedBy, decision_note AS decisionNote, decided_at AS decidedAt, created_at AS createdAt FROM camera_edit_requests WHERE id = ?",
    )
    .bind(id)
    .first<CameraEditDecisionItem>();
}

async function loadLastEditEvent(
  d1: ModerationD1,
  id: number,
  action: string,
): Promise<ModerationEvent | null> {
  return d1
    .prepare(
      `SELECT id, entity, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, reason_code AS reasonCode, note, actor, reviewer_id AS reviewerId, actor_role AS actorRole, recused, escalated, second_reviewer_id AS secondReviewerId, appeal_id AS appealId, created_at AS createdAt FROM moderation_events WHERE entity = 'camera_edit' AND entity_id = ? AND action = ? ORDER BY id DESC LIMIT 1`,
    )
    .bind(id, action)
    .first<ModerationEvent>();
}

export type CameraEditDecisionItem = {
  id: number;
  cameraId: number | null;
  contributorId: number | null;
  status: string;
  decidedBy: number | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
};

/**
 * Statement builder for the camera side of an approve-with-outcome decision
 * (P1-2 atomic write path). Same logic as the pre-batch `applyCorrectionOutcome`:
 * re-reads the camera record first and returns [] for no-ops; otherwise returns
 * the UPDATE + guarded event pair for the given outcome (marked-stale only when
 * the record is verified, with its status guard; removed/corrected always). The
 * caller splices the returned statements into the decision batch, so the camera
 * mutation and its audit event commit atomically with the correction decision.
 */
async function buildCorrectionOutcomeStatements(
  d1: ModerationD1,
  cameraId: number,
  outcome: CorrectionOutcome,
  reasonCode: ModerationReasonCode,
  note: string | null,
  nowIso: string,
): Promise<D1PreparedStatement[]> {
  const record = await d1
    .prepare("SELECT status FROM cameras WHERE id = ?")
    .bind(cameraId)
    .first<{ status: string }>();
  if (!record) return [];

  // Same P1-2 contract as the camera transitions: `updated` always carries a
  // comparable ISO timestamp (the descriptive outcome text stays in the
  // moderation event note), so directory ordering and freshness stay intact.
  if (outcome === "marked-stale") {
    // A credible correction sends a verified record back to needs_review while
    // it is reassessed (DATA_TRUST SLA).
    if (record.status !== "verified") return [];
    return [
      d1
        .prepare("UPDATE cameras SET status = 'needs_review', updated = ? WHERE id = ? AND status = 'verified'")
        .bind(nowIso, cameraId),
      buildGuardedEventStatement(
        d1,
        {
          entity: "camera",
          entityId: cameraId,
          previousStatus: "verified",
          newStatus: "needs_review",
          action: "marked-stale",
          reasonCode,
          note,
        },
        "cameras",
        cameraId,
        "needs_review",
      ),
    ];
  }

  if (outcome === "removed") {
    return [
      d1.prepare("UPDATE cameras SET status = 'removed', updated = ? WHERE id = ?").bind(nowIso, cameraId),
      buildGuardedEventStatement(
        d1,
        {
          entity: "camera",
          entityId: cameraId,
          previousStatus: record.status,
          newStatus: "removed",
          action: "removed",
          reasonCode,
          note,
        },
        "cameras",
        cameraId,
        "removed",
      ),
    ];
  }

  if (outcome === "corrected") {
    return [
      d1.prepare("UPDATE cameras SET updated = ? WHERE id = ?").bind(nowIso, cameraId),
      buildGuardedEventStatement(
        d1,
        {
          entity: "camera",
          entityId: cameraId,
          previousStatus: record.status,
          newStatus: record.status,
          action: "corrected",
          reasonCode,
          note,
        },
        "cameras",
        cameraId,
        record.status,
      ),
    ];
  }

  // kept / escalated: no record mutation, nothing to batch.
  return [];
}

/**
 * One correction request in a record's private request history (H1,
 * t_69891619). Unlike the queue row (`PendingCorrectionRequest`) it carries
 * the resolution timestamp and the append-only decision trail for that
 * request, so a moderator can see the full life of every request on a
 * record without leaving the local dashboard.
 */
export type CorrectionHistoryRequest = {
  id: number;
  cameraId: number | null;
  issueType: string;
  message: string;
  contact: string | null;
  status: string;
  outcome: string | null;
  createdAt: string;
  resolvedAt: string | null;
  events: ModerationEvent[];
};

export type CorrectionHistory = {
  camera: { id: number; title: string; status: string } | null;
  requests: CorrectionHistoryRequest[];
};

/**
 * Private per-record correction history for the local moderation dashboard
 * (docs/FUTURE_ROADMAP.md Horizon 1 — "a local way to associate a
 * correction request with a record outcome").
 *
 * Returns every request linked to the record — pending and resolved — with
 * the request's own decision events (approve/reject/associate/escalate from
 * the append-only trail), oldest event first. The events are fetched in one
 * batched query (no N+1) and grouped in memory.
 *
 * Privacy boundary: this is a moderator-only read. It never leaves the
 * moderation API (the worker edge gate covers `/api/moderation/*`), so
 * contact details, internal notes and reviewer attribution stay local. The
 * public record page continues to expose only the filtered
 * `listPublicCameraRevisions` projection.
 *
 * A removed record still exists as a `cameras` row (`status = 'removed'`),
 * so its history stays visible to moderators; a record deleted from the
 * table (corrections then carry `camera_id = NULL` via the FK's SET NULL)
 * answers `camera: null`.
 */
export async function listCorrectionHistoryForCamera(
  cameraId: number,
): Promise<CorrectionHistory> {
  const d1 = await getModerationD1();
  const camera = await d1
    .prepare("SELECT id, title, status FROM cameras WHERE id = ?")
    .bind(cameraId)
    .first<{ id: number; title: string; status: string }>();
  if (!camera) return { camera: null, requests: [] };

  // Newest first; capped so the events IN (...) clause stays well under the
  // SQLite variable limit even before chunking.
  const requests = await d1
    .prepare(
      "SELECT id, camera_id AS cameraId, issue_type AS issueType, message, contact, status, outcome, created_at AS createdAt, resolved_at AS resolvedAt FROM correction_requests WHERE camera_id = ? ORDER BY created_at DESC, id DESC LIMIT 200",
    )
    .bind(cameraId)
    .all<Omit<CorrectionHistoryRequest, "events">>();

  const ids = requests.results.map((request) => request.id);
  const eventsByRequest = new Map<number, ModerationEvent[]>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    const placeholders = chunk.map(() => "?").join(", ");
    const events = await d1
      .prepare(
        `SELECT id, entity, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, reason_code AS reasonCode, note, actor, reviewer_id AS reviewerId, actor_role AS actorRole, recused, escalated, second_reviewer_id AS secondReviewerId, appeal_id AS appealId, created_at AS createdAt FROM moderation_events WHERE entity = 'correction' AND entity_id IN (${placeholders}) ORDER BY created_at ASC, id ASC`,
      )
      .bind(...chunk)
      .all<ModerationEvent>();
    for (const event of events.results) {
      const list = eventsByRequest.get(event.entityId);
      if (list) list.push(event);
      else eventsByRequest.set(event.entityId, [event]);
    }
  }

  return {
    camera,
    requests: requests.results.map((request) => ({
      ...request,
      events: eventsByRequest.get(request.id) ?? [],
    })),
  };
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
 * Actions that change the public record lifecycle. Internal workflow events —
 * recusals, escalations, second-review intents, appeal filings/decisions —
 * never appear in the public revision history even though they are stored in
 * the same append-only table.
 */
const PUBLIC_LIFECYCLE_ACTIONS = new Set([
  "approve",
  "reject",
  "hide",
  "mark-stale",
  "reverify",
  "scheduled-expiry",
  "expiry-not-reconfirmed",
  "marked-stale",
  "removed",
  "corrected",
]);

/**
 * Reviewed public change summary for a camera record: the lifecycle
 * transitions a moderator applied (approved, marked stale, re-verified,
 * removed), oldest first. This is the public revision history described in
 * docs/FUTURE_ROADMAP.md (Horizon 1). It deliberately projects only
 * non-identifying fields: the private audit columns (actor, note,
 * reason_code) never leave this boundary, so contributor and moderator
 * identities and internal notes are never published. Internal workflow
 * actions (recusals, escalations, appeals) are filtered out even though they
 * live in the same audit table.
 */
export async function listPublicCameraRevisions(cameraId: number): Promise<PublicCameraRevision[]> {
  const d1 = await getModerationD1();
  const result = await d1
    .prepare(
      "SELECT id, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, created_at AS createdAt FROM moderation_events WHERE entity = 'camera' AND entity_id = ? ORDER BY created_at ASC, id ASC",
    )
    .bind(cameraId)
    .all<PublicCameraRevision>();
  return result.results.filter((event) => PUBLIC_LIFECYCLE_ACTIONS.has(event.action));
}
