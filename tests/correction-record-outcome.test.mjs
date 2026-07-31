// QA contract — H1: correction-request → record outcome for moderators.
//
// Contract source: docs/FUTURE_ROADMAP.md (Horizon 1), docs/workstreams/DATA_TRUST.md,
// docs/DATA_MODEL.md. Full spec: see task t_f00aa65e workspace QA_SPEC_correction_record_outcome.md.
//
// PATCH /api/moderation, entity=correction:
//   { entity: "correction", id, action: "approve"|"reject"|"associate",
//     reasonCode, note?, outcome?, cameraId? }
//
//   - outcome  (string, ONLY with "approve"): kept|corrected|marked-stale|removed|escalated
//   - cameraId (positive integer, optional on ANY correction action): links/re-links the
//     request to a record, persisted on correction_requests.camera_id
//   - associate: new action; REQUIRES cameraId; links a pending request to a record without
//     deciding; db layer writes an audit event with action='associate'
//   - db call: moderateCorrection(id, action, reasonCode, note, options?) with
//     options = { outcome?, cameraId? }; NO 5th argument when both are absent
//     (backward compatible — existing tests assert exactly 4 args).
//   - malformed payloads → 400 and no db writes.
//
// This suite is RED on main (feature absent: zero "outcome" occurrences in db/ and app/).
// The implementation must turn it GREEN without touching the other suites.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { apiRequest, cleanupRouteTree, loadRoute, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFile(path.join(root, relativePath), "utf8");

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

const route = () => loadRoute("app/api/moderation/route.mjs");

const validReasonCode = "verified-public-infrastructure";

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
  actor: "Local moderator",
  createdAt: "2026-07-31T08:00:00.000Z",
};

// The db layer receives options = { outcome?, cameraId? }. Implementations may
// omit an absent key or carry it as undefined — pin the semantics, not the shape.
function assertOptions(args, expected) {
  assert.equal(args.length, 5, "a 5th options argument must be passed");
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
  stub("moderateCorrection", async () => ({
    item: { ...correctionItem, status: "reviewed", outcome: "marked-stale" },
    event: { ...correctionEvent, newStatus: "reviewed" },
  }));
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, outcome: "marked-stale" },
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
  stub("moderateCorrection", async () => ({ item: { ...correctionItem, cameraId: 7 }, event: correctionEvent }));
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, cameraId: 7 },
    }),
  );
  assert.equal(response.status, 200);
  assertOptions(callArgs("moderateCorrection")[0], { cameraId: 7 });
});

test("PATCH approve with outcome and cameraId passes both through", async () => {
  stub("moderateCorrection", async () => ({
    item: { ...correctionItem, cameraId: 7, status: "reviewed", outcome: "removed" },
    event: { ...correctionEvent, newStatus: "reviewed" },
  }));
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, note: "done", outcome: "removed", cameraId: 7 },
    }),
  );
  assert.equal(response.status, 200);
  const args = callArgs("moderateCorrection")[0];
  assert.equal(args[3], "done");
  assertOptions(args, { outcome: "removed", cameraId: 7 });
});

test("PATCH reject may also carry a cameraId reassociation", async () => {
  stub("moderateCorrection", async () => ({
    item: { ...correctionItem, cameraId: 5, status: "rejected" },
    event: { ...correctionEvent, newStatus: "rejected", action: "reject" },
  }));
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "reject", reasonCode: "duplicate", cameraId: 5 },
    }),
  );
  assert.equal(response.status, 200);
  const args = callArgs("moderateCorrection")[0];
  assert.deepEqual(args.slice(0, 4), [9, "reject", "duplicate", null]);
  assertOptions(args, { cameraId: 5 });
});

test("PATCH associate links a pending request to a record without deciding", async () => {
  const associatedEvent = { ...correctionEvent, newStatus: "pending", action: "associate" };
  stub("moderateCorrection", async () => ({ item: { ...correctionItem, cameraId: 7 }, event: associatedEvent }));
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "associate", reasonCode: "insufficient-evidence", cameraId: 7 },
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
      stub("moderateCorrection", async () => ({ item: { ...correctionItem, cameraId: 7 }, event: correctionEvent }));
      const response = await PATCH(
        apiRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "correction", id: 9, action, reasonCode: validReasonCode, cameraId: 7 },
        }),
      );
      assert.equal(response.status, 200, action);
    });
  }
});

// ---------------------------------------------------------------------------
// AC-6 — backward compatibility: no options → exactly 4 db args
// ---------------------------------------------------------------------------

test("PATCH approve without outcome or cameraId stays backward compatible (no 5th argument)", async () => {
  stub("moderateCorrection", async () => ({
    item: { ...correctionItem, status: "reviewed" },
    event: { ...correctionEvent, newStatus: "reviewed" },
  }));
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, note: "fixed" },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("moderateCorrection")[0], [9, "approve", validReasonCode, "fixed"]);
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
        apiRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "correction", id: 9, action: "associate", reasonCode: validReasonCode, cameraId },
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
        apiRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, outcome },
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
        apiRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "correction", id: 9, action, reasonCode: validReasonCode, outcome: "kept" },
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
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "associate", reasonCode: validReasonCode },
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
        apiRequest("/api/moderation", {
          method: "PATCH",
          body: { entity: "camera", id: 5, action: "approve", reasonCode: validReasonCode, ...overrides },
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
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "hide", reasonCode: validReasonCode, cameraId: 5 },
    }),
  );
  assert.equal(response.status, 400);
  expectNoDbWrites("unknown correction action");
});

// ---------------------------------------------------------------------------
// Errors and db-layer failures
// ---------------------------------------------------------------------------

test("PATCH returns 404 when the db layer rejects the correction decision", async () => {
  stub("moderateCorrection", async () => null);
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 999, action: "approve", reasonCode: validReasonCode, outcome: "kept", cameraId: 5 },
    }),
  );
  assert.equal(response.status, 404);
  assert.match((await responseBody(response)).error, /Item not found/);
});

test("PATCH returns 500 when the correction write fails", async () => {
  stub("moderateCorrection", async () => {
    throw new Error("Moderation event could not be recorded");
  });
  const { PATCH } = await route();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: { entity: "correction", id: 9, action: "approve", reasonCode: validReasonCode, outcome: "kept", cameraId: 5 },
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
  };
  stub("listPendingModerationItems", async () => queue);
  const { GET } = await route();
  const response = await GET(apiRequest("/api/moderation"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.correctionRequests[0].cameraId, 7);
  assert.equal(body.correctionRequests[0].outcome, null);
});

// ---------------------------------------------------------------------------
// AC-3 / AC-4 / AC-5 — static contract on the db and public boundary
// ---------------------------------------------------------------------------

test("db schema carries the outcome column (runtime CREATE TABLE)", async () => {
  const corrections = await readSource("db/corrections.ts");
  const moderation = await readSource("db/moderation.ts");
  assert.match(
    corrections,
    /CREATE\s+TABLE[^)]*correction_requests[\s\S]{0,600}\boutcome\s+TEXT/i,
    "db/corrections.ts must create correction_requests with an outcome column",
  );
  assert.match(
    moderation,
    /CREATE\s+TABLE[^)]*correction_requests[\s\S]{0,600}\boutcome\s+TEXT/i,
    "db/moderation.ts must create correction_requests with an outcome column",
  );
});

test("db layer declares the correction outcome allowlist", async () => {
  const moderation = await readSource("db/moderation.ts");
  for (const value of ["kept", "corrected", "marked-stale", "removed", "escalated"]) {
    assert.match(moderation, new RegExp(`["'\`]${value}["'\`]`), `outcome allowlist must include ${value}`);
  }
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
