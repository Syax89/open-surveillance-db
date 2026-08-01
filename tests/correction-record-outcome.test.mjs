// QA contract — H1: correction-request → record outcome for moderators.
//
// Contract source: docs/FUTURE_ROADMAP.md (Horizon 1), docs/workstreams/DATA_TRUST.md,
// docs/DATA_MODEL.md. Full spec: see task t_f00aa65e workspace QA_SPEC_correction_record_outcome.md.
//
// PATCH /api/moderation, entity=correction:
//   { entity: "correction", id, action: "approve"|"reject"|"associate"|"escalate",
//     reasonCode, note?, outcome?, cameraId?, actorId }
//
//   - outcome  (string, ONLY with "approve"): kept|corrected|marked-stale|removed|escalated
//   - cameraId (positive integer, optional on ANY correction action): links/re-links the
//     request to a record, persisted on correction_requests.camera_id
//   - associate: new action; REQUIRES cameraId; links a pending request to a record without
//     deciding; db layer writes an audit event with action='associate'
//   - db call: moderateCorrection(id, action, reasonCode, note, options?, context?) with
//     options = { outcome?, cameraId? } (undefined when both are absent) and
//     context = { actorId, sensitivity?, assigneeId?, recused?, requiresSecondReview? }
//   - malformed payloads → 400 and no db writes.
//
// Wave B (Data & Trust): every decision is attributed to a named reviewer
// (actorId) and the route maps the db-layer discriminated result to a stable
// HTTP status (see docs/workstreams/DATA_TRUST.md "Queue and decisions").

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { apiRequest as publicRequest, cleanupRouteTree, loadRoute, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFile(path.join(root, relativePath), "utf8");

// Route-level authz (ADR 0014): protected routes derive the acting reviewer
// from the authenticated identity header. This mock-based suite acts as the
// Demo Record Reviewer (moderator coarse role, reviewer id 2) unless a test
// overrides the stub.
const moderatorUser = {
  id: 2,
  email: "record@osdb.test",
  displayName: "Demo Record Reviewer",
  role: "moderator",
  active: 1,
  mfaEnabled: 0,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const moderatorReviewer = { id: 2, displayName: "Demo Record Reviewer", role: "record_reviewer", active: 1 };
const authRequest = (path, opts = {}) =>
  publicRequest(path, { ...opts, headers: { "x-osdb-user-email": moderatorUser.email, ...(opts.headers ?? {}) } });
const stubModeratorAuth = () => {
  stub("getUserByEmail", async (email) => (email === moderatorUser.email ? moderatorUser : null));
  stub("getReviewerByUserId", async () => moderatorReviewer);
};

beforeEach(() => {
  resetMockState();
  stubModeratorAuth();
});
after(async () => cleanupRouteTree());

const route = () => loadRoute("app/api/moderation/route.mjs");

const validReasonCode = "verified-public-infrastructure";
const actorId = 2;

const correctionItem = {
  id: 9,
  cameraId: 3,
  issueType: "Wrong location",
  message: "The camera actually sits on the other corner",
  contact: null,
  status: "pending",
  createdAt: "2026-07-30T10:00:00.000Z",
};

const correctionEvent = {
  id: 7,
  entity: "correction",
  entityId: 9,
  previousStatus: "pending",
  newStatus: "reviewed",
  action: "approve",
  reasonCode: validReasonCode,
  note: null,
  actor: "Demo Record Reviewer",
  reviewerId: 2,
  actorRole: "record_reviewer",
  recused: 0,
  escalated: 0,
  secondReviewerId: null,
  createdAt: "2026-07-31T08:00:00.000Z",
};

const queueFixture = {
  id: 10,
  entity: "correction",
  entityId: 9,
  state: "closed",
  assigneeId: 2,
  sensitivity: "standard",
  requiresSecondReview: 0,
  secondReviewerId: null,
  escalationReason: null,
  createdAt: "2026-07-31T08:00:00.000Z",
  updatedAt: "2026-07-31T08:00:00.000Z",
  assignee: "Demo Record Reviewer",
  secondReviewer: null,
};

const okResult = (item, event = correctionEvent, queue = queueFixture) => ({ kind: "ok", item, event, queue });

// The db layer receives options = { outcome?, cameraId? } as the 5th argument
// and the attribution context (actorId + workflow fields) as the 6th.
// Implementations may omit an absent options key or carry it as undefined —
// pin the semantics, not the shape.
function assertOptions(args, expected) {
  assert.equal(args.length, 6, "options (5th) and context (6th) arguments must be passed");
  assert.deepEqual(args[5], { actorId }, "the reviewer attribution must be forwarded");
  const options = args[4];
  assert.equal(typeof options, "object");
  const keys = Object.keys(options)
    .filter((key) => options[key] !== undefined)
    .sort();
  assert.deepEqual(keys, Object.keys(expected).sort(), "options must carry exactly the provided fields");
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(options[key], value, `options.${key}`);
  }
}

const expectNoDbWrites = (name) => {
  assert.equal(callArgs("moderateCamera").length + callArgs("moderateCorrection").length, 0, name);
};

// ---------------------------------------------------------------------------
// AC-1 / AC-2 — association and outcome flow through to the db layer
// ---------------------------------------------------------------------------

test("PATCH approve with outcome passes options to moderateCorrection", async () => {
  stub("moderateCorrection", async () =>
    okResult({ ...correctionItem, status: "reviewed", outcome: "marked-stale" }, { ...correctionEvent, newStatus: "reviewed" }),
  );
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, outcome: "marked-stale", actorId },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.entity, "correction");
  assert.equal(body.item.outcome, "marked-stale");
  assert.equal(body.event.action, "approve");
  assertOptions(callArgs("moderateCorrection")[0], { outcome: "marked-stale" });
});

test("PATCH approve with cameraId associates the request to a record", async () => {
  stub("moderateCorrection", async () => okResult({ ...correctionItem, cameraId: 7 }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, cameraId: 7, actorId },
    }),
  );
  assert.equal(response.status, 200);
  assertOptions(callArgs("moderateCorrection")[0], { cameraId: 7 });
});

test("PATCH approve with outcome and cameraId passes both through", async () => {
  stub("moderateCorrection", async () =>
    okResult({ ...correctionItem, cameraId: 7, status: "reviewed", outcome: "removed" }, { ...correctionEvent, newStatus: "reviewed" }),
  );
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, note: "done", outcome: "removed", cameraId: 7, actorId },
    }),
  );
  assert.equal(response.status, 200);
  const args = callArgs("moderateCorrection")[0];
  assert.equal(args[3], "done");
  assertOptions(args, { outcome: "removed", cameraId: 7 });
});

test("PATCH reject may also carry a cameraId reassociation", async () => {
  stub("moderateCorrection", async () =>
    okResult({ ...correctionItem, cameraId: 5, status: "rejected" }, { ...correctionEvent, newStatus: "rejected", action: "reject" }),
  );
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "reject", reasonCode: "duplicate", cameraId: 5, actorId },
    }),
  );
  assert.equal(response.status, 200);
  const args = callArgs("moderateCorrection")[0];
  assert.deepEqual(args.slice(0, 4), [9, "reject", "duplicate", null]);
  assertOptions(args, { cameraId: 5 });
});

test("PATCH associate links a pending request to a record without deciding", async () => {
  const associatedEvent = { ...correctionEvent, newStatus: "pending", action: "associate" };
  stub("moderateCorrection", async () => okResult({ ...correctionItem, cameraId: 7 }, associatedEvent));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "associate", reasonCode: "insufficient-evidence", cameraId: 7, actorId },
    }),
  );
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.entity, "correction");
  assert.equal(body.item.status, "pending", "associate must not decide the request");
  assert.equal(body.item.cameraId, 7);
  assert.equal(body.event.action, "associate", "AC-4: association writes an audit event");
  const args = callArgs("moderateCorrection")[0];
  assert.deepEqual(args.slice(0, 4), [9, "associate", "insufficient-evidence", null]);
  assertOptions(args, { cameraId: 7 });
});

test("PATCH supports the full correction action set with cameraId", async (t) => {
  const { PATCH } = await route();
  for (const action of ["approve", "reject", "associate"]) {
    await t.test(action, async () => {
      stub("moderateCorrection", async () => okResult({ ...correctionItem, cameraId: 7 }));
      const response = await PATCH(
        authRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "correction", id: 9, action, reasonCode: validReasonCode, cameraId: 7, actorId },
        }),
      );
      assert.equal(response.status, 200, action);
    });
  }
});

test("PATCH escalate on a correction requires a note and forwards the action", async () => {
  stub("moderateCorrection", async () =>
    okResult(correctionItem, { ...correctionEvent, action: "escalate", escalated: 1 }, { ...queueFixture, state: "escalated" }),
  );
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "escalate", reasonCode: "requires-senior-review", note: "Needs senior moderator", actorId },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("moderateCorrection")[0], [
    9,
    "escalate",
    "requires-senior-review",
    "Needs senior moderator",
    undefined,
    { actorId },
  ]);
});

// ---------------------------------------------------------------------------
// AC-6 — backward compatibility: no options → options arg stays undefined
// ---------------------------------------------------------------------------

test("PATCH approve without outcome or cameraId stays backward compatible (no options object)", async () => {
  stub("moderateCorrection", async () =>
    okResult({ ...correctionItem, status: "reviewed" }, { ...correctionEvent, newStatus: "reviewed" }),
  );
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, note: "fixed", actorId },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("moderateCorrection")[0], [9, "approve", validReasonCode, "fixed", undefined, { actorId }]);
});

// ---------------------------------------------------------------------------
// AC-1 / AC-2 — malformed payloads: 400 and no db writes
// ---------------------------------------------------------------------------

test("PATCH rejects invalid cameraId values on corrections", async (t) => {
  const { PATCH } = await route();
  const cases = [
    { name: "zero", cameraId: 0 },
    { name: "negative", cameraId: -1 },
    { name: "fractional", cameraId: 2.5 },
    { name: "numeric string", cameraId: "5" },
    { name: "object", cameraId: {} },
    { name: "array", cameraId: [] },
    { name: "null", cameraId: null },
    { name: "boolean", cameraId: true },
    { name: "empty string", cameraId: "" },
  ];
  for (const { name, cameraId } of cases) {
    await t.test(name, async () => {
      const response = await PATCH(
        authRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "correction", id: 9, action: "associate", reasonCode: validReasonCode, cameraId, actorId },
        }),
      );
      assert.equal(response.status, 400, name);
      expectNoDbWrites(name);
    });
  }
});

test("PATCH rejects invalid outcome values on corrections", async (t) => {
  const { PATCH } = await route();
  const cases = [
    { name: "unknown code", outcome: "banana" },
    { name: "empty string", outcome: "" },
    { name: "numeric", outcome: 3 },
    { name: "null", outcome: null },
    { name: "boolean", outcome: true },
    { name: "array", outcome: [] },
  ];
  for (const { name, outcome } of cases) {
    await t.test(name, async () => {
      const response = await PATCH(
        authRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, outcome, actorId },
        }),
      );
      assert.equal(response.status, 400, name);
      expectNoDbWrites(name);
    });
  }
});

test("PATCH rejects outcome on non-approve correction actions", async (t) => {
  const { PATCH } = await route();
  for (const action of ["reject", "associate"]) {
    await t.test(action, async () => {
      const response = await PATCH(
        authRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "correction", id: 9, action, reasonCode: validReasonCode, outcome: "kept", actorId },
        }),
      );
      assert.equal(response.status, 400, action);
      expectNoDbWrites(action);
    });
  }
});

test("PATCH associate requires a cameraId", async () => {
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "associate", reasonCode: validReasonCode, actorId },
    }),
  );
  assert.equal(response.status, 400);
  expectNoDbWrites("associate without cameraId");
});

test("PATCH rejects correction-only fields on camera decisions", async (t) => {
  const { PATCH } = await route();
  const cases = [
    { name: "outcome on camera", outcome: "kept" },
    { name: "cameraId on camera", cameraId: 5 },
  ];
  for (const { name, ...overrides } of cases) {
    await t.test(name, async () => {
      const response = await PATCH(
        authRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode, actorId, ...overrides },
        }),
      );
      assert.equal(response.status, 400, name);
      expectNoDbWrites(name);
    });
  }
});

test("PATCH rejects unknown correction actions even with a cameraId", async () => {
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "hide", reasonCode: validReasonCode, cameraId: 5, actorId },
    }),
  );
  assert.equal(response.status, 400);
  expectNoDbWrites("unknown correction action");
});

// ---------------------------------------------------------------------------
// Errors and db-layer failures
// ---------------------------------------------------------------------------

test("PATCH returns 404 when the db layer rejects the correction decision", async () => {
  stub("moderateCorrection", async () => ({ kind: "not_found" }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 999, action: "approve", reasonCode: validReasonCode, outcome: "kept", cameraId: 5, actorId },
    }),
  );
  assert.equal(response.status, 404);
  assert.match((await responseBody(response)).error, /Item not found/);
});

test("PATCH associate to a non-existent camera returns 404", async () => {
  stub("moderateCorrection", async () => ({ kind: "camera_not_found" }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "associate", reasonCode: validReasonCode, cameraId: 4242, actorId },
    }),
  );
  assert.equal(response.status, 404);
  assert.match((await responseBody(response)).error, /Camera not found/);
});

test("PATCH approve with outcome on a non-existent camera returns 404", async () => {
  stub("moderateCorrection", async () => ({ kind: "camera_not_found" }));
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, outcome: "removed", cameraId: 4242, actorId },
    }),
  );
  assert.equal(response.status, 404);
  assert.match((await responseBody(response)).error, /Camera not found/);
});

test("PATCH returns 500 when the correction write fails", async () => {
  stub("moderateCorrection", async () => {
    throw new Error("Moderation event could not be recorded");
  });
  const { PATCH } = await route();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, outcome: "kept", cameraId: 5, actorId },
    }),
  );
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to update moderation item");
});

test("GET /api/moderation exposes the correction outcome in the queue", async () => {
  const queue = {
    cameraReports: [],
    publishedCameras: [],
    reviewCameras: [],
    correctionRequests: [{ ...correctionItem, cameraId: 7, status: "pending", outcome: null }],
    recentEvents: [],
    reviewers: [],
    queueItems: [],
  };
  stub("listPendingModerationItems", async () => queue);
  const { GET } = await route();
  const response = await GET(authRequest("/api/moderation"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.correctionRequests[0].cameraId, 7);
  assert.equal(body.correctionRequests[0].outcome, null);
});

// ---------------------------------------------------------------------------
// AC-3 / AC-4 / AC-5 — static contract on the db and public boundary
// ---------------------------------------------------------------------------

test("db schema carries the outcome column (Drizzle migration 0001)", async () => {
  const migration0001 = await readSource("drizzle/0001_low_queen_noir.sql");
  const schema = await readSource("db/schema.ts");
  // H3: the schema is delivered by the Drizzle migrations, not by runtime
  // bootstrap (getD1() is a pure binding passthrough). Assert the outcome
  // column on the migration that creates correction_requests and on the
  // schema declaration.
  assert.match(
    migration0001,
    /CREATE\s+TABLE[^)]*`correction_requests`[\s\S]{0,600}`outcome`\s+text/i,
    "drizzle/0001 must create correction_requests with an outcome column",
  );
  assert.match(
    schema,
    /outcome:\s*text\(\s*["']outcome["']\s*\)/,
    "db/schema.ts must declare the outcome column",
  );
});

test("db layer declares the correction outcome allowlist", async () => {
  const moderation = await readSource("db/moderation.ts");
  for (const value of ["kept", "corrected", "marked-stale", "removed", "escalated"]) {
    assert.match(moderation, new RegExp(`["'\`]${value}["'\`]`), `outcome allowlist must include ${value}`);
  }
});

test("db schema enforces the correction camera FK (migration 0015 + schema.ts)", async () => {
  const migration0015 = await readSource("drizzle/0015_correction_camera_fk.sql");
  const schema = await readSource("db/schema.ts");
  // SQLite cannot add a REFERENCES clause to an existing column, so the
  // migration must recreate correction_requests with the constraint and
  // preserve the historical rows (SET NULL keeps corrections after a
  // camera record is removed).
  assert.match(
    migration0015,
    /REFERENCES\s*`cameras`\s*\(`id`\)[^;]*ON\s+DELETE\s+set\s+null/i,
    "migration 0015 must declare the FK with ON DELETE SET NULL",
  );
  assert.match(
    migration0015,
    /CREATE\s+TABLE\s+`new_correction_requests`/i,
    "migration 0015 must recreate correction_requests to add the FK",
  );
  assert.match(
    migration0015,
    /INSERT\s+INTO\s+`new_correction_requests`[\s\S]*SELECT[\s\S]*FROM\s+`correction_requests`/i,
    "migration 0015 must preserve existing correction rows",
  );
  assert.match(
    schema,
    /cameraId:\s*integer\(\s*["']camera_id["']\s*\)\s*\.references\(\s*\(\)\s*=>\s*cameras\.id,\s*\{\s*onDelete:\s*["']set null["']\s*\}\)/,
    "db/schema.ts must declare the FK with ON DELETE SET NULL",
  );
});

test("AC-3: approve outcomes move or update the linked camera record", async () => {
  const moderation = await readSource("db/moderation.ts");
  assert.match(
    moderation,
    /outcome[\s\S]{0,240}marked-stale[\s\S]{0,240}needs_review/i,
    "marked-stale must move a verified record to needs_review",
  );
  assert.match(
    moderation,
    /outcome[\s\S]{0,240}["']removed["'][\s\S]{0,240}status[\s\S]{0,80}removed/i,
    "removed must remove the linked record",
  );
  assert.match(
    moderation,
    /outcome[\s\S]{0,240}corrected[\s\S]{0,240}updated/i,
    "corrected must touch the linked record",
  );
});

test("AC-4: every correction decision writes an audit event", async () => {
  const moderation = await readSource("db/moderation.ts");
  const moderateStart = moderation.indexOf("export async function moderateCorrection");
  assert.ok(moderateStart >= 0, "moderateCorrection must exist");
  const moderateFn = moderation.slice(moderateStart, moderation.indexOf("async function createModerationEvent", moderateStart));
  assert.match(moderateFn, /createModerationEvent\(/, "moderateCorrection must record a moderation event");
  assert.match(
    moderation,
    /action\s*:\s*["']associate["']/,
    "associate must be recorded as an auditable action",
  );
});

test("the moderation queue exposes the correction outcome", async () => {
  const moderation = await readSource("db/moderation.ts");
  const listStart = moderation.indexOf("export async function listPendingModerationItems");
  const listEnd = moderation.indexOf("export async function moderateCamera", listStart);
  const listFn = moderation.slice(listStart, listEnd);
  assert.ok(listStart >= 0, "listPendingModerationItems must exist");
  assert.match(
    listFn,
    /correction_requests[\s\S]{0,500}\boutcome\b/i,
    "the queue SELECT must expose the outcome column",
  );
});

test("AC-5: correction outcomes never leak into public routes", async () => {
  for (const routePath of [
    "app/api/cameras/route.ts",
    "app/api/cameras/nearby/route.ts",
    "app/api/corrections/route.ts",
  ]) {
    const source = await readSource(routePath);
    assert.doesNotMatch(source, /\boutcome\b/i, `${routePath} must never expose correction outcomes`);
    assert.doesNotMatch(source, /correction_requests/i, `${routePath} must not read the corrections table`);
  }
});
