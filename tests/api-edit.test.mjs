/**
 * Runtime API tests for the two-track community edit flow (ADR 0018 §4, C3):
 *
 *   PATCH /api/cameras/[id]
 *     - pending records: direct owner-only UPDATE (200 owner view, no-store);
 *     - verified/needs_review/stale: camera_edit_requests diff row +
 *       moderation_queue row (entity camera_edit) -> 202 { editRequest };
 *     - removed/rejected: 409; non-owner on published: 403; anonymous
 *       records / non-owner on pending: 404 fail-closed; no-op: 200
 *       "no changes" with NO event (anti-farming); race: 409 (expectedUpdated
 *       precondition); whitelist violations: 400 per-field before any write;
 *       CSRF + same-origin + edit bucket (5/min); erasure de-attributes.
 *
 * Two layers, mirroring the C1 verification suites:
 *   - Part 1 (mocked db/camera-edits): pins the HTTP contract — guard order,
 *     401/403/404/409/429/503/200/202/400 mappings, no-store, whitelist
 *     400s, the independent `edit` rate-limit bucket.
 *   - Part 2 (real in-memory D1 + real db modules): pins the DB truths —
 *     owner pending edit writes the record + an `edit_applied` audit event,
 *     no-op writes nothing, the partial unique yields exactly one open
 *     edit-request per camera (concurrent PATCH race), approve applies the
 *     diff + `edit_applied`, approve is idempotent (no double apply), reject
 *     discards + `edit_rejected`, eraseContributor SET NULLs.
 *
 * No personal data: all fixtures are fictional; the clock is injected.
 */

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import {
  apiRequest,
  cleanupRouteTree,
  loadLibModule,
  loadRoute,
  loadTreeModule,
  responseBody,
} from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";
import { applyDrizzleMigrations, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";

let rateLimit;
let env;

async function sharedEnv() {
  return (await loadTreeModule("cloudflare-workers.mjs")).env;
}

beforeEach(async () => {
  resetMockState();
  if (!rateLimit) rateLimit = await loadLibModule("rate-limit");
  if (!env) env = await sharedEnv();
  rateLimit.resetRateLimitState();
  for (const key of Object.keys(env)) {
    if (key.startsWith("EDIT_") || key.startsWith("CONFIRM_")) delete env[key];
  }
});

after(async () => cleanupRouteTree());

const cameraEditRoute = () => loadRoute("app/api/cameras/[id]/route.mjs");

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

const ownerView = {
  id: 5,
  title: "Corner shop entrance",
  kind: "Fixed dome",
  manufacturer: "Acme Cameras",
  observedOn: "2026-07-01",
  publishManufacturer: 0,
  publishObservedOn: 0,
  address: "Via Roma 1",
  notes: "Private note",
  latitude: 41.9005,
  longitude: 12.4937,
  status: "pending",
  source: "Community report",
  updated: "Community edit",
  description: "",
  lastVerifiedAt: null,
  reviewDueAt: null,
  reviewIntervalMonths: 12,
  contributorId: 7,
  createdAt: "2026-08-01T08:00:00.000Z",
};

function sessionRequest(pathAndQuery, { headers = {}, ...rest } = {}) {
  return apiRequest(pathAndQuery, {
    ...rest,
    headers: {
      cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      ...headers,
    },
  });
}

const authedPatch = (pathAndQuery, body, { headers = {}, ...rest } = {}) =>
  sessionRequest(pathAndQuery, {
    method: "PATCH",
    headers: { "x-csrf-token": "csrf-token-123", ...headers },
    body,
    ...rest,
  });

function liveSession() {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
}

// ---------------------------------------------------------------------------
// Part 1 — route contract (mocked db/camera-edits)
// ---------------------------------------------------------------------------

test("E1 guard order: anonymous answers 401 before any db work", async () => {
  const { PATCH } = await cameraEditRoute();
  const response = await PATCH(apiRequest("/api/cameras/5", {
    method: "PATCH",
    body: { title: "New title" },
  }));
  assert.equal(response.status, 401);
  assert.equal(callArgs("applyCameraEdit").length, 0);
});

test("E1 guard order: missing/wrong CSRF answers 403", async (t) => {
  const { PATCH } = await cameraEditRoute();
  await t.test("missing header", async () => {
    liveSession();
    const response = await PATCH(sessionRequest("/api/cameras/5", {
      method: "PATCH",
      body: { title: "New title" },
    }));
    assert.equal(response.status, 403);
    assert.equal(callArgs("applyCameraEdit").length, 0);
  });
  await t.test("wrong header", async () => {
    liveSession();
    const response = await PATCH(sessionRequest("/api/cameras/5", {
      method: "PATCH",
      headers: { "x-csrf-token": "wrong-token" },
      body: { title: "New title" },
    }));
    assert.equal(response.status, 403);
    assert.equal(callArgs("applyCameraEdit").length, 0);
  });
});

test("E1 guard order: cross-origin rejected before any db work", async () => {
  const { PATCH } = await cameraEditRoute();
  const response = await PATCH(apiRequest("/api/cameras/5", {
    method: "PATCH",
    headers: { origin: "https://evil.test" },
    body: { title: "New title" },
  }));
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "Cross-origin request rejected.");
  assert.equal(callArgs("applyCameraEdit").length, 0);
});

// ---------------------------------------------------------------------------
// C6 — GET /api/cameras/[id]/edit (owner-only view for /records/[id]/edit)
// ---------------------------------------------------------------------------

const editViewRoute = () => loadRoute("app/api/cameras/[id]/edit/route.mjs");

const editRequestFixture = {
  id: 12,
  cameraId: 5,
  status: "pending",
  createdAt: "2026-08-01T12:00:00.000Z",
};

test("C6 GET edit view: anonymous answers 401 before any db work", async () => {
  const { GET } = await editViewRoute();
  const response = await GET(apiRequest("/api/cameras/5/edit"));
  assert.equal(response.status, 401);
  assert.equal((await responseBody(response)).error, "Not authenticated.");
  assert.equal(callArgs("getCameraEditView").length, 0);
});

test("C6 GET edit view: owner answers 200 { record, editRequest } with no-store", async () => {
  liveSession();
  stub("getCameraEditView", async () => ({ kind: "ok", record: ownerView, editRequest: editRequestFixture }));
  const { GET } = await editViewRoute();
  const response = await GET(sessionRequest("/api/cameras/5/edit"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { record: ownerView, editRequest: editRequestFixture });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const [id, contributorId] = callArgs("getCameraEditView")[0];
  assert.equal(id, 5);
  assert.equal(contributorId, 7);
});

test("C6 GET edit view: owner with no open edit-request answers 200 with editRequest null", async () => {
  liveSession();
  stub("getCameraEditView", async () => ({ kind: "ok", record: ownerView, editRequest: null }));
  const { GET } = await editViewRoute();
  const response = await GET(sessionRequest("/api/cameras/5/edit"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.editRequest, null);
  assert.equal(body.record.id, 5);
});

test("C6 GET edit view: non-owner on a published record answers 403", async () => {
  liveSession();
  stub("getCameraEditView", async () => ({ kind: "not_owner" }));
  const { GET } = await editViewRoute();
  const response = await GET(sessionRequest("/api/cameras/5/edit"));
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "You can only edit your own reports.");
});

test("C6 GET edit view: missing/pending-not-owned records answer 404 fail-closed", async () => {
  liveSession();
  stub("getCameraEditView", async () => ({ kind: "not_found" }));
  const { GET } = await editViewRoute();
  const response = await GET(sessionRequest("/api/cameras/9/edit"));
  assert.equal(response.status, 404);
  assert.equal((await responseBody(response)).error, "Camera not found.");
});

test("C6 GET edit view: malformed id answers 404 and never reaches the db layer", async () => {
  liveSession();
  const { GET } = await editViewRoute();
  for (const path of ["/api/cameras/abc/edit", "/api/cameras/0/edit", "/api/cameras/-1/edit"]) {
    const response = await GET(sessionRequest(path));
    assert.equal(response.status, 404, `${path} must answer 404`);
    assert.equal((await responseBody(response)).error, "Camera not found.");
  }
  assert.equal(callArgs("getCameraEditView").length, 0);
});

test("C6 GET edit view: answers 503 when the db layer is unavailable", async () => {
  liveSession();
  stub("getCameraEditView", async () => {
    throw new Error("boom");
  });
  const { GET } = await editViewRoute();
  const response = await GET(sessionRequest("/api/cameras/5/edit"));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Database unavailable");
});

test("C6 GET edit view: the shared read bucket rate-limits the view (429)", async () => {
  liveSession();
  env.READ_RATE_LIMIT_MAX = "2";
  env.READ_RATE_LIMIT_WINDOW_SECONDS = "60";
  stub("getCameraEditView", async () => ({ kind: "ok", record: ownerView, editRequest: null }));
  const { GET } = await editViewRoute();
  for (let i = 0; i < 2; i++) {
    const response = await GET(sessionRequest("/api/cameras/5/edit"));
    assert.equal(response.status, 200, `request ${i + 1} must pass`);
  }
  const third = await GET(sessionRequest("/api/cameras/5/edit"));
  assert.equal(third.status, 429);
  assert.equal((await responseBody(third)).error, "Too many requests. Please try again shortly.");
});

test("E2 owner pending edit answers 200 with the owner view, no-store", async () => {
  liveSession();
  stub("applyCameraEdit", async () => ({ kind: "direct_applied", record: ownerView }));
  const { PATCH } = await cameraEditRoute();
  const response = await PATCH(authedPatch("/api/cameras/5", { title: "New title" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { record: ownerView, changed: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const [input] = callArgs("applyCameraEdit")[0];
  assert.equal(input.cameraId, 5);
  assert.equal(input.contributorId, 7);
  assert.deepEqual(input.fields, { title: "New title" });
});

test("E7 no-op edit answers 200 changed:false with no event (anti-farming)", async () => {
  liveSession();
  stub("applyCameraEdit", async () => ({ kind: "no_changes" }));
  const { PATCH } = await cameraEditRoute();
  const response = await PATCH(authedPatch("/api/cameras/5", { title: "Same title" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { error: "No changes were made.", changed: false });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("E2 pending fail-closed: anonymous records and non-owners map to 404", async (t) => {
  const { PATCH } = await cameraEditRoute();
  for (const kind of ["camera_not_found", "not_found"]) {
    await t.test(kind, async () => {
      liveSession();
      stub("applyCameraEdit", async () => ({ kind }));
      const response = await PATCH(authedPatch("/api/cameras/9", { title: "New title" }));
      assert.equal(response.status, 404);
      assert.equal((await responseBody(response)).error, "Camera not found.");
    });
  }
});

test("E2 moderator/non-owner on a published record answers 403", async () => {
  liveSession();
  stub("applyCameraEdit", async () => ({ kind: "not_owner" }));
  const { PATCH } = await cameraEditRoute();
  const response = await PATCH(authedPatch("/api/cameras/5", { title: "New title" }));
  assert.equal(response.status, 403);
  assert.equal((await responseBody(response)).error, "You can only edit your own reports.");
});

test("E4 removed/rejected records answer 409 blocked", async () => {
  liveSession();
  stub("applyCameraEdit", async () => ({ kind: "status_blocked" }));
  const { PATCH } = await cameraEditRoute();
  const response = await PATCH(authedPatch("/api/cameras/5", { title: "New title" }));
  assert.equal(response.status, 409);
  assert.equal((await responseBody(response)).error, "Records in this state cannot be edited.");
});

test("E3 verified record edit answers 202 with the editRequest payload", async () => {
  liveSession();
  stub("applyCameraEdit", async () => ({
    kind: "edit_request_created",
    editRequest: { id: 12, cameraId: 5, status: "pending", createdAt: "2026-08-01T12:00:00.000Z" },
  }));
  const { PATCH } = await cameraEditRoute();
  const response = await PATCH(authedPatch("/api/cameras/5", { title: "New title" }));
  assert.equal(response.status, 202);
  assert.deepEqual(await responseBody(response), {
    editRequest: { id: 12, cameraId: 5, status: "pending", createdAt: "2026-08-01T12:00:00.000Z" },
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("E8 race and one-open-per-camera both answer 409", async (t) => {
  const { PATCH } = await cameraEditRoute();
  await t.test("race (precondition)", async () => {
    liveSession();
    stub("applyCameraEdit", async () => ({ kind: "race" }));
    const response = await PATCH(authedPatch("/api/cameras/5", { title: "New", expectedUpdated: "old-value" }));
    assert.equal(response.status, 409);
    assert.match((await responseBody(response)).error, /changed since you loaded/i);
  });
  await t.test("edit_request_exists", async () => {
    liveSession();
    stub("applyCameraEdit", async () => ({ kind: "edit_request_exists" }));
    const response = await PATCH(authedPatch("/api/cameras/5", { title: "New" }));
    assert.equal(response.status, 409);
    assert.match((await responseBody(response)).error, /already pending/i);
  });
});

test("E5 non-editable fields answer 400 per-field before any write", async (t) => {
  const { PATCH } = await cameraEditRoute();
  const forbidden = [
    ["status", { status: "verified" }],
    ["contributorId", { contributorId: 99 }],
    ["source", { source: "spoofed" }],
    ["publishManufacturer", { publishManufacturer: true }],
    ["publishObservedOn", { publishObservedOn: true }],
    ["lastVerifiedAt", { lastVerifiedAt: "2026-01-01T00:00:00.000Z" }],
    ["reviewDueAt", { reviewDueAt: "2026-01-01T00:00:00.000Z" }],
    ["latitude", { latitude: 41.9 }],
  ];
  for (const [field, body] of forbidden) {
    await t.test(field, async () => {
      liveSession();
      const response = await PATCH(authedPatch("/api/cameras/5", body));
      assert.equal(response.status, 400, `${field} must be rejected`);
      assert.equal((await responseBody(response)).error, `Field "${field}" is not editable.`);
      // Per-field, no partial effects: the db layer is never reached.
      assert.equal(callArgs("applyCameraEdit").length, 0);
    });
  }
});

test("E5 editable-field validation: limits, dates, types", async (t) => {
  const { PATCH } = await cameraEditRoute();
  await t.test("title over 90 chars", async () => {
    liveSession();
    const response = await PATCH(authedPatch("/api/cameras/5", { title: "x".repeat(91) }));
    assert.equal(response.status, 400);
  });
  await t.test("title empty", async () => {
    liveSession();
    const response = await PATCH(authedPatch("/api/cameras/5", { title: "  " }));
    assert.equal(response.status, 400);
  });
  await t.test("kind over 60 chars", async () => {
    liveSession();
    const response = await PATCH(authedPatch("/api/cameras/5", { kind: "x".repeat(61) }));
    assert.equal(response.status, 400);
  });
  await t.test("notes over 1000 chars", async () => {
    liveSession();
    const response = await PATCH(authedPatch("/api/cameras/5", { notes: "x".repeat(1001) }));
    assert.equal(response.status, 400);
  });
  await t.test("observedOn not a date", async () => {
    liveSession();
    const response = await PATCH(authedPatch("/api/cameras/5", { observedOn: "not-a-date" }));
    assert.equal(response.status, 400);
  });
  await t.test("observedOn invalid calendar date", async () => {
    liveSession();
    const response = await PATCH(authedPatch("/api/cameras/5", { observedOn: "2026-02-31" }));
    assert.equal(response.status, 400);
  });
  await t.test("non-string value", async () => {
    liveSession();
    const response = await PATCH(authedPatch("/api/cameras/5", { title: 42 }));
    assert.equal(response.status, 400);
  });
  await t.test("empty body", async () => {
    liveSession();
    const response = await PATCH(authedPatch("/api/cameras/5", {}));
    assert.equal(response.status, 400);
  });
  await t.test("array body", async () => {
    liveSession();
    const response = await PATCH(authedPatch("/api/cameras/5", ["title"]));
    assert.equal(response.status, 400);
  });
  await t.test("all db calls stayed zero", () => {
    assert.equal(callArgs("applyCameraEdit").length, 0);
  });
});

test("E5 clearing a nullable field is a valid edit and reaches the db layer", async () => {
  liveSession();
  stub("applyCameraEdit", async () => ({ kind: "direct_applied", record: ownerView }));
  const { PATCH } = await cameraEditRoute();
  const response = await PATCH(authedPatch("/api/cameras/5", { address: "" }));
  assert.equal(response.status, 200);
  const [input] = callArgs("applyCameraEdit")[0];
  assert.equal(input.fields.address, null, "empty address clears the field (null)");
});

test("E9 malformed ids answer 404 and never reach the db layer", async (t) => {
  const { PATCH } = await cameraEditRoute();
  for (const id of ["abc", "0", "-1", "1e3"]) {
    await t.test(id, async () => {
      liveSession();
      const response = await PATCH(authedPatch(`/api/cameras/${id}`, { title: "New" }));
      assert.equal(response.status, 404);
      assert.equal(callArgs("applyCameraEdit").length, 0);
    });
  }
});

test("E9 the edit bucket is 5/min and independent of the confirm bucket", async () => {
  env.EDIT_RATE_LIMIT_MAX = "2";
  env.EDIT_RATE_LIMIT_WINDOW_SECONDS = "60";
  liveSession();
  stub("applyCameraEdit", async () => ({ kind: "direct_applied", record: ownerView }));
  const { PATCH } = await cameraEditRoute();

  const first = await PATCH(authedPatch("/api/cameras/5", { title: "One" }));
  assert.equal(first.status, 200);
  const second = await PATCH(authedPatch("/api/cameras/5", { title: "Two" }));
  assert.equal(second.status, 200);
  const blocked = await PATCH(authedPatch("/api/cameras/5", { title: "Three" }));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(blocked.headers.get("cache-control"), "no-store");

  // The edit bucket is separate from the confirm bucket: a verification
  // toggle still passes while the edit bucket is exhausted.
  const confirmEnv = { ...env, CONFIRM_RATE_LIMIT_MAX: "30", CONFIRM_RATE_LIMIT_WINDOW_SECONDS: "60" };
  assert.equal(
    rateLimit.checkRateLimit("confirm", "caller", rateLimit.limitsFor("confirm", confirmEnv)).allowed,
    true,
    "the confirm bucket must be unaffected by edit-bucket exhaustion",
  );
});

test("E6 CSRF: a wrong token on a valid body answers 403 and never reaches the db", async () => {
  liveSession();
  const { PATCH } = await cameraEditRoute();
  const response = await PATCH(sessionRequest("/api/cameras/5", {
    method: "PATCH",
    headers: { "x-csrf-token": "stale-token" },
    body: { title: "New" },
  }));
  assert.equal(response.status, 403);
  assert.equal(callArgs("applyCameraEdit").length, 0);
});

test("route answers 503 when the db layer is unavailable", async () => {
  liveSession();
  stub("applyCameraEdit", async () => {
    throw new Error("Database binding unavailable");
  });
  const { PATCH } = await cameraEditRoute();
  const response = await PATCH(authedPatch("/api/cameras/5", { title: "New" }));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Database unavailable");
});

// ---------------------------------------------------------------------------
// Part 2 — real db layer against in-memory D1 (SQL truths, E1/E3/E7/E8/E10)
// ---------------------------------------------------------------------------

const NOW = "2026-08-01T12:00:00.000Z";

let runtime;
let db;
let cameraEdits;
let moderation;
let auth;

async function freshDb() {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  cameraEdits = runtime.cameraEdits;
  moderation = runtime.moderation;
  auth = runtime.auth;
}

let contributorSeq = 0;

async function insertContributor(overrides = {}) {
  contributorSeq += 1;
  const row = {
    email: `edit-contrib-${contributorSeq}-${crypto.randomUUID()}@example.org`,
    displayName: null,
    passwordHash: "pbkdf2$210000$test$fixture",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
  return (await db
    .prepare("INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(row.email, row.displayName, row.passwordHash, row.createdAt, row.updatedAt)
    .first()).id;
}

async function insertCamera(overrides = {}) {
  const row = {
    title: "Edit-flow camera",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    publishManufacturer: 0,
    publishObservedOn: 0,
    address: null,
    notes: "",
    latitude: 44.1,
    longitude: 12.2,
    status: "pending",
    source: "Community report",
    updated: "Submitted just now",
    description: "",
    lastVerifiedAt: null,
    reviewDueAt: null,
    reviewIntervalMonths: 12,
    contributorId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
  return (await db
    .prepare(
      `INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, status, source, updated, description, last_verified_at, review_due_at, review_interval_months, contributor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      row.title, row.kind, row.manufacturer, row.observedOn, row.publishManufacturer, row.publishObservedOn,
      row.address, row.notes, row.latitude, row.longitude, row.status, row.source, row.updated, row.description,
      row.lastVerifiedAt, row.reviewDueAt, row.reviewIntervalMonths, row.contributorId, row.createdAt,
    )
    .first()).id;
}

async function moderationEventCount(entity, entityId, action) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM moderation_events WHERE entity = ? AND entity_id = ? AND action = ?")
    .bind(entity, entityId, action)
    .first();
  return Number(row.n);
}

async function queueRowCount(entity, entityId) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM moderation_queue WHERE entity = ? AND entity_id = ? AND state != 'closed'")
    .bind(entity, entityId)
    .first();
  return Number(row.n);
}

test("E1 real SQL: owner pending edit updates the record and records an edit_applied audit event", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const cameraId = await insertCamera({ contributorId: ownerId, title: "Old title" });

  const result = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId,
    fields: { title: "New title", notes: "Updated note" },
    now: NOW,
  });
  assert.equal(result.kind, "direct_applied");
  assert.equal(result.record.title, "New title");
  assert.equal(result.record.notes, "Updated note");
  // P1-2: an applied edit writes the injected clock into `updated`, never a
  // prose label ("Community edit" was a non-ISO value that broke ordering).
  assert.equal(result.record.updated, NOW);

  const row = await db.prepare("SELECT title, notes FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(row.title, "New title");
  assert.equal(row.notes, "Updated note");
  // Audit trail: exactly one edit_applied event for the camera.
  assert.equal(await moderationEventCount("camera", cameraId, "edit_applied"), 1);
});

test("E1 real SQL: non-owner and anonymous-record edits answer not_found (fail-closed)", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const otherId = await insertContributor();
  const cameraId = await insertCamera({ contributorId: ownerId });
  const anonymousCameraId = await insertCamera({ contributorId: null });

  const other = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: otherId, fields: { title: "Hijack" }, now: NOW,
  });
  assert.equal(other.kind, "not_found", "another contributor must not learn the pending record exists");
  assert.equal(await moderationEventCount("camera", cameraId, "edit_applied"), 0);

  const anonymous = await cameraEdits.applyCameraEdit({
    cameraId: anonymousCameraId, contributorId: ownerId, fields: { title: "Hijack" }, now: NOW,
  });
  assert.equal(anonymous.kind, "not_found", "an anonymous record has no owner");
  assert.equal(await moderationEventCount("camera", anonymousCameraId, "edit_applied"), 0);
});

test("E7 real SQL: a no-op pending edit writes nothing (no event, anti-farming)", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const cameraId = await insertCamera({ contributorId: ownerId, title: "Same title", notes: "Same notes" });

  const result = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId,
    fields: { title: "Same title", notes: "Same notes" },
    now: NOW,
  });
  assert.equal(result.kind, "no_changes");
  assert.equal(await moderationEventCount("camera", cameraId, "edit_applied"), 0);
});

test("E8 real SQL: a stale expectedUpdated precondition answers race and never overwrites", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const cameraId = await insertCamera({ contributorId: ownerId, updated: "Submitted just now" });

  const result = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId,
    fields: { title: "New title" },
    expectedUpdated: "stale-value",
    now: NOW,
  });
  assert.equal(result.kind, "race");
  const row = await db.prepare("SELECT title FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(row.title, "Edit-flow camera", "the record must stay untouched on a race");
});

test("E3 real SQL: published-record edit creates the diff + moderation_queue row, cameras untouched", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const cameraId = await insertCamera({
    contributorId: ownerId, status: "verified", title: "Old title", lastVerifiedAt: NOW, reviewDueAt: "2027-08-01T00:00:00.000Z",
  });

  const result = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId,
    fields: { title: "New title", manufacturer: "Acme" },
    now: NOW,
  });
  assert.equal(result.kind, "edit_request_created");
  assert.equal(result.editRequest.cameraId, cameraId);
  assert.equal(result.editRequest.status, "pending");
  assert.equal(result.editRequest.createdAt, NOW);

  const camera = await db.prepare("SELECT title FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.title, "Old title", "cameras must not be mutated by the edit request");

  const request = await db
    .prepare("SELECT proposed_title AS proposedTitle, proposed_manufacturer AS proposedManufacturer, proposed_kind AS proposedKind FROM camera_edit_requests WHERE id = ?")
    .bind(result.editRequest.id)
    .first();
  assert.equal(request.proposedTitle, "New title");
  assert.equal(request.proposedManufacturer, "Acme");
  assert.equal(request.proposedKind, null, "unchanged columns stay NULL (explicit per-column diff)");
  assert.equal(await queueRowCount("camera_edit", result.editRequest.id), 1);
});

test("E3 real SQL: approve applies the diff and records edit_applied, queue closes", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const cameraId = await insertCamera({
    contributorId: ownerId, status: "verified", title: "Old title", notes: "Old notes",
    lastVerifiedAt: NOW, reviewDueAt: "2027-08-01T00:00:00.000Z",
  });
  const created = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId,
    fields: { title: "New title", notes: "New notes" },
    now: NOW,
  });

  // Reviewers: seed the demo identities so reviewer id 2 (record_reviewer)
  // exists — approve is reserved to record_reviewer/senior_moderator.
  db.exec(`
    INSERT INTO users (id, email, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES
      (2, 'record@osdb.test', 'Demo Record Reviewer', 'moderator', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    INSERT INTO reviewers (id, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES
      (2, 'Demo Record Reviewer', 'record_reviewer', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');
  `);

  const decided = await moderation.moderateCameraEdit(
    created.editRequest.id, "approve", "verified-public-infrastructure", null,
    { actorId: 2 },
  );
  assert.equal(decided.kind, "ok");
  assert.equal(decided.event.action, "edit_applied");
  assert.equal(decided.event.newStatus, "approved");

  const camera = await db.prepare("SELECT title, notes FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.title, "New title");
  assert.equal(camera.notes, "New notes");

  const request = await db.prepare("SELECT status, decided_by AS decidedBy, decided_at AS decidedAt FROM camera_edit_requests WHERE id = ?").bind(created.editRequest.id).first();
  assert.equal(request.status, "approved");
  assert.equal(request.decidedBy, 2);
  assert.ok(request.decidedAt);
  assert.equal(await queueRowCount("camera_edit", created.editRequest.id), 0, "the queue row must be closed");
});

test("E3 real SQL: approve is idempotent — a second approve never re-applies or double-logs", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const cameraId = await insertCamera({
    contributorId: ownerId, status: "verified", title: "Old title",
    lastVerifiedAt: NOW, reviewDueAt: "2027-08-01T00:00:00.000Z",
  });
  const created = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId, fields: { title: "New title" }, now: NOW,
  });
  db.exec(`
    INSERT INTO users (id, email, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES
      (2, 'record@osdb.test', 'Demo Record Reviewer', 'moderator', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    INSERT INTO reviewers (id, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES
      (2, 'Demo Record Reviewer', 'record_reviewer', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');
  `);

  const first = await moderation.moderateCameraEdit(created.editRequest.id, "approve", "verified-public-infrastructure", null, { actorId: 2 });
  assert.equal(first.kind, "ok");
  const second = await moderation.moderateCameraEdit(created.editRequest.id, "approve", "verified-public-infrastructure", null, { actorId: 2 });
  assert.equal(second.kind, "ok", "re-approving an approved request must stay ok (idempotent)");

  assert.equal(await moderationEventCount("camera_edit", created.editRequest.id, "edit_applied"), 1, "exactly one edit_applied event");
  const camera = await db.prepare("SELECT title FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.title, "New title", "the diff was applied exactly once");
});

test("E3 real SQL: reject discards the diff and records edit_rejected", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const cameraId = await insertCamera({
    contributorId: ownerId, status: "verified", title: "Old title",
    lastVerifiedAt: NOW, reviewDueAt: "2027-08-01T00:00:00.000Z",
  });
  const created = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId, fields: { title: "New title" }, now: NOW,
  });
  db.exec(`
    INSERT INTO users (id, email, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES
      (2, 'record@osdb.test', 'Demo Record Reviewer', 'moderator', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    INSERT INTO reviewers (id, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES
      (2, 'Demo Record Reviewer', 'record_reviewer', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');
  `);

  const decided = await moderation.moderateCameraEdit(created.editRequest.id, "reject", "inaccurate-or-outdated", "Not verifiable", { actorId: 2 });
  assert.equal(decided.kind, "ok");
  assert.equal(decided.event.action, "edit_rejected");

  const camera = await db.prepare("SELECT title FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.title, "Old title", "reject must never touch the camera");
  const request = await db.prepare("SELECT status, decision_note AS decisionNote FROM camera_edit_requests WHERE id = ?").bind(created.editRequest.id).first();
  assert.equal(request.status, "rejected");
  assert.equal(request.decisionNote, "Not verifiable");
  assert.equal(await moderationEventCount("camera_edit", created.editRequest.id, "edit_rejected"), 1);
});

test("E4 real SQL: removed/rejected records answer status_blocked", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  for (const status of ["removed", "rejected"]) {
    const cameraId = await insertCamera({ contributorId: ownerId, status });
    const result = await cameraEdits.applyCameraEdit({
      cameraId, contributorId: ownerId, fields: { title: "New title" }, now: NOW,
    });
    assert.equal(result.kind, "status_blocked", `${status} must block edits`);
  }
});

test("E3 real SQL: the partial unique yields exactly one open edit-request per camera (race)", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const cameraId = await insertCamera({
    contributorId: ownerId, status: "verified", title: "Old title",
    lastVerifiedAt: NOW, reviewDueAt: "2027-08-01T00:00:00.000Z",
  });

  const first = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId, fields: { title: "First" }, now: NOW,
  });
  assert.equal(first.kind, "edit_request_created");
  // A second, concurrent-looking PATCH for the same camera loses the race.
  const second = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId, fields: { title: "Second" }, now: NOW,
  });
  assert.equal(second.kind, "edit_request_exists");
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM camera_edit_requests WHERE camera_id = ? AND status = 'pending'")
    .bind(cameraId)
    .first();
  assert.equal(Number(count.n), 1, "exactly one open request must survive the race");
});

test("E10 real SQL: eraseContributor de-attributes pending and decided edit requests", async () => {
  await freshDb();
  const ownerId = await insertContributor();
  const cameraId = await insertCamera({
    contributorId: ownerId, status: "verified", title: "Old title",
    lastVerifiedAt: NOW, reviewDueAt: "2027-08-01T00:00:00.000Z",
  });
  const created = await cameraEdits.applyCameraEdit({
    cameraId, contributorId: ownerId, fields: { title: "New title" }, now: NOW,
  });
  assert.equal(created.kind, "edit_request_created");

  const erasure = await auth.eraseContributor(ownerId);
  assert.ok(erasure.ok ?? erasure.deleted);

  const row = await db
    .prepare("SELECT contributor_id AS contributorId FROM camera_edit_requests WHERE id = ?")
    .bind(created.editRequest.id)
    .first();
  assert.equal(row.contributorId, null, "erasure must SET NULL the edit-request attribution");
  const camera = await db.prepare("SELECT contributor_id AS contributorId FROM cameras WHERE id = ?").bind(cameraId).first();
  assert.equal(camera.contributorId, null, "the camera is de-attributed, never deleted");
});
