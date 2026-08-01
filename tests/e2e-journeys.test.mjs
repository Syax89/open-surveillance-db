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
import { cleanupE2ETree, e2eEnv, loadE2ERoute } from "./helpers/e2e-harness.mjs";

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
  password: "supersecret123",
};

// ---------------------------------------------------------------------------
// Harness wiring (same as auth-flow-e2e)
// ---------------------------------------------------------------------------

let env;
let camerasRoute;
let moderationRoute;
let registerRoute;
let loginRoute;
let meRoute;
let submissionsRoute;
let logoutRoute;

beforeEach(async () => {
  env = await e2eEnv();
  env.DB = new D1SqliteDatabase();
  await applyDrizzleMigrations(env.DB);
  await seedDemoIdentities(env.DB);
  const load = async (name, routePath) => (await loadE2ERoute(routePath));
  camerasRoute = await load("cameras", "app/api/cameras/route.mjs");
  moderationRoute = await load("moderation", "app/api/moderation/route.mjs");
  registerRoute = await load("register", "app/api/auth/register/route.mjs");
  loginRoute = await load("login", "app/api/auth/login/route.mjs");
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

test("journey segnala: the report form renders on the SSR home (no JS needed to see it)", async () => {
  const { response, html } = await ssr("/");
  assert.equal(response.status, 200);
  assert.match(html, /<form class="report-form"/, "the report form must be part of the home SSR");
  assert.match(html, /id="report"/, "the segnala section anchor must exist");
});

test("journey segnala: submit → moderation queue → approve → public listing → record detail", async () => {
  // 1. The contributor submits the report through the real route.
  const submitted = await camerasRoute.POST(apiRequest("/api/cameras", {
    method: "POST",
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
  assert.match(detail.html, new RegExp(record.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "the record detail must show the title");
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
