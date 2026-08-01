// Runtime API tests for /api/photos (upload + public listing) and
// /api/photos/[id] (public serving, fail closed).
//
// The photo intake contract (STATUS gap #3, docs/PRIVACY_AND_SAFETY.md):
//   - uploads are limited by MIME allowlist, byte cap and dimension cap;
//   - EXIF stripping is mandatory and fail-closed at intake;
//   - photos are NEVER public until approved with confirmed redaction AND
//     the linked camera is itself public;
//   - the storage key never leaves the db layer.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

const photosRoute = () => loadRoute("app/api/photos/route.mjs");
const photoItemRoute = () => loadRoute("app/api/photos/[id]/route.mjs");
const moderationPhotoRoute = () => loadRoute("app/api/moderation/photos/[id]/route.mjs");

// Default pending-photo quota state for tests that are not about the quota:
// zero pending photos, zero pending bytes — the upload is always allowed by
// the state quota and the test exercises whatever behaviour it stubbed.
function quotaOk() {
  return stub("pendingPhotoUsage", async () => ({ count: 0, sizeBytes: 0 }));
}

// SHA-256 hex of a string, matching app/lib/abuse-alerts.ts sha256Hex — used
// to assert the anonymous quota bucket key is the hashed caller key.
async function sha256HexOf(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Synthetic EXIF-carrying JPEG bytes (see image-metadata.test.mjs fixtures).
function jpegBytes() {
  const be16 = (value) => [(value >> 8) & 0xff, value & 0xff];
  const ascii = (text) => Uint8Array.from([...text].map((c) => c.charCodeAt(0)));
  const concat = (...arrays) => {
    const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
    let offset = 0;
    for (const array of arrays) { out.set(array, offset); offset += array.length; }
    return out;
  };
  const app0 = concat(Uint8Array.from([0xff, 0xe0]), Uint8Array.from(be16(16)), ascii("JFIF\0"), Uint8Array.from([1, 1, 0, 0, 1, 0, 1, 0, 0]));
  const app1Exif = concat(Uint8Array.from([0xff, 0xe1]), Uint8Array.from(be16(2 + 13)), ascii("Exif\0\0"), ascii("GPS-GEO"));
  const sof0 = concat(Uint8Array.from([0xff, 0xc0]), Uint8Array.from(be16(8)), Uint8Array.from([8]), Uint8Array.from(be16(48)), Uint8Array.from(be16(64)), Uint8Array.from([1]));
  const sos = concat(Uint8Array.from([0xff, 0xda]), Uint8Array.from(be16(2 + 5)), Uint8Array.from([1, 0x01, 0x00, 0x3f, 0x00]));
  return concat(Uint8Array.from([0xff, 0xd8]), app0, app1Exif, sof0, sos, Uint8Array.from([0x12, 0x34]), Uint8Array.from([0xff, 0xd9]));
}

function photoRequest(body, { contentType = "image/jpeg", headers = {} } = {}) {
  return new Request("https://osdb.test/api/photos", {
    method: "POST",
    headers: { "content-type": contentType, ...headers },
    body,
  });
}

const photoFixture = {
  id: 11,
  cameraId: null,
  mimeType: "image/jpeg",
  width: 64,
  height: 48,
  sizeBytes: 128,
  status: "pending",
  exifStripped: 1,
  redactionConfirmed: 0,
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
};

// ---------------------------------------------------------------------------
// POST /api/photos — intake contract
// ---------------------------------------------------------------------------

test("POST /api/photos stores a sanitised photo and returns metadata only", async () => {
  quotaOk();
  stub("createPendingPhoto", async () => photoFixture);
  const bytes = jpegBytes();
  const { POST } = await photosRoute();
  const response = await POST(photoRequest(bytes));

  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.deepEqual(body.photo, photoFixture);
  // The storage key must never be exposed in the API response.
  assert.equal("storageKey" in body.photo, false);

  // The db layer received the raw bytes: stripping is the route's job, and
  // the storage boundary receives exactly what was validated.
  const received = callArgs("createPendingPhoto")[0][0];
  assert.ok(received.bytes instanceof Uint8Array);
  assert.equal(received.mimeType, "image/jpeg");
  assert.equal(received.width, 64);
  assert.equal(received.height, 48);
  // No session cookie → anonymous upload, no contributor attribution.
  assert.equal(received.contributorId, null);
});

test("POST /api/photos attributes an authenticated upload to its contributor", async () => {
  quotaOk();
  stub("findSessionByToken", async () => ({
    tokenHash: "x",
    csrfToken: "csrf-token-123",
    contributor: { id: 7, email: "linus@osdb.test", displayName: "Linus" },
  }));
  stub("createPendingPhoto", async () => photoFixture);
  const { POST } = await photosRoute();
  const response = await POST(
    new Request("https://osdb.test/api/photos", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
        "x-csrf-token": "csrf-token-123",
      },
      body: jpegBytes(),
    }),
  );
  assert.equal(response.status, 201);
  assert.equal(callArgs("createPendingPhoto")[0][0].contributorId, 7);
});

test("POST /api/photos rejects an authenticated upload without a valid CSRF token", async () => {
  stub("findSessionByToken", async () => ({
    tokenHash: "x",
    csrfToken: "csrf-token-123",
    contributor: { id: 7, email: "linus@osdb.test", displayName: "Linus" },
  }));
  const { POST } = await photosRoute();
  const response = await POST(
    new Request("https://osdb.test/api/photos", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      },
      body: jpegBytes(),
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(callArgs("createPendingPhoto").length, 0);
});

test("POST /api/photos rejects non-allowlisted MIME types with 415", async () => {
  quotaOk();
  const { POST } = await photosRoute();
  const response = await POST(photoRequest(jpegBytes(), { contentType: "image/gif" }));
  assert.equal(response.status, 415);
  assert.equal(callArgs("createPendingPhoto").length, 0);
});

test("POST /api/photos rejects a declared type that does not match the file bytes", async () => {
  quotaOk();
  const { POST } = await photosRoute();
  const response = await POST(photoRequest(jpegBytes(), { contentType: "image/png" }));
  assert.equal(response.status, 415);
  assert.equal(callArgs("createPendingPhoto").length, 0);
});

test("POST /api/photos rejects non-image bodies with 415", async () => {
  quotaOk();
  const { POST } = await photosRoute();
  const response = await POST(photoRequest(new Uint8Array([1, 2, 3, 4, 5]), { contentType: "image/jpeg" }));
  assert.equal(response.status, 415);
  assert.equal(callArgs("createPendingPhoto").length, 0);
});

test("POST /api/photos rejects unreadable dimensions with 400", async () => {
  quotaOk();
  const { POST } = await photosRoute();
  // JPEG container with no SOF marker → dimensions unreadable. At least 12
  // bytes so sniffing succeeds first (otherwise it is a 415, not a 400).
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9, 0x00, 0x00]);
  const response = await POST(photoRequest(bytes));
  assert.equal(response.status, 400);
  assert.equal(callArgs("createPendingPhoto").length, 0);
});

test("POST /api/photos rejects oversized bodies with 413", async () => {
  quotaOk();
  const { POST } = await photosRoute();
  // Declared content-length over the default 10 MiB cap → 413 pre-read.
  const response = await POST(
    photoRequest(jpegBytes(), { headers: { "content-length": String(11 * 1024 * 1024) } }),
  );
  assert.equal(response.status, 413);
  assert.equal(callArgs("createPendingPhoto").length, 0);
});

test("POST /api/photos honours env-tuned limits via the shared env mock", async () => {
  quotaOk();
  const env = (await loadTreeModule("cloudflare-workers.mjs")).env;
  env.PHOTO_MAX_BYTES = "8";
  env.PHOTO_MAX_DIMENSION = "32";
  try {
    const { POST } = await photosRoute();
    // Byte cap: measured body larger than 8 bytes → 413.
    const big = await POST(photoRequest(jpegBytes()));
    assert.equal(big.status, 413);
    // Dimension cap: 64px wide > 32px limit → 400. Raise the byte cap so the
    // full image is read and the SOF dimensions are actually enforced.
    env.PHOTO_MAX_BYTES = "1000000";
    stub("createPendingPhoto", async () => photoFixture);
    const dimmed = await POST(photoRequest(jpegBytes()));
    assert.equal(dimmed.status, 400);
    assert.equal(callArgs("createPendingPhoto").length, 0);
  } finally {
    delete env.PHOTO_MAX_BYTES;
    delete env.PHOTO_MAX_DIMENSION;
  }
});

test("POST /api/photos returns 503 when submissions are disabled", async () => {
  const env = (await loadTreeModule("cloudflare-workers.mjs")).env;
  env.POST_SUBMISSIONS_DISABLED = "true";
  try {
    const { POST } = await photosRoute();
    const response = await POST(photoRequest(jpegBytes()));
    assert.equal(response.status, 503);
    assert.equal(callArgs("createPendingPhoto").length, 0);
  } finally {
    env.POST_SUBMISSIONS_DISABLED = "false";
  }
});

test("POST /api/photos fails closed when metadata stripping cannot be verified", async () => {
  quotaOk();
  const env = (await loadTreeModule("cloudflare-workers.mjs")).env;
  env.PHOTO_MAX_BYTES = "1000000";
  try {
    const { POST } = await photosRoute();
    // A truncated JPEG (no EOI) is structurally walkable only up to the end:
    // stripImageMetadata returns null → upload rejected, nothing stored.
    const truncated = jpegBytes().slice(0, -2);
    const response = await POST(photoRequest(truncated));
    assert.equal(response.status, 400);
    assert.equal(callArgs("createPendingPhoto").length, 0);
  } finally {
    delete env.PHOTO_MAX_BYTES;
  }
});

// ---------------------------------------------------------------------------
// POST /api/photos — pending-photo quota (audit t_2ee58c08, P2)
// ---------------------------------------------------------------------------

test("POST /api/photos answers 429 when the caller is at the pending-photo count cap", async () => {
  // 20 pending photos = default cap → the 21st upload is rejected before the
  // body is read and nothing is stored.
  stub("pendingPhotoUsage", async () => ({ count: 20, sizeBytes: 0 }));
  stub("createPendingPhoto", async () => photoFixture);
  const { POST } = await photosRoute();
  const response = await POST(photoRequest(jpegBytes()));

  assert.equal(response.status, 429);
  const body = await responseBody(response);
  assert.match(body.error ?? "", /quota exceeded/i);
  assert.equal(callArgs("createPendingPhoto").length, 0, "over-quota upload must not reach storage");
});

test("POST /api/photos answers 429 when pending bytes exceed the byte quota", async () => {
  // Just under the count cap, but the pending bytes (200 MiB − 1 byte) plus the
  // new photo push past the default 200 MiB byte quota → rejected before storage.
  const byteCap = 200 * 1024 * 1024;
  stub("pendingPhotoUsage", async () => ({ count: 5, sizeBytes: byteCap - 1 }));
  stub("createPendingPhoto", async () => photoFixture);
  const { POST } = await photosRoute();
  const response = await POST(photoRequest(jpegBytes()));

  assert.equal(response.status, 429);
  assert.equal(callArgs("createPendingPhoto").length, 0, "over-quota upload must not reach storage");
});

test("POST /api/photos allows uploads under the pending-photo quota unchanged", async () => {
  // At 19 pending photos (one below the default cap of 20) a new upload is
  // accepted and stored exactly as before the quota existed.
  stub("pendingPhotoUsage", async () => ({ count: 19, sizeBytes: 1024 }));
  stub("createPendingPhoto", async () => photoFixture);
  const { POST } = await photosRoute();
  const response = await POST(photoRequest(jpegBytes()));

  assert.equal(response.status, 201);
  assert.equal(callArgs("createPendingPhoto").length, 1);
  const received = callArgs("createPendingPhoto")[0][0];
  assert.equal(received.submitterKey, `anon:${await sha256HexOf("unknown")}`);
  // The storage layer must still receive the sanitised bytes and attribution.
  assert.ok(received.bytes instanceof Uint8Array);
  assert.equal(received.mimeType, "image/jpeg");
});

test("POST /api/photos honours env-tuned pending-photo quota knobs", async () => {
  const env = (await loadTreeModule("cloudflare-workers.mjs")).env;
  env.PHOTOS_MAX_PENDING_PER_CALLER = "2";
  env.PHOTOS_MAX_PENDING_BYTES = "1000";
  try {
    // Count cap at 2: two pending photos → third upload rejected with 429.
    stub("pendingPhotoUsage", async () => ({ count: 2, sizeBytes: 100 }));
    stub("createPendingPhoto", async () => photoFixture);
    let { POST } = await photosRoute();
    assert.equal((await POST(photoRequest(jpegBytes()))).status, 429);
    assert.equal(callArgs("createPendingPhoto").length, 0);

    // Byte cap at 1000: 999 pending bytes + a photo over 1 byte → 429.
    stub("pendingPhotoUsage", async () => ({ count: 0, sizeBytes: 999 }));
    const response = await POST(photoRequest(jpegBytes()));
    assert.equal(response.status, 429);
    assert.equal(callArgs("createPendingPhoto").length, 0);

    // Under both caps: upload accepted.
    stub("pendingPhotoUsage", async () => ({ count: 1, sizeBytes: 100 }));
    const ok = await POST(photoRequest(jpegBytes()));
    assert.equal(ok.status, 201);
    assert.equal(callArgs("createPendingPhoto").length, 1);
  } finally {
    delete env.PHOTOS_MAX_PENDING_PER_CALLER;
    delete env.PHOTOS_MAX_PENDING_BYTES;
  }
});

test("POST /api/photos buckets an authenticated upload by contributor id", async () => {
  quotaOk();
  stub("findSessionByToken", async () => ({
    tokenHash: "x",
    csrfToken: "csrf-token-123",
    contributor: { id: 7, email: "linus@osdb.test", displayName: "Linus" },
  }));
  stub("createPendingPhoto", async () => photoFixture);
  const { POST } = await photosRoute();
  const response = await POST(
    new Request("https://osdb.test/api/photos", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
        "x-csrf-token": "csrf-token-123",
      },
      body: jpegBytes(),
    }),
  );
  assert.equal(response.status, 201);
  assert.equal(callArgs("pendingPhotoUsage")[0][0], "contributor:7");
  assert.equal(callArgs("createPendingPhoto")[0][0].submitterKey, "contributor:7");
});

test("POST /api/photos buckets an anonymous upload by hashed caller key", async () => {
  quotaOk();
  stub("createPendingPhoto", async () => photoFixture);
  const { POST } = await photosRoute();
  // With no cf-connecting-ip header the rate-limit callerKey falls back to
  // "unknown"; the quota key is the SHA-256 of that value, never the raw key.
  const response = await POST(photoRequest(jpegBytes()));
  assert.equal(response.status, 201);
  const key = callArgs("pendingPhotoUsage")[0][0];
  assert.match(key, /^anon:[0-9a-f]{64}$/);
  assert.equal(key, `anon:${await sha256HexOf("unknown")}`);
  assert.equal(callArgs("createPendingPhoto")[0][0].submitterKey, key);
});

// ---------------------------------------------------------------------------
// GET /api/photos?cameraId=N — public gallery (approved photos of public camera)
// ---------------------------------------------------------------------------

test("GET /api/photos?cameraId= lists approved photos only for a public camera", async () => {
  stub("getPublicCameraById", async () => ({ id: 5, status: "verified" }));
  const approved = [
    { id: 3, mimeType: "image/jpeg", width: 64, height: 48 },
    { id: 4, mimeType: "image/webp", width: 128, height: 96 },
  ];
  stub("listApprovedPhotosForCamera", async () => approved);
  const { GET } = await photosRoute();
  const response = await GET(apiRequest("/api/photos?cameraId=5"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { photos: approved });
  assert.deepEqual(callArgs("listApprovedPhotosForCamera")[0], [5]);
});

test("GET /api/photos?cameraId= returns 404 when the camera is not public", async () => {
  stub("getPublicCameraById", async () => null);
  const { GET } = await photosRoute();
  const response = await GET(apiRequest("/api/photos?cameraId=5"));
  assert.equal(response.status, 404);
  assert.equal(callArgs("listApprovedPhotosForCamera").length, 0, "no photo lookup for a non-public camera");
});

test("GET /api/photos?cameraId= rejects a missing or invalid camera id", async () => {
  const { GET } = await photosRoute();
  assert.equal((await GET(apiRequest("/api/photos"))).status, 400);
  assert.equal((await GET(apiRequest("/api/photos?cameraId=abc"))).status, 400);
  assert.equal((await GET(apiRequest("/api/photos?cameraId=0"))).status, 400);
});

// ---------------------------------------------------------------------------
// GET /api/photos/[id] — public photo bytes (fail closed)
// ---------------------------------------------------------------------------

test("GET /api/photos/[id] serves bytes only when the photo is public", async () => {
  stub("readPublicPhotoBytes", async () => ({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" }));
  const { GET } = await photoItemRoute();
  const response = await GET(apiRequest("/api/photos/11"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /image\/jpeg/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const body = await response.arrayBuffer();
  assert.deepEqual([...new Uint8Array(body)], [0xff, 0xd8, 0xff]);
});

test("GET /api/photos/[id] answers 404 when the photo is not publicly visible", async () => {
  stub("readPublicPhotoBytes", async () => null);
  const { GET } = await photoItemRoute();
  const response = await GET(apiRequest("/api/photos/11"));
  assert.equal(response.status, 404);
});

test("GET /api/photos/[id] rejects non-positive ids with 404", async () => {
  const { GET } = await photoItemRoute();
  assert.equal((await GET(apiRequest("/api/photos/0"))).status, 404);
  assert.equal((await GET(apiRequest("/api/photos/abc"))).status, 404);
  assert.equal(callArgs("readPublicPhotoBytes").length, 0);
});

// ---------------------------------------------------------------------------
// GET /api/moderation/photos/[id] — moderator preview (edge-gated path)
// ---------------------------------------------------------------------------

test("GET /api/moderation/photos/[id] serves bytes for the moderation preview", async () => {
  stub("readPhotoBytes", async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" }));
  const { GET } = await moderationPhotoRoute();
  const response = await GET(apiRequest("/api/moderation/photos/11"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /image\/png/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("GET /api/moderation/photos/[id] answers 404 for unknown photos", async () => {
  stub("readPhotoBytes", async () => null);
  const { GET } = await moderationPhotoRoute();
  const response = await GET(apiRequest("/api/moderation/photos/11"));
  assert.equal(response.status, 404);
});
