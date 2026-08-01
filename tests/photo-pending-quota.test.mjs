// Pending-photo quota DB layer (audit t_2ee58c08, P2).
//
// DB-layer integration tests for pendingPhotoUsage against the real
// db/photos.ts SQL on a fresh in-memory SQLite (schema from the real Drizzle
// migrations, including 0012_pending_photo_quota):
//   - the quota counts ONLY 'pending' rows for the caller's submitter_key;
//   - approved and rejected photos leave the cap the moment a moderator
//     decides them;
//   - buckets are isolated: one caller's pending photos never count toward
//     another caller's quota;
//   - createPendingPhoto persists the submitter_key column.
//
// No personal data is used: all fixtures are fictional, and anonymous bucket
// keys are the SHA-256 hashes the route derives — never raw IPs.

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

// Insert a photo with an explicit submitter key and status. The R2 put + D1
// insert pair is covered by the route tests; here we exercise the quota
// query only, so rows are written directly with the columns that matter.
async function insertPhoto({ submitterKey, status = "pending", sizeBytes = 128 }) {
  const result = await db
    .prepare(
      `INSERT INTO photos (camera_id, contributor_id, submitter_key, storage_key, mime_type, width, height, size_bytes, status, exif_stripped, redaction_confirmed, created_at, updated_at)
       VALUES (NULL, NULL, ?, 'photos/fixture.jpg', 'image/jpeg', 64, 48, ?, ?, 1, 0, '2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z')
       RETURNING id`,
    )
    .bind(submitterKey, sizeBytes, status)
    .first();
  return result.id;
}

test("pendingPhotoUsage counts only pending photos of the caller bucket", async () => {
  await insertPhoto({ submitterKey: "contributor:7" });
  await insertPhoto({ submitterKey: "contributor:7" });
  await insertPhoto({ submitterKey: "contributor:7", sizeBytes: 512 });

  const usage = await photos.pendingPhotoUsage("contributor:7");
  assert.equal(usage.count, 3);
  assert.equal(usage.sizeBytes, 128 + 128 + 512);
});

test("approved and rejected photos do NOT count toward the pending cap", async () => {
  const pendingId = await insertPhoto({ submitterKey: "contributor:7" });
  await insertPhoto({ submitterKey: "contributor:7", status: "approved" });
  await insertPhoto({ submitterKey: "contributor:7", status: "rejected" });

  // Only the pending row counts.
  const usage = await photos.pendingPhotoUsage("contributor:7");
  assert.equal(usage.count, 1);
  assert.equal(usage.sizeBytes, 128);

  // A moderator deciding the last pending photo drains the bucket to zero.
  const decided = await photos.moderatePhoto(pendingId, "approve", true, "ok", null);
  assert.equal(decided.kind, "ok");
  const afterDecide = await photos.pendingPhotoUsage("contributor:7");
  assert.equal(afterDecide.count, 0);
  assert.equal(afterDecide.sizeBytes, 0);
});

test("caller buckets are isolated", async () => {
  await insertPhoto({ submitterKey: "contributor:7" });
  await insertPhoto({ submitterKey: "anon:<hashed-key-a>" });
  await insertPhoto({ submitterKey: "anon:<hashed-key-b>" });

  assert.equal((await photos.pendingPhotoUsage("contributor:7")).count, 1);
  assert.equal((await photos.pendingPhotoUsage("anon:<hashed-key-a>")).count, 1);
  assert.equal((await photos.pendingPhotoUsage("anon:<hashed-key-b>")).count, 1);
  // A bucket with no rows reads as zero, not an error.
  assert.deepEqual(await photos.pendingPhotoUsage("contributor:999"), { count: 0, sizeBytes: 0 });
});

test("createPendingPhoto persists the submitter_key bucket", async () => {
  runtime.env.PHOTOS = { put: async () => {} };
  const report = await photos.createPendingPhoto({
    bytes: new Uint8Array([0xff, 0xd8, 0xff]),
    mimeType: "image/jpeg",
    width: 64,
    height: 48,
    contributorId: null,
    submitterKey: "anon:<hashed-key-c>",
  });
  assert.ok(report.id > 0);
  // The bucket key is internal bookkeeping: never part of the projection.
  assert.equal("submitterKey" in report, false);

  const usage = await photos.pendingPhotoUsage("anon:<hashed-key-c>");
  assert.equal(usage.count, 1);
  assert.equal(usage.sizeBytes, 3);
});
