import { env } from "cloudflare:workers";
import { getD1 } from "./cameras";
import { PUBLIC_CAMERA_STATUSES } from "../app/lib/public-status";
import type { ModerationEvent } from "./moderation";

/**
 * Photo evidence (STATUS gap #3): D1 stores metadata ONLY; image bytes live
 * in the R2 bucket bound as `PHOTOS` under an opaque key.
 *
 * Visibility rule (docs/PRIVACY_AND_SAFETY.md): a photo is served to the
 * public ONLY when BOTH hold:
 *   - the photo is `approved` by a moderator with `redaction_confirmed = 1`
 *     (the moderator confirms the subject has been redacted); and
 *   - the linked camera is itself public (`cameras.status` in
 *     PUBLIC_CAMERA_STATUSES and inside its review window).
 * Everything else fails closed with 404. `storage_key` never leaves this
 * module: clients interact with photos by id only.
 */

export type PhotoRecord = {
  id: number;
  cameraId: number | null;
  contributorId: number | null;
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  status: string;
  exifStripped: number;
  redactionConfirmed: number;
  createdAt: string;
  updatedAt: string;
};

/** Public-safe projection: everything except the opaque storage key. */
export type PendingPhotoReport = Omit<PhotoRecord, "storageKey">;

export type PhotoModerationAction = "approve" | "reject";

export type PhotoModerationResult =
  | { kind: "ok"; item: PendingPhotoReport; event: ModerationEvent }
  | { kind: "not_found" }
  | { kind: "redaction_required" };

const photoColumns =
  "id, camera_id AS cameraId, contributor_id AS contributorId, storage_key AS storageKey, mime_type AS mimeType, width, height, size_bytes AS sizeBytes, status, exif_stripped AS exifStripped, redaction_confirmed AS redactionConfirmed, created_at AS createdAt, updated_at AS updatedAt";

function withoutStorageKey(photo: PhotoRecord): PendingPhotoReport {
  const { storageKey, ...publicPhoto } = photo;
  void storageKey;
  return publicPhoto;
}

function mimeToExtension(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

/** Fetch an R2 object's bytes by storage key. Returns null when missing. */
async function readObjectBytes(storageKey: string): Promise<Uint8Array | null> {
  if (!env.PHOTOS) throw new Error("Photo storage binding unavailable");
  const object = await env.PHOTOS.get(storageKey);
  if (!object) return null;
  return new Uint8Array(await object.arrayBuffer());
}

/**
 * Store an EXIF-stripped image and record its metadata in D1.
 * `bytes` MUST already be stripped (the route enforces this with
 * stripImageMetadata) — this function is the storage boundary, not the
 * sanitisation boundary.
 */
export async function createPendingPhoto(input: {
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
  contributorId?: number | null;
}): Promise<PendingPhotoReport> {
  if (!env.PHOTOS) throw new Error("Photo storage binding unavailable");
  const d1 = await getD1();
  const extension = mimeToExtension(input.mimeType);
  const storageKey = `photos/${crypto.randomUUID()}.${extension}`;
  await env.PHOTOS.put(storageKey, input.bytes, {
    httpMetadata: { contentType: input.mimeType },
  });
  const now = new Date().toISOString();
  const result = await d1
    .prepare(
      `INSERT INTO photos (camera_id, contributor_id, storage_key, mime_type, width, height, size_bytes, status, exif_stripped, redaction_confirmed, created_at, updated_at)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, 'pending', 1, 0, ?, ?)
       RETURNING ${photoColumns}`,
    )
    .bind(
      input.contributorId ?? null,
      storageKey,
      input.mimeType,
      input.width,
      input.height,
      input.bytes.length,
      now,
      now,
    )
    .first<PhotoRecord>();
  if (!result) throw new Error("Photo could not be stored");
  return withoutStorageKey(result);
}

/** Moderation queue view: pending photos (metadata only, no storage key). */
export async function listPendingPhotos(): Promise<PendingPhotoReport[]> {
  const d1 = await getD1();
  const result = await d1
    .prepare(
      `SELECT ${photoColumns} FROM photos WHERE status = 'pending' ORDER BY created_at ASC, id ASC`,
    )
    .all<PhotoRecord>();
  return result.results.map(withoutStorageKey);
}

/** Full metadata lookup by id (moderation preview path). */
export async function getPhotoById(id: number): Promise<PhotoRecord | null> {
  const d1 = await getD1();
  return d1
    .prepare(`SELECT ${photoColumns} FROM photos WHERE id = ?`)
    .bind(id)
    .first<PhotoRecord>();
}

/**
 * Public read boundary for a single photo. Returns the photo (with storage
 * key, for serving) ONLY when it is approved, redaction is confirmed, and
 * the linked camera is publicly current. Anything else returns null, and
 * the route answers 404 — fail closed, no existence leak.
 */
export async function getPublicPhoto(
  id: number,
  nowIso: string = new Date().toISOString(),
): Promise<PhotoRecord | null> {
  const d1 = await getD1();
  const placeholders = PUBLIC_CAMERA_STATUSES.map(() => "?").join(", ");
  // Same public predicate as db/cameras.ts but qualified to the cameras
  // table: `status IN (…)` refers to the camera's status, and the freshness
  // carve-out keeps `demo` records public without a schedule.
  const result = await d1
    .prepare(
      `SELECT p.id, p.camera_id AS cameraId, p.storage_key AS storageKey, p.mime_type AS mimeType, p.width, p.height, p.size_bytes AS sizeBytes, p.status, p.exif_stripped AS exifStripped, p.redaction_confirmed AS redactionConfirmed, p.created_at AS createdAt, p.updated_at AS updatedAt
       FROM photos p JOIN cameras c ON c.id = p.camera_id
       WHERE p.id = ? AND p.status = 'approved' AND p.redaction_confirmed = 1
         AND c.status IN (${placeholders})
         AND (c.status = 'demo' OR c.review_due_at IS NULL OR c.review_due_at >= ?)`,
    )
    .bind(id, ...PUBLIC_CAMERA_STATUSES, nowIso)
    .first<PhotoRecord>();
  return result ?? null;
}

/** Approved photos of a public camera (record detail gallery). */
export async function listApprovedPhotosForCamera(cameraId: number): Promise<
  Array<{ id: number; mimeType: string; width: number; height: number }>
> {
  const d1 = await getD1();
  const result = await d1
    .prepare(
      `SELECT id, mime_type AS mimeType, width, height FROM photos
       WHERE camera_id = ? AND status = 'approved' AND redaction_confirmed = 1
       ORDER BY id ASC`,
    )
    .bind(cameraId)
    .all<{ id: number; mimeType: string; width: number; height: number }>();
  return result.results;
}

/**
 * Link uploaded photos to a camera report at submission time.
 *
 * Ownership guard (Ada review, PR #64): photos carry the contributor id
 * recorded at upload; a photo attributed to a contributor may only be
 * linked by that same contributor. Anonymous photos (`contributor_id IS
 * NULL`) stay linkable by anyone — they carry no attribution, and the
 * photo remains private and moderated regardless. An anonymous submitter
 * (contributorId null) can only link anonymous photos.
 *
 * Rejection is silent and best-effort by design: the WHERE clause makes a
 * cross-owner (or non-pending/already-linked) photo simply not match, so
 * it is left orphaned and the caller sees a lower count — never a 403/404.
 * A hard error here would fail the whole report submission over a single
 * foreign photo id (hostile UX) and would turn the endpoint into a photo
 * id existence oracle (403 vs 404 distinguishes "exists but not yours").
 * The photo can never become public without moderation regardless.
 */
export async function linkPhotosToCamera(
  cameraId: number,
  photoIds: number[],
  contributorId?: number | null,
): Promise<number> {
  if (photoIds.length === 0) return 0;
  const d1 = await getD1();
  const now = new Date().toISOString();
  const placeholders = photoIds.map(() => "?").join(", ");
  const result = await d1
    .prepare(
      `UPDATE photos SET camera_id = ?, updated_at = ?
       WHERE id IN (${placeholders}) AND status = 'pending' AND camera_id IS NULL
         AND (contributor_id IS NULL OR contributor_id = ?)`,
    )
    .bind(cameraId, now, ...photoIds, contributorId ?? null)
    .run() as { meta: { changes: number } };
  return result.meta.changes;
}

/**
 * Moderator decision on a photo. `approve` REQUIRES redactionConfirmed: a
 * photo may never become public unless the moderator confirms the subject
 * was redacted. Writes an append-only moderation event (entity 'photo').
 */
export async function moderatePhoto(
  id: number,
  action: PhotoModerationAction,
  redactionConfirmed: boolean,
  reasonCode: string,
  note: string | null,
  actorId?: number,
): Promise<PhotoModerationResult> {
  const d1 = await getD1();
  const current = await getPhotoById(id);
  if (!current) return { kind: "not_found" };
  if (current.status !== "pending") return { kind: "not_found" };
  if (action === "approve" && redactionConfirmed !== true) {
    return { kind: "redaction_required" };
  }

  const newStatus = action === "approve" ? "approved" : "rejected";
  const redactionFlag = action === "approve" ? 1 : current.redactionConfirmed;
  const now = new Date().toISOString();
  const updated = await d1
    .prepare(
      `UPDATE photos SET status = ?, redaction_confirmed = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'
       RETURNING ${photoColumns}`,
    )
    .bind(newStatus, redactionFlag, now, id)
    .first<PhotoRecord>();
  if (!updated) return { kind: "not_found" };

  const actor = actorId
    ? await d1
        .prepare("SELECT display_name AS displayName FROM reviewers WHERE id = ? AND active = 1")
        .bind(actorId)
        .first<{ displayName: string }>()
    : null;
  const event = await createPhotoModerationEvent(d1, {
    entityId: id,
    previousStatus: "pending",
    newStatus,
    action,
    reasonCode,
    note,
    actor: actor?.displayName ?? "Local moderator",
    reviewerId: actorId ?? null,
  });
  return { kind: "ok", item: withoutStorageKey(updated), event };
}

async function createPhotoModerationEvent(
  d1: Awaited<ReturnType<typeof getD1>>,
  input: {
    entityId: number;
    previousStatus: string;
    newStatus: string;
    action: string;
    reasonCode: string;
    note: string | null;
    actor: string;
    reviewerId: number | null;
  },
): Promise<ModerationEvent> {
  const createdAt = new Date().toISOString();
  const result = await d1
    .prepare(
      `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, reviewer_id, actor_role, recused, escalated, second_reviewer_id, created_at)
       VALUES ('photo', ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, NULL, ?)
       RETURNING id, entity, entity_id AS entityId, previous_status AS previousStatus, new_status AS newStatus, action, reason_code AS reasonCode, note, actor, reviewer_id AS reviewerId, actor_role AS actorRole, recused, escalated, second_reviewer_id AS secondReviewerId, created_at AS createdAt`,
    )
    .bind(
      input.entityId,
      input.previousStatus,
      input.newStatus,
      input.action,
      input.reasonCode,
      input.note,
      input.actor,
      input.reviewerId,
      createdAt,
    )
    .first<ModerationEvent>();
  if (!result) throw new Error("Moderation event could not be recorded");
  return result;
}

/** Read stored bytes by photo id — moderation preview only (edge-gated). */
export async function readPhotoBytes(id: number): Promise<{
  bytes: Uint8Array;
  mimeType: string;
} | null> {
  const photo = await getPhotoById(id);
  if (!photo) return null;
  const bytes = await readObjectBytes(photo.storageKey);
  if (!bytes) return null;
  return { bytes, mimeType: photo.mimeType };
}

/** Read stored bytes for a publicly visible photo (approved + redacted + camera public). */
export async function readPublicPhotoBytes(
  id: number,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const photo = await getPublicPhoto(id);
  if (!photo) return null;
  const bytes = await readObjectBytes(photo.storageKey);
  if (!bytes) return null;
  return { bytes, mimeType: photo.mimeType };
}
