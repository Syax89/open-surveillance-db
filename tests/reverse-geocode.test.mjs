// Reverse geocoding unit tests (CEO 2026-08-07): db/reverse-geocode.ts.
//
// Contracts pinned here:
//   1. cache-first: a position already in geocode_reverse_cache (rounded
//      to 4 decimals ≈ 11 m) returns the stored address WITHOUT touching
//      the network (fetch stub counts calls);
//   2. miss → live Nominatim lookup with the identifying User-Agent, then
//      the reply is persisted under the ROUNDED key so a nearby record
//      (~11 m away) hits the cache;
//   3. Nominatim failures/empty replies return null and are never cached;
//   4. the rounded cache key collapses nearby coordinates into one row.
//
// The module is compiled into db-real/ (REAL_DB_MODULES) and runs against
// a fresh in-memory D1 with the REAL Drizzle migrations (0041 creates the
// geocode_reverse_cache table). globalThis.fetch is stubbed: no network.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { cleanupRouteTree, loadTreeModule } from "./helpers/api-harness.mjs";
import { D1SqliteDatabase as D1 } from "./helpers/d1-sqlite.mjs";
import { applyDrizzleMigrations } from "./helpers/db-runtime-harness.mjs";

let treeEnv;
let reverseGeocode;
let fetchCalls = 0;
let originalFetch;

const nominatimReply = (displayName) =>
  new Response(JSON.stringify({ display_name: displayName }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function stubFetch(impl) {
  globalThis.fetch = async (url, init) => {
    fetchCalls += 1;
    return impl(String(url), init);
  };
}

async function realModule() {
  if (!reverseGeocode) {
    ({ env: treeEnv } = await loadTreeModule("cloudflare-workers.mjs"));
    reverseGeocode = await loadTreeModule("db-real/reverse-geocode.mjs");
  }
  return reverseGeocode;
}

async function freshDb() {
  const db = new D1();
  await applyDrizzleMigrations(db);
  return db;
}

beforeEach(async () => {
  await realModule();
  fetchCalls = 0;
  originalFetch = globalThis.fetch;
});

after(async () => cleanupRouteTree());

test("cache miss: live lookup + the address is persisted under the rounded key", async () => {
  stubFetch(() => nominatimReply("Via Roma 12, Ferrara, Italia"));
  const db = await freshDb();

  const result = await reverseGeocode.reverseGeocode(db, 41.90282, 12.49638);
  assert.equal(result?.address, "Via Roma 12, Ferrara, Italia");
  assert.equal(result?.cached, false);
  assert.equal(fetchCalls, 1, "one live upstream call on a miss");

  // The reply is stored under the ROUNDED key (4 decimals).
  const row = await db.prepare("SELECT lat, lng, address FROM geocode_reverse_cache").first();
  assert.deepEqual([row.lat, row.lng], [41.9028, 12.4964], "the cache key is the rounded coordinate pair");
  assert.equal(row.address, "Via Roma 12, Ferrara, Italia");
});

test("cache hit: a nearby record (~11 m) reuses the stored address with ZERO network calls", async () => {
  stubFetch(() => nominatimReply("Via Roma 12, Ferrara, Italia"));
  const db = await freshDb();
  await reverseGeocode.reverseGeocode(db, 41.90282, 12.49638);

  fetchCalls = 0;
  // Same rounded cell, different precise coordinates: cache hit.
  const near = await reverseGeocode.reverseGeocode(db, 41.90279, 12.49642);
  assert.equal(near?.address, "Via Roma 12, Ferrara, Italia");
  assert.equal(near?.cached, true, "the nearby lookup hits the cache");
  assert.equal(fetchCalls, 0, "no upstream call on a cache hit");
});

test("cacheKey rounds to 4 decimals so two cameras on the same corner share one row", () => {
  const [lat, lng] = reverseGeocode.cacheKey(41.902816, 12.496374);
  assert.equal(lat, 41.9028);
  assert.equal(lng, 12.4964);
});

test("Nominatim failures and empty replies return null and are never cached", async () => {
  const db = await freshDb();

  stubFetch(() => new Response("{}", { status: 500 }));
  const failed = await reverseGeocode.reverseGeocode(db, 41.9, 12.49);
  assert.equal(failed, null);
  const afterFailure = await db.prepare("SELECT COUNT(*) AS n FROM geocode_reverse_cache").first();
  assert.equal(afterFailure.n, 0, "a failed lookup is never cached");

  stubFetch(() => nominatimReply(""));
  const empty = await reverseGeocode.reverseGeocode(db, 41.91, 12.5);
  assert.equal(empty, null);
  const afterEmpty = await db.prepare("SELECT COUNT(*) AS n FROM geocode_reverse_cache").first();
  assert.equal(afterEmpty.n, 0, "an empty reply is never cached");
});

test("a second lookup on the same rounded cell returns the STORED address — never re-fetches", async () => {
  stubFetch(() => nominatimReply("Via Roma 12, Ferrara, Italia"));
  const db = await freshDb();
  await reverseGeocode.reverseGeocode(db, 41.90282, 12.49638);

  // Same rounded cell ([41.9028, 12.4964] — keep decimals below the
  // rounding boundary), upstream would now answer differently: the
  // cache-first path must serve the stored value without any fetch.
  fetchCalls = 0;
  stubFetch(() => nominatimReply("Via Roma 12, Ferrara, Italia (nuova)"));
  const again = await reverseGeocode.reverseGeocode(db, 41.90283, 12.49642);
  assert.equal(again?.address, "Via Roma 12, Ferrara, Italia", "the cache-first lookup serves the stored address");
  assert.equal(again?.cached, true);
  assert.equal(fetchCalls, 0, "no upstream call — the reply was already persisted");
  const row = await db.prepare("SELECT address FROM geocode_reverse_cache").first();
  assert.equal(row.address, "Via Roma 12, Ferrara, Italia");
});

test("ON CONFLICT upsert keeps exactly one row per rounded cell (schema contract)", async () => {
  const db = await freshDb();
  // Direct upserts on the same rounded key (the path the live lookup uses
  // after a miss): the second write must UPDATE the same row, not insert.
  await db
    .prepare(
      "INSERT INTO geocode_reverse_cache (lat, lng, address, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(lat, lng) DO UPDATE SET address = excluded.address, updated_at = excluded.updated_at",
    )
    .bind(41.9028, 12.4964, "Prima risposta", "2026-08-07T10:00:00.000Z")
    .run();
  await db
    .prepare(
      "INSERT INTO geocode_reverse_cache (lat, lng, address, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(lat, lng) DO UPDATE SET address = excluded.address, updated_at = excluded.updated_at",
    )
    .bind(41.9028, 12.4964, "Seconda risposta", "2026-08-07T11:00:00.000Z")
    .run();
  const rows = await db.prepare("SELECT address FROM geocode_reverse_cache").all();
  assert.equal(rows.results.length, 1, "exactly one row per rounded cell");
  assert.equal(rows.results[0].address, "Seconda risposta", "the upsert updated the existing row");
});
