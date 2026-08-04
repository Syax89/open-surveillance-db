// H3 — Invalid and hostile input coverage.
//
// The route-level suites (api-cameras, api-corrections, api-moderation) cover
// malformed JSON, wrong types, out-of-range values and length limits with the
// db layer stubbed. This suite goes one layer deeper and fills the remaining
// hostile-input gaps:
//
//  1. DB layer (real SQL on in-memory SQLite through the D1 adapter):
//     SQL-injection payloads must be stored as inert text and never executed;
//     hostile unicode/control characters must round-trip exactly; oversized
//     strings must not crash the database (length limiting is the route's
//     job); null/empty optionals and boundary coordinates are stored verbatim.
//  2. Route layer: prototype-pollution keys (__proto__, constructor) and
//     unknown extra fields must never reach the db layer, and moderation
//     bodies carrying privilege-like extra keys must be parsed normally.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest as publicRequest, cleanupRouteTree, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
// Camera/correction intakes now require a VERIFIED session (write gate,
// Fase E1): the plain request helper stays for the moderation/identity
// tests below, the verified-session helper for the public intakes.
import { D1SqliteDatabase as D1 } from "./helpers/d1-sqlite.mjs";
import { applyDrizzleMigrations } from "./helpers/db-runtime-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

// Verified contributor session (write gate Fase E1): every public intake
// POST needs it. The gate itself has its own suite (tests/write-gate.test.mjs);
// here it is just the fixture that lets the hostile-input tests reach the
// body parsing they target.
const session = {
  id: 7,
  tokenHash: "hash",
  csrfToken: "csrf-token-123",
  createdAt: "2026-08-01T00:00:00.000Z",
  expiresAt: "2026-09-01T00:00:00.000Z",
  revokedAt: null,
};
const contributor = {
  id: 7,
  email: "linus@osdb.test",
  displayName: "Linus",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};
const verifiedRequest = (path, opts = {}) =>
  publicRequest(path, {
    ...opts,
    headers: {
      cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      "x-csrf-token": "csrf-token-123",
      ...(opts.headers ?? {}),
    },
  });
const stubVerifiedSession = () => {
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
};

// Route-level authz (ADR 0014): the moderation route derives the acting
// reviewer from the authenticated identity header. This suite acts as the
// Demo Record Reviewer (moderator coarse role, reviewer id 2) for the
// protected-route call below; the public cameras/corrections intakes ignore
// the header.
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

let treeEnv = null;
let realCameras = null;
let realCorrections = null;

async function realDb() {
  if (!realCameras) {
    ({ env: treeEnv } = await loadTreeModule("cloudflare-workers.mjs"));
    realCameras = await loadTreeModule("db-real/cameras.mjs");
    realCorrections = await loadTreeModule("db-real/corrections.mjs");
  }
  return { env: treeEnv, cameras: realCameras, corrections: realCorrections };
}

async function resetDb({ env }) {
  env.DB = new D1();
  // H3: the schema comes from the real Drizzle migrations (fresh-DB contract);
  // getD1() is a pure binding passthrough and bootstraps nothing.
  await applyDrizzleMigrations(env.DB);
  await env.DB.prepare("DELETE FROM cameras").run();
}

async function countCameras(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM cameras").first();
  return Number(row.count);
}

// ---------------------------------------------------------------------------
// DB layer: hostile strings through the real parameterised SQL
// ---------------------------------------------------------------------------

const hostileTitle = `'; DROP TABLE cameras;--`;
const hostileKind = `" OR "1"="1" --`;
const hostileAddress = `'; DELETE FROM moderation_events;--`;
const hostileNotes = `') ON CONFLICT DO NOTHING--`;

test("SQL injection payloads are stored as inert text and never executed", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  const record = await cameras.createPendingCamera({
    title: hostileTitle,
    kind: hostileKind,
    manufacturer: null,
    observedOn: null,
    address: hostileAddress,
    notes: hostileNotes,
    latitude: 44.1,
    longitude: 12.2,
  });

  assert.equal(record.title, hostileTitle, "payload must round-trip as literal text");
  assert.equal(record.kind, hostileKind);
  assert.equal(record.address, hostileAddress);
  assert.equal(record.notes, hostileNotes);

  // H3: the fresh DB starts empty (migrations only, no runtime demo seed),
  // so the hostile record is the only row in the cameras table.
  assert.equal(await countCameras(env), 1, "no rows deleted by the injection string");
  const publicRecords = await cameras.listPublicCameras();
  assert.equal(publicRecords.some((item) => item.id === record.id), false, "pending hostile record stays private");
  await cameras.createPendingCamera({
    title: "Still alive",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "",
    latitude: 44.1,
    longitude: 12.2,
  });
  assert.equal(await countCameras(env), 2, "the cameras table is fully functional afterwards");
});

test("hostile unicode and control characters round-trip exactly", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  // NUL bytes are deliberately excluded: node:sqlite truncates bound strings
  // at the first \x00 (a limitation of the test adapter; production D1 stores
  // TEXT as length-prefixed SQLite strings).
  const title = "🏗️ Телекамера \u202E\u202D\u2066 RTL\u2069 \u001F \"quoted\" 'apostrophe' \\backslash\\ tab\there";
  const record = await cameras.createPendingCamera({
    title,
    kind: "Traffic monitoring",
    manufacturer: "Ünïcode ©orp",
    observedOn: null,
    address: "Café 123",
    notes: "emoji 🎥 and newline\nhere",
    latitude: 44.1,
    longitude: 12.2,
  });

  assert.equal(record.title, title);
  assert.equal(record.manufacturer, "Ünïcode ©orp");
  assert.equal(record.address, "Café 123");
  assert.equal(record.notes, "emoji 🎥 and newline\nhere");
});

test("oversized strings are stored whole at the DB layer (the route is the truncation gate)", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  const huge = "A".repeat(100_000);
  const record = await cameras.createPendingCamera({
    title: huge,
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    address: huge,
    notes: huge,
    latitude: 44.1,
    longitude: 12.2,
  });

  assert.equal(record.title.length, 100_000);
  assert.equal(record.notes.length, 100_000);
  assert.equal(record.address.length, 100_000);
});

test("optional null and empty metadata are stored as null or empty as given", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  const record = await cameras.createPendingCamera({
    title: "Optionals",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "",
    latitude: 44.1,
    longitude: 12.2,
  });

  assert.equal(record.manufacturer, null);
  assert.equal(record.observedOn, null);
  assert.equal(record.address, null, "empty address normalised to null by the db layer");
  assert.equal(record.notes, "", "empty notes are kept as the empty string");
});

test("boundary coordinate values are stored verbatim", async () => {
  const { env, cameras } = await realDb();
  await resetDb({ env, cameras });
  const record = await cameras.createPendingCamera({
    title: "Edges",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "",
    latitude: 90,
    longitude: 180,
  });
  assert.equal(record.latitude, 90);
  assert.equal(record.longitude, 180);
});

test("numeric-string cameraId is coerced to an integer by SQLite affinity", async () => {
  const { env, cameras, corrections } = await realDb();
  await resetDb({ env, cameras });
  const camera = await cameras.createPendingCamera({
    title: "Target",
    kind: "Fixed dome",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "",
    latitude: 44.1,
    longitude: 12.2,
  });

  const request = await corrections.createCorrectionRequest({
    cameraId: String(camera.id),
    issueType: "inaccurate details",
    message: "Wrong kind",
    contact: "",
  });
  assert.equal(request.correction.cameraId, camera.id, "string id must be stored as the integer it represents");
  assert.equal(typeof request.correction.cameraId, "number");
});

// ---------------------------------------------------------------------------
// Route layer: prototype-pollution keys and unknown fields
// ---------------------------------------------------------------------------

const camerasRoute = () => loadRoute("app/api/cameras/route.mjs");
const correctionsRoute = () => loadRoute("app/api/corrections/route.mjs");
const moderationRoute = () => loadRoute("app/api/moderation/route.mjs");

test("POST /api/cameras never forwards prototype-pollution or unknown keys to the db layer", async () => {
  stubVerifiedSession();
  stub("createPendingCamera", async (input) => ({ id: 9, ...input }));
  stub("findNearbyPublicCameras", async () => []);
  const { POST } = await camerasRoute();
  const response = await POST(
    verifiedRequest("/api/cameras", {
      method: "POST",
      body: '{"title":"Safe cam","kind":"Fixed dome","latitude":44.1,"longitude":12.2,"__proto__":{"admin":true},"constructor":{"prototype":{"polluted":true}},"extraField":"ignored"}',
    }),
  );
  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.equal(body.record.title, "Safe cam");
  assert.deepEqual(body.possibleDuplicates, [], "duplicate check must complete with clean inputs");

  const [args] = callArgs("createPendingCamera");
  assert.deepEqual(Object.keys(args[0]).sort(), [
    "address",
    "contributorId",
    // Field-of-view bearing (t_1b08fe12): always forwarded to the db layer —
    // the route normalises it to null for dome cameras ("Fixed dome" here),
    // and an absent input becomes null (non-directional/unknown).
    "direction",
    "kind",
    "latitude",
    "longitude",
    "manufacturer",
    "notes",
    "observedOn",
    "title",
  ]);
  assert.equal(Object.hasOwn(args[0], "__proto__"), false, "the __proto__ key must never be forwarded");
  assert.equal(Object.hasOwn(args[0], "extraField"), false);

  const [duplicateArgs] = callArgs("findNearbyPublicCameras");
  assert.deepEqual(
    duplicateArgs,
    [44.1, 12.2, 75, { title: "Safe cam", address: "", kind: "Fixed dome" }],
    "the pre-submit duplicate check receives only the sanitised, trimmed fields",
  );

  assert.equal(Object.prototype.polluted, undefined, "Object.prototype must be untouched");
  assert.equal(Object.prototype.admin, undefined);
});

test("POST /api/corrections ignores unknown and prototype keys", async () => {
  stubVerifiedSession();
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 4, ...input } }));
  const { POST } = await correctionsRoute();
  const response = await POST(
    verifiedRequest("/api/corrections", {
      method: "POST",
      body: '{"issueType":"abuse","message":"Shows my house","__proto__":{"bypass":1},"admin":true,"cameraId":1}',
    }),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await responseBody(response), { referenceId: 4 });

  const [args] = callArgs("createCorrectionRequest");
  assert.deepEqual(Object.keys(args[0]).sort(), ["cameraId", "contact", "contributorId", "issueType", "message"]);
  assert.equal(args[0].cameraId, 1);
  assert.equal(Object.prototype.bypass, undefined);
});

test("PATCH /api/moderation ignores privilege-like extra keys in the body", async () => {
  stubModeratorAuth();
  stub("moderateCamera", async (id) => ({
    kind: "ok",
    item: { id, status: "verified" },
    event: { id: 1 },
    queue: { id: 10 },
  }));
  const { PATCH } = await moderationRoute();
  const response = await PATCH(
    authRequest("/api/moderation", {
      method: "PATCH",
      body: JSON.stringify({
        entity: "camera",
        id: 3,
        action: "approve",
        reasonCode: "verified-public-infrastructure",
        note: "ok",
        actorId: 2,
        admin: true,
        role: "root",
        force: true,
      }),
    }),
  );
  assert.equal(response.status, 200);

  const [args] = callArgs("moderateCamera");
  assert.deepEqual(
    args,
    [3, "approve", "verified-public-infrastructure", "ok", { publishManufacturer: false, publishObservedOn: false }, { actorId: 2 }],
    "only the documented moderation arguments may reach the db layer",
  );
});
