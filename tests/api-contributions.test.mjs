// Runtime API tests for the community profile contributions (ADR 0018 §3,
// COMMUNITY_PLAN §2.3, C2):
//   GET /api/auth/me/contributions  paginated own contributions + level meta
//   GET /api/auth/me                extended with the caller's level
// plus the pure trust-level derivation (app/lib/trust-levels.ts).
//
// P1-P8 pin the HTTP contract on the mocked db layer: guard order
// (URL length, auth rate limit, 401 anonymous, whitelist filters, pagination),
// the F0 canonical pagination object, the no-store cache header, and the
// fail-closed "only own data" rule (a cross-account contributorId is a 400,
// never resolved). L1-L8 pin the deriveLevel boundaries
// (0/1/4/5/19/20/49/50/51) and the monotonicity contract (up AND down), and
// prove no endpoint exposes anyone else's or a global level. The
// "only status='verified' counts" rule is verified against the REAL SQL on
// an in-memory D1 (countVerifiedCameras + listContributorContributions).
// All fixtures are fictional.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  apiRequest,
  cleanupRouteTree,
  loadLibModule,
  loadRoute,
  responseBody,
} from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";
import { applyDrizzleMigrations, cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";

let rateLimit;

beforeEach(async () => {
  resetMockState();
  if (!rateLimit) rateLimit = await loadLibModule("rate-limit");
  rateLimit.resetRateLimitState();
});

after(async () => {
  await cleanupRouteTree();
  await cleanupDbRuntime();
});

const contributionsRoute = () => loadRoute("app/api/auth/me/contributions/route.mjs");
const meRoute = () => loadRoute("app/api/auth/me/route.mjs");
const camerasRoute = () => loadRoute("app/api/cameras/route.mjs");

const contributor = {
  id: 7,
  email: "ada@example.org",
  displayName: "Ada",
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-01T08:00:00.000Z",
};

const session = {
  id: 1,
  contributorId: 7,
  tokenHash: "hash-of-raw-token",
  csrfToken: "csrf-token-123",
  createdAt: "2026-08-01T08:00:00.000Z",
  expiresAt: "2026-08-31T08:00:00.000Z",
  revokedAt: null,
};

function sessionRequest(pathAndQuery) {
  return apiRequest(pathAndQuery, {
    headers: { cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123" },
  });
}

const cameraContribution = {
  type: "camera",
  id: 12,
  title: "Station camera",
  issueType: null,
  cameraId: null,
  status: "verified",
  createdAt: "2026-08-01T09:00:00.000Z",
};

const correctionContribution = {
  type: "correction",
  id: 3,
  title: null,
  issueType: "inaccurate",
  cameraId: 12,
  status: "pending",
  createdAt: "2026-07-30T09:00:00.000Z",
};

const photoContribution = {
  type: "photo",
  id: 5,
  title: null,
  issueType: null,
  cameraId: 12,
  status: "approved",
  createdAt: "2026-07-29T09:00:00.000Z",
};

// ---------------------------------------------------------------------------
// P1-P8 — route contract (mocked db layer)
// ---------------------------------------------------------------------------

test("P1: contributions answers 401 without a session", async () => {
  const { GET } = await contributionsRoute();
  const response = await GET(apiRequest("/api/auth/me/contributions"));
  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).error, "Not authenticated.");
  assert.equal(callArgs("listContributorContributions").length, 0, "anonymous must not touch the database");
  assert.equal(callArgs("countVerifiedCameras").length, 0);
});

test("P2: contributions rejects an unknown type filter with 400", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  const { GET } = await contributionsRoute();
  const response = await GET(sessionRequest("/api/auth/me/contributions?type=video"));
  assert.equal(response.status, 400);
  assert.match((await responseBody(response)).error, /type must be one of/);
  assert.equal(callArgs("listContributorContributions").length, 0);
});

test("P3: contributions rejects an unknown status filter with 400", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  const { GET } = await contributionsRoute();
  const response = await GET(sessionRequest("/api/auth/me/contributions?status=published"));
  assert.equal(response.status, 400);
  assert.match((await responseBody(response)).error, /status must be one of/);
  assert.equal(callArgs("listContributorContributions").length, 0);
});

test("P4: contributions rejects invalid page/pageSize with 400", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  const { GET } = await contributionsRoute();
  for (const query of ["?page=0", "?page=abc", "?pageSize=0", "?pageSize=1.5"]) {
    const response = await GET(sessionRequest(`/api/auth/me/contributions${query}`));
    assert.equal(response.status, 400, `${query} must be rejected`);
    assert.match((await responseBody(response)).error, /page|pageSize/);
  }
  assert.equal(callArgs("listContributorContributions").length, 0);
});

test("P5: contributions refuses a cross-account contributorId with 400 (only own data)", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  const { GET } = await contributionsRoute();
  const response = await GET(sessionRequest("/api/auth/me/contributions?contributorId=99"));
  assert.equal(response.status, 400);
  assert.match((await responseBody(response)).error, /only serves the authenticated contributor/);
  assert.equal(callArgs("listContributorContributions").length, 0, "the foreign id must never be resolved");
});

test("P6: contributions returns the pagination object, no-store and the caller's level in the meta", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("listContributorContributions", async () => ({
    contributions: [cameraContribution, correctionContribution, photoContribution],
    total: 7,
  }));
  stub("countVerifiedCameras", async () => 7);
  const { GET } = await contributionsRoute();
  const response = await GET(sessionRequest("/api/auth/me/contributions?page=1&pageSize=25"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await responseBody(response);
  assert.deepEqual(body.contributions, [cameraContribution, correctionContribution, photoContribution]);
  assert.deepEqual(body.pagination, { page: 1, pageSize: 25, total: 7, totalPages: 1, hasMore: false });
  // 7 verified -> L2 (threshold 5), next threshold 20.
  assert.deepEqual(body.level, { level: 2, verifiedCount: 7, threshold: 5, nextThreshold: 20 });
  // The db layer was called with the caller's own id, not a foreign one.
  assert.deepEqual(callArgs("listContributorContributions")[0][0], 7);
});

test("P6b: pagination math across pages (hasMore, totalPages, offset)", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("listContributorContributions", async () => ({ contributions: [cameraContribution], total: 7 }));
  stub("countVerifiedCameras", async () => 7);
  const { GET } = await contributionsRoute();
  const response = await GET(sessionRequest("/api/auth/me/contributions?page=2&pageSize=5"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.pagination, { page: 2, pageSize: 5, total: 7, totalPages: 2, hasMore: false });
  // Offset for the db layer: (page-1)*pageSize = 5.
  const [, filters] = callArgs("listContributorContributions")[0];
  assert.equal(filters.offset, 5);
  assert.equal(filters.limit, 5);
});

test("P7: type/status filters are forwarded to the db layer after whitelist validation", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("listContributorContributions", async () => ({ contributions: [], total: 0 }));
  stub("countVerifiedCameras", async () => 0);
  const { GET } = await contributionsRoute();
  const response = await GET(sessionRequest("/api/auth/me/contributions?type=correction&status=pending&page=3&pageSize=10"));
  assert.equal(response.status, 200);
  const [, filters] = callArgs("listContributorContributions")[0];
  assert.equal(filters.type, "correction");
  assert.equal(filters.status, "pending");
  assert.equal(filters.limit, 10);
  assert.equal(filters.offset, 20);
});

test("P7b: absent filters mean all types and all statuses", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("listContributorContributions", async () => ({ contributions: [], total: 0 }));
  stub("countVerifiedCameras", async () => 0);
  const { GET } = await contributionsRoute();
  const response = await GET(sessionRequest("/api/auth/me/contributions"));
  assert.equal(response.status, 200);
  const [, filters] = callArgs("listContributorContributions")[0];
  assert.equal(filters.type, undefined);
  assert.equal(filters.status, undefined);
});

test("P8: contributions answers 503 when the database is unavailable", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("listContributorContributions", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await contributionsRoute();
  const response = await GET(sessionRequest("/api/auth/me/contributions"));
  assert.equal(response.status, 503);
});

test("P8b: pageSize is capped at 100 by the route (F0 contract)", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("listContributorContributions", async () => ({ contributions: [], total: 0 }));
  stub("countVerifiedCameras", async () => 0);
  const { GET } = await contributionsRoute();
  const response = await GET(sessionRequest("/api/auth/me/contributions?pageSize=500"));
  assert.equal(response.status, 200);
  const [, filters] = callArgs("listContributorContributions")[0];
  assert.equal(filters.limit, 100);
});

// ---------------------------------------------------------------------------
// L1-L8 — trust-level derivation (pure) + "no others'/global level" rule
// ---------------------------------------------------------------------------

test("L1: deriveLevel boundaries — 0/1/4/5/19/20/49/50/51", async () => {
  const { deriveLevel } = await loadLibModule("trust-levels");
  assert.equal(deriveLevel(0), 0, "L0 at 0");
  assert.equal(deriveLevel(1), 1, "L1 at 1");
  assert.equal(deriveLevel(4), 1, "still L1 just below 5");
  assert.equal(deriveLevel(5), 2, "L2 at 5");
  assert.equal(deriveLevel(19), 2, "still L2 just below 20");
  assert.equal(deriveLevel(20), 3, "L3 at 20");
  assert.equal(deriveLevel(49), 3, "still L3 just below 50");
  assert.equal(deriveLevel(50), 4, "L4 at 50");
  assert.equal(deriveLevel(51), 4, "L4 above 50");
});

test("L2: deriveLevel is monotone non-decreasing going UP (0..100)", async () => {
  const { deriveLevel } = await loadLibModule("trust-levels");
  let previous = deriveLevel(0);
  for (let count = 1; count <= 100; count += 1) {
    const level = deriveLevel(count);
    assert.ok(level >= previous, `level must never drop while count rises (count=${count})`);
    previous = level;
  }
});

test("L3: deriveLevel is monotone non-increasing going DOWN (100..0)", async () => {
  const { deriveLevel } = await loadLibModule("trust-levels");
  let previous = deriveLevel(100);
  for (let count = 99; count >= 0; count -= 1) {
    const level = deriveLevel(count);
    assert.ok(level <= previous, `level must never rise while count falls (count=${count})`);
    previous = level;
  }
});

test("L4: negative/garbage counts are clamped to L0 (fail-closed, never a level up)", async () => {
  const { deriveLevel } = await loadLibModule("trust-levels");
  assert.equal(deriveLevel(-1), 0);
  assert.equal(deriveLevel(NaN), 0);
  assert.equal(deriveLevel(Infinity), 0, "a corrupt/infinite count must not grant a high level");
});

test("L5: trustLevelMeta carries verifiedCount, threshold and nextThreshold (null at L4)", async () => {
  const { trustLevelMeta } = await loadLibModule("trust-levels");
  assert.deepEqual(trustLevelMeta(0), { level: 0, verifiedCount: 0, threshold: 0, nextThreshold: 1 });
  assert.deepEqual(trustLevelMeta(5), { level: 2, verifiedCount: 5, threshold: 5, nextThreshold: 20 });
  assert.deepEqual(trustLevelMeta(50), { level: 4, verifiedCount: 50, threshold: 50, nextThreshold: null });
  assert.deepEqual(trustLevelMeta(80), { level: 4, verifiedCount: 80, threshold: 50, nextThreshold: null });
});

test("L6: the public cameras list never exposes a level (no global/other level leak)", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [], total: 0, nextOffset: null }));
  stub("getPublicCameraFacets", async () => ({ kinds: [], freshness: { "7d": 0, "30d": 0, "90d": 0, all: 0 } }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.ok(!("level" in body), "public list must not carry a level field");
  assert.ok(!("levels" in body), "public list must not carry levels");
});

test("L7: the old submissions endpoint stays (backward compat) and carries no level", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("listContributorSubmissions", async () => [
    { id: 11, title: "Station camera", status: "pending", createdAt: "2026-08-01T09:00:00.000Z" },
  ]);
  const { GET } = await loadRoute("app/api/auth/me/submissions/route.mjs");
  const response = await GET(sessionRequest("/api/auth/me/submissions"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.submissions.length, 1);
  assert.ok(!("level" in body), "the legacy endpoint must not gain a level field");
});

test("L8: /api/auth/me exposes only the caller's own derived level", async () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("countVerifiedCameras", async () => 20);
  const { GET } = await meRoute();
  const response = await GET(sessionRequest("/api/auth/me"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.contributor.id, 7);
  assert.deepEqual(body.level, { level: 3, verifiedCount: 20, threshold: 20, nextThreshold: 50 });
});

// ---------------------------------------------------------------------------
// Real-SQL section: only status='verified' counts + the paginated UNION list
// ---------------------------------------------------------------------------

async function realDbFixture() {
  const runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  return { db, auth: runtime.auth };
}

let contributorSeq = 0;

// Raw INSERT of a contributor (email is unique per fixture) so the
// cameras/correction_requests/photos contributor_id foreign keys resolve.
async function insertContributor(db, overrides = {}) {
  contributorSeq += 1;
  const row = {
    email: `contrib-${contributorSeq}-${crypto.randomUUID()}@example.org`,
    displayName: null,
    passwordHash: "pbkdf2$210000$test$fixture",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
  const result = await db
    .prepare("INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(row.email, row.displayName, row.passwordHash, row.createdAt, row.updatedAt)
    .first();
  return result.id;
}

async function insertCamera(db, overrides = {}) {
  const row = {
    title: "Contribution camera",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    publishManufacturer: 0,
    publishObservedOn: 0,
    address: null,
    notes: "",
    latitude: 44.1,
    longitude: 12.2,
    status: "verified",
    source: "Community report",
    updated: "Test update",
    description: "",
    lastVerifiedAt: null,
    reviewDueAt: null,
    reviewIntervalMonths: 12,
    contributorId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
  const result = await db
    .prepare(
      `INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, status, source, updated, description, last_verified_at, review_due_at, review_interval_months, contributor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      row.title,
      row.kind,
      row.manufacturer,
      row.observedOn,
      row.publishManufacturer,
      row.publishObservedOn,
      row.address,
      row.notes,
      row.latitude,
      row.longitude,
      row.status,
      row.source,
      row.updated,
      row.description,
      row.lastVerifiedAt,
      row.reviewDueAt,
      row.reviewIntervalMonths,
      row.contributorId,
      row.createdAt,
    )
    .first();
  return result.id;
}

async function insertCorrection(db, overrides = {}) {
  const row = {
    cameraId: null,
    issueType: "inaccurate",
    message: "Wrong address",
    contact: null,
    status: "pending",
    contributorId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
  const result = await db
    .prepare(
      `INSERT INTO correction_requests (camera_id, issue_type, message, contact, status, contributor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(row.cameraId, row.issueType, row.message, row.contact, row.status, row.contributorId, row.createdAt)
    .first();
  return result.id;
}

async function insertPhoto(db, overrides = {}) {
  const row = {
    cameraId: null,
    contributorId: null,
    submitterKey: "contributor:7",
    storageKey: "opaque-key",
    mimeType: "image/jpeg",
    width: 800,
    height: 600,
    sizeBytes: 1024,
    status: "pending",
    exifStripped: 1,
    redactionConfirmed: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
  const result = await db
    .prepare(
      `INSERT INTO photos (camera_id, contributor_id, submitter_key, storage_key, mime_type, width, height, size_bytes, status, exif_stripped, redaction_confirmed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      row.cameraId,
      row.contributorId,
      row.submitterKey,
      row.storageKey,
      row.mimeType,
      row.width,
      row.height,
      row.sizeBytes,
      row.status,
      row.exifStripped,
      row.redactionConfirmed,
      row.createdAt,
      row.updatedAt,
    )
    .first();
  return result.id;
}

test("R1: countVerifiedCameras counts ONLY status='verified' rows (real SQL)", async () => {
  const { db, auth } = await realDbFixture();
  const contributorId = await insertContributor(db);
  await insertCamera(db, { contributorId, status: "verified", createdAt: "2026-07-01T00:00:00.000Z" });
  await insertCamera(db, { contributorId, status: "verified", createdAt: "2026-07-02T00:00:00.000Z" });
  await insertCamera(db, { contributorId, status: "pending", createdAt: "2026-07-03T00:00:00.000Z" });
  await insertCamera(db, { contributorId, status: "rejected", createdAt: "2026-07-04T00:00:00.000Z" });
  await insertCamera(db, { contributorId, status: "removed", createdAt: "2026-07-05T00:00:00.000Z" });
  await insertCamera(db, { contributorId, status: "needs_review", createdAt: "2026-07-06T00:00:00.000Z" });
  // Another contributor's verified row must not leak into the count.
  const otherId = await insertContributor(db);
  await insertCamera(db, { contributorId: otherId, status: "verified", createdAt: "2026-07-07T00:00:00.000Z" });
  assert.equal(await auth.countVerifiedCameras(contributorId), 2, "only the two verified rows of this contributor count");
});

test("R2: listContributorContributions returns the UNION of all three kinds, newest first", async () => {
  const { db, auth } = await realDbFixture();
  const contributorId = await insertContributor(db);
  const camId = await insertCamera(db, {
    contributorId,
    status: "verified",
    createdAt: "2026-08-01T10:00:00.000Z",
    title: "Oldest verified",
  });
  await insertCorrection(db, {
    contributorId,
    status: "pending",
    createdAt: "2026-08-01T11:00:00.000Z",
    cameraId: camId,
  });
  await insertPhoto(db, {
    contributorId,
    status: "approved",
    createdAt: "2026-08-01T12:00:00.000Z",
    cameraId: camId,
  });
  const page = await auth.listContributorContributions(contributorId, { limit: 10, offset: 0 });
  assert.equal(page.total, 3);
  assert.deepEqual(
    page.contributions.map((row) => row.type),
    ["photo", "correction", "camera"],
    "newest created_at first across kinds",
  );
  assert.equal(page.contributions[0].status, "approved");
  assert.equal(page.contributions[1].issueType, "inaccurate");
  assert.equal(page.contributions[2].title, "Oldest verified");
});

test("R3: listContributorContributions filters by type and status, and paginates", async () => {
  const { db, auth } = await realDbFixture();
  const contributorId = await insertContributor(db);
  await insertCamera(db, { contributorId, status: "verified", createdAt: "2026-08-01T10:00:00.000Z" });
  await insertCamera(db, { contributorId, status: "pending", createdAt: "2026-08-01T09:00:00.000Z" });
  await insertCorrection(db, { contributorId, status: "pending", createdAt: "2026-08-01T08:00:00.000Z" });
  await insertCorrection(db, { contributorId, status: "reviewed", createdAt: "2026-08-01T07:00:00.000Z" });

  const camerasOnly = await auth.listContributorContributions(contributorId, { type: "camera", limit: 10, offset: 0 });
  assert.equal(camerasOnly.total, 2);
  assert.ok(camerasOnly.contributions.every((row) => row.type === "camera"));

  const pendingOnly = await auth.listContributorContributions(contributorId, { status: "pending", limit: 10, offset: 0 });
  assert.equal(pendingOnly.total, 2);
  assert.ok(pendingOnly.contributions.every((row) => row.status === "pending"));

  const reviewedOnly = await auth.listContributorContributions(contributorId, { status: "reviewed", limit: 10, offset: 0 });
  assert.equal(reviewedOnly.total, 1);
  assert.equal(reviewedOnly.contributions[0].type, "correction");

  const page2 = await auth.listContributorContributions(contributorId, { limit: 2, offset: 2 });
  assert.equal(page2.total, 4);
  assert.equal(page2.contributions.length, 2);
});

test("R4: listContributorContributions never lists another contributor's rows", async () => {
  const { db, auth } = await realDbFixture();
  const contributorId = await insertContributor(db);
  const otherId = await insertContributor(db);
  await insertCamera(db, { contributorId: otherId, status: "verified", createdAt: "2026-08-01T10:00:00.000Z" });
  await insertCorrection(db, { contributorId: otherId, status: "pending", createdAt: "2026-08-01T09:00:00.000Z" });
  const page = await auth.listContributorContributions(contributorId, { limit: 10, offset: 0 });
  assert.equal(page.total, 0);
  assert.deepEqual(page.contributions, []);
});

test("R5: listContributorContributions clamps limit to [1,100] and offset to >= 0 at the db boundary", async () => {
  const { db, auth } = await realDbFixture();
  const contributorId = await insertContributor(db);
  await insertCamera(db, { contributorId, status: "verified", createdAt: "2026-08-01T10:00:00.000Z" });
  const huge = await auth.listContributorContributions(contributorId, { limit: 5000, offset: -5 });
  assert.equal(huge.contributions.length, 1);
  assert.equal(huge.total, 1);
  const tiny = await auth.listContributorContributions(contributorId, { limit: 0, offset: 0 });
  assert.equal(tiny.contributions.length, 1, "limit 0 falls back to the default");
});
