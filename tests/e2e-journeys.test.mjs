/**
 * E2E user journeys through the REAL route+db surface (F-QA t_7b716c97,
 * item 5 — "e2e miniflare estesi").
 *
 * Three journeys the roadmap requires covered end to end:
 *
 *   2. segnala → submit → coda moderazione: the home report form's payload
 *      POSTs to /api/cameras; the item lands in the moderation queue and a
 *      moderator approves it into the public listing (SSR home + record
 *      detail reachable after publish).
 *   3. login → account: register builds a real session; /api/auth/me
 *      resolves the contributor, submissions list shows ONLY the
 *      contributor's own reports, logout revokes the session.
 *
 * Journey 1 (browse → filtri → record) lives in
 * tests/browse-filter-record.test.mjs (client filter interaction + SSR
 * browse/detail).
 *
 * Implementation: the e2e-harness runs the REAL route handlers against the
 * REAL db modules on an in-memory D1 (schema from the real Drizzle
 * migrations) — same runtime truth as auth-flow-e2e.test.mjs — plus
 * Miniflare over the built worker for the SSR halves. Fixtures are
 * fictional; no personal data anywhere (privacy & safety by design).
 *
 * Requires `npm run build` first (npm test already builds before running).
 */
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { apiRequest, responseBody } from "./helpers/api-harness.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  seedDemoIdentities,
} from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import { cleanupE2ETree, e2eEnv, loadE2EModule, loadE2ERoute } from "./helpers/e2e-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "dist", "server");

const REVIEWERS = { record: 2 }; // Demo Record Reviewer (seedDemoIdentities)
const reviewerEmail = { 2: "record@osdb.test" };
const identityFor = (actorId) => reviewerEmail[actorId] ?? "admin@osdb.test";

// Fictional fixtures only (never real personal data).
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

const CONTRIBUTOR = {
  email: "journey@example.org",
  displayName: "Journey Tester",
  password: "Sup3rsecret!123",
};

// ---------------------------------------------------------------------------
// Verified-session fixture (write gate, Fase E1)
// ---------------------------------------------------------------------------
// Camera/correction intakes require a session whose account is
// email-verified. These journeys target the full flow (submit → moderation →
// publish), not the gate, so the submitter is provisioned verified. The
// session is created lazily per test because env.DB is fresh in beforeEach.
let submitHeaders = null;
async function submitterSessionHeaders() {
  const auth = await loadE2EModule("db/auth.mjs");
  const profile = await auth.createContributor({
    email: "journey-submitter@example.org",
    displayName: "Journey Submitter",
    password: "Sup3rsecret!123",
  });
  await env.DB.prepare("UPDATE contributors SET email_verified_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), profile.id)
    .run();
  const { rawToken, csrfToken } = await auth.createSession(profile.id, { ttlDays: 7 });
  return {
    cookie: `osdb_session=${rawToken}; osdb_csrf=${csrfToken}`,
    "x-csrf-token": csrfToken,
  };
}
async function ensureSubmitHeaders() {
  if (!submitHeaders) submitHeaders = await submitterSessionHeaders();
  return submitHeaders;
}
// Mark a freshly registered contributor email-verified (the write gate
// refuses writes until the account is verified; the verify-email endpoint
// is Fase B, so journeys simulate the verified state directly).
async function markVerifiedByEmail(email) {
  await env.DB.prepare("UPDATE contributors SET email_verified_at = ? WHERE email = ?")
    .bind(new Date().toISOString(), email)
    .run();
}

// ---------------------------------------------------------------------------
// Harness wiring (same as auth-flow-e2e)
// ---------------------------------------------------------------------------

let env;
let camerasRoute;
let cameraEditRoute;
let moderationRoute;
let registerRoute;
let meRoute;
let submissionsRoute;
let logoutRoute;

beforeEach(async () => {
  env = await e2eEnv();
  env.DB = new D1SqliteDatabase();
  // The verified submitter session is per-test: env.DB is fresh, so a cached
  // session from the previous test no longer exists in the database.
  submitHeaders = null;
  await applyDrizzleMigrations(env.DB);
  await seedDemoIdentities(env.DB);
  const load = async (name, routePath) => (await loadE2ERoute(routePath));
  camerasRoute = await load("cameras", "app/api/cameras/route.mjs");
  cameraEditRoute = await load("cameraEdit", "app/api/cameras/[id]/route.mjs");
  moderationRoute = await load("moderation", "app/api/moderation/route.mjs");
  registerRoute = await load("register", "app/api/auth/register/route.mjs");
  // loginRoute is deliberately not exercised here: ADR 0013 makes register
  // create the session immediately, so the login→account journey runs
  // through register (login is covered by api-auth.test.mjs).
  meRoute = await load("me", "app/api/auth/me/route.mjs");
  submissionsRoute = await load("submissions", "app/api/auth/me/submissions/route.mjs");
  logoutRoute = await load("logout", "app/api/auth/logout/route.mjs");
});

after(async () => {
  await cleanupE2ETree();
  await cleanupDbRuntime();
});

async function workerModules() {
  const found = [];
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".js")) found.push({ type: "ESModule", path: full });
    }
  };
  await walk(serverDir);
  const entry = found.find((m) => m.path === path.join(serverDir, "index.js"));
  assert.ok(entry, "dist/server/index.js is missing — run `npm run build` first");
  return [entry, ...found.filter((m) => m !== entry)];
}

async function ssr(route) {
  const mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
    bindings: {},
  });
  try {
    const response = await mf.dispatchFetch(`http://localhost${route}`, {
      headers: { accept: "text/html" },
    });
    return { response, html: await response.text() };
  } finally {
    await mf.dispose();
  }
}

// ---------------------------------------------------------------------------
// Journey 2: segnala → submit → coda moderazione
// ---------------------------------------------------------------------------

test("journey segnala: the report tool renders on the SSR /segnala route (form is client-gated)", async () => {
  // F2 moved the report form off the home hub into the /segnala tool route
  // (F1 route group). P1-2 (Vera design): the form is gated by WriteGateWall
  // (the write gate requires a verified contributor), so the anonymous SSR
  // renders the tool heading + the wall's loading state — the form itself
  // mounts client-side after the verified-session check. The write journey
  // (next test) exercises the real API with a verified session.
  const { response, html } = await ssr("/segnala");
  assert.equal(response.status, 200);
  assert.match(html, /id="report-tool-title"/, "the segnala tool heading must SSR");
  assert.match(html, /write-gate-wall/, "the login wall gates the form on SSR");
  assert.doesNotMatch(html, /<form class="report-form"/, "the gated form must not leak into anonymous SSR");
});

test("journey segnala: submit → moderation queue → approve → public listing → record detail", async () => {
  // 1. The contributor submits the report through the real route (write gate
  //    Fase E1: a verified contributor session is required).
  const submitted = await camerasRoute.POST(apiRequest("/api/cameras", {
    method: "POST",
    headers: await ensureSubmitHeaders(),
    body: SUBMIT,
  }));
  assert.equal(submitted.status, 201, "submission must return 201");
  const { record } = await responseBody(submitted);
  assert.equal(record.status, "pending", "a fresh report starts pending");

  // 2. It lands in the moderation queue (not yet public anywhere).
  const queueResponse = await moderationRoute.GET(apiRequest("/api/moderation", {
    headers: { "x-osdb-user-email": identityFor(REVIEWERS.record) },
  }));
  assert.equal(queueResponse.status, 200);
  const queue = await responseBody(queueResponse);
  assert.ok(
    queue.cameraReports?.some((item) => item.id === record.id && item.status === "pending"),
    "the pending report must appear in the moderation queue",
  );

  const beforePublish = await camerasRoute.GET(apiRequest("/api/cameras"));
  assert.equal((await responseBody(beforePublish)).records.length, 0, "pending must be absent from the public listing");

  // 3. A moderator approves it.
  const approved = await moderationRoute.PATCH(apiRequest("/api/moderation", {
    method: "PATCH",
    headers: { "x-osdb-user-email": identityFor(REVIEWERS.record) },
    body: { entity: "camera", id: record.id, action: "approve", reasonCode: "verified-public-infrastructure", actorId: REVIEWERS.record },
  }));
  assert.equal(approved.status, 200, "approve must succeed");

  // 4. It is now public, and the record detail is reachable over SSR.
  const listing = await camerasRoute.GET(apiRequest("/api/cameras"));
  const publicRecords = (await responseBody(listing)).records;
  assert.ok(publicRecords.some((item) => item.id === record.id && item.status === "verified"), "approved report must be public");

  const detail = await ssr(`/records/${record.id}`);
  assert.equal(detail.response.status, 200, "the public record detail must render");
  // The record detail is a client-fetched page (F0 [id] API): SSR renders
  // the accessible loading shell with an aria-live region; the record title
  // itself is asserted at client level (client-record-page.test.mjs).
  assert.match(detail.html, /class="record-detail"[^>]*aria-live="polite"/, "the detail shell must be an aria-live region");
  assert.match(detail.html, /loading-note/, "the SSR shell must announce the loading state");
});

// ---------------------------------------------------------------------------
// Journey 3: login → account
// ---------------------------------------------------------------------------

test("journey account: register builds a session, me resolves the contributor, submissions show only own data", async () => {
  // 1. Register (creates a session immediately — ADR 0013).
  const registered = await registerRoute.POST(apiRequest("/api/auth/register", {
    method: "POST",
    body: CONTRIBUTOR,
  }));
  assert.equal(registered.status, 201, "register must return 201");
  const registerCookies = registered.headers.getSetCookie().join("; ");
  assert.match(registerCookies, /osdb_session=/, "register must issue a session cookie");

  // 2. me: the session resolves the contributor.
  const me = await meRoute.GET(apiRequest("/api/auth/me", { headers: { cookie: registerCookies } }));
  assert.equal(me.status, 200);
  const { contributor } = await responseBody(me);
  assert.equal(contributor.email, CONTRIBUTOR.email, "me must return the registered contributor");

  // 2b. Verify the account email (write gate Fase E1): a fresh register is
  //     read-only — the session only gains write access once the account is
  //     verified. The verify-email endpoint is Fase B; the journey simulates
  //     the verified state directly on the column the gate reads.
  await env.DB.prepare("UPDATE contributors SET email_verified_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), contributor.id)
    .run();

  // 3. Submissions are empty before any report.
  const empty = await submissionsRoute.GET(apiRequest("/api/auth/me/submissions", { headers: { cookie: registerCookies } }));
  assert.equal(empty.status, 200);
  assert.equal((await responseBody(empty)).submissions.length, 0, "a fresh account has no submissions");

  // 4. Submitting a report attributes it to the contributor.
  const csrfToken = /osdb_csrf=([^;]+)/.exec(registerCookies)?.[1];
  const authHeaders = { cookie: registerCookies, "x-csrf-token": csrfToken };
  const submitted = await camerasRoute.POST(apiRequest("/api/cameras", {
    method: "POST",
    headers: authHeaders,
    body: { ...SUBMIT, title: "My own report" },
  }));
  assert.equal(submitted.status, 201);
  const { record } = await responseBody(submitted);
  assert.equal(record.contributorId, contributor.id, "the report must be attributed to the contributor");

  const own = await submissionsRoute.GET(apiRequest("/api/auth/me/submissions", { headers: { cookie: registerCookies } }));
  assert.equal((await responseBody(own)).submissions.length, 1, "the account shows exactly its own report");

  // 5. Logout revokes the session.
  const loggedOut = await logoutRoute.POST(apiRequest("/api/auth/logout", {
    method: "POST",
    headers: authHeaders,
  }));
  assert.equal(loggedOut.status, 200);
  const afterLogout = await meRoute.GET(apiRequest("/api/auth/me", { headers: { cookie: registerCookies } }));
  assert.equal(afterLogout.status, 401, "the revoked session must not resolve after logout");
});

// ---------------------------------------------------------------------------
// Journey 4: community editing a due binari (ADR 0018 §4, C3)
// register → submit → approve → edit pending → edit altrui 403 → edit
// verified → re-moderation.
// ---------------------------------------------------------------------------

async function registerContributor(overrides = {}) {
  const email = `edit-journey-${crypto.randomUUID()}@example.org`;
  const response = await registerRoute.POST(apiRequest("/api/auth/register", {
    method: "POST",
    body: { email, displayName: "Edit Journey Tester", password: "Sup3rsecret!123", ...overrides },
  }));
  assert.equal(response.status, 201, "register must return 201");
  const cookies = response.headers.getSetCookie().join("; ");
  const csrfToken = /osdb_csrf=([^;]+)/.exec(cookies)?.[1];
  assert.ok(csrfToken, "register must issue a CSRF cookie");
  return { cookies, csrfToken, email };
}

const editPatch = (pathAndQuery, body, auth) =>
  apiRequest(pathAndQuery, {
    method: "PATCH",
    headers: { cookie: auth.cookies, "x-csrf-token": auth.csrfToken },
    body,
  });

test("journey edit: pending edits direct, verified goes to re-moderation, foreign edits 403", async () => {
  // 1. register → two contributors (owner + outsider).
  const owner = await registerContributor();
  const outsider = await registerContributor();
  // Write gate (Fase E1): a fresh register is read-only — verify the owner's
  // account so the submit below passes the gate (verify-email is Fase B; the
  // journey simulates the verified state on the column the gate reads).
  await markVerifiedByEmail(owner.email);
  const me = await meRoute.GET(apiRequest("/api/auth/me", { headers: { cookie: owner.cookies } }));
  const { contributor } = await responseBody(me);

  // 2. submit → pending record attributed to the owner.
  const submitted = await camerasRoute.POST(apiRequest("/api/cameras", {
    method: "POST",
    headers: { cookie: owner.cookies, "x-csrf-token": owner.csrfToken },
    body: { ...SUBMIT, title: "Old corner shop title" },
  }));
  assert.equal(submitted.status, 201);
  const { record } = await responseBody(submitted);
  assert.equal(record.status, "pending");
  assert.equal(record.contributorId, contributor.id);

  // 3. edit pending: the owner PATCHes the pending record directly (binario
  //    diretto) and gets the owner view back, no moderation round-trip.
  const pendingEdit = await cameraEditRoute.PATCH(editPatch(`/api/cameras/${record.id}`, {
    title: "Renamed before publish",
    expectedUpdated: record.updated,
  }, owner));
  assert.equal(pendingEdit.status, 200);
  const pendingView = await responseBody(pendingEdit);
  assert.equal(pendingView.changed, true);
  assert.equal(pendingView.record.title, "Renamed before publish");
  assert.equal(pendingView.record.status, "pending", "status is never editable");

  // 4. approve → verified (a moderator publishes it).
  const approved = await moderationRoute.PATCH(apiRequest("/api/moderation", {
    method: "PATCH",
    headers: { "x-osdb-user-email": identityFor(REVIEWERS.record) },
    body: { entity: "camera", id: record.id, action: "approve", reasonCode: "verified-public-infrastructure", actorId: REVIEWERS.record },
  }));
  assert.equal(approved.status, 200, "approve must succeed");
  const listing = await camerasRoute.GET(apiRequest("/api/cameras"));
  assert.ok((await responseBody(listing)).records.some((item) => item.id === record.id && item.status === "verified"));

  // 5. edit altrui: the outsider cannot edit the verified record → 403
  //    (moderators and non-owners act only through the moderation endpoints).
  const foreign = await cameraEditRoute.PATCH(editPatch(`/api/cameras/${record.id}`, {
    title: "Hijacked title",
  }, outsider));
  assert.equal(foreign.status, 403);

  // 6. edit verified: the owner's PATCH never touches `cameras` — it creates
  //    an edit request (binario moderazione) and answers 202.
  const verifiedEdit = await cameraEditRoute.PATCH(editPatch(`/api/cameras/${record.id}`, {
    title: "Community corrected title",
  }, owner));
  assert.equal(verifiedEdit.status, 202);
  const { editRequest } = await responseBody(verifiedEdit);
  assert.equal(editRequest.cameraId, record.id);
  assert.equal(editRequest.status, "pending");

  // The record is unchanged until a human decides.
  const publicRecord = await cameraEditRoute.GET(apiRequest(`/api/cameras/${record.id}`));
  const { record: stillOld } = await responseBody(publicRecord);
  assert.equal(stillOld.title, "Renamed before publish", "the public record must not change until approve");

  // The edit request is visible in the moderation queue (entity camera_edit).
  const queueResponse = await moderationRoute.GET(apiRequest("/api/moderation", {
    headers: { "x-osdb-user-email": identityFor(REVIEWERS.record) },
  }));
  const queue = await responseBody(queueResponse);
  const queuedEdit = queue.cameraEditRequests?.find((item) => item.id === editRequest.id);
  assert.ok(queuedEdit, "the edit request must appear in the moderation queue");
  assert.equal(queuedEdit.proposedTitle, "Community corrected title");
  assert.equal(queuedEdit.currentTitle, "Renamed before publish", "the queue carries old+new for the diff UI");

  // 7. re-moderation: a moderator approves the diff → the record changes.
  const decided = await moderationRoute.PATCH(apiRequest("/api/moderation", {
    method: "PATCH",
    headers: { "x-osdb-user-email": identityFor(REVIEWERS.record) },
    body: { entity: "camera_edit", id: editRequest.id, action: "approve", reasonCode: "verified-public-infrastructure", actorId: REVIEWERS.record },
  }));
  assert.equal(decided.status, 200, "camera_edit approve must succeed");

  const afterDecision = await cameraEditRoute.GET(apiRequest(`/api/cameras/${record.id}`));
  const { record: corrected } = await responseBody(afterDecision);
  assert.equal(corrected.title, "Community corrected title", "approve applies the diff to the public record");
  assert.equal(corrected.status, "verified", "status and freshness clocks are never touched");
});
