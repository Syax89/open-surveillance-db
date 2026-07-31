// Runtime API tests for /api/cameras and /api/cameras/nearby.
// The route handlers are exercised with real Request objects against a mocked
// db layer; every test asserts actual HTTP status codes and response bodies.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

const camerasRoute = () => loadRoute("app/api/cameras/route.mjs");
const nearbyRoute = () => loadRoute("app/api/cameras/nearby/route.mjs");

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
  status: "verified",
  source: "Community report",
  updated: "2026-01-01T00:00:00.000Z",
  description: "",
  createdAt: "2026-01-01T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// GET /api/cameras — public listing and export formats
// ---------------------------------------------------------------------------

test("GET /api/cameras returns the public list as JSON by default", async () => {
  stub("listPublicCameras", async () => [cameraFixture]);
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(await responseBody(response), { records: [cameraFixture] });
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
  const body = await responseBody(response);
  assert.equal(body.type, "FeatureCollection");
  assert.equal(body.features.length, 1);
  const feature = body.features[0];
  assert.equal(feature.type, "Feature");
  assert.deepEqual(feature.geometry, { type: "Point", coordinates: [12.4936, 41.9004] });
  assert.equal(feature.properties.id, cameraFixture.id);
  assert.equal(feature.properties.title, cameraFixture.title);
});

test("GET /api/cameras?format=csv escapes quotes and neutralises spreadsheet formulas", async () => {
  const hostile = {
    ...cameraFixture,
    id: 1,
    title: "=SUM(A1:A2)",
    kind: "Fixed dome",
    manufacturer: "-leading",
    observedOn: "2026-01-01",
    status: "verified",
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
  const csv = await responseBody(response);
  assert.match(csv, /^id,title,kind,manufacturer,observed_on,status,source,updated,description,address,latitude,longitude\n/);
  assert.match(
    csv,
    /"1","'=SUM\(A1:A2\)","Fixed dome","'-leading","2026-01-01","verified","Community report","2026-01-01T00:00:00\.000Z","He said ""hi"", ok","","41\.9004","12\.4936"\n/,
    "formula injection must be neutralised with a leading apostrophe, quotes doubled, nulls empty",
  );
});

test("GET /api/cameras ignores unknown format values and returns JSON", async () => {
  stub("listPublicCameras", async () => [cameraFixture]);
  const { GET } = await camerasRoute();
  const response = await GET(apiRequest("/api/cameras?format=xml"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { records: [cameraFixture] });
});

test("GET /api/cameras returns 503 when the database is unavailable", async () => {
  stub("listPublicCameras", async () => {
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

test("POST /api/cameras stores a trimmed, date-validated pending report", async () => {
  stub("createPendingCamera", async (input) => ({ id: 7, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    apiRequest("/api/cameras", {
      method: "POST",
      body: {
        title: "  Nuova telecamera  ",
        kind: "  PTZ  ",
        manufacturer: "  VendorCorp  ",
        observedOn: "2026-07-01",
        address: "  Via Roma 12  ",
        notes: "  vista sul parco  ",
        latitude: 44.1,
        longitude: 12.2,
      },
    }),
  );

  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.equal(body.record.id, 7);
  assert.deepEqual(callArgs("createPendingCamera")[0], [
    {
      title: "Nuova telecamera",
      kind: "PTZ",
      manufacturer: "VendorCorp",
      observedOn: "2026-07-01",
      address: "Via Roma 12",
      notes: "vista sul parco",
      latitude: 44.1,
      longitude: 12.2,
    },
  ]);
});

test("POST /api/cameras without optional metadata passes nulls and empty strings", async () => {
  stub("createPendingCamera", async (input) => ({ id: 8, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    apiRequest("/api/cameras", {
      method: "POST",
      body: { title: "Minimal", kind: "Dome", latitude: 45.0, longitude: 9.0 },
    }),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(callArgs("createPendingCamera")[0][0], {
    title: "Minimal",
    kind: "Dome",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "",
    latitude: 45,
    longitude: 9,
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
      const response = await POST(apiRequest("/api/cameras", { method: "POST", body }));
      assert.equal(response.status, 400, name);
      const parsed = await responseBody(response);
      assert.match(parsed.error, /A title, type, valid position/, name);
      assert.equal(callArgs("createPendingCamera").length, 0, "no write must happen");
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
        apiRequest("/api/cameras", {
          method: "POST",
          body: { title: "X", kind: "Y", latitude: lat, longitude: lon ?? 10 },
        }),
      );
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("createPendingCamera").length, 0, name);
    });
  }
});

test("POST /api/cameras accepts coordinate boundary values", async () => {
  stub("createPendingCamera", async (input) => ({ id: 9, ...input }));
  const { POST } = await camerasRoute();
  for (const [latitude, longitude] of [[-90, -180], [90, 180], [0, 0]]) {
    const response = await POST(
      apiRequest("/api/cameras", {
        method: "POST",
        body: { title: "Edge", kind: "Dome", latitude, longitude },
      }),
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
        apiRequest("/api/cameras", {
          method: "POST",
          body: { title: "X", kind: "Y", latitude: 1, longitude: 1, observedOn },
        }),
      );
      assert.equal(response.status, 400, observedOn);
    });
  }
});

test("POST /api/cameras truncates long fields to their documented limits", async () => {
  stub("createPendingCamera", async (input) => ({ id: 10, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    apiRequest("/api/cameras", {
      method: "POST",
      body: {
        title: "T".repeat(95),
        kind: "K".repeat(70),
        address: "A".repeat(200),
        notes: "N".repeat(1200),
        manufacturer: "M".repeat(90),
        latitude: 1,
        longitude: 1,
      },
    }),
  );
  assert.equal(response.status, 201);
  const input = callArgs("createPendingCamera")[0][0];
  assert.equal(input.title.length, 90);
  assert.equal(input.kind.length, 60);
  assert.equal(input.address.length, 180);
  assert.equal(input.notes.length, 1000);
  assert.equal(input.manufacturer.length, 80);
});

test("POST /api/cameras normalises an ISO datetime observedOn to its date part", async () => {
  stub("createPendingCamera", async (input) => ({ id: 11, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    apiRequest("/api/cameras", {
      method: "POST",
      body: {
        title: "X",
        kind: "Y",
        latitude: 1,
        longitude: 1,
        observedOn: "2026-07-01T23:59:59.000Z",
      },
    }),
  );
  assert.equal(response.status, 201);
  assert.equal(callArgs("createPendingCamera")[0][0].observedOn, "2026-07-01");
});

test("POST /api/cameras maps malformed JSON bodies to 500", async () => {
  stub("createPendingCamera", async (input) => ({ id: 12, ...input }));
  const { POST } = await camerasRoute();
  const response = await POST(
    apiRequest("/api/cameras", { method: "POST", body: '{"title": broken' }),
  );
  assert.equal(response.status, 500);
  const body = await responseBody(response);
  assert.ok(body.error, "an error message must be returned");
});

test("POST /api/cameras rejects non-object JSON bodies", async () => {
  const { POST } = await camerasRoute();
  for (const body of ["42", "[1,2]", '"hello"']) {
    const response = await POST(apiRequest("/api/cameras", { method: "POST", body }));
    assert.equal(response.status, 400, body);
    assert.equal(callArgs("createPendingCamera").length, 0, body);
  }
});

test("POST /api/cameras rejects a JSON null body with 400 (OSDB-QA-001)", async () => {
  const { POST } = await camerasRoute();
  const response = await POST(apiRequest("/api/cameras", { method: "POST", body: "null" }));
  assert.equal(response.status, 400);
  assert.equal(callArgs("createPendingCamera").length, 0);
});

test("POST /api/cameras rejects non-string observedOn values", async (t) => {
  const { POST } = await camerasRoute();
  for (const observedOn of [20260701, { year: 2026 }, ["2026-07-01"], true]) {
    await t.test(`observedOn=${JSON.stringify(observedOn)}`, async () => {
      const response = await POST(
        apiRequest("/api/cameras", {
          method: "POST",
          body: { title: "X", kind: "Y", latitude: 1, longitude: 1, observedOn },
        }),
      );
      assert.equal(response.status, 400, JSON.stringify(observedOn));
      assert.equal(callArgs("createPendingCamera").length, 0);
    });
  }
});

test("POST /api/cameras maps database failures to 500 with a generic client-safe message", async () => {
  // The route must not leak the underlying error message to the client
  // (pre-hosting hardening): the status is 500, the message is generic.
  stub("createPendingCamera", async () => {
    throw new Error("Report could not be stored");
  });
  const { POST } = await camerasRoute();
  const response = await POST(
    apiRequest("/api/cameras", {
      method: "POST",
      body: { title: "X", kind: "Y", latitude: 1, longitude: 1 },
    }),
  );
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to save report");
});

test("POST /api/cameras coerces empty-string and null coordinates to 0,0", async () => {
  // Documented edge case: Number("") === 0 and Number(null) === 0, so the
  // bounds check passes and the record is stored at 0,0. Flagged for review.
  stub("createPendingCamera", async (input) => ({ id: 13, ...input }));
  const { POST } = await camerasRoute();
  for (const latitude of ["", null]) {
    const response = await POST(
      apiRequest("/api/cameras", {
        method: "POST",
        body: { title: "X", kind: "Y", latitude, longitude: latitude },
      }),
    );
    assert.equal(response.status, 201, `latitude=${String(latitude)}`);
    assert.deepEqual(
      [callArgs("createPendingCamera")[0][0].latitude, callArgs("createPendingCamera")[0][0].longitude],
      [0, 0],
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/cameras/nearby
// ---------------------------------------------------------------------------

const nearbyFixture = { ...cameraFixture, distanceMeters: 42 };

test("nearby search passes bounded coordinates and radius to the helper", async () => {
  stub("findNearbyPublicCameras", async () => [nearbyFixture]);
  const { GET } = await nearbyRoute();
  const response = await GET(apiRequest("/api/cameras/nearby?latitude=41.9&longitude=12.49&radius=75"));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { records: [nearbyFixture] });
  assert.deepEqual(callArgs("findNearbyPublicCameras")[0], [41.9, 12.49, 75, { title: "", address: "", kind: "" }]);
});

test("nearby search defaults the radius to 75 metres", async () => {
  stub("findNearbyPublicCameras", async () => []);
  const { GET } = await nearbyRoute();
  const response = await GET(apiRequest("/api/cameras/nearby?latitude=41.9&longitude=12.49"));
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("findNearbyPublicCameras")[0], [41.9, 12.49, 75, { title: "", address: "", kind: "" }]);
});

test("nearby search accepts boundary radius values 10 and 500", async () => {
  stub("findNearbyPublicCameras", async () => []);
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
      assert.equal(callArgs("findNearbyPublicCameras").length, 0, name);
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
      assert.equal(callArgs("findNearbyPublicCameras").length, 0, name);
    });
  }
});

test("nearby search returns 503 when the database is unavailable", async () => {
  stub("findNearbyPublicCameras", async () => {
    throw new Error("Database binding unavailable");
  });
  const { GET } = await nearbyRoute();
  const response = await GET(apiRequest("/api/cameras/nearby?latitude=0&longitude=0&radius=50"));
  assert.equal(response.status, 503);
});

test("nearby search forwards and truncates pre-submit text hints", async () => {
  stub("findNearbyPublicCameras", async () => []);
  const { GET } = await nearbyRoute();
  const response = await GET(
    apiRequest(`/api/cameras/nearby?latitude=41.9&longitude=12.49&radius=75&title=${"T".repeat(95)}&address=${"A".repeat(200)}&kind=${"K".repeat(70)}`),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(callArgs("findNearbyPublicCameras")[0], [
    41.9,
    12.49,
    75,
    { title: "T".repeat(90), address: "A".repeat(180), kind: "K".repeat(60) },
  ]);
});

// ---------------------------------------------------------------------------
// POST /api/cameras — non-blocking pre-submit duplicate detection
// ---------------------------------------------------------------------------

test("POST includes nearby reviewed records as possibleDuplicates without blocking the report", async () => {
  const duplicateFixture = {
    ...nearbyFixture,
    similarity: 0.82,
    matchStrength: "high",
  };
  stub("createPendingCamera", async (input) => ({ id: 14, ...input }));
  stub("findNearbyPublicCameras", async () => [duplicateFixture]);
  const { POST } = await camerasRoute();
  const response = await POST(
    apiRequest("/api/cameras", {
      method: "POST",
      body: { title: "Camera porta nord", kind: "Fixed dome", address: "Via Roma 1", latitude: 41.9004, longitude: 12.4936 },
    }),
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

test("POST survives a failing duplicate check with an empty possibleDuplicates list", async () => {
  stub("createPendingCamera", async (input) => ({ id: 15, ...input }));
  stub("findNearbyPublicCameras", async () => {
    throw new Error("Database binding unavailable");
  });
  const { POST } = await camerasRoute();
  const response = await POST(
    apiRequest("/api/cameras", {
      method: "POST",
      body: { title: "X", kind: "Y", latitude: 1, longitude: 1 },
    }),
  );
  assert.equal(response.status, 201);
  const body = await responseBody(response);
  assert.equal(body.record.id, 15);
  assert.deepEqual(body.possibleDuplicates, []);
});
