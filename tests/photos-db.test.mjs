// DB-layer tests for db/photos.ts — the least-covered production module
// (baseline 35.10% lines, 73/208). Exercises every public function against
// the real Drizzle migrations on in-memory D1, with a minimal in-memory R2
// mock for the byte-storage boundary:
//
//   - createPendingPhoto        R2 put + metadata insert, extension mapping,
//                               storage-key redaction, binding missing → throw
//   - listPendingPhotos         queue view, no storage key
//   - getPhotoById              full metadata lookup (moderation preview)
//   - getPublicPhoto            approved + redaction + camera public, fail
//                               closed for pending/rejected/unredacted/non-public
//                               cameras and stale review windows; demo carve-out
//   - listApprovedPhotosForCamera  gallery projection, approved+redacted only
//   - linkPhotosToCamera        pending/unlinked guard (empty list no-op)
//   - moderatePhoto             approve (requires redaction), reject, unknown
//                               ids, non-pending ids, event trail, actor name
//   - readPhotoBytes / readPublicPhotoBytes  R2 boundary, fail-closed 404
//
// Fixtures are fictional only — no personal data.
//
// The R2 mock keeps the photo bytes it was handed so tests can assert what
// crossed the storage boundary without any real network.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime, seedDemoIdentities } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";

let runtime;
let photos;
let db;
let r2;

beforeEach(async () => {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  // Migration 0017 removes the demo seed (fresh DB = zero demo rows, exactly
  // like alpha/prod). This suite exercises moderatePhoto with the demo
  // reviewer identities (reviewer id 2), so it provisions them explicitly —
  // the same shape a deploy provisions real accounts before opening the DB.
  await seedDemoIdentities(db);
  runtime.env.DB = db;
  // Minimal in-memory R2 mock: put stores bytes, get returns a BodyInit-like
  // object (arrayBuffer) or null. Keyed by storage key.
  r2 = new Map();
  runtime.env.PHOTOS = {
    put: async (key, bytes, opts) => {
      r2.set(key, { bytes, opts });
      return {};
    },
    get: async (key) => {
      const entry = r2.get(key);
      return entry ? { arrayBuffer: async () => entry.bytes } : null;
    },
    delete: async (key) => {
      r2.delete(key);
    },
  };
  photos = runtime.photos;
});

after(async () => cleanupDbRuntime());

const jpegBytes = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x12, 0x34, 0xff, 0xd9]);

async function insertCamera({ status = "verified", reviewDueAt = null, id = 1 } = {}) {
  const result = await db
    .prepare(
      `INSERT INTO cameras (id, title, kind, address, notes, latitude, longitude, status, source, updated, description, created_at, review_due_at)
       VALUES (?, 'Piazza Fittizia', 'Fixed dome', 'Via Fittizia 1', '', 41.9005, 12.4937, ?, 'Community report', '2026-07-01T00:00:00.000Z', '', '2026-07-01T00:00:00.000Z', ?)
       RETURNING id`,
    )
    .bind(id, status, reviewDueAt)
    .first();
  return result.id;
}

async function insertPhoto({
  cameraId = null,
  status = "pending",
  redactionConfirmed = 0,
  contributorId = null,
  storageKey = "photos/fixture.jpg",
  id = 11,
} = {}) {
  const result = await db
    .prepare(
      `INSERT INTO photos (id, camera_id, contributor_id, storage_key, mime_type, width, height, size_bytes, status, exif_stripped, redaction_confirmed, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'image/jpeg', 64, 48, 128, ?, 1, ?, '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z')
       RETURNING id`,
    )
    .bind(id, cameraId, contributorId, storageKey, status, redactionConfirmed)
    .first();
  return result.id;
}

// ---------------------------------------------------------------------------
// createPendingPhoto
// ---------------------------------------------------------------------------

test("createPendingPhoto stores bytes in R2, inserts metadata, and never leaks the storage key", async () => {
  const bytes = jpegBytes();
  const created = await photos.createPendingPhoto({
    bytes,
    mimeType: "image/jpeg",
    width: 64,
    height: 48,
    contributorId: 7,
  });

  // Public projection: no storageKey anywhere in the returned record.
  assert.equal("storageKey" in created, false);
  assert.equal(created.status, "pending");
  assert.equal(created.mimeType, "image/jpeg");
  assert.equal(created.contributorId, 7);
  assert.equal(created.exifStripped, 1);
  assert.equal(created.redactionConfirmed, 0);

  // The byte storage boundary received exactly the stripped bytes.
  assert.equal(r2.size, 1);
  const [key, entry] = [...r2.entries()][0];
  assert.match(key, /^photos\/[0-9a-f-]{36}\.jpg$/);
  assert.deepEqual(entry.bytes, bytes);
  assert.equal(entry.opts.httpMetadata.contentType, "image/jpeg");

  // Metadata row exists in D1 with the same storage key.
  const row = await db.prepare("SELECT storage_key AS storageKey FROM photos WHERE id = ?").bind(created.id).first();
  assert.equal(row.storageKey, key);
});

test("createPendingPhoto maps mime types to storage extensions (png/webp/jpg)", async () => {
  for (const [mimeType, extension] of [
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/jpeg", "jpg"],
    ["application/octet-stream", "jpg"], // unknown → jpg fallback
  ]) {
    await photos.createPendingPhoto({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType,
      width: 1,
      height: 1,
    });
    assert.ok([...r2.keys()].some((key) => key.endsWith(`.${extension}`)), `${mimeType} → .${extension}`);
    r2.clear();
  }
});

test("createPendingPhoto attributes an anonymous upload with a null contributor", async () => {
  const created = await photos.createPendingPhoto({
    bytes: jpegBytes(),
    mimeType: "image/jpeg",
    width: 64,
    height: 48,
  });
  assert.equal(created.contributorId, null);
});

test("createPendingPhoto throws when the photo storage binding is missing", async () => {
  delete runtime.env.PHOTOS;
  await assert.rejects(
    photos.createPendingPhoto({ bytes: jpegBytes(), mimeType: "image/jpeg", width: 1, height: 1 }),
    /Photo storage binding unavailable/,
  );
});

test("createPendingPhoto removes the R2 object when the D1 INSERT fails (P1-3, no orphan)", async () => {
  // Simulate a D1 failure at INSERT time (e.g. transient worker error): the
  // bytes were already put into R2, so the fix must delete them — otherwise
  // the object is orphaned with no D1 row and the retention sweep (which
  // only sees D1 rows) can never collect it.
  db.exec("DROP TABLE photos"); // INSERT then throws "no such table"
  await assert.rejects(
    photos.createPendingPhoto({ bytes: jpegBytes(), mimeType: "image/jpeg", width: 64, height: 48 }),
    /no such table/,
  );
  assert.equal(r2.size, 0, "the R2 object must be deleted when the metadata INSERT fails");
});

test("createPendingPhoto surfaces the original INSERT error even when the R2 cleanup also fails", async () => {
  // Best-effort cleanup: a failing PHOTOS.delete must not mask the INSERT
  // error (the upload failed either way, and the object stays as debris
  // only if the bucket itself is also down).
  db.exec("DROP TABLE photos");
  runtime.env.PHOTOS.delete = async () => {
    throw new Error("R2 delete simulated failure");
  };
  await assert.rejects(
    photos.createPendingPhoto({ bytes: jpegBytes(), mimeType: "image/jpeg", width: 64, height: 48 }),
    /no such table/,
  );
  assert.equal(r2.size, 1, "object stays when the best-effort delete fails (documented debris)");
});

test("createPendingPhoto retries cleanly after a D1 INSERT failure (idempotent, one object)", async () => {
  // Idempotency on retry: a client retry after a failed attempt must start
  // from a clean state — the failed attempt's object is gone, and the retry
  // stores exactly one object + one row (fresh UUID per attempt).
  let insertCalls = 0;
  const originalPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const statement = originalPrepare(sql);
    if (sql.includes("INSERT INTO photos")) {
      const originalFirst = statement.first.bind(statement);
      statement.first = (...args) => {
        insertCalls += 1;
        if (insertCalls === 1) throw new Error("D1 INSERT simulated failure");
        return originalFirst(...args);
      };
    }
    return statement;
  };

  await assert.rejects(
    photos.createPendingPhoto({ bytes: jpegBytes(), mimeType: "image/jpeg", width: 64, height: 48 }),
    /D1 INSERT simulated failure/,
  );
  assert.equal(r2.size, 0, "failed attempt leaves no R2 object behind");

  const retried = await photos.createPendingPhoto({
    bytes: jpegBytes(),
    mimeType: "image/jpeg",
    width: 64,
    height: 48,
  });
  assert.equal(r2.size, 1, "retry stores exactly one R2 object");
  const row = await db.prepare("SELECT storage_key AS storageKey FROM photos WHERE id = ?").bind(retried.id).first();
  assert.ok(row.storageKey.startsWith("photos/"));
});

// ---------------------------------------------------------------------------
// listPendingPhotos / getPhotoById
// ---------------------------------------------------------------------------

test("listPendingPhotos returns only pending photos, oldest first, without storage keys", async () => {
  await insertPhoto({ id: 11, status: "pending" });
  await insertPhoto({ id: 12, status: "approved", redactionConfirmed: 1 });
  await insertPhoto({ id: 13, status: "pending" });

  const pending = await photos.listPendingPhotos();
  assert.deepEqual(pending.map((p) => p.id), [11, 13]);
  for (const photo of pending) {
    assert.equal("storageKey" in photo, false, "the moderation queue view must not leak storage keys");
  }
});

test("getPhotoById returns full metadata (including storage key) or null", async () => {
  const id = await insertPhoto({ id: 11, status: "pending" });
  const found = await photos.getPhotoById(id);
  assert.equal(found.id, id);
  assert.equal(found.storageKey, "photos/fixture.jpg", "the moderation preview path carries the storage key");
  assert.equal(found.cameraId, null);

  assert.equal(await photos.getPhotoById(999999), null);
});

// ---------------------------------------------------------------------------
// getPublicPhoto — fail-closed public boundary
// ---------------------------------------------------------------------------

test("getPublicPhoto serves an approved, redacted photo linked to a public camera", async () => {
  await insertCamera({ status: "verified", id: 1 });
  await insertPhoto({ id: 11, cameraId: 1, status: "approved", redactionConfirmed: 1 });

  const photo = await photos.getPublicPhoto(11);
  assert.equal(photo.id, 11);
  assert.equal(photo.storageKey, "photos/fixture.jpg", "the public serving path carries the storage key for the route");
  assert.equal(photo.status, "approved");
});

test("getPublicPhoto fails closed for pending, rejected, and unredacted photos", async () => {
  await insertCamera({ status: "verified", id: 1 });
  await insertPhoto({ id: 11, cameraId: 1, status: "pending" });
  await insertPhoto({ id: 12, cameraId: 1, status: "rejected" });
  await insertPhoto({ id: 13, cameraId: 1, status: "approved", redactionConfirmed: 0 });

  assert.equal(await photos.getPublicPhoto(11), null);
  assert.equal(await photos.getPublicPhoto(12), null);
  assert.equal(await photos.getPublicPhoto(13), null);
  assert.equal(await photos.getPublicPhoto(999999), null);
});

test("getPublicPhoto fails closed when the linked camera is not public or its review window is stale", async () => {
  await insertCamera({ status: "pending", id: 1 });
  await insertPhoto({ id: 11, cameraId: 1, status: "approved", redactionConfirmed: 1 });
  assert.equal(await photos.getPublicPhoto(11), null, "non-public camera → hidden");

  // A verified camera with a stale review window is also hidden.
  await db
    .prepare("UPDATE cameras SET status = 'verified', review_due_at = '2020-01-01T00:00:00.000Z' WHERE id = 1")
    .run();
  assert.equal(await photos.getPublicPhoto(11), null, "stale review window → hidden");
});

test("getPublicPhoto keeps demo cameras public without a review window", async () => {
  await insertCamera({ status: "demo", reviewDueAt: "2020-01-01T00:00:00.000Z", id: 1 });
  await insertPhoto({ id: 11, cameraId: 1, status: "approved", redactionConfirmed: 1 });
  const photo = await photos.getPublicPhoto(11);
  assert.equal(photo.id, 11, "demo carve-out keeps the photo public even with a past review_due_at");
});

test("getPublicPhoto honours an explicit now for the review window", async () => {
  await insertCamera({ status: "verified", reviewDueAt: "2030-01-01T00:00:00.000Z", id: 1 });
  await insertPhoto({ id: 11, cameraId: 1, status: "approved", redactionConfirmed: 1 });
  // review_due_at is the deadline: a future deadline means the record is
  // still current; a past one means the review window closed.
  assert.equal((await photos.getPublicPhoto(11, "2026-08-01T00:00:00.000Z")).id, 11, "inside the review window");
  assert.equal(await photos.getPublicPhoto(11, "2031-01-01T00:00:00.000Z"), null, "review window already past");
  assert.equal(await photos.getPublicPhoto(11, "2030-06-01T00:00:00.000Z"), null, "review window already past (mid-year)");
});

// ---------------------------------------------------------------------------
// listApprovedPhotosForCamera
// ---------------------------------------------------------------------------

test("listApprovedPhotosForCamera returns only approved+redacted photos of the camera", async () => {
  await insertCamera({ status: "verified", id: 1 });
  await insertPhoto({ id: 11, cameraId: 1, status: "approved", redactionConfirmed: 1 });
  await insertPhoto({ id: 12, cameraId: 1, status: "approved", redactionConfirmed: 0 });
  await insertPhoto({ id: 13, cameraId: 1, status: "pending" });
  await insertPhoto({ id: 14, cameraId: 2, status: "approved", redactionConfirmed: 1 });

  const gallery = await photos.listApprovedPhotosForCamera(1);
  assert.deepEqual(gallery.map((p) => p.id), [11]);
  assert.deepEqual(Object.keys(gallery[0]).sort(), ["height", "id", "mimeType", "width"]);
});

// ---------------------------------------------------------------------------
// linkPhotosToCamera
// ---------------------------------------------------------------------------

test("linkPhotosToCamera is a no-op for an empty id list", async () => {
  assert.equal(await photos.linkPhotosToCamera(1, [], null), 0);
});

test("linkPhotosToCamera leaves already-linked photos alone", async () => {
  await insertCamera({ status: "verified", id: 1 });
  await insertPhoto({ id: 11, cameraId: 1, status: "pending" });
  const linked = await photos.linkPhotosToCamera(2, [11], null);
  assert.equal(linked, 0, "an already-linked pending photo must not be relinked");
  const row = await db.prepare("SELECT camera_id AS cameraId FROM photos WHERE id = 11").first();
  assert.equal(row.cameraId, 1);
});

// ---------------------------------------------------------------------------
// moderatePhoto
// ---------------------------------------------------------------------------

test("moderatePhoto approves with confirmed redaction and writes the audit event", async () => {
  await insertPhoto({ id: 11, status: "pending" });
  const result = await photos.moderatePhoto(11, "approve", true, "verified-public-infrastructure", "Subject visible", 2);

  assert.equal(result.kind, "ok");
  assert.equal(result.item.status, "approved");
  assert.equal(result.item.redactionConfirmed, 1);
  assert.equal("storageKey" in result.item, false, "the moderated projection never leaks the storage key");
  assert.equal(result.event.entity, "photo");
  assert.equal(result.event.entityId, 11);
  assert.equal(result.event.action, "approve");
  assert.equal(result.event.previousStatus, "pending");
  assert.equal(result.event.newStatus, "approved");
  assert.equal(result.event.actor, "Demo Record Reviewer", "actor name is resolved from the reviewer profile");
  assert.equal(result.event.reviewerId, 2);

  const eventRow = await db.prepare("SELECT entity FROM moderation_events WHERE entity = 'photo' AND entity_id = 11").first();
  assert.equal(eventRow.entity, "photo");
});

test("moderatePhoto rejects without redaction confirmation", async () => {
  await insertPhoto({ id: 11, status: "pending" });
  const result = await photos.moderatePhoto(11, "reject", false, "privacy-or-safety-concern", "Subject not redacted", null);
  assert.equal(result.kind, "ok");
  assert.equal(result.item.status, "rejected");
  assert.equal(result.item.redactionConfirmed, 0);

  const event = await db
    .prepare("SELECT action, new_status AS newStatus FROM moderation_events WHERE entity = 'photo' AND entity_id = 11")
    .first();
  assert.equal(event.action, "reject");
  assert.equal(event.newStatus, "rejected");
});

test("moderatePhoto refuses to approve without redaction confirmation", async () => {
  await insertPhoto({ id: 11, status: "pending" });
  const result = await photos.moderatePhoto(11, "approve", false, "verified-public-infrastructure", null, null);
  assert.equal(result.kind, "redaction_required");
  const row = await db.prepare("SELECT status FROM photos WHERE id = 11").first();
  assert.equal(row.status, "pending", "a refused approval must not change the photo");
});

test("moderatePhoto returns not_found for unknown and non-pending ids", async () => {
  await insertPhoto({ id: 11, status: "approved", redactionConfirmed: 1 });
  assert.equal((await photos.moderatePhoto(11, "reject", false, "other", null, null)).kind, "not_found");
  assert.equal((await photos.moderatePhoto(999999, "reject", false, "other", null, null)).kind, "not_found");
});

test("moderatePhoto falls back to a neutral actor when no active reviewer profile matches", async () => {
  // A deactivated reviewer row exists (FK requires the id) but fails the
  // `active = 1` filter, so the event actor falls back to the neutral label.
  await db
    .prepare(
      `INSERT INTO reviewers (id, display_name, role, active, mfa_enabled, created_at, updated_at)
       VALUES (99, 'Deactivated Reviewer', 'record_reviewer', 0, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z')`,
    )
    .run();
  await insertPhoto({ id: 11, status: "pending" });
  const result = await photos.moderatePhoto(11, "approve", true, "verified-public-infrastructure", null, 99);
  assert.equal(result.kind, "ok");
  assert.equal(result.event.actor, "Local moderator");
  assert.equal(result.event.reviewerId, 99);
});

// ---------------------------------------------------------------------------
// readPhotoBytes / readPublicPhotoBytes
// ---------------------------------------------------------------------------

test("readPhotoBytes returns the stored bytes and mime type for an existing photo", async () => {
  await insertPhoto({ id: 11, status: "pending" });
  r2.set("photos/fixture.jpg", { bytes: jpegBytes(), opts: {} });
  const result = await photos.readPhotoBytes(11);
  assert.deepEqual(result.bytes, jpegBytes());
  assert.equal(result.mimeType, "image/jpeg");
});

test("readPhotoBytes returns null for unknown photos and missing R2 objects", async () => {
  await insertPhoto({ id: 11, status: "pending" });
  assert.equal(await photos.readPhotoBytes(999999), null, "unknown id → null");
  assert.equal(await photos.readPhotoBytes(11), null, "metadata exists but bytes missing → null");
});

test("readPublicPhotoBytes serves only publicly visible photos, fail closed otherwise", async () => {
  await insertCamera({ status: "verified", id: 1 });
  await insertPhoto({ id: 11, cameraId: 1, status: "approved", redactionConfirmed: 1 });
  await insertPhoto({ id: 12, cameraId: 1, status: "pending" });
  r2.set("photos/fixture.jpg", { bytes: jpegBytes(), opts: {} });

  const publicBytes = await photos.readPublicPhotoBytes(11);
  assert.deepEqual(publicBytes.bytes, jpegBytes());
  assert.equal(publicBytes.mimeType, "image/jpeg");

  assert.equal(await photos.readPublicPhotoBytes(12), null, "pending photo → null");
  assert.equal(await photos.readPublicPhotoBytes(999999), null, "unknown photo → null");
});
