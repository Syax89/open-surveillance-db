import { getD1 } from "./cameras";
import { recordModerationEvent } from "./moderation";

/**
 * Community contribution editing (ADR 0018 §4, C3).
 *
 * The two-track PATCH /api/cameras/[id] logic lives HERE, not in the route:
 *
 *   - `pending` (never public)  -> direct UPDATE with a server-side ownership
 *     check. Anonymous records and non-owners answer `not_found` (404
 *     fail-closed, no-existence-oracle pattern — a pending record is
 *     indistinguishable from a missing id for anyone but its owner).
 *   - `verified` / `needs_review` / `stale` (published history) -> the UPDATE
 *     never mutates `cameras`: it inserts a `camera_edit_requests` row (the
 *     explicit per-column diff against the whitelist) plus a
 *     `moderation_queue` row (entity `camera_edit`). A moderator applies or
 *     discards the diff later (db/moderation.ts moderateCameraEdit); the
 *     public record keeps the moderator's signature until then.
 *   - `removed` / `rejected` (terminal) -> `status_blocked` (409).
 *
 * Only the whitelist columns are ever touched (title, kind, address, notes,
 * manufacturer, observedOn, description — same limits as POST /api/cameras).
 * `status`, `contributor_id`, `source`, `publish_*`, `last_verified_at` /
 * `review_due_at` (freshness clock) are never editable: the parser rejects
 * them per-field with 400 before any write, so there are never partial
 * effects. A no-op edit (same content) answers `no_changes` and writes NO
 * event (anti-farming, ADR 0018 §3.5); a real pending edit records an
 * `edit_applied` audit event. The direct path carries an optional
 * `expectedUpdated` precondition: when the caller sends the `updated` value
 * it last saw and the record changed since, the UPDATE affects zero rows and
 * the result is `race` (409).
 */

export const EDITABLE_EDIT_FIELD_LIMITS = {
  title: 90,
  kind: 60,
  address: 180,
  notes: 1000,
  manufacturer: 80,
  observedOn: 10,
  description: 1000,
} as const;

export type EditableEditField = keyof typeof EDITABLE_EDIT_FIELD_LIMITS;

export const EDITABLE_EDIT_FIELDS = Object.keys(EDITABLE_EDIT_FIELD_LIMITS) as EditableEditField[];

export const NEVER_EDITABLE_EDIT_FIELDS = [
  "status",
  "contributorId",
  "source",
  "publishManufacturer",
  "publishObservedOn",
  "lastVerifiedAt",
  "reviewDueAt",
  "reviewIntervalMonths",
  "latitude",
  "longitude",
  "id",
  "createdAt",
  "updated",
] as const;

/** Normalised, validated edit payload after parseEditableEditFields. */
export type EditableCameraFields = {
  title?: string;
  kind?: string;
  address?: string | null;
  notes?: string;
  manufacturer?: string | null;
  observedOn?: string | null;
  description?: string;
};

export type ParsedEditPayload = {
  fields: EditableCameraFields;
  /** Optional optimistic-concurrency precondition: the `updated` value the caller last saw. */
  expectedUpdated?: string;
};

export type ParseEditResult =
  | { ok: true; payload: ParsedEditPayload }
  | { ok: false; error: string };

/** The owner view of a camera: the full row, notes included. */
export type OwnerCameraRecord = {
  id: number;
  title: string;
  kind: string;
  manufacturer: string | null;
  observedOn: string | null;
  publishManufacturer: number;
  publishObservedOn: number;
  address: string | null;
  notes: string;
  latitude: number;
  longitude: number;
  status: string;
  source: string;
  updated: string;
  description: string;
  lastVerifiedAt: string | null;
  reviewDueAt: string | null;
  reviewIntervalMonths: number;
  contributorId: number | null;
  createdAt: string;
};

export type EditRequestSummary = {
  id: number;
  cameraId: number;
  status: "pending";
  createdAt: string;
};

export type ApplyCameraEditResult =
  | { kind: "camera_not_found" }
  // Pending-path fail-closed: anonymous record or not the owner. The route
  // answers 404 (no-existence-oracle); no status is ever leaked.
  | { kind: "not_found" }
  // Published-path: the caller is not the record owner (includes a moderator
  // who is not the owner — they act only through the moderation endpoints).
  | { kind: "not_owner" }
  // removed / rejected (terminal states): edit blocked, no queue row.
  | { kind: "status_blocked" }
  // Same content as the stored record (or an empty body): 200, no event.
  | { kind: "no_changes" }
  // Direct path: the UPDATE ran and the record now carries the new values.
  | { kind: "direct_applied"; record: OwnerCameraRecord }
  // Optimistic-concurrency precondition failed (expectedUpdated mismatch or
  // the record left `pending` between the read and the write): 409.
  | { kind: "race" }
  // A camera_edit_requests row is already open for this camera
  // (partial unique (camera_id) WHERE status='pending'): 409.
  | { kind: "edit_request_exists" }
  // Published path: the diff row + moderation_queue row were created; the
  // edit now waits for a human moderator. 202.
  | { kind: "edit_request_created"; editRequest: EditRequestSummary };

export const PUBLISHED_EDITABLE_STATUSES = ["verified", "needs_review", "stale"] as const;
export const TERMINAL_EDITABLE_STATUSES = ["removed", "rejected"] as const;

/**
 * Owner view of a camera plus its open edit-request, when one exists (C6).
 *
 * The public GET /api/cameras/[id] is deliberately attribution-free (it
 * never exposes `contributor_id` nor `notes`) and answers 404 for pending
 * records, so the /records/[id]/edit page cannot pre-fill its form from it.
 * This is the owner-only read that complements the C3 PATCH:
 *
 *   - owner, any status  -> `ok` with the full row (notes included) and the
 *     open edit-request (`editRequest`) or null. The page renders the form
 *     for pending/published states and the blocked notice for removed /
 *     rejected; the request state is shown before any submit, so a second
 *     concurrent PATCH (409 edit_request_exists) is prevented client-side.
 *   - pending / removed / rejected and not the owner -> `not_found` (404
 *     fail-closed, no-existence-oracle: these records are not public).
 *   - published and not the owner -> `not_owner` (403, the record exists
 *     publicly but editing is owner-only, same rule as the PATCH).
 */
export type CameraEditViewResult =
  | { kind: "ok"; record: OwnerCameraRecord; editRequest: EditRequestSummary | null }
  | { kind: "not_found" }
  | { kind: "not_owner" };

export async function getCameraEditView(
  cameraId: number,
  contributorId: number,
): Promise<CameraEditViewResult> {
  const d1 = await getD1();
  const camera = await loadCameraForEdit(d1, cameraId);
  if (!camera) return { kind: "not_found" };

  const isOwner = camera.contributorId === contributorId;
  if (!isOwner) {
    // Published records are public (403, ownership rule); anything else is
    // indistinguishable from a missing id (404 fail-closed).
    if ((PUBLISHED_EDITABLE_STATUSES as readonly string[]).includes(camera.status)) {
      return { kind: "not_owner" };
    }
    return { kind: "not_found" };
  }

  const openRequest = await d1
    .prepare(
      "SELECT id, camera_id AS cameraId, status, created_at AS createdAt FROM camera_edit_requests WHERE camera_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
    )
    .bind(cameraId)
    .first<EditRequestSummary>();
  return {
    kind: "ok",
    record: {
      id: camera.id,
      title: camera.title,
      kind: camera.kind,
      manufacturer: camera.manufacturer,
      observedOn: camera.observedOn,
      publishManufacturer: camera.publishManufacturer,
      publishObservedOn: camera.publishObservedOn,
      address: camera.address,
      notes: camera.notes,
      latitude: camera.latitude,
      longitude: camera.longitude,
      status: camera.status,
      source: camera.source,
      updated: camera.updated,
      description: camera.description,
      lastVerifiedAt: camera.lastVerifiedAt,
      reviewDueAt: camera.reviewDueAt,
      reviewIntervalMonths: camera.reviewIntervalMonths,
      contributorId: camera.contributorId,
      createdAt: camera.createdAt,
    },
    editRequest: openRequest ?? null,
  };
}

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Validate one PATCH body against the editable whitelist. Every key must be
 * an editable field (title, kind, address, notes, manufacturer, observedOn,
 * description) or the optional `expectedUpdated` precondition; any other key
 * (status, contributor_id, source, publish_*, freshness clock, coordinates)
 * is rejected per-field with the field named — before any database write, so
 * a rejected payload never has partial effects. Length caps mirror POST
 * /api/cameras; `observedOn` must be a real calendar date. Empty string
 * clears a nullable field (address / manufacturer / observedOn) — for
 * title/kind an empty value is a validation error, matching POST.
 */
export function parseEditableEditFields(value: unknown): ParseEditResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "A JSON object with at least one editable field is required." };
  }
  const body = value as Record<string, unknown>;
  const fields: EditableCameraFields = {};
  let expectedUpdated: string | undefined;

  for (const key of Object.keys(body)) {
    if (key === "expectedUpdated") {
      if (typeof body[key] !== "string" || (body[key] as string).length === 0) {
        return { ok: false, error: 'The "expectedUpdated" precondition must be a non-empty string.' };
      }
      expectedUpdated = body[key] as string;
      continue;
    }
    if (!EDITABLE_EDIT_FIELDS.includes(key as EditableEditField)) {
      return { ok: false, error: `Field "${key}" is not editable.` };
    }
    const field = key as EditableEditField;
    const maxLength = EDITABLE_EDIT_FIELD_LIMITS[field];
    const raw = body[field];
    // null / undefined: the client did not supply a value for this column.
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string") {
      return { ok: false, error: `Field "${field}" must be a string.` };
    }
    const text = raw.trim();
    if (text.length > maxLength) {
      return { ok: false, error: `Field "${field}" must be at most ${maxLength} characters.` };
    }
    if (field === "observedOn") {
      if (text !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return { ok: false, error: `Field "observedOn" must be a YYYY-MM-DD date.` };
      }
      if (text !== "" && !isCalendarDate(text)) {
        return { ok: false, error: `Field "observedOn" is not a valid calendar date.` };
      }
      fields[field] = text === "" ? null : text;
      continue;
    }
    if (field === "title" || field === "kind") {
      if (text === "") {
        return { ok: false, error: `Field "${field}" cannot be empty.` };
      }
      fields[field] = text;
      continue;
    }
    // Nullable free-text columns: empty string clears the value (null).
    if (field === "address" || field === "manufacturer") {
      fields[field] = text === "" ? null : text;
      continue;
    }
    fields[field] = text;
  }

  if (Object.keys(fields).length === 0 && expectedUpdated === undefined) {
    return { ok: false, error: "Provide at least one editable field." };
  }
  return { ok: true, payload: { fields, ...(expectedUpdated !== undefined ? { expectedUpdated } : {}) } };
}

type CameraEditRow = {
  id: number;
  title: string;
  kind: string;
  manufacturer: string | null;
  observedOn: string | null;
  publishManufacturer: number;
  publishObservedOn: number;
  address: string | null;
  notes: string;
  latitude: number;
  longitude: number;
  status: string;
  source: string;
  updated: string;
  description: string;
  lastVerifiedAt: string | null;
  reviewDueAt: string | null;
  reviewIntervalMonths: number;
  contributorId: number | null;
  createdAt: string;
};

const ownerColumns =
  "id, title, kind, manufacturer, observed_on AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, notes, latitude, longitude, status, source, updated, description, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, contributor_id AS contributorId, created_at AS createdAt";

async function loadCameraForEdit(d1: Awaited<ReturnType<typeof getD1>>, cameraId: number): Promise<CameraEditRow | null> {
  return d1
    .prepare(`SELECT ${ownerColumns} FROM cameras WHERE id = ?`)
    .bind(cameraId)
    .first<CameraEditRow>();
}

/** Normalise a stored column for diffing: NULL and "" compare equal (clearing a field is a no-op when it is already unset). */
function storedText(value: string | null): string {
  return value ?? "";
}

/** Diff the supplied fields against the stored row; only changed columns are returned. */
function diffFields(row: CameraEditRow, fields: EditableCameraFields): EditableCameraFields {
  const diff: EditableCameraFields = {};
  if (fields.title !== undefined && fields.title !== row.title) diff.title = fields.title;
  if (fields.kind !== undefined && fields.kind !== row.kind) diff.kind = fields.kind;
  if (fields.address !== undefined && fields.address !== storedText(row.address)) diff.address = fields.address;
  if (fields.notes !== undefined && fields.notes !== row.notes) diff.notes = fields.notes;
  if (fields.manufacturer !== undefined && fields.manufacturer !== storedText(row.manufacturer)) {
    diff.manufacturer = fields.manufacturer;
  }
  if (fields.observedOn !== undefined && fields.observedOn !== storedText(row.observedOn)) {
    diff.observedOn = fields.observedOn;
  }
  if (fields.description !== undefined && fields.description !== row.description) diff.description = fields.description;
  return diff;
}

/**
 * The two-track edit entry point. Reads the record, applies the pending-path
 * rules or the published-path edit-request rules, and returns a
 * discriminated result the route maps to HTTP. All anti-farming and
 * ownership logic lives here so no route can bypass it; `now` is an
 * injectable deterministic clock for tests.
 */
export async function applyCameraEdit(input: {
  cameraId: number;
  contributorId: number;
  fields: EditableCameraFields;
  expectedUpdated?: string;
  now: string;
}): Promise<ApplyCameraEditResult> {
  const d1 = await getD1();
  const camera = await loadCameraForEdit(d1, input.cameraId);
  if (!camera) return { kind: "camera_not_found" };

  if (camera.status === "pending") {
    // Pending records are never public: the owner is the ONLY caller who may
    // learn of their existence. Anonymous records have no owner and answer
    // the same 404 — no-existence-oracle, indistinguishable from a missing id.
    if (camera.contributorId !== input.contributorId) return { kind: "not_found" };

    const diff = diffFields(camera, input.fields);
    if (Object.keys(diff).length === 0) return { kind: "no_changes" };

    // Optimistic-concurrency precondition: when the client echoes the
    // `updated` value it last saw, a mismatch means the record changed since
    // the read (or left `pending` between read and write) -> 409, never a
    // silent overwrite.
    const sets: string[] = [];
    const binds: (string | number | null)[] = [];
    for (const field of Object.keys(diff) as EditableEditField[]) {
      sets.push(`${sqlColumn(field)} = ?`);
      binds.push(storageValue(field, diff[field]));
    }
    sets.push("updated = ?");
    binds.push("Community edit");

    const precondition = input.expectedUpdated !== undefined ? " AND updated = ?" : "";
    // Bind order follows the SQL: the WHERE columns (id, status,
    // contributor_id) come before the appended precondition column.
    binds.push(input.cameraId, "pending", input.contributorId);
    if (input.expectedUpdated !== undefined) binds.push(input.expectedUpdated);

    const updated = await d1
      .prepare(`UPDATE cameras SET ${sets.join(", ")} WHERE id = ? AND status = ? AND contributor_id = ?${precondition} RETURNING ${ownerColumns}`)
      .bind(...binds)
      .first<OwnerCameraRecord>();
    if (!updated) {
      // Distinguish a lost race from a vanished record without leaking
      // statuses: both answer 409 for the owner (the record still exists —
      // only its state/updated moved), 404 otherwise.
      const recheck = await d1
        .prepare("SELECT id FROM cameras WHERE id = ? AND contributor_id = ?")
        .bind(input.cameraId, input.contributorId)
        .first<{ id: number }>();
      return recheck ? { kind: "race" } : { kind: "not_found" };
    }

    // Real edit -> audit event. The no-op path above returned before this
    // point, so useless PATCHes can never farm an audit trail (anti-farming,
    // ADR 0018 §3.5). The event is private (the public revision history only
    // projects lifecycle actions for published records); actor carries no PII.
    await recordModerationEvent(d1, {
      entity: "camera",
      entityId: input.cameraId,
      previousStatus: "pending",
      newStatus: "pending",
      action: "edit_applied",
      reasonCode: "other",
      note: null,
      actor: "Contributor",
    });

    return { kind: "direct_applied", record: updated };
  }

  if ((PUBLISHED_EDITABLE_STATUSES as readonly string[]).includes(camera.status)) {
    // The record is public: existence is not a secret, but editing is
    // owner-only. A moderator who is not the owner gets the same 403 here —
    // they act only through the moderation endpoints (ADR 0018 §1.3).
    if (camera.contributorId !== input.contributorId) return { kind: "not_owner" };

    const diff = diffFields(camera, input.fields);
    if (Object.keys(diff).length === 0) return { kind: "no_changes" };

    // One open edit-request per camera, enforced by the partial unique index
    // (camera_id) WHERE status='pending' — the SQL-level guard means two
    // concurrent PATCHes yield exactly one row; the loser answers 409.
    const now = input.now;
    let requestId: number;
    try {
      const inserted = await d1
        .prepare(
          `INSERT INTO camera_edit_requests (camera_id, contributor_id, proposed_title, proposed_kind, proposed_address, proposed_notes, proposed_manufacturer, proposed_observed_on, proposed_description, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
           RETURNING id`,
        )
        .bind(
          input.cameraId,
          input.contributorId,
          diff.title ?? null,
          diff.kind ?? null,
          diff.address ?? null,
          diff.notes ?? null,
          diff.manufacturer ?? null,
          diff.observedOn ?? null,
          diff.description ?? null,
          now,
          now,
        )
        .first<{ id: number }>();
      if (!inserted) throw new Error("Camera edit request could not be inserted");
      requestId = inserted.id;
    } catch {
      return { kind: "edit_request_exists" };
    }

    // The moderation_queue row (entity `camera_edit`) makes the request
    // visible to the human gate immediately (ADR 0018 §4). entity_id is the
    // edit-request id — exactly like corrections point at their own row.
    await d1
      .prepare(
        `INSERT INTO moderation_queue (entity, entity_id, state, assignee_id, sensitivity, requires_second_review, second_reviewer_id, escalation_reason, created_at, updated_at)
         VALUES ('camera_edit', ?, 'queued', NULL, 'standard', 0, NULL, NULL, ?, ?)`,
      )
      .bind(requestId, now, now)
      .run();

    return {
      kind: "edit_request_created",
      editRequest: { id: requestId, cameraId: input.cameraId, status: "pending", createdAt: now },
    };
  }

  if ((TERMINAL_EDITABLE_STATUSES as readonly string[]).includes(camera.status)) {
    return { kind: "status_blocked" };
  }

  // Any other state (e.g. `demo` seed records) is not community-editable.
  return { kind: "status_blocked" };
}

function sqlColumn(field: EditableEditField): string {
  switch (field) {
    case "title": return "title";
    case "kind": return "kind";
    case "address": return "address";
    case "notes": return "notes";
    case "manufacturer": return "manufacturer";
    case "observedOn": return "observed_on";
    case "description": return "description";
  }
}

function storageValue(field: EditableEditField, value: string | null | undefined): string | null {
  if (value === undefined) return null;
  if ((field === "address" || field === "manufacturer" || field === "observedOn") && value === "") return null;
  return value;
}
