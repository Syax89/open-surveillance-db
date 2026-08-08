// Runtime API tests for /api/cameras and /api/cameras/nearby.
// The route handlers are exercised with real Request objects against a mocked
// db layer; every test asserts actual HTTP status codes and response bodies.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

// Session fixture (ADR 0013 double-submit CSRF): the write gate (Fase E1)
// resolves the session cookie through resolveOptionalContributor ->
// findSessionByToken (stubbed), requires same-origin + x-csrf-token, then
// requires a VERIFIED contributor (getContributorVerification stubbed).
const session = {
  id: 7,
  tokenHash: "hash",
  csrfToken: "csrf-token-123",
  createdAt: "2026-08-01T00:00:00.000Z",
  expiresAt: "2026-09-01T00:00:00.000Z",
  revokedAt: null,
};
const contributor = { id: 7, email: "linus@osdb.test", displayName: "Linus", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" };

// POST with a verified session cookie + CSRF (the default for intake tests —
// the gate itself has its own suite, tests/write-gate.test.mjs).
function sessionPost(body, headers = {}) {
  return apiRequest("/api/cameras", {
    method: "POST",
    body,
    headers: {
      cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      "x-csrf-token": "csrf-token-123",
      ...headers,
    },
  });
}

beforeEach(() => {
  resetMockState();
  // The JSON list now computes facets inline; every list test gets the empty
  // facet shape unless it overrides the stub.
  stub("getPublicCameraFacets", defaultFacets);
  // Write gate (Fase E1): a VERIFIED session by default — the intake
  // validation tests below focus on the payload; the gate itself has its own
  // dedicated suite (tests/write-gate.test.mjs). Tests that exercise the gate
  // (anonymous / unverified / CSRF) override these stubs.
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
});
after(async () => cleanupRouteTree());

const camerasRoute = () => loadRoute("app/api/cameras/route.mjs");
const nearbyRoute = () => loadRoute("app/api/cameras/nearby/route.mjs");

// Facets contract (FRONTEND_PLAN § 3.2.2): the JSON list carries the facets
// inline so the filter UI gets kinds/freshness in one round-trip.
const emptyFacets = { kinds: [], freshness: { "7d": 0, "30d": 0, "90d": 0, all: 0 } };
const defaultFacets = async () => emptyFacets;

const cameraFixture = {
  id: 1,
  title: "Sample camera",
  kind: "Fixed dome",
  manufacturer: "Acme",
  observedOn: "2026-01-01",
  publishManufacturer: 1,
  publishObservedOn: 1,
  address: "Via Roma 1",
  notes: "",
  latitude: 41.9004,
  longitude: 12.4936,
  // Dome fixture (kind "Fixed dome"): the dome rule (t_1b08fe12) means the
  // stored direction is always NULL — the map renders it circular.
  direction: null,
  status: "active",
  source: "Community report",
  updated: "2026-01-01T00:00:00.000Z",
  description: "",
  createdAt: "2026-01-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// GET /api/cameras — public listing and export formats
// ---------------------------------------------------------------------------

test("GET /api/cameras returns the public list as JSON by default", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [cameraFixture], total: 1, nextOffset: null }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=300, stale-while-revalidate=600", "the directory list is cached for a bounded window and revalidated after moderation decisions");
  assert.equal(response.headers.get("cache-tag"), "cameras-list", "the list carries the shared list cache-tag for moderation purge");
  assert.deepEqual(await responseBody(response), { records: [cameraFixture], total: 1, nextOffset: null });
  assert.deepEqual(callArgs("listPublicCamerasPage")[0], [{}, { limit: 500, offset: 0 }], "the default page is the first 500 records");
  assert.equal(callArgs("getPublicCameraFacets").length, 0, "facets are OPT-IN (QA#5 F2): the default JSON list never pays for the two full-set aggregates");
});

test("GET /api/cameras?facets=1 includes the facets for the filter UI (opt-in, QA#5 F2)", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [cameraFixture], total: 1, nextOffset: null }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?facets=1"));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { records: [cameraFixture], total: 1, nextOffset: null, facets: emptyFacets });
  assert.equal(callArgs("getPublicCameraFacets").length, 1, "the facets are computed only when the filter UI requests them");
});

test("GET /api/cameras?format=geojson emits lon/lat FeatureCollection with export headers", async () => {
  stub("listPublicCameras", async () => [cameraFixture]);
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?format=geojson"));

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-disposition"),
    /filename=opensurveillancedb-cameras\.geojson/,
  );
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=3600", "export snapshots may be cached for a bounded window");
  assert.equal(response.headers.get("cache-tag"), "cameras-export", "exports carry the shared export cache-tag for moderation purge");
  const body = await responseBody(response);
  assert.equal(body.type, "FeatureCollection");
  // ODbL 1.0 attribution (TERMS § 7.1): the FeatureCollection must carry the
  // licence id and the attribution notice as top-level members.
  assert.equal(body.license, "ODbL-1.0");
  assert.match(body.attribution, /© OpenSurveillanceDB contributors — ODbL 1\.0/);
  assert.match(body.attribution, /opendatacommons\.org\/licenses\/odbl\/1\.0\//);
  assert.equal(body.features.length, 1);
  const feature = body.features[0];
  assert.equal(feature.type, "Feature");
  assert.deepEqual(feature.geometry, { type: "Point", coordinates: [12.4936, 41.9004] });
  assert.equal(feature.properties.id, cameraFixture.id);
  assert.equal(feature.properties.title, cameraFixture.title);
  assert.equal(feature.properties.direction, null, "the dome fixture carries direction null in GeoJSON properties");
});

test("GET /api/cameras?format=geojson exposes a directional camera's bearing in properties.direction", async () => {
  const directional = { ...cameraFixture, kind: "PTZ", direction: 135 };
  stub("listPublicCameras", async () => [directional]);
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?format=geojson"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.features[0].properties.direction, 135, "a directional camera carries its bearing in properties");
});

test("GET /api/cameras?format=csv exports a directional camera's bearing in the trailing direction column", async () => {
  const directional = { ...cameraFixture, kind: "PTZ", direction: 135 };
  stub("listPublicCameras", async () => [directional]);
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?format=csv"));
  assert.equal(response.status, 200);
  const csv = await responseBody(response);
  assert.match(
    csv,
    /"41\.9004","12\.4936","135"\n/,
    "a directional camera's bearing must appear in the trailing direction column",
  );
});

test("GET /api/cameras?format=csv escapes quotes and neutralises spreadsheet formulas", async () => {
  const hostile = {
    ...cameraFixture,
    id: 1,
    title: "=SUM(A1:A2)",
    kind: "Fixed dome",
    manufacturer: "-leading",
    observedOn: "2026-01-01",
    status: "active",
    source: "Community report",
    updated: "2026-01-01T00:00:00.000Z",
    description: 'He said "hi", ok',
    address: null,
    latitude: 41.9004,
    longitude: 12.4936,
  };
  stub("listPublicCameras", async () => [hostile]);
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?format=csv"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/csv; charset=utf-8/);
  assert.match(response.headers.get("content-disposition"), /filename=opensurveillancedb-cameras\.csv/);
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=3600", "export snapshots may be cached for a bounded window");
  assert.equal(response.headers.get("cache-tag"), "cameras-export", "exports carry the shared export cache-tag for moderation purge");
  const csv = await responseBody(response);
  assert.match(csv, /^id,title,kind,manufacturer,observed_on,status,source,updated,description,address,latitude,longitude,direction\n/);
  assert.match(
    csv,
    /"1","'=SUM\(A1:A2\)","Fixed dome","'-leading","2026-01-01","active","Community report","2026-01-01T00:00:00\.000Z","He said ""hi"", ok","","41\.9004","12\.4936",""\n/,
    "formula injection must be neutralised with a leading apostrophe, quotes doubled, nulls empty (direction NULL = blank cell)",
  );
  // ODbL 1.0 attribution (TERMS § 7.1): the CSV export must end with the
  // licence notice as a comment line, keeping the header row parseable.
  assert.match(
    csv,
    /# © OpenSurveillanceDB contributors — ODbL 1\.0 \(https:\/\/opendatacommons\.org\/licenses\/odbl\/1\.0\/\); attribution e share-alike richiesti per database derivati\n$/,
    "the CSV export must carry the ODbL notice footer",
  );
});

test("GET /api/cameras ignores unknown format values and returns JSON", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [cameraFixture], total: 1, nextOffset: null }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?format=xml"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { records: [cameraFixture], total: 1, nextOffset: null });
});

test("GET /api/cameras?kind= filters the public list by an exact, parameterised category", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [cameraFixture], total: 1, nextOffset: null }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?kind=Fixed%20dome"));

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { records: [cameraFixture], total: 1, nextOffset: null });
  assert.deepEqual(callArgs("listPublicCamerasPage")[0], [{ kind: "Fixed dome" }, { limit: 500, offset: 0 }]);
});

test("GET /api/cameras trims and bounds the kind filter and ignores blank values", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [cameraFixture], total: 1, nextOffset: null }));
  const { GET } = await camerasRoute();

  const trimmed = await GET(apiRequest("/api/cameras?kind=%20%20PTZ%20%20"));
  assert.equal(trimmed.status, 200);
  assert.deepEqual(callArgs("listPublicCamerasPage")[0], [{ kind: "PTZ" }, { limit: 500, offset: 0 }]);

  await GET(apiRequest("/api/cameras?kind=%20%20"));
  assert.deepEqual(callArgs("listPublicCamerasPage")[1], [{}, { limit: 500, offset: 0 }], "a blank kind must not filter");

  await GET(apiRequest(`/api/cameras?kind=${"K".repeat(80)}`));
  assert.deepEqual(callArgs("listPublicCamerasPage")[2], [{ kind: "K".repeat(60) }, { limit: 500, offset: 0 }], "the kind filter must be capped at the schema limit");
});

test("GET /api/cameras?freshness= applies a whitelisted verification-freshness window", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [cameraFixture], total: 1, nextOffset: null }));
  const { GET } = await camerasRoute();

  const response = await GET(apiRequest("/api/cameras?freshness=7d"));
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("listPublicCamerasPage")[0], [{ freshness: "7d" }, { limit: 500, offset: 0 }]);

  await GET(apiRequest("/api/cameras?freshness=30d&kind=Dome"));
  assert.deepEqual(callArgs("listPublicCamerasPage")[1], [{ kind: "Dome", freshness: "30d" }, { limit: 500, offset: 0 }]);
});

test("GET /api/cameras treats freshness=all and an absent freshness as no filter", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [cameraFixture], total: 1, nextOffset: null }));
  const { GET } = await camerasRoute();

  await GET(apiRequest("/api/cameras?freshness=all"));
  assert.deepEqual(callArgs("listPublicCamerasPage")[0], [{}, { limit: 500, offset: 0 }]);

  await GET(apiRequest("/api/cameras"));
  assert.deepEqual(callArgs("listPublicCamerasPage")[1], [{}, { limit: 500, offset: 0 }]);
});

test("GET /api/cameras rejects freshness values outside the whitelist with 400", async (t) => {
  const { GET } = await camerasRoute();
  for (const freshness of ["1d", "365d", "week", "7D", "", "7 d"]) {
    await t.test(`freshness=${JSON.stringify(freshness)}`, async () => {
      const response = await GET(apiRequest(`/api/cameras?freshness=${encodeURIComponent(freshness)}`));
      assert.equal(response.status, 400, freshness);
      const body = await responseBody(response);
      assert.match(body.error, /Unknown freshness window/, freshness);
      assert.equal(callArgs("listPublicCamerasPage").length, 0, "no query must run for an invalid window");
    });
  }
});

test("GET /api/cameras rejects sort values outside the ranking whitelist with 400", async (t) => {
  const { GET } = await camerasRoute();
  for (const sort of ["helpful", "likes", "votes", "", "useful;DROP", "USEFUL"]) {
    await t.test(`sort=${JSON.stringify(sort)}`, async () => {
      const response = await GET(apiRequest(`/api/cameras?sort=${encodeURIComponent(sort)}`));
      assert.equal(response.status, 400, sort);
      const body = await responseBody(response);
      assert.match(body.error, /Unknown sort option/, sort);
      assert.equal(callArgs("listPublicCamerasPage").length, 0, "no query must run for an invalid sort");
    });
  }
});

test("GET /api/cameras forwards a valid ranking sort to the paginated query", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [cameraFixture], total: 1, nextOffset: null }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?sort=useful"));
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("listPublicCamerasPage")[0], [{ sort: "useful" }, { limit: 500, offset: 0 }]);
});

test("GET /api/cameras export formats honour the same safe filters", async () => {
  stub("listPublicCameras", async () => [cameraFixture]);
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?format=csv&kind=Fixed%20dome&freshness=90d"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /filename=opensurveillancedb-cameras\.csv/);
  assert.deepEqual(callArgs("listPublicCameras")[0], [{ kind: "Fixed dome", freshness: "90d" }]);
});

test("GET /api/cameras forwards limit and offset to the paginated query and reports total/nextOffset", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [cameraFixture], total: 1_327, nextOffset: 525 }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?limit=25&offset=500"));

  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.records, [cameraFixture]);
  assert.equal(body.total, 1327);
  assert.equal(body.nextOffset, 525, "nextOffset is surfaced verbatim so clients can fetch the next page");
  assert.deepEqual(callArgs("listPublicCamerasPage")[0], [{}, { limit: 25, offset: 500 }]);
});

test("GET /api/cameras clamps limit above the max and accepts a zero offset", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await camerasRoute();

  await GET(apiRequest("/api/cameras?limit=999999"));
  assert.deepEqual(callArgs("listPublicCamerasPage")[0], [{}, { limit: 500, offset: 0 }], "an over-max limit is clamped to the maximum page");

  await GET(apiRequest("/api/cameras?limit=500&offset=0"));
  assert.deepEqual(callArgs("listPublicCamerasPage")[1], [{}, { limit: 500, offset: 0 }], "offset 0 is valid");

  await GET(apiRequest("/api/cameras?limit="));
  assert.deepEqual(callArgs("listPublicCamerasPage")[2], [{}, { limit: 500, offset: 0 }], "a blank limit falls back to the default page size, like an absent one");
});

test("GET /api/cameras rejects invalid limit and offset values with 400", async (t) => {
  const { GET } = await camerasRoute();
  const cases = [
    { name: "limit text", query: "limit=abc" },
    { name: "limit negative", query: "limit=-5" },
    { name: "limit decimal", query: "limit=1.5" },
    { name: "limit zero", query: "limit=0" },
    { name: "offset text", query: "offset=abc" },
    { name: "offset negative", query: "offset=-3" },
    { name: "offset decimal", query: "offset=2.5" },
    // review P2-4 / kanban t_e86c91c4: huge-but-valid integers are NO
    // longer rejected here — the anti-DoS guard moved to the db boundary
    // (offset >= total → empty page, no SELECT). See the offset-acceptance
    // tests below for MAX_SAFE_INTEGER and offsets beyond the old 10000 cap.
  ];
  for (const { name, query } of cases) {
    await t.test(name, async () => {
      const response = await GET(apiRequest(`/api/cameras?${query}`));
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("listPublicCamerasPage").length, 0, "no query must run for invalid pagination");
    });
  }
});

test("GET /api/cameras accepts offsets beyond the old MAX_PAGE_OFFSET when the dataset is larger (t_e86c91c4)", async () => {
  // The fixed 10000 cap (PR #250) broke the /directory walk once the dataset
  // grew past 10000 records: the client requested offset 10500..12000 and got
  // 400 → empty state. The route now forwards any non-negative offset to the
  // db layer, which answers an empty page for offset >= total.
  stub("listPublicCamerasPage", async () => ({ records: [], total: 12_284, nextOffset: null }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?offset=12000"));
  assert.equal(response.status, 200, "an offset past the old cap is accepted, not 400");
  assert.deepEqual(callArgs("listPublicCamerasPage")[0], [{}, { limit: 500, offset: 12000 }]);
});

test("GET /api/cameras forwards a MAX_SAFE_INTEGER offset to the db guard (anti-DoS at the boundary, not the route)", async () => {
  // review P2-4: the route no longer rejects ?offset=9007199254740991 with
  // 400 before any db work — the db boundary answers an empty page WITHOUT
  // running the SELECT (offset >= total), which is the actual protection
  // against an astronomical SQL OFFSET. The route only checks syntax.
  stub("listPublicCamerasPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?offset=9007199254740991"));
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("listPublicCamerasPage")[0], [{}, { limit: 500, offset: 9007199254740991 }]);
});

test("GET /api/cameras accepts an offset at the old MAX_PAGE_OFFSET boundary", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?offset=10000"));
  assert.equal(response.status, 200, "offset == 10000 stays accepted (no cap regression)");
  assert.deepEqual(callArgs("listPublicCamerasPage")[0], [{}, { limit: 500, offset: 10000 }]);
});

test("GET /api/cameras export formats ignore pagination parameters entirely", async () => {
  stub("listPublicCameras", async () => [cameraFixture]);
  const { GET } = await camerasRoute();
  // Exports are complete snapshots: pagination params are not validated and
  // the full list is returned even with an absurd limit.
  const response = await GET(apiRequest("/api/cameras?format=csv&limit=abc&offset=-1"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /filename=opensurveillancedb-cameras\.csv/);
  assert.equal(callArgs("listPublicCamerasPage").length, 0, "the paginated query must never run for exports");
});

test("GET /api/cameras returns 503 when the database is unavailable", async () => {
  stub("listPublicCamerasPage", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras"));
  assert.equal(response.status, 503);
  const body = await responseBody(response);
  assert.equal(body.error, "Database unavailable");
});

// ---------------------------------------------------------------------------
// POST /api/cameras — community reports
// ---------------------------------------------------------------------------

test("POST /api/cameras stores a trimmed, date-validated report for immediate publication (ADR 0021)", async () => {
  stub("createCamera", async (input) => ({ id: 7, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionPost({
        title: "  Nuova telecamera  ",
        kind: "  PTZ  ",
        manufacturer: "  VendorCorp  ",
        observedOn: "2026-07-01",
        address: "  Via Roma 12  ",
        notes: "  vista sul parco  ",
        latitude: 44.1,
        longitude: 12.2,
      }),
  );

  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.equal(body.record.id, 7);
  assert.deepEqual(callArgs("createCamera")[0], [
    {
      title: "Nuova telecamera",
      kind: "PTZ",
      manufacturer: "VendorCorp",
      observedOn: "2026-07-01",
      address: "Via Roma 12",
      notes: "vista sul parco",
      latitude: 44.1,
      longitude: 12.2,
      // Absent direction = non-directional/unknown (NULL), t_1b08fe12.
      direction: null,
      contributorId: 7,
    },
  ]);
});

test("POST /api/cameras without optional metadata passes nulls and empty strings", async () => {
  stub("createCamera", async (input) => ({ id: 8, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionPost({ title: "Minimal", kind: "Dome", latitude: 45.0, longitude: 9.0 }),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(callArgs("createCamera")[0][0], {
    title: "Minimal",
    kind: "Dome",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "",
    latitude: 45,
    longitude: 9,
    direction: null,
    contributorId: 7,
  });
});

test("POST /api/cameras rejects missing or blank required fields", async (t) => {
  const { POST } = await camerasRoute();
  const cases = [
    { name: "empty body", body: {} },
    { name: "missing kind", body: { title: "X", latitude: 1, longitude: 1 } },
    { name: "missing title", body: { kind: "X", latitude: 1, longitude: 1 } },
    { name: "blank title", body: { title: "   ", kind: "X", latitude: 1, longitude: 1 } },
    { name: "blank kind", body: { title: "X", kind: "\n\t", latitude: 1, longitude: 1 } },
    { name: "missing coordinates", body: { title: "X", kind: "Y" } },
  ];
  for (const { name, body } of cases) {
    await t.test(name, async () => {
      const response = await POST(sessionPost(body));
      assert.equal(response.status, 400, name);
      const parsed = await responseBody(response);
      assert.match(parsed.error, /A title, type, valid position/, name);
      assert.equal(callArgs("createCamera").length, 0, "no write must happen");
    });
  }
});

test("POST /api/cameras rejects non-numeric or out-of-range coordinates", async (t) => {
  const { POST } = await camerasRoute();
  const cases = [
    { name: "latitude text", lat: "abc" },
    { name: "latitude decimal comma", lat: "12,5" },
    { name: "latitude above 90", lat: 91 },
    { name: "latitude below -90", lat: -90.0001 },
    { name: "longitude above 180", lat: 0, lon: 180.0001 },
    { name: "longitude below -180", lat: 0, lon: -181 },
    { name: "longitude text", lat: 0, lon: "east" },
  ];
  for (const { name, lat, lon } of cases) {
    await t.test(name, async () => {
      const response = await POST(
        sessionPost({ title: "X", kind: "Y", latitude: lat, longitude: lon ?? 10 }),
      );
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("createCamera").length, 0, name);
    });
  }
});

test("POST /api/cameras accepts coordinate boundary values", async () => {
  stub("createCamera", async (input) => ({ id: 9, ...input }));
  const { POST } = await camerasRoute();
  for (const [latitude, longitude] of [[-90, -180], [90, 180], [0, 0]]) {
    const response = await POST(
      sessionPost({ title: "Edge", kind: "Dome", latitude, longitude }),
    );
    assert.equal(response.status, 201, `${latitude},${longitude}`);
  }
});

test("POST /api/cameras accepts only exact, real calendar dates", async (t) => {
  const { POST } = await camerasRoute();
  const cases = [
    "2026-13-01",
    "2026-02-30",
    "2026-00-10",
    "2026-2-01",
    "2026/07/01",
    "abcdefghij",
    "26-07-01",
  ];
  for (const observedOn of cases) {
    await t.test(`observedOn=${observedOn}`, async () => {
      const response = await POST(
        sessionPost({ title: "X", kind: "Y", latitude: 1, longitude: 1, observedOn }),
      );
      assert.equal(response.status, 400, observedOn);
    });
  }
});

test("POST /api/cameras accepts a direction bearing between 0 and 359 and stores it", async () => {
  stub("createCamera", async (input) => ({ id: 30, ...input }));
  const { POST } = await camerasRoute();
  for (const direction of [0, 1, 90, 180, 359]) {
    const response = await POST(
      sessionPost({ title: "X", kind: "PTZ", latitude: 1, longitude: 1, direction }),
    );
    assert.equal(response.status, 201, `direction=${direction}`);
    assert.equal(callArgs("createCamera").at(-1)[0].direction, direction, `direction=${direction} must be stored verbatim (0 is a valid north bearing, never falsy)`);
  }
});

test("POST /api/cameras accepts direction null and stores NULL (non-directional / clear)", async () => {
  stub("createCamera", async (input) => ({ id: 31, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionPost({ title: "X", kind: "PTZ", latitude: 1, longitude: 1, direction: null }),
  );
  assert.equal(response.status, 201);
  assert.equal(callArgs("createCamera")[0][0].direction, null, "an explicit null direction is stored as NULL");
});

test("POST /api/cameras rejects out-of-range or non-integer direction with 422", async (t) => {
  const { POST } = await camerasRoute();
  const cases = [
    ["above 359", 360],
    ["negative", -1],
    ["decimal", 45.5],
    ["numeric string", "45"],
    ["boolean", true],
    ["array", [45]],
  ];
  for (const [name, direction] of cases) {
    await t.test(name, async () => {
      const response = await POST(
        sessionPost({ title: "X", kind: "PTZ", latitude: 1, longitude: 1, direction }),
      );
      assert.equal(response.status, 422, `${name} must answer 422 (distinct from the 400 shape errors)`);
      const body = await responseBody(response);
      assert.match(body.error, /direction/, `${name} error must name the field`);
      assert.equal(callArgs("createCamera").length, 0, `${name}: no write before validation`);
    });
  }
});

test("POST /api/cameras ignores direction for dome cameras (dome rule, stored NULL)", async () => {
  stub("createCamera", async (input) => ({ id: 32, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionPost({ title: "Dome cam", kind: "Fixed dome", latitude: 1, longitude: 1, direction: 90 }),
  );
  assert.equal(response.status, 201);
  assert.equal(
    callArgs("createCamera")[0][0].direction,
    null,
    "a dome camera never stores a bearing: the supplied direction is normalised to NULL (t_1b08fe12 dome rule)",
  );
});

test("POST /api/cameras truncates long fields to their documented limits", async () => {
  stub("createCamera", async (input) => ({ id: 10, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionPost({
      title: "T".repeat(95),
      kind: "K".repeat(70),
      address: "A".repeat(200),
      notes: "N".repeat(1200),
      manufacturer: "M".repeat(90),
      latitude: 1,
      longitude: 1,
    }),
  );
  assert.equal(response.status, 201);
  const input = callArgs("createCamera")[0][0];
  assert.equal(input.title.length, 90);
  assert.equal(input.kind.length, 60);
  assert.equal(input.address.length, 180);
  assert.equal(input.notes.length, 1000);
  assert.equal(input.manufacturer.length, 80);
});

test("POST /api/cameras normalises an ISO datetime observedOn to its date part", async () => {
  stub("createCamera", async (input) => ({ id: 11, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionPost({
        title: "X",
        kind: "Y",
        latitude: 1,
        longitude: 1,
        observedOn: "2026-07-01T23:59:59.000Z",
      }),
  );
  assert.equal(response.status, 201);
  assert.equal(callArgs("createCamera")[0][0].observedOn, "2026-07-01");
});

test("POST /api/cameras maps malformed JSON bodies to 400", async () => {
  stub("createCamera", async (input) => ({ id: 12, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionPost('{"title": broken'),
  );
  assert.equal(response.status, 400);
  const body = await responseBody(response);
  assert.ok(body.error, "an error message must be returned");
  assert.equal(callArgs("createCamera").length, 0, "no db write for malformed JSON");
});

test("POST /api/cameras rejects non-object JSON bodies", async () => {
  const { POST } = await camerasRoute();
  for (const body of ["42", "[1,2]", '"hello"']) {
    const response = await POST(sessionPost(body));
    assert.equal(response.status, 400, body);
    assert.equal(callArgs("createCamera").length, 0, body);
  }
});

test("POST /api/cameras rejects a JSON null body with 400 (OSDB-QA-001)", async () => {
  const { POST } = await camerasRoute();
  const response = await POST(sessionPost("null"));
  assert.equal(response.status, 400);
  assert.equal(callArgs("createCamera").length, 0);
});

test("POST /api/cameras rejects non-string observedOn values", async (t) => {
  const { POST } = await camerasRoute();
  for (const observedOn of [20260701, { year: 2026 }, ["2026-07-01"], true]) {
    await t.test(`observedOn=${JSON.stringify(observedOn)}`, async () => {
      const response = await POST(
        sessionPost({ title: "X", kind: "Y", latitude: 1, longitude: 1, observedOn }),
      );
      assert.equal(response.status, 400, JSON.stringify(observedOn));
      assert.equal(callArgs("createCamera").length, 0);
    });
  }
});

test("POST /api/cameras maps database failures to 500 with a generic client-safe message", async () => {
  // The route must not leak the underlying error message to the client
  // (pre-hosting hardening): the status is 500, the message is generic.
  stub("createCamera", async () => {
    throw new Error("Report could not be stored");
  });
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionPost({ title: "X", kind: "Y", latitude: 1, longitude: 1 }),
  );
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to save report");
});

test("POST /api/cameras coerces empty-string and null coordinates to 0,0", async () => {
  // Documented edge case: Number("") === 0 and Number(null) === 0, so the
  // bounds check passes and the record is stored at 0,0. Flagged for review.
  stub("createCamera", async (input) => ({ id: 13, ...input }));
  const { POST } = await camerasRoute();
  for (const latitude of ["", null]) {
    const response = await POST(
      sessionPost({ title: "X", kind: "Y", latitude, longitude: latitude }),
    );
    assert.equal(response.status, 201, `latitude=${String(latitude)}`);
    assert.deepEqual(
      [callArgs("createCamera")[0][0].latitude, callArgs("createCamera")[0][0].longitude],
      [0, 0],
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/cameras/nearby
// ---------------------------------------------------------------------------

const nearbyFixture = { ...cameraFixture, distanceMeters: 42 };

test("nearby search passes bounded coordinates and pagination to the helper", async () => {
  stub("findNearbyPublicCamerasPage", async () => ({ records: [nearbyFixture], total: 1, nextOffset: null }));
  const { GET } = await nearbyRoute();
  const response = await GET(apiRequest("/api/cameras/nearby?latitude=41.9&longitude=12.49&radius=75"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { records: [nearbyFixture], total: 1, nextOffset: null });
  assert.deepEqual(callArgs("findNearbyPublicCamerasPage")[0], [41.9, 12.49, 75, { limit: 50, offset: 0 }], "the default nearby page is 50 records (FRONTEND_PLAN § 3.2.3)");
});

test("nearby search defaults the radius to 75 metres", async () => {
  stub("findNearbyPublicCamerasPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await nearbyRoute();
  const response = await GET(apiRequest("/api/cameras/nearby?latitude=41.9&longitude=12.49"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store", "duplicate-warning data must never be cached");
  assert.deepEqual(callArgs("findNearbyPublicCamerasPage")[0], [41.9, 12.49, 75, { limit: 50, offset: 0 }]);
});

test("nearby search forwards explicit limit/offset and clamps an over-max limit", async () => {
  stub("findNearbyPublicCamerasPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await nearbyRoute();

  const explicit = await GET(apiRequest("/api/cameras/nearby?latitude=0&longitude=0&radius=50&limit=8&offset=16"));
  assert.equal(explicit.status, 200);
  assert.deepEqual(callArgs("findNearbyPublicCamerasPage")[0], [0, 0, 50, { limit: 8, offset: 16 }], "the pre-submit form requests a compact page");

  const clamped = await GET(apiRequest("/api/cameras/nearby?latitude=0&longitude=0&limit=999999"));
  assert.equal(clamped.status, 200);
  assert.deepEqual(callArgs("findNearbyPublicCamerasPage")[1], [0, 0, 75, { limit: 100, offset: 0 }], "an over-max limit is clamped to 100");
});

test("nearby search accepts boundary radius values 10 and 500", async () => {
  stub("findNearbyPublicCamerasPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await nearbyRoute();
  for (const radius of [10, 500]) {
    const response = await GET(
      apiRequest(`/api/cameras/nearby?latitude=0&longitude=0&radius=${radius}`),
    );
    assert.equal(response.status, 200, `radius=${radius}`);
  }
});

test("nearby search rejects missing or invalid coordinates", async (t) => {
  const { GET } = await nearbyRoute();
  const cases = [
    { name: "no parameters", query: "" },
    { name: "latitude text", query: "latitude=abc&longitude=12" },
    { name: "latitude above 90", query: "latitude=90.5&longitude=12" },
    { name: "latitude below -90", query: "latitude=-91&longitude=12" },
    { name: "longitude above 180", query: "latitude=0&longitude=181" },
    { name: "longitude below -180", query: "latitude=0&longitude=-180.1" },
    { name: "empty latitude", query: "latitude=&longitude=12" },
  ];
  for (const { name, query } of cases) {
    await t.test(name, async () => {
      const response = await GET(apiRequest(`/api/cameras/nearby?${query}`));
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("findNearbyPublicCamerasPage").length, 0, name);
    });
  }
});

test("nearby search rejects radius outside 10–500 metres", async (t) => {
  const { GET } = await nearbyRoute();
  const cases = [
    { name: "radius below 10", radius: "9" },
    { name: "radius above 500", radius: "501" },
    { name: "radius text", radius: "abc" },
    { name: "radius blank", radius: "" },
    { name: "radius negative", radius: "-5" },
  ];
  for (const { name, radius } of cases) {
    await t.test(name, async () => {
      const response = await GET(
        apiRequest(`/api/cameras/nearby?latitude=0&longitude=0&radius=${radius}`),
      );
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("findNearbyPublicCamerasPage").length, 0, name);
    });
  }
});

test("nearby search rejects invalid limit and offset values with 400", async (t) => {
  const { GET } = await nearbyRoute();
  const cases = [
    "limit=abc", "limit=-5", "limit=1.5", "limit=0", "offset=abc", "offset=-3",
    // review P2-4: huge-but-valid integers are rejected before any db work.
    "offset=9007199254740991", "offset=10001",
  ];
  for (const query of cases) {
    await t.test(query, async () => {
      const response = await GET(apiRequest(`/api/cameras/nearby?latitude=0&longitude=0&${query}`));
      assert.equal(response.status, 400, query);
      assert.equal(callArgs("findNearbyPublicCamerasPage").length, 0, "no query must run for invalid pagination");
    });
  }
});

test("nearby search returns 503 when the database is unavailable", async () => {
  stub("findNearbyPublicCamerasPage", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await nearbyRoute();
  const response = await GET(apiRequest("/api/cameras/nearby?latitude=0&longitude=0&radius=50"));
  assert.equal(response.status, 503);
});

// ---------------------------------------------------------------------------
// POST /api/cameras — Horizon 1 duplicate gate (ADR 0019)
// ---------------------------------------------------------------------------

test("POST includes nearby reviewed records as possibleDuplicates without blocking the report", async () => {
  // Medium/low candidates stay informational: only a high-strength match
  // forces the confirmation gate, so a medium candidate must not block.
  const duplicateFixture = {
    ...nearbyFixture,
    similarity: 0.4,
    matchStrength: "medium",
  };
  stub("createCamera", async (input) => ({ id: 14, ...input }));
  stub("findNearbyPublicCameras", async () => [duplicateFixture]);
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionPost({ title: "Camera porta nord", kind: "Fixed dome", address: "Via Roma 1", latitude: 41.9004, longitude: 12.4936 }),
  );
  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.equal(body.record.id, 14);
  assert.deepEqual(body.possibleDuplicates, [duplicateFixture]);
  // The duplicate check must reuse the cleaned, validated fields and a 75 m radius.
  assert.deepEqual(callArgs("findNearbyPublicCameras")[0], [
    41.9004,
    12.4936,
    75,
    { title: "Camera porta nord", address: "Via Roma 1", kind: "Fixed dome" },
  ]);
});

test("POST rejects a high-strength duplicate with 409 and does NOT store the record", async () => {
  const duplicateFixture = {
    ...nearbyFixture,
    similarity: 0.82,
    matchStrength: "high",
  };
  stub("createCamera", async (input) => ({ id: 14, ...input }));
  stub("findNearbyPublicCameras", async () => [duplicateFixture]);
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionPost({ title: "Camera porta nord", kind: "Fixed dome", address: "Via Roma 1", latitude: 41.9004, longitude: 12.4936 }),
  );
  assert.equal(response.status, 409, "a likely duplicate must be refused before storage");
  const body = await responseBody(response);
  assert.ok(body.error, "the 409 must explain the gate");
  assert.deepEqual(body.possibleDuplicates, [duplicateFixture], "the 409 must carry the candidate list so the client can surface it");
  assert.equal(callArgs("createCamera").length, 0, "no db write for an unconfirmed duplicate");
});

test("POST stores the report once the submitter explicitly confirms the duplicate is distinct", async () => {
  const duplicateFixture = {
    ...nearbyFixture,
    similarity: 0.82,
    matchStrength: "high",
  };
  stub("createCamera", async (input) => ({ id: 14, ...input }));
  stub("findNearbyPublicCameras", async () => [duplicateFixture]);
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionPost({ title: "Camera porta nord", kind: "Fixed dome", address: "Via Roma 1", latitude: 41.9004, longitude: 12.4936, duplicateConfirmed: true }),
  );
  assert.equal(response.status, 201, "an explicit confirmation must let the report through");
  const body = await responseBody(response);
  assert.equal(body.record.id, 14);
  // The candidates stay in the response for transparency: the moderator can
  // still compare the confirmed report against the nearby record.
  assert.deepEqual(body.possibleDuplicates, [duplicateFixture]);
});

test("POST treats a non-boolean duplicateConfirmed as absent (fail-closed)", async () => {
  const duplicateFixture = {
    ...nearbyFixture,
    similarity: 0.82,
    matchStrength: "high",
  };
  stub("createCamera", async (input) => ({ id: 14, ...input }));
  stub("findNearbyPublicCameras", async () => [duplicateFixture]);
  const { POST } = await camerasRoute();
  for (const bogus of ["true", 1, "yes"]) {
    const response = await POST(
      sessionPost({ title: "Camera porta nord", kind: "Fixed dome", latitude: 41.9004, longitude: 12.4936, duplicateConfirmed: bogus }),
    );
    assert.equal(response.status, 409, `duplicateConfirmed=${JSON.stringify(bogus)} must fail closed`);
  }
  assert.equal(callArgs("createCamera").length, 0, "no db write for any non-boolean confirmation");
});

test("POST survives a failing duplicate check with an empty possibleDuplicates list", async () => {
  stub("createCamera", async (input) => ({ id: 15, ...input }));
  stub("findNearbyPublicCameras", async () => {
    throw new Error("Database binding unavailable");
  });
  const { POST } = await camerasRoute();
  const response = await POST(
    sessionPost({ title: "X", kind: "Y", latitude: 1, longitude: 1 }),
  );
  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.equal(body.record.id, 15);
  assert.deepEqual(body.possibleDuplicates, []);
});

// ---------------------------------------------------------------------------
// GET /api/cameras/[id] — record detail
// ---------------------------------------------------------------------------

const cameraIdRoute = () => loadRoute("app/api/cameras/[id]/route.mjs");

test("GET /api/cameras/[id] returns the public record wrapped in { record }", async () => {
  stub("getCommunityRecordById", async () => cameraFixture);
  const { GET } = await cameraIdRoute();
  const response = await GET(apiRequest("/api/cameras/1"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=300, stale-while-revalidate=600", "the record detail is cached for a bounded window like the list");
  assert.equal(response.headers.get("cache-tag"), "camera-1", "the record detail carries its per-id cache-tag for moderation purge");
  assert.deepEqual(await responseBody(response), { record: cameraFixture });
  assert.deepEqual(callArgs("getCommunityRecordById")[0], [1]);
});

test("GET /api/cameras/[id] fails closed with 404 for non-public or missing records", async () => {
  stub("getCommunityRecordById", async () => null);
  const { GET } = await cameraIdRoute();
  const response = await GET(apiRequest("/api/cameras/999"));
  assert.equal(response.status, 404);
  const body = await responseBody(response);
  assert.equal(body.error, "Camera not found.");
  assert.deepEqual(callArgs("getCommunityRecordById")[0], [999]);
});

test("GET /api/cameras/[id] rejects non-numeric and non-positive ids with 404", async (t) => {
  const { GET } = await cameraIdRoute();
  const paths = [
    "/api/cameras/abc",
    "/api/cameras/-3",
    "/api/cameras/1.5",
    "/api/cameras/0",
    "/api/cameras/",
    // Follow-up F0 (t_ae600b90): scientific/hex syntax parses to finite
    // integers via Number(), but the public ids are plain decimal strings.
    "/api/cameras/1e3",
    "/api/cameras/0x10",
    "/api/cameras/1_000",
    "/api/cameras/1e",
  ];
  for (const path of paths) {
    await t.test(path, async () => {
      const response = await GET(apiRequest(path));
      assert.equal(response.status, 404, path);
      assert.equal(callArgs("getCommunityRecordById").length, 0, "no lookup must run for a malformed id");
    });
  }
});

test("GET /api/cameras/[id] returns 503 when the database is unavailable", async () => {
  stub("getCommunityRecordById", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await cameraIdRoute();
  const response = await GET(apiRequest("/api/cameras/1"));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Database unavailable");
});

// ---------------------------------------------------------------------------
// GET /api/cameras — facets and bounding-box GeoJSON
// ---------------------------------------------------------------------------

test("GET /api/cameras?facets=1 includes kind and freshness facets computed on the public boundary", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [cameraFixture], total: 512, nextOffset: 25 }));
  stub("getPublicCameraFacets", async () => ({
    kinds: [{ kind: "Fixed dome", count: 210 }, { kind: "PTZ", count: 44 }],
    freshness: { "7d": 12, "30d": 64, "90d": 130, all: 512 },
  }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?facets=1"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.deepEqual(body.facets, {
    kinds: [{ kind: "Fixed dome", count: 210 }, { kind: "PTZ", count: 44 }],
    freshness: { "7d": 12, "30d": 64, "90d": 130, all: 512 },
  });
  assert.equal(body.total, 512);
});

test("GET /api/cameras without ?facets=1 omits the facets (QA#5 F2: no consumer, no full-set aggregates)", async () => {
  stub("listPublicCamerasPage", async () => ({ records: [cameraFixture], total: 512, nextOffset: 25 }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras"));
  assert.equal(response.status, 200);
  const body = await responseBody(response);
  assert.equal(body.facets, undefined, "facets must not be present in the default JSON list");
  assert.equal(callArgs("getPublicCameraFacets").length, 0, "the aggregate queries must not run on a default read");
});

test("GET /api/cameras?format=geojson&bbox= returns only the points inside the box with a 5-minute cache", async () => {
  stub("listPublicCamerasInBbox", async () => [cameraFixture]);
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?format=geojson&bbox=12.4,41.8,12.6,42.0"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=300, stale-while-revalidate=600", "the map marker layer is cached like the list, never longer");
  assert.equal(response.headers.get("cache-tag"), "cameras-bbox", "the bbox layer carries the shared bbox cache-tag for moderation purge");
  assert.equal(response.headers.get("content-disposition"), null, "a bbox GeoJSON is a live map layer, not a download attachment");
  const body = await responseBody(response);
  assert.equal(body.type, "FeatureCollection");
  assert.equal(body.features.length, 1);
  assert.deepEqual(callArgs("listPublicCamerasInBbox")[0], [{ west: 12.4, south: 41.8, east: 12.6, north: 42.0 }]);
});

test("GET /api/cameras?bbox= returns the JSON viewport page (map data contract, t_bb310428)", async () => {
  // The JSON bbox contract is the map's data layer: same {records,total,
  // nextOffset} shape as the directory list, bounded inside the box. The
  // default (no format) request must reach listPublicCamerasInBboxPage with
  // the bbox + parsed filters and the default page size.
  stub("listPublicCamerasInBboxPage", async () => ({ records: [cameraFixture], total: 1, nextOffset: null }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?bbox=12.4,41.8,12.6,42.0"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, s-maxage=300, stale-while-revalidate=600", "the viewport page is cached like the directory list");
  assert.equal(response.headers.get("cache-tag"), "cameras-list", "the viewport page shares the list cache-tag for moderation purge");
  const body = await responseBody(response);
  assert.deepEqual(body.records, [cameraFixture]);
  assert.equal(body.total, 1, "total is the count INSIDE the bbox (the set the caller can page through)");
  assert.equal(body.nextOffset, null);
  assert.equal(body.facets, undefined, "the viewport page must not compute full-set facets (no consumer, no aggregate cost)");
  const args = callArgs("listPublicCamerasInBboxPage")[0];
  assert.deepEqual(args[0], { west: 12.4, south: 41.8, east: 12.6, north: 42.0 });
  assert.deepEqual(args[1], {}, "no kind/freshness filters are forwarded when none are present");
  assert.deepEqual(args[2], { limit: 1000, offset: 0 }, "the default bbox page size is PUBLIC_CAMERAS_BBOX_DEFAULT_LIMIT");
});

test("GET /api/cameras?bbox= forwards kind/freshness filters and explicit limit/offset to the bbox page", async () => {
  stub("listPublicCamerasInBboxPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?bbox=12.4,41.8,12.6,42.0&kind=Dome&freshness=30d&limit=200&offset=40"));

  assert.equal(response.status, 200);
  const args = callArgs("listPublicCamerasInBboxPage")[0];
  assert.deepEqual(args[0], { west: 12.4, south: 41.8, east: 12.6, north: 42.0 });
  assert.deepEqual(args[1], { kind: "Dome", freshness: "30d" }, "F0 server-side filters apply to the viewport page too");
  assert.deepEqual(args[2], { limit: 200, offset: 40 });
});

test("GET /api/cameras?bbox=&limit= clamps the viewport page size to the bbox max and rejects bad offsets", async () => {
  stub("listPublicCamerasInBboxPage", async () => ({ records: [], total: 0, nextOffset: null }));
  const { GET } = await camerasRoute();

  const overMax = await GET(apiRequest("/api/cameras?bbox=12.4,41.8,12.6,42.0&limit=999999"));
  assert.equal(overMax.status, 200);
  assert.deepEqual(callArgs("listPublicCamerasInBboxPage")[0][2], { limit: 10_000, offset: 0 }, "limit clamps to PUBLIC_CAMERAS_BBOX_MAX_LIMIT (never unbounded)");

  const badLimit = await GET(apiRequest("/api/cameras?bbox=12.4,41.8,12.6,42.0&limit=abc"));
  assert.equal(badLimit.status, 400);

  const badOffset = await GET(apiRequest("/api/cameras?bbox=12.4,41.8,12.6,42.0&offset=-1"));
  assert.equal(badOffset.status, 400);
});

test("GET /api/cameras?bbox= accepts offsets beyond the old MAX_PAGE_OFFSET (t_e86c91c4)", async () => {
  // The bbox page had the same fixed 10000 cap as the list: a dense
  // national viewport with >10000 records could 400 the map's paging.
  // Offsets are forwarded to the db boundary guard like the list page.
  stub("listPublicCamerasInBboxPage", async () => ({ records: [], total: 12_284, nextOffset: null }));
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?bbox=12.4,41.8,12.6,42.0&offset=12000"));
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("listPublicCamerasInBboxPage")[0][2], { limit: 1000, offset: 12000 });
});

test("GET /api/cameras bbox validation rejects malformed and inverted rectangles", async (t) => {
  const { GET } = await camerasRoute();
  const cases = [
    "12.4,41.8,12.6",
    "12.4,41.8,12.6,42.0,99",
    "abc,41.8,12.6,42.0",
    "12.6,41.8,12.4,42.0",
    "12.4,42.0,12.6,41.8",
    "-181,0,10,10",
    "0,-91,10,10",
    // Follow-up F0 (t_ae600b90): empty segments must be rejected — a bare
    // `Number("")` is 0, so a trailing/middle comma would silently parse as
    // a real coordinate instead of answering 400.
    "12.4,41.8,12.6,",
    "12.4,,12.6,42.0",
    ",41.8,12.6,42.0",
    "12.4,41.8,12.6, ",
    // Non-decimal numeric syntax is rejected too ("1e3"/"0x10" parse to
    // finite numbers via Number(), but they are not plain decimal segments).
    "1e3,41.8,12.6,42.0",
    "0x10,41.8,12.6,42.0",
  ];
  for (const bbox of cases) {
    await t.test(`geojson ${bbox}`, async () => {
      const response = await GET(apiRequest(`/api/cameras?format=geojson&bbox=${encodeURIComponent(bbox)}`));
      assert.equal(response.status, 400, bbox);
      assert.equal(callArgs("listPublicCamerasInBbox").length, 0, "no query must run for an invalid bbox");
    });
    await t.test(`json ${bbox}`, async () => {
      const response = await GET(apiRequest(`/api/cameras?bbox=${encodeURIComponent(bbox)}`));
      assert.equal(response.status, 400, bbox);
      assert.equal(callArgs("listPublicCamerasInBboxPage").length, 0, "no query must run for an invalid bbox");
    });
  }
});

test("GET /api/cameras?bbox= rejects CSV and unknown formats (snapshots stay complete)", async () => {
  const { GET } = await camerasRoute();
  const csv = await GET(apiRequest("/api/cameras?bbox=12.4,41.8,12.6,42.0&format=csv"));
  assert.equal(csv.status, 400);
  const body = await responseBody(csv);
  assert.match(body.error, /format=geojson/);
  const xml = await GET(apiRequest("/api/cameras?bbox=12.4,41.8,12.6,42.0&format=xml"));
  assert.equal(xml.status, 400);
});
