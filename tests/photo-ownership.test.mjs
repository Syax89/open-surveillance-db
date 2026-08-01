// Photo→report ownership guard (Ada review, PR #64).
//
// DB-layer integration tests for linkPhotosToCamera: a photo attributed to
// a contributor (contributor_id set at upload) may only be linked by that
// same contributor; anonymous photos stay linkable by anyone. Runs the real
// db/photos.ts SQL against a fresh in-memory SQLite through the D1 adapter,
// with the schema from the real Drizzle migrations.
//
// No personal data is used: all fixtures are fictional.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";

let runtime;
let photos;
let db;

beforeEach(async () => {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  photos = runtime.photos;
});

after(async () => cleanupDbRuntime());

// Insert a pending, unlinked photo directly (the R2 put + D1 insert pair is
// covered by the route tests; here we exercise the link guard only).
async function insertPendingPhoto({ contributorId = null } = {}) {
  const result = await db
    .prepare(
      `INSERT INTO photos (camera_id, contributor_id, storage_key, mime_type, width, height, size_bytes, status, exif_stripped, redaction_confirmed, created_at, updated_at)
       VALUES (NULL, ?, 'photos/fixture.jpg', 'image/jpeg', 64, 48, 128, 'pending', 1, 0, '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z')
       RETURNING id`,
    )
    .bind(contributorId)
    .first();
  return result.id;
}

test("an anonymous photo can be linked by anyone (best-effort, stays private)", async () => {
  const photoId = await insertPendingPhoto({ contributorId: null });
  const linked = await photos.linkPhotosToCamera(42, [photoId], null);
  assert.equal(linked, 1);
  const row = await db
    .prepare("SELECT camera_id AS cameraId FROM photos WHERE id = ?")
    .bind(photoId)
    .first();
  assert.equal(row.cameraId, 42);
});

test("a contributor-attributed photo can only be linked by its owner", async () => {
  const photoId = await insertPendingPhoto({ contributorId: 7 });

  // Wrong contributor: the photo must NOT be linked.
  const blocked = await photos.linkPhotosToCamera(42, [photoId], 8);
  assert.equal(blocked, 0);
  let row = await db
    .prepare("SELECT camera_id AS cameraId FROM photos WHERE id = ?")
    .bind(photoId)
    .first();
  assert.equal(row.cameraId, null, "photo must stay unlinked for a non-owner");

  // Anonymous submitter: cannot claim someone else's attributed photo either.
  const anonymous = await photos.linkPhotosToCamera(43, [photoId], null);
  assert.equal(anonymous, 0);
  row = await db.prepare("SELECT camera_id AS cameraId FROM photos WHERE id = ?").bind(photoId).first();
  assert.equal(row.cameraId, null);

  // The owner links it successfully.
  const linked = await photos.linkPhotosToCamera(44, [photoId], 7);
  assert.equal(linked, 1);
  row = await db.prepare("SELECT camera_id AS cameraId FROM photos WHERE id = ?").bind(photoId).first();
  assert.equal(row.cameraId, 44);
});

test("mixed id lists only link the photos the submitter owns", async () => {
  const own = await insertPendingPhoto({ contributorId: 5 });
  const foreign = await insertPendingPhoto({ contributorId: 6 });
  const anon = await insertPendingPhoto({ contributorId: null });

  const linked = await photos.linkPhotosToCamera(42, [own, foreign, anon], 5);
  assert.equal(linked, 2, "owner links own + anonymous, never foreign");

  const rows = await db
    .prepare("SELECT id, camera_id AS cameraId FROM photos WHERE id IN (?, ?, ?) ORDER BY id")
    .bind(own, foreign, anon)
    .all();
  const byId = Object.fromEntries(rows.results.map((row) => [row.id, row.cameraId]));
  assert.equal(byId[own], 42);
  assert.equal(byId[foreign], null, "foreign-attributed photo must remain unlinked");
  assert.equal(byId[anon], 42);
});

test("empty id lists are a no-op without touching the database", async () => {
  const linked = await photos.linkPhotosToCamera(42, [], null);
  assert.equal(linked, 0);
});

test("nonexistent photo ids are a silent best-effort no-op", async () => {
  // A photo id that does not exist (or was already linked elsewhere) simply
  // does not match the UPDATE: the caller gets a lower count, never a throw
  // or an existence oracle (403/404). This is the "id inesistente" edge
  // from the t_0de37378 audit — POST /api/cameras must still answer 201
  // with linkedPhotos: 0.
  const linked = await photos.linkPhotosToCamera(42, [999_999, 999_998], null);
  assert.equal(linked, 0);
});
