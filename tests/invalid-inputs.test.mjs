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
import { apiRequest, cleanupRouteTree, loadRoute, loadTreeModule, responseBody } from "./helpers/api-harness.mjs";
import { D1 } from "./helpers/d1-adapter.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

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

async function resetDb({ env, cameras }) {
  env.DB = new D1();
  await cameras.getD1();
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

  // The cameras table auto-seeds two demo rows whenever it is empty (a
  // behaviour locked by the fresh-DB test in db-public-contracts), so the
  // hostile record arrives alongside them.
  assert.equal(await countCameras(env), 3, "no rows deleted by the injection string");
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
  assert.equal(await countCameras(env), 4, "the cameras table is fully functional afterwards");
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
  assert.equal(request.cameraId, camera.id, "string id must be stored as the integer it represents");
  assert.equal(typeof request.cameraId, "number");
});

// ---------------------------------------------------------------------------
// Route layer: prototype-pollution keys and unknown fields
// ---------------------------------------------------------------------------

const camerasRoute = () => loadRoute("app/api/cameras/route.mjs");
const correctionsRoute = () => loadRoute("app/api/corrections/route.mjs");
const moderationRoute = () => loadRoute("app/api/moderation/route.mjs");

test("POST /api/cameras never forwards prototype-pollution or unknown keys to the db layer", async () => {
  stub("createPendingCamera", async (input) => ({ id: 9, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    apiRequest("/api/cameras", {
      method: "POST",
      body: '{"title":"Safe cam","kind":"Fixed dome","latitude":44.1,"longitude":12.2,"__proto__":{"admin":true},"constructor":{"prototype":{"polluted":true}},"extraField":"ignored"}',
    }),
  );
  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.equal(body.record.title, "Safe cam");

  const [args] = callArgs("createPendingCamera");
  assert.deepEqual(Object.keys(args[0]).sort(), [
    "address",
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
  assert.equal(Object.prototype.polluted, undefined, "Object.prototype must be untouched");
  assert.equal(Object.prototype.admin, undefined);
});

test("POST /api/corrections ignores unknown and prototype keys", async () => {
  stub("createCorrectionRequest", async (input) => ({ id: 4, ...input }));
  const { POST } = await correctionsRoute();
  const response = await POST(
    apiRequest("/api/corrections", {
      method: "POST",
      body: '{"issueType":"privacy concern","message":"Shows my house","__proto__":{"bypass":1},"admin":true,"cameraId":1}',
    }),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(await responseBody(response), { referenceId: 4 });

  const [args] = callArgs("createCorrectionRequest");
  assert.deepEqual(Object.keys(args[0]).sort(), ["cameraId", "contact", "issueType", "message"]);
  assert.equal(args[0].cameraId, 1);
  assert.equal(Object.prototype.bypass, undefined);
});

test("PATCH /api/moderation ignores privilege-like extra keys in the body", async () => {
  stub("moderateCamera", async (id, action, reasonCode, note) => ({
    item: { id, status: "verified" },
    event: { id: 1 },
  }));
  const { PATCH } = await moderationRoute();
  const response = await PATCH(
    apiRequest("/api/moderation", {
      method: "PATCH",
      body: JSON.stringify({
        entity: "camera",
        id: 3,
        action: "approve",
        reasonCode: "verified-public-infrastructure",
        note: "ok",
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
    [3, "approve", "verified-public-infrastructure", "ok", { publishManufacturer: false, publishObservedOn: false }],
    "only the documented moderation arguments may reach the db layer",
  );
});
