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
import { apiRequest, cleanupRouteTree, loadLibModule, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
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
// POST /api/photos — HTTP-layer edge cases (audit t_0de37378, P2)
// ---------------------------------------------------------------------------

test("POST /api/photos rejects an empty body (0 bytes) without storing anything", async () => {
  // The audit hypothesis was 400, but the route answers 415: sniffImageType
  // needs >= 12 bytes and returns null on an empty body, which maps to the
  // generic "not a readable image" rejection. Fail-closed either way — the
  // photo is never stored. The test fixes the actual (verified) behaviour.
  quotaOk();
  stub("createPendingPhoto", async () => photoFixture);
  const { POST } = await photosRoute();
  const response = await POST(photoRequest(new Uint8Array(0)));
  assert.equal(response.status, 415);
  assert.equal(callArgs("createPendingPhoto").length, 0);
});

test("POST /api/photos rejects a missing Content-Type even with a valid binary body", async () => {
  // Content-Type is required: the allowlist check runs before the body is
  // read, so a valid JPEG without a declared type answers 415, never 201.
  quotaOk();
  stub("createPendingPhoto", async () => photoFixture);
  const { POST } = await photosRoute();
  const response = await POST(
    new Request("https://osdb.test/api/photos", {
      method: "POST",
      body: jpegBytes(), // no content-type header at all
    }),
  );
  assert.equal(response.status, 415);
  const body = await responseBody(response);
  assert.match(body.error ?? "", /JPEG, PNG and WebP/);
  assert.equal(callArgs("createPendingPhoto").length, 0);
});

test("POST /api/photos rejects GIF, BMP and AVIF with valid magic bytes", async () => {
  // Non-allowlisted formats fail on the declared Content-Type regardless of
  // how well-formed their container is — the allowlist check precedes any
  // parsing, so a real GIF89a/BMP/AVIF payload is refused the same way.
  const gif89a = Uint8Array.from([...Array.from("GIF89a", (c) => c.charCodeAt(0)), ...new Uint8Array(24).fill(0)]);
  const bmp = Uint8Array.from([0x42, 0x4d, ...new Uint8Array(24).fill(0)]); // "BM"
  const avif = Uint8Array.from([0x00, 0x00, 0x00, 0x18, ...Array.from("ftypavif", (c) => c.charCodeAt(0)), ...new Uint8Array(16).fill(0)]);
  for (const [bytes, contentType, label] of [
    [gif89a, "image/gif", "GIF89a"],
    [bmp, "image/bmp", "BMP"],
    [avif, "image/avif", "AVIF"],
  ]) {
    quotaOk();
    stub("createPendingPhoto", async () => photoFixture);
    const { POST } = await photosRoute();
    const response = await POST(photoRequest(bytes, { contentType }));
    assert.equal(response.status, 415, `${label} must be rejected with 415`);
    assert.equal(callArgs("createPendingPhoto").length, 0, `${label} must not be stored`);
  }
});

test("POST /api/photos rejects a declared JPEG whose bytes are a non-allowlisted format", async () => {
  // GIF89a magic bytes declared as image/jpeg: the sniffed type is null
  // (GIF is not in the allowlist), so the container check answers 415.
  quotaOk();
  stub("createPendingPhoto", async () => photoFixture);
  const { POST } = await photosRoute();
  const gifBody = Uint8Array.from([...Array.from("GIF89a", (c) => c.charCodeAt(0)), ...new Uint8Array(24).fill(0)]);
  const response = await POST(photoRequest(gifBody, { contentType: "image/jpeg" }));
  assert.equal(response.status, 415);
  assert.equal(callArgs("createPendingPhoto").length, 0);
});

test("POST /api/photos fails closed on a zip-bomb JPEG (huge declared APP1) without crashing", async () => {
  // An APP1/EXIF segment declaring 0xFFFF bytes with only a few bytes behind
  // it: the segment walker refuses the truncated container (400) instead of
  // allocating/parsing the declared length. Verified: 400, nothing stored,
  // no 500.
  quotaOk();
  stub("createPendingPhoto", async () => photoFixture);
  const { POST } = await photosRoute();
  // SOI + APP1(length 0xFFFF, "Exif" + 2 bytes) + EOI — declared length far
  // beyond the actual body.
  const be16 = (value) => [(value >> 8) & 0xff, value & 0xff];
  const app1Bomb = Uint8Array.from([
    0xff, 0xd8, // SOI
    0xff, 0xe1, ...be16(0xffff), // APP1, declared length 65535
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0" + 2 bytes of payload
    0xff, 0xd9, // EOI
  ]);
  const response = await POST(photoRequest(app1Bomb));
  assert.equal(response.status, 400);
  const body = await responseBody(response);
  assert.match(body.error ?? "", /dimensions|could not be read/i);
  assert.equal(callArgs("createPendingPhoto").length, 0);
});

test("POST /api/photos fails closed on a zip-bomb PNG (huge declared chunk) without crashing", async () => {
  // A PNG whose eXIf chunk declares 0xFFFFFFFF bytes with a tiny real body:
  // IHDR parses fine, but the metadata strip refuses the truncated chunk
  // (400) — fail-closed, nothing stored.
  quotaOk();
  stub("createPendingPhoto", async () => photoFixture);
  const { POST } = await photosRoute();
  const be32 = (value) => [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Uint8Array.from([...be32(13), ...Array.from("IHDR", (c) => c.charCodeAt(0)), ...be32(64), ...be32(48), 8, 2, 0, 0, 0, 0, 0, 0, 0]);
  const exifBomb = Uint8Array.from([...be32(0xffffffff), ...Array.from("eXIf", (c) => c.charCodeAt(0)), 0x41]);
  const iend = Uint8Array.from([...be32(0), ...Array.from("IEND", (c) => c.charCodeAt(0)), 0, 0, 0, 0]);
  const bombPng = new Uint8Array([...signature, ...ihdr, ...exifBomb, ...iend]);
  const response = await POST(photoRequest(bombPng, { contentType: "image/png" }));
  assert.equal(response.status, 400);
  const body = await responseBody(response);
  assert.match(body.error ?? "", /metadata could not be verified/i);
  assert.equal(callArgs("createPendingPhoto").length, 0);
});

test("POST /api/photos treats a revoked or expired session cookie as anonymous", async () => {
  // A cookie whose token no longer resolves (logout revoked it, or it aged
  // past AUTH_SESSION_TTL_DAYS) must not fail the upload nor attribute it:
  // resolveOptionalContributor returns null → anonymous intake, no CSRF gate.
  quotaOk();
  stub("createPendingPhoto", async () => photoFixture);
  // findSessionByToken returning null = revoked/expired/unknown token.
  stub("findSessionByToken", async () => null);
  const { POST } = await photosRoute();
  const response = await POST(
    new Request("https://osdb.test/api/photos", {
      method: "POST",
      headers: {
        "content-type": "image/jpeg",
        cookie: "osdb_session=dead-session-token; osdb_csrf=stale-csrf",
        "x-csrf-token": "stale-csrf",
        origin: "https://osdb.test",
      },
      body: jpegBytes(),
    }),
  );
  assert.equal(response.status, 201);
  const received = callArgs("createPendingPhoto")[0][0];
  assert.equal(received.contributorId, null, "no attribution for a dead session");
  const key = callArgs("pendingPhotoUsage")[0][0];
  assert.match(key, /^anon:/, "dead session is bucketed as anonymous");
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
  assert.equal(response.headers.get("cache-control"), "no-store", "the approved-photo list must never be cached");
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

test("GET /api/photos answers 429 past the read bucket and records the block (audit t_5ca60ab2, P2)", async () => {
  // The list route was previously unthrottled; it now shares the read-family
  // bucket with GET /api/photos/[id] (READ_RATE_LIMIT_* knobs, default
  // 60/min). A scraper cannot lean on the JSON list to bypass the byte route.
  const rateLimit = await loadLibModule("rate-limit");
  // Earlier GET tests in this file already consumed the shared in-memory
  // "read" bucket (same caller key): start from a clean slate so the
  // 1/min cap is exercised exactly.
  rateLimit.resetRateLimitState();
  const envModule = await loadTreeModule("cloudflare-workers.mjs");
  const previous = envModule.env.READ_RATE_LIMIT_MAX;
  envModule.env.READ_RATE_LIMIT_MAX = "1";
  try {
    stub("getPublicCameraById", async () => ({ id: 5, status: "verified" }));
    stub("listApprovedPhotosForCamera", async () => []);
    const { GET } = await photosRoute();
    const allowed = await GET(apiRequest("/api/photos?cameraId=5"));
    assert.equal(allowed.status, 200, "the first call fits the 1/min cap");
    assert.equal(callArgs("listApprovedPhotosForCamera").length, 1);

    const blocked = await GET(apiRequest("/api/photos?cameraId=5"));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
    assert.equal(callArgs("listApprovedPhotosForCamera").length, 1, "the throttled call never reaches the db layer");
  } finally {
    envModule.env.READ_RATE_LIMIT_MAX = previous;
    rateLimit.resetRateLimitState();
  }
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

test("GET /api/photos/[id] serves the stored mimeType with safe headers and no attachment disposition", async () => {
  // The response Content-Type must mirror the photo's stored mimeType (not a
  // hard-coded default), and the photo is displayed inline: no
  // Content-Disposition header is set, so browsers render it rather than
  // downloading it. Cache/CSP/nosniff hardening is always present.
  for (const mimeType of ["image/jpeg", "image/png", "image/webp"]) {
    stub("readPublicPhotoBytes", async () => ({ bytes: new Uint8Array([0x00, 0x01, 0x02]), mimeType }));
    const { GET } = await photoItemRoute();
    const response = await GET(apiRequest("/api/photos/11"));
    assert.equal(response.status, 200, mimeType);
    assert.equal(response.headers.get("content-type"), mimeType, `content-type must be ${mimeType}`);
    assert.equal(response.headers.get("content-disposition"), null, "photos are served inline, never as an attachment");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cache-control"), "public, max-age=3600, immutable");
    assert.equal(response.headers.get("cache-tag"), "photo-11", "approved photo bytes carry their per-photo cache-tag for the future moderation purge");
    assert.match(response.headers.get("content-security-policy") ?? "", /sandbox/);
  }
});

test("GET /api/photos/[id] never serves non-image mimeTypes from storage", async () => {
  // Defense in depth: even if the db layer somehow returned a non-image
  // mimeType, the served Content-Type must not be a generic default — the
  // route passes the stored value through unchanged, and the intake pipeline
  // guarantees only allowlisted types reach storage.
  stub("readPublicPhotoBytes", async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "text/html" }));
  const { GET } = await photoItemRoute();
  const response = await GET(apiRequest("/api/photos/11"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html");
  assert.equal(response.headers.get("content-disposition"), null);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
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
