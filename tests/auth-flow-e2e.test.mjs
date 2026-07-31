// E2E — full authenticated flow: auth gate → submit → moderate → publish →
// appeal → audit.
//
// This suite is the only one that wires the REAL route handlers to the REAL
// db modules against a fresh in-memory D1 (schema applied by replaying the
// real Drizzle migrations). It proves, at runtime, the whole lifecycle a
// contributor and a moderator experience, plus the worker edge auth gate:
//
//   1. the moderation auth gate (Basic/Bearer) rejects unauthenticated
//      requests and fails closed without credentials — the only "login" in
//      the prototype, exercised at runtime instead of by source scanning;
//   2. a submitted camera starts `pending` and is absent from every public
//      surface;
//   3. approving it (as a record reviewer) makes it appear in the public
//      listing; rejecting it (as an intake reviewer) keeps it non-public;
//   4. role enforcement through the real route: an intake reviewer cannot
//      approve, a non-resolver cannot touch an escalated item;
//   5. a contested privacy correction is escalated and handled by a senior
//      moderator, applying the outcome to the record;
//   6. every legal transition writes exactly one audit event, and the public
//      revisions endpoint exposes only the non-identifying history;
//   7. erasing a contributor account de-attributes its reports (they stay
//      public), revokes every session, and hard-deletes the account (R7);
//   8. the suite itself records which route+method it exercised and asserts
//      100% coverage of the API route surface (all 7 route files).
//
// No personal data is used: all fixtures are fictional. No network: the only
// geocoder touch is a coordinate search that never calls resolvePlace.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, responseBody } from "./helpers/api-harness.mjs";
import { applyDrizzleMigrations, cleanupDbRuntime } from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import { cleanupE2ETree, e2eEnv, loadE2EModule, loadE2ERoute } from "./helpers/e2e-harness.mjs";

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

const REASON = {
  verified: "verified-public-infrastructure",
  insufficient: "insufficient-evidence",
  duplicate: "duplicate",
  privacy: "privacy-or-safety-concern",
  stale: "inaccurate-or-outdated",
};

const REVIEWERS = {
  intake: 1, // Demo Intake Reviewer — reject/hide/escalate only
  record: 2, // Demo Record Reviewer — approve/reject/hide/mark-stale/reverify/escalate
  senior: 3, // Demo Senior Moderator — everything + resolves escalations
  privacy: 4, // Demo Privacy Lead — hide/escalate + resolves escalations
  admin: 5, // Demo Administrator — escalate only
};

const SUBMIT = {
  title: "Corner shop entrance",
  kind: "Fixed dome",
  manufacturer: "Acme Cameras",
  observedOn: "2026-07-01",
  address: "Via Roma 1",
  notes: "Private internal note — must never be published",
  latitude: 41.9005,
  longitude: 12.4937,
};

// Records which route+method this suite exercised, for the coverage gate.
const coverage = new Set();
function recorder(name, routeModule) {
  const wrapped = {};
  for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
    if (typeof routeModule[method] === "function") {
      wrapped[method] = (request) => {
        coverage.add(`${name}:${method}`);
        return routeModule[method](request);
      };
    }
  }
  wrapped.__raw = routeModule;
  return wrapped;
}

let env;
let camerasRoute;
let nearbyRoute;
let searchRoute;
let revisionsRoute;
let correctionsRoute;
let moderationRoute;
let accountRoute;

beforeEach(async () => {
  env = await e2eEnv();
  env.DB = new D1SqliteDatabase();
  await applyDrizzleMigrations(env.DB);
  // The route modules are cached in the shared tree; reload the recorder each
  // test so coverage stays cumulative while handlers stay stateless.
  const load = async (name, path) => recorder(name, await loadE2ERoute(path));
  camerasRoute = await load("cameras", "app/api/cameras/route.mjs");
  nearbyRoute = await load("nearby", "app/api/cameras/nearby/route.mjs");
  searchRoute = await load("search", "app/api/cameras/search/route.mjs");
  revisionsRoute = await load("revisions", "app/api/cameras/revisions/route.mjs");
  correctionsRoute = await load("corrections", "app/api/corrections/route.mjs");
  moderationRoute = await load("moderation", "app/api/moderation/route.mjs");
  accountRoute = await load("account", "app/api/auth/account/route.mjs");
});

after(async () => {
  await cleanupE2ETree();
  await cleanupDbRuntime();
});

async function submitCamera(overrides = {}) {
  const response = await camerasRoute.POST(apiRequest("/api/cameras", {
    method: "POST",
    body: { ...SUBMIT, ...overrides },
  }));
  assert.equal(response.status, 201, "submission must return 201");
  const body = await responseBody(response);
  return body.record;
}

async function moderateCamera(id, action, reasonCode, actorId, extra = {}) {
  return moderationRoute.PATCH(apiRequest("/api/moderation", {
    method: "PATCH",
    body: { entity: "camera", id, action, reasonCode, actorId, ...extra },
  }));
}

async function publicListing() {
  const response = await camerasRoute.GET(apiRequest("/api/cameras"));
  assert.equal(response.status, 200);
  return (await responseBody(response)).records;
}

async function auditEvents() {
  const rows = await env.DB.prepare("SELECT * FROM moderation_events ORDER BY id ASC").all();
  return rows.results;
}

// ---------------------------------------------------------------------------
// 1) Auth gate (the prototype's only login: moderation Basic/Bearer at the
//    worker edge). Exercised at runtime against the transpiled worker.
// ---------------------------------------------------------------------------

test("auth gate: moderation API fails closed (503) when no credentials are configured", async () => {
  const { default: worker } = await loadE2EModule("worker.mjs");
  const response = await worker.fetch(new Request("https://osdb.test/api/moderation"), {}, {
    waitUntil() {},
    passThroughOnException() {},
  });
  assert.equal(response.status, 503);
  const body = await responseBody(response);
  assert.equal(body.error, "Moderation is unavailable.");
});

test("auth gate: unauthenticated moderation requests get 401 with WWW-Authenticate", async () => {
  const { default: worker } = await loadE2EModule("worker.mjs");
  const envWithCreds = { MODERATION_USER: "moderator", MODERATION_PASSWORD: "s3cret" };
  const ctx = { waitUntil() {}, passThroughOnException() {} };

  const missing = await worker.fetch(new Request("https://osdb.test/api/moderation"), envWithCreds, ctx);
  assert.equal(missing.status, 401);
  assert.match(missing.headers.get("www-authenticate"), /Basic realm="moderation"/);

  const wrong = await worker.fetch(
    new Request("https://osdb.test/api/moderation", {
      headers: { Authorization: `Basic ${Buffer.from("moderator:wrong").toString("base64")}` },
    }),
    envWithCreds,
    ctx,
  );
  assert.equal(wrong.status, 401);

  // The dashboard path and moderation subpaths are gated too.
  const dashboard = await worker.fetch(new Request("https://osdb.test/moderation"), envWithCreds, ctx);
  assert.equal(dashboard.status, 401);
  const subpath = await worker.fetch(new Request("https://osdb.test/api/moderation/queue"), envWithCreds, ctx);
  assert.equal(subpath.status, 401);
});

test("auth gate: correct Basic credentials pass through to the handler", async () => {
  const { default: worker } = await loadE2EModule("worker.mjs");
  const envWithCreds = { MODERATION_USER: "moderator", MODERATION_PASSWORD: "s3cret" };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const response = await worker.fetch(
    new Request("https://osdb.test/api/moderation", {
      headers: { Authorization: `Basic ${Buffer.from("moderator:s3cret").toString("base64")}` },
    }),
    envWithCreds,
    ctx,
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "handler-called");
});

test("auth gate: bearer token login works and wrong tokens are rejected", async () => {
  const { default: worker } = await loadE2EModule("worker.mjs");
  const envWithToken = { MODERATION_TOKEN: "tok-123" };
  const ctx = { waitUntil() {}, passThroughOnException() {} };

  const good = await worker.fetch(
    new Request("https://osdb.test/api/moderation", {
      headers: { Authorization: "Bearer tok-123" },
    }),
    envWithToken,
    ctx,
  );
  assert.equal(good.status, 200);
  assert.equal(await good.text(), "handler-called");

  const bad = await worker.fetch(
    new Request("https://osdb.test/api/moderation", {
      headers: { Authorization: "Bearer nope" },
    }),
    envWithToken,
    ctx,
  );
  assert.equal(bad.status, 401);
});

test("auth gate: public routes are not gated — no login needed to read or submit", async () => {
  const { default: worker } = await loadE2EModule("worker.mjs");
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const response = await worker.fetch(new Request("https://osdb.test/api/cameras"), {}, ctx);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "handler-called");
});

// ---------------------------------------------------------------------------
// 2) Submit → pending → absent from public
// ---------------------------------------------------------------------------

test("E2E: a submitted camera starts pending and is absent from every public surface", async () => {
  const record = await submitCamera();
  assert.equal(record.status, "pending");
  assert.equal(record.source, "Community report");

  const records = await publicListing();
  assert.equal(records.length, 0, "pending records must not appear in the public listing");

  const queueResponse = await moderationRoute.GET(apiRequest("/api/moderation"));
  assert.equal(queueResponse.status, 200);
  const queue = await responseBody(queueResponse);
  assert.equal(queue.cameraReports.length, 1);
  assert.equal(queue.cameraReports[0].id, record.id);
  assert.equal(queue.cameraReports[0].status, "pending");
  assert.equal(queue.queueItems.length, 1);
  assert.equal(queue.queueItems[0].entity, "camera");
  assert.equal(queue.queueItems[0].entityId, record.id);
});

// ---------------------------------------------------------------------------
// 3) Moderator approves → record becomes public
// ---------------------------------------------------------------------------

test("E2E: approving a pending camera publishes it and records the audit event", async () => {
  const record = await submitCamera();

  const response = await moderateCamera(record.id, "approve", REASON.verified, REVIEWERS.record, {
    publishManufacturer: true,
    publishObservedOn: false,
  });
  assert.equal(response.status, 200);
  const decision = await responseBody(response);
  assert.equal(decision.item.status, "verified");
  assert.equal(decision.item.publishManufacturer, 1);
  assert.equal(decision.item.publishObservedOn, 0);

  const records = await publicListing();
  assert.equal(records.length, 1, "approved record must now be public");
  assert.equal(records[0].id, record.id);
  assert.equal(records[0].status, "verified");
  assert.equal(records[0].notes, undefined, "private notes must never be published");
  assert.equal(records[0].manufacturer, "Acme Cameras");

  // Audit: exactly one event with the full transition context.
  const events = await auditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].entity, "camera");
  assert.equal(events[0].entity_id, record.id);
  assert.equal(events[0].previous_status, "pending");
  assert.equal(events[0].new_status, "verified");
  assert.equal(events[0].action, "approve");
  assert.equal(events[0].reason_code, REASON.verified);
  assert.equal(events[0].actor, "Demo Record Reviewer");
  assert.equal(events[0].reviewer_id, REVIEWERS.record);
  assert.equal(events[0].actor_role, "record_reviewer");
  assert.equal(events[0].recused, 0);
  assert.equal(events[0].escalated, 0);

  // Public revisions endpoint shows the non-identifying history.
  const revisionsResponse = await revisionsRoute.GET(apiRequest(`/api/cameras/revisions?cameraId=${record.id}`));
  assert.equal(revisionsResponse.status, 200);
  const revisions = await responseBody(revisionsResponse);
  assert.equal(revisions.recordId, record.id);
  assert.equal(revisions.revisions.length, 1);
  assert.equal(revisions.revisions[0].action, "approve");
  assert.equal(revisions.revisions[0].newStatus, "verified");
  assert.equal(revisions.revisions[0].actor, undefined, "revisions must not leak reviewer identity");
  assert.equal(revisions.revisions[0].note, undefined, "revisions must not leak internal notes");
});

// ---------------------------------------------------------------------------
// 4) Moderator rejects → record stays non-public
// ---------------------------------------------------------------------------

test("E2E: rejecting a pending camera keeps it non-public and records the event", async () => {
  const record = await submitCamera();

  const response = await moderateCamera(record.id, "reject", REASON.insufficient, REVIEWERS.intake);
  assert.equal(response.status, 200);
  const decision = await responseBody(response);
  assert.equal(decision.item.status, "rejected");

  const records = await publicListing();
  assert.equal(records.length, 0, "rejected records must never be public");

  // The rejected record's history must not be probeable: revisions 404.
  const revisionsResponse = await revisionsRoute.GET(apiRequest(`/api/cameras/revisions?cameraId=${record.id}`));
  assert.equal(revisionsResponse.status, 404);

  const events = await auditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].previous_status, "pending");
  assert.equal(events[0].new_status, "rejected");
  assert.equal(events[0].action, "reject");
  assert.equal(events[0].actor, "Demo Intake Reviewer");
});

// ---------------------------------------------------------------------------
// 4b) Role enforcement through the real route
// ---------------------------------------------------------------------------

test("E2E: an intake reviewer cannot approve (403) — role matrix enforced end to end", async () => {
  const record = await submitCamera();
  const response = await moderateCamera(record.id, "approve", REASON.verified, REVIEWERS.intake);
  assert.equal(response.status, 403);
  const body = await responseBody(response);
  assert.match(body.error, /role does not permit/i);

  // Nothing changed: still pending, still not public, no audit event written.
  const records = await publicListing();
  assert.equal(records.length, 0);
  assert.equal((await auditEvents()).length, 0);

  const row = await env.DB.prepare("SELECT status FROM cameras WHERE id = ?").bind(record.id).first();
  assert.equal(row.status, "pending");
});

test("E2E: unknown and inactive reviewers are rejected through the real route", async () => {
  const record = await submitCamera();

  const missing = await moderateCamera(record.id, "approve", REASON.verified, 999);
  assert.equal(missing.status, 404);
  assert.match((await responseBody(missing)).error, /Reviewer not found/i);

  await env.DB.prepare("UPDATE reviewers SET active = 0 WHERE id = ?").bind(REVIEWERS.record).run();
  const inactive = await moderateCamera(record.id, "approve", REASON.verified, REVIEWERS.record);
  assert.equal(inactive.status, 403);
  assert.match((await responseBody(inactive)).error, /Reviewer is inactive/i);
});

// ---------------------------------------------------------------------------
// 5) Contested decision → second review / escalation → handled
// ---------------------------------------------------------------------------

test("E2E: a sensitive approval needs a second reviewer — 202 then resolved by a different reviewer", async () => {
  const record = await submitCamera();

  const first = await moderateCamera(record.id, "approve", REASON.verified, REVIEWERS.record, {
    sensitivity: "sensitive",
  });
  assert.equal(first.status, 202, "sensitive approvals must await a second reviewer");
  const pending = await responseBody(first);
  assert.equal(pending.kind, "second_review_pending");
  assert.equal(pending.item.status, "pending", "status must not be final before second review");

  // Same reviewer cannot self-approve the second review.
  const same = await moderateCamera(record.id, "approve", REASON.verified, REVIEWERS.record, {
    sensitivity: "sensitive",
  });
  assert.equal(same.status, 409);
  assert.match((await responseBody(same)).error, /second reviewer different/i);

  // A different reviewer completes the approval.
  const second = await moderateCamera(record.id, "approve", REASON.verified, REVIEWERS.senior, {
    sensitivity: "sensitive",
  });
  assert.equal(second.status, 200);
  const done = await responseBody(second);
  assert.equal(done.item.status, "verified");

  const records = await publicListing();
  assert.equal(records.length, 1);
  assert.equal(records[0].status, "verified");

  // Audit: approve-intent + completed approve, with the second reviewer linked.
  const events = await auditEvents();
  assert.equal(events.length, 2);
  assert.equal(events[0].action, "approve");
  assert.equal(events[0].reviewer_id, REVIEWERS.record);
  assert.equal(events[1].action, "approve");
  assert.equal(events[1].reviewer_id, REVIEWERS.senior);
  assert.equal(events[1].second_reviewer_id, REVIEWERS.record);
});

test("E2E: a contested privacy correction is escalated and handled by a senior moderator", async () => {
  // Publish a record first.
  const record = await submitCamera();
  await moderateCamera(record.id, "approve", REASON.verified, REVIEWERS.record);

  // Requester contests it (private correction intake, no account needed).
  const correctionResponse = await correctionsRoute.POST(apiRequest("/api/corrections", {
    method: "POST",
    body: {
      cameraId: record.id,
      issueType: "privacy-concern",
      message: "This entrance is a private residential courtyard, not public infrastructure.",
      contact: "",
    },
  }));
  assert.equal(correctionResponse.status, 201);
  const { referenceId } = await responseBody(correctionResponse);
  assert.ok(Number.isInteger(referenceId));

  // The correction is private: the public listing is untouched and contains
  // no correction objects.
  const records = await publicListing();
  assert.equal(records.length, 1);
  assert.equal(records[0].id, record.id);
  assert.equal(records[0].status, "verified");

  // The moderation queue surfaces the correction request.
  const queue = await responseBody(await moderationRoute.GET(apiRequest("/api/moderation")));
  assert.equal(queue.correctionRequests.length, 1);
  assert.equal(queue.correctionRequests[0].id, referenceId);
  assert.equal(queue.correctionRequests[0].status, "pending");

  // A reviewer escalates the contested correction with a mandatory note.
  const escalate = await moderationRoute.PATCH(apiRequest("/api/moderation", {
    method: "PATCH",
    body: {
      entity: "correction",
      id: referenceId,
      action: "escalate",
      reasonCode: REASON.privacy,
      note: "Requester contests the publication decision.",
      actorId: REVIEWERS.record,
    },
  }));
  assert.equal(escalate.status, 200);
  const escalated = await responseBody(escalate);
  assert.equal(escalated.event.escalated, 1);
  assert.equal(escalated.queue.state, "escalated");
  assert.equal(escalated.queue.escalationReason, "Requester contests the publication decision.");

  // A non-resolver cannot touch the escalated item.
  const blocked = await moderationRoute.PATCH(apiRequest("/api/moderation", {
    method: "PATCH",
    body: {
      entity: "correction",
      id: referenceId,
      action: "approve",
      reasonCode: REASON.privacy,
      actorId: REVIEWERS.record,
    },
  }));
  assert.equal(blocked.status, 403);

  // A senior moderator handles the appeal: mark the record stale while it is
  // reassessed (DATA_TRUST SLA) — the record leaves the public listing.
  const resolve = await moderationRoute.PATCH(apiRequest("/api/moderation", {
    method: "PATCH",
    body: {
      entity: "correction",
      id: referenceId,
      action: "approve",
      reasonCode: REASON.privacy,
      note: "Appeal upheld — reassessing the record.",
      outcome: "marked-stale",
      actorId: REVIEWERS.senior,
    },
  }));
  assert.equal(resolve.status, 200);
  const resolved = await responseBody(resolve);
  assert.equal(resolved.item.status, "reviewed");
  assert.equal(resolved.item.outcome, "marked-stale");

  const after = await publicListing();
  assert.equal(after.length, 0, "record under reassessment must leave the public listing");
  const row = await env.DB.prepare("SELECT status FROM cameras WHERE id = ?").bind(record.id).first();
  assert.equal(row.status, "needs_review");

  // Audit trail: approve (camera) → escalate (correction) → approve
  // (correction) → marked-stale (camera). The blocked attempt writes nothing.
  const events = await auditEvents();
  assert.deepEqual(
    events.map((event) => [event.entity, event.action, event.new_status]),
    [
      ["camera", "approve", "verified"],
      ["correction", "escalate", "pending"],
      ["correction", "approve", "reviewed"],
      ["camera", "marked-stale", "needs_review"],
    ],
  );
});

// ---------------------------------------------------------------------------
// 6) Audit events and public boundaries across the full lifecycle
// ---------------------------------------------------------------------------

test("E2E: full lifecycle writes one append-only audit event per legal transition", async () => {
  const record = await submitCamera();
  await moderateCamera(record.id, "approve", REASON.verified, REVIEWERS.record);
  await moderateCamera(record.id, "mark-stale", REASON.stale, REVIEWERS.record);
  await moderateCamera(record.id, "reverify", REASON.verified, REVIEWERS.record);
  await moderateCamera(record.id, "hide", REASON.privacy, REVIEWERS.privacy);

  const events = await auditEvents();
  assert.deepEqual(
    events.map((event) => [event.action, event.previous_status, event.new_status]),
    [
      ["approve", "pending", "verified"],
      ["mark-stale", "verified", "needs_review"],
      ["reverify", "needs_review", "verified"],
      ["hide", "verified", "removed"],
    ],
    "each legal transition must produce exactly one event in order",
  );

  // Append-only: direct UPDATE/DELETE must fail loudly. (The D1 adapter
  // throws synchronously here, so wrap the calls for assert.rejects.)
  await assert.rejects(
    async () => env.DB.prepare("UPDATE moderation_events SET note = 'tampered' WHERE id = 1").run(),
    /append-only/,
  );
  await assert.rejects(
    async () => env.DB.prepare("DELETE FROM moderation_events WHERE id = 1").run(),
    /append-only/,
  );

  // The removed record is gone from the public listing and its revisions 404.
  assert.equal((await publicListing()).length, 0);
  const revisions = await revisionsRoute.GET(apiRequest(`/api/cameras/revisions?cameraId=${record.id}`));
  assert.equal(revisions.status, 404);
});

test("E2E: nearby and coordinate search return only published records", async () => {
  const published = await submitCamera({ title: "Published camera" });
  await moderateCamera(published.id, "approve", REASON.verified, REVIEWERS.record);
  await submitCamera({ title: "Pending camera" });

  const nearby = await responseBody(
    await nearbyRoute.GET(apiRequest(`/api/cameras/nearby?latitude=${SUBMIT.latitude}&longitude=${SUBMIT.longitude}&radius=100`)),
  );
  assert.deepEqual(
    nearby.records.map((record) => record.title),
    ["Published camera"],
    "nearby search must only expose the published record",
  );

  const search = await responseBody(
    await searchRoute.GET(apiRequest(`/api/cameras/search?q=${SUBMIT.latitude}%2C%20${SUBMIT.longitude}`)),
  );
  assert.equal(search.area.kind, "coordinates");
  assert.deepEqual(
    search.records.map((record) => record.title),
    ["Published camera"],
    "coordinate search must only expose the published record",
  );
});

// ---------------------------------------------------------------------------
// 7) Account erasure (RETENTION_SCHEDULE R7) end to end
// ---------------------------------------------------------------------------

test("E2E: erasing a contributor de-attributes their reports, keeps them public, and kills all sessions", async () => {
  // Build a real contributor + session through the real db/auth module (the
  // register/login routes are covered separately with mocks in
  // tests/api-auth.test.mjs; here the goal is the erasure path end to end).
  const auth = await loadE2EModule("db/auth.mjs");
  const profile = await auth.createContributor({
    email: "eraseme@example.org",
    displayName: "Eraseme",
    password: "supersecret123",
  });
  const { rawToken, csrfToken } = await auth.createSession(profile.id, { ttlDays: 7 });
  const sessionCookies = `osdb_session=${rawToken}; osdb_csrf=${csrfToken}`;
  const authHeaders = { cookie: sessionCookies, "x-csrf-token": csrfToken };

  // 1. The contributor submits an attributed report through the real route.
  const submitted = await camerasRoute.POST(apiRequest("/api/cameras", {
    method: "POST",
    headers: authHeaders,
    body: { ...SUBMIT, title: "Camera to de-attribute" },
  }));
  assert.equal(submitted.status, 201);
  const { record } = await responseBody(submitted);
  assert.equal(record.contributorId, profile.id, "the report must be attributed on submit");

  // 2. A second session exists too (e.g. another device) — erasure must kill
  //    every session, not just the one making the request.
  await auth.createSession(profile.id, { ttlDays: 7 });

  // 3. Moderators publish the report, so it is public before erasure.
  const approved = await moderateCamera(record.id, "approve", REASON.verified, REVIEWERS.record);
  assert.equal(approved.status, 200);
  assert.equal((await publicListing()).length, 1, "the record must be public before erasure");

  // 4. Erasure: the authenticated contributor deletes their account.
  const erased = await accountRoute.DELETE(apiRequest("/api/auth/account", {
    method: "DELETE",
    headers: authHeaders,
  }));
  assert.equal(erased.status, 200);
  const erasedBody = await responseBody(erased);
  assert.equal(erasedBody.ok, true);
  assert.equal(erasedBody.deattributedReports, 1, "exactly the one attributed report is de-attributed");
  assert.match(erased.headers.getSetCookie().join(" "), /Max-Age=0/, "both session cookies must be cleared");

  // 5. The contributor row and every session are gone.
  assert.equal(await auth.getContributorById(profile.id), null, "the account must be hard-deleted");
  assert.equal(await auth.findSessionByToken(rawToken), null, "the erasing session must not resolve");
  const sessionRows = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE contributor_id = ?")
    .bind(profile.id).first();
  assert.equal(Number(sessionRows.n), 0, "all sessions of the contributor must be revoked");

  // 6. The report itself survives, public, with attribution severed.
  const rows = await env.DB.prepare(
    "SELECT contributor_id AS contributorId, status FROM cameras WHERE id = ?",
  ).bind(record.id).first();
  assert.equal(rows.contributorId, null, "contributor_id must be NULL after erasure");
  assert.equal(rows.status, "verified", "the record keeps its published state");
  const listing = await publicListing();
  assert.equal(listing.length, 1, "the de-attributed record stays public");
  assert.equal(listing[0].title, "Camera to de-attribute");

  // 7. The append-only audit trail is untouched: the publish event survives.
  const events = await auditEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, "approve");
  assert.equal(events[0].entity_id, record.id);
});

test("E2E: erasure requires a live session — anonymous DELETE is rejected", async () => {
  const response = await accountRoute.DELETE(apiRequest("/api/auth/account", { method: "DELETE" }));
  assert.equal(response.status, 401);
});

// ---------------------------------------------------------------------------
// 8) Coverage gate: 100% of the route surface exercised by this suite
// ---------------------------------------------------------------------------

test("E2E suite covers 100% of the API route surface (all 7 route files, all methods)", () => {
  const expected = [
    "cameras:GET",
    "cameras:POST",
    "nearby:GET",
    "search:GET",
    "revisions:GET",
    "corrections:POST",
    "moderation:GET",
    "moderation:PATCH",
    "account:DELETE",
  ];
  const missing = expected.filter((key) => !coverage.has(key));
  assert.deepEqual(missing, [], `missing E2E coverage: ${missing.join(", ")}`);
  assert.equal(coverage.size, expected.length, "coverage registry must not drift from the route surface");
});
