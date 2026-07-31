// Runtime API tests for /api/corrections (write-only public endpoint).

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
after(async () => cleanupRouteTree());

const route = () => loadRoute("app/api/corrections/route.mjs");

test("POST /api/corrections stores a trimmed request and returns its reference id", async () => {
  stub("createCorrectionRequest", async (input) => ({ id: 31, ...input }));
  const { POST } = await route();
  const response = await POST(
    apiRequest("/api/corrections", {
      method: "POST",
      body: {
        cameraId: 42,
        issueType: "  Wrong location  ",
        message: "  The camera is actually on the other corner.  ",
        contact: "  reporter@example.test  ",
      },
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await responseBody(response), { referenceId: 31 });
  assert.deepEqual(callArgs("createCorrectionRequest")[0][0], {
    cameraId: 42,
    issueType: "Wrong location",
    message: "The camera is actually on the other corner.",
    contact: "reporter@example.test",
  });
});

test("POST /api/corrections accepts an omitted cameraId and stores null", async (t) => {
  const { POST } = await route();
  const cases = [
    { name: "undefined", body: { issueType: "X", message: "Y" } },
    { name: "empty string", body: { cameraId: "", issueType: "X", message: "Y" } },
    { name: "null", body: { cameraId: null, issueType: "X", message: "Y" } },
  ];
  for (const { name, body } of cases) {
    await t.test(name, async () => {
      // Stub inside the subtest: beforeEach resets state for every subtest.
      stub("createCorrectionRequest", async (input) => ({ id: 32, ...input }));
      const response = await POST(apiRequest("/api/corrections", { method: "POST", body }));
      assert.equal(response.status, 201, name);
      assert.equal(callArgs("createCorrectionRequest").at(-1)[0].cameraId, null, name);
    });
  }
});

test("POST /api/corrections accepts a numeric-string cameraId", async () => {
  stub("createCorrectionRequest", async (input) => ({ id: 33, ...input }));
  const { POST } = await route();
  const response = await POST(
    apiRequest("/api/corrections", {
      method: "POST",
      body: { cameraId: "42", issueType: "X", message: "Y" },
    }),
  );
  assert.equal(response.status, 201);
  assert.equal(callArgs("createCorrectionRequest")[0][0].cameraId, 42);
});

test("POST /api/corrections rejects invalid cameraId values", async (t) => {
  const { POST } = await route();
  const cases = [
    { name: "zero", cameraId: 0 },
    { name: "negative", cameraId: -3 },
    { name: "fractional", cameraId: 1.5 },
    { name: "text", cameraId: "abc" },
    { name: "object", cameraId: {} },
    { name: "empty array", cameraId: [] },
  ];
  for (const { name, cameraId } of cases) {
    await t.test(name, async () => {
      const response = await POST(
        apiRequest("/api/corrections", {
          method: "POST",
          body: { cameraId, issueType: "X", message: "Y" },
        }),
      );
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("createCorrectionRequest").length, 0, name);
    });
  }
});

test("POST /api/corrections coerces truthy non-numeric cameraIds to numbers", async () => {
  // Documented edge case: Number(true) === 1 and Number([5]) === 5 pass the
  // integer check. Flagged for review.
  stub("createCorrectionRequest", async (input) => ({ id: 35, ...input }));
  const { POST } = await route();
  for (const [cameraId, expected] of [[true, 1], [[5], 5]]) {
    const response = await POST(
      apiRequest("/api/corrections", {
        method: "POST",
        body: { cameraId, issueType: "X", message: "Y" },
      }),
    );
    assert.equal(response.status, 201, `cameraId=${JSON.stringify(cameraId)}`);
    assert.equal(
      callArgs("createCorrectionRequest").at(-1)[0].cameraId,
      expected,
      `cameraId=${JSON.stringify(cameraId)}`,
    );
  }
});

test("POST /api/corrections rejects missing or blank issue type and message", async (t) => {
  const { POST } = await route();
  const cases = [
    { name: "missing issueType", body: { message: "Y" } },
    { name: "missing message", body: { issueType: "X" } },
    { name: "blank issueType", body: { issueType: "  ", message: "Y" } },
    { name: "blank message", body: { issueType: "X", message: "\n" } },
    { name: "empty body", body: {} },
  ];
  for (const { name, body } of cases) {
    await t.test(name, async () => {
      const response = await POST(apiRequest("/api/corrections", { method: "POST", body }));
      assert.equal(response.status, 400, name);
      assert.equal(callArgs("createCorrectionRequest").length, 0, name);
    });
  }
});

test("POST /api/corrections truncates long fields to their documented limits", async () => {
  stub("createCorrectionRequest", async (input) => ({ id: 34, ...input }));
  const { POST } = await route();
  const response = await POST(
    apiRequest("/api/corrections", {
      method: "POST",
      body: {
        issueType: "I".repeat(100),
        message: "M".repeat(3000),
        contact: "C".repeat(300),
      },
    }),
  );
  assert.equal(response.status, 201);
  const input = callArgs("createCorrectionRequest")[0][0];
  assert.equal(input.issueType.length, 50);
  assert.equal(input.message.length, 1500);
  assert.equal(input.contact.length, 180);
});

test("POST /api/corrections rejects non-object JSON bodies", async () => {
  const { POST } = await route();
  // NOTE: JSON `null` is excluded here on purpose — see the documented-500
  // test below. Property access on null throws inside the handler and the
  // catch-all maps it to 500, not 400 (finding OSDB-QA-001).
  for (const body of ["[]", "7", '"x"']) {
    const response = await POST(apiRequest("/api/corrections", { method: "POST", body }));
    assert.equal(response.status, 400, body);
    assert.equal(callArgs("createCorrectionRequest").length, 0, body);
  }
});

test("POST /api/corrections maps a JSON null body to 500 (documented deviation, OSDB-QA-001)", async () => {
  // FINDING OSDB-QA-001: the handler reads `payload.cameraId` without an
  // isRecord() guard, so a JSON `null` body throws a TypeError that the
  // catch-all turns into 500 instead of a client-error 400. The moderation
  // route guards the same input with 400, so this is inconsistent. If the
  // route is hardened, flip this assertion to 400.
  const { POST } = await route();
  const response = await POST(apiRequest("/api/corrections", { method: "POST", body: "null" }));
  assert.equal(response.status, 500);
  assert.equal(callArgs("createCorrectionRequest").length, 0);
});

test("POST /api/corrections maps malformed JSON to 500", async () => {
  const { POST } = await route();
  const response = await POST(apiRequest("/api/corrections", { method: "POST", body: "{oops" }));
  assert.equal(response.status, 500);
});

test("POST /api/corrections maps database failures to 500", async () => {
  stub("createCorrectionRequest", async () => {
    throw new Error("Correction request could not be saved");
  });
  const { POST } = await route();
  const response = await POST(
    apiRequest("/api/corrections", {
      method: "POST",
      body: { issueType: "X", message: "Y" },
    }),
  );
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error, "Unable to save correction request");
});

test("the corrections route exposes no GET handler", async () => {
  const routeModule = await route();
  assert.equal(typeof routeModule.GET, "undefined");
});
