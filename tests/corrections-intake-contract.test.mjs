// Wave B (Data & Trust) — route-level contract for the private
// correction/removal intake (POST /api/corrections).
//
// These tests exercise the real route handler with the mocked db boundary
// (see helpers/api-harness.mjs): validation, trimming, HTTP status codes,
// rate limiting and the submissions-disabled gate. Together with
// tests/intake-urgent-hide-workflow.test.mjs (real database layer) they pin
// the documented intake contract from docs/workstreams/DATA_TRUST.md:
//
//   - every published record has a low-friction, account-free issue path
//     whose documented categories are all accepted;
//   - the intake acknowledges with a case reference and never echoes
//     requester-supplied content back;
//   - removal-style requests may arrive without a precise record id;
//   - the endpoint fails closed (503) when submissions are disabled and
//     rate-limits abusive callers (429 + Retry-After);
//   - hostile input (script tags, CRLF, control characters) is bounded and
//     cannot crash the handler or inject headers.
//
// All fixtures are fictional; no personal data is used.

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  apiRequest,
  buildRouteTree,
  cleanupRouteTree,
  loadRoute,
  responseBody,
} from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => resetMockState());
afterEach(async () => {
  // Restore the shared env mock mutated by the fail-closed / rate-limit tests.
  const env = await correctionsEnv();
  env.POST_SUBMISSIONS_DISABLED = "false";
  env.POST_RATE_LIMIT_MAX = "1000000";
  env.POST_RATE_LIMIT_WINDOW_SECONDS = "60";
});
after(async () => cleanupRouteTree());

async function correctionsEnv() {
  const tree = await buildRouteTree();
  return import(pathToFileURL(path.join(tree, "cloudflare-workers.mjs"))).then((m) => m.env);
}

const route = () => loadRoute("app/api/corrections/route.mjs");

// The documented issue categories from the "Report an issue" path
// (docs/workstreams/DATA_TRUST.md — Corrections, removals, and appeals).
const DOCUMENTED_CATEGORIES = [
  "Inaccurate location/details",
  "No longer present",
  "Private/non-public",
  "Privacy concern",
  "Safety concern",
  "Rights/ownership concern",
  "Other",
];

function intakePost(body, headers = {}) {
  return apiRequest("/api/corrections", { method: "POST", body, headers });
}

test("the intake accepts every documented correction category, trimmed", async () => {
  const { POST } = await route();
  for (const [index, issueType] of DOCUMENTED_CATEGORIES.entries()) {
    stub("createCorrectionRequest", async (input) => ({ id: 100 + index, ...input }));
    const response = await POST(
      intakePost(
        {
          cameraId: 42,
          issueType: `  ${issueType}  `,
          message: "Please review this record.",
          contact: null,
        },
        { "cf-connecting-ip": `203.0.113.${10 + index}` },
      ),
    );
    assert.equal(response.status, 201, issueType);
    const input = callArgs("createCorrectionRequest").at(-1)[0];
    assert.equal(input.issueType, issueType, "the category must be stored trimmed");
  }
});

test("the intake response never echoes requester-supplied content", async () => {
  stub("createCorrectionRequest", async (input) => ({ id: 77, ...input }));
  const { POST } = await route();
  const response = await POST(
    intakePost(
      {
        cameraId: 42,
        issueType: "Privacy concern",
        message: "This camera faces a private window.",
        contact: "requester@example.test",
      },
      { "cf-connecting-ip": "203.0.113.20" },
    ),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(
    await responseBody(response),
    { referenceId: 77 },
    "the acknowledgment must be only the case reference — no message, category, contact or cameraId echo",
  );
});

test("removal-style requests are accepted without a precise camera id", async () => {
  const { POST } = await route();
  const cases = [
    { name: "no longer present", issueType: "No longer present", cameraId: undefined },
    { name: "private/non-public", issueType: "Private/non-public", cameraId: null },
    { name: "privacy concern", issueType: "Privacy concern", cameraId: "" },
  ];
  for (const [index, { name, issueType, cameraId }] of cases.entries()) {
    stub("createCorrectionRequest", async (input) => ({ id: 200 + index, ...input }));
    const body = { issueType, message: "Please investigate." };
    if (cameraId !== undefined) body.cameraId = cameraId;
    const response = await POST(
      intakePost(body, { "cf-connecting-ip": `203.0.113.${30 + index}` }),
    );
    assert.equal(response.status, 201, name);
    assert.equal(callArgs("createCorrectionRequest").at(-1)[0].cameraId, null, name);
  }
});

test("the intake fails closed with 503 when submissions are disabled", async () => {
  const env = await correctionsEnv();
  env.POST_SUBMISSIONS_DISABLED = "true";
  const { POST } = await route();
  const response = await POST(
    intakePost(
      { issueType: "Other", message: "Hello", contact: null },
      { "cf-connecting-ip": "203.0.113.40" },
    ),
  );
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error, "Correction requests are temporarily disabled.");
  assert.equal(callArgs("createCorrectionRequest").length, 0, "no request may be stored while disabled");
});

test("the intake rate-limits abusive callers with 429 and a Retry-After window", async () => {
  const env = await correctionsEnv();
  env.POST_RATE_LIMIT_MAX = "1";
  env.POST_RATE_LIMIT_WINDOW_SECONDS = "60";
  const { POST } = await route();
  const request = () =>
    POST(
      intakePost(
        { issueType: "Other", message: "Hello", contact: null },
        { "cf-connecting-ip": "203.0.113.50" },
      ),
    );

  // The first request must reach the database layer, so the db boundary is
  // stubbed like in the other intake tests; the second is rate-limited
  // before any db call happens.
  stub("createCorrectionRequest", async (input) => ({ id: 400, ...input }));
  const first = await request();
  assert.equal(first.status, 201, "the first request within the window must pass");
  const second = await request();
  assert.equal(second.status, 429, "the second request within the window must be rate-limited");
  assert.ok(
    Number.parseInt(second.headers.get("Retry-After") ?? "", 10) >= 1,
    "the 429 must carry a positive Retry-After",
  );
  assert.equal(
    callArgs("createCorrectionRequest").length,
    1,
    "only the allowed request may reach the database layer",
  );
});

test("hostile input is bounded and cannot crash the intake or inject headers", async (t) => {
  const { POST } = await route();
  const cases = [
    { name: "script tag in message", message: "<script>alert(1)</script>", contact: null },
    { name: "CRLF header injection in contact", message: "Hello", contact: "x@example.test\r\nX-Injected: 1" },
    { name: "control characters", message: "Line1\u0000\u001fLine2", contact: null },
    { name: "zero-width and unicode", message: "café \u200b 日本語 🎥", contact: "r@example.test" },
  ];
  for (const [index, { name, message, contact }] of cases.entries()) {
    await t.test(name, async () => {
      stub("createCorrectionRequest", async (input) => ({ id: 300 + index, ...input }));
      const response = await POST(
        intakePost(
          { cameraId: 42, issueType: "Other", message, contact },
          { "cf-connecting-ip": `203.0.113.${60 + index}` },
        ),
      );
      assert.equal(response.status, 201, "hostile input must not crash the handler");
      assert.equal(response.headers.get("x-injected"), null, "requester content must never reach response headers");
      assert.match(
        response.headers.get("content-type") ?? "",
        /application\/json/,
        "the response must stay a well-formed JSON document",
      );
      const stored = callArgs("createCorrectionRequest").at(-1)[0];
      assert.equal(typeof stored.message, "string");
      assert.ok(stored.message.length <= 1500, "message must stay within the documented bound");
      assert.ok(stored.contact === null || stored.contact.length <= 180, "contact must stay within the documented bound");
    });
  }
});

test("the intake contract is write-only: no GET handler exposes stored requests", async () => {
  const routeModule = await route();
  assert.equal(typeof routeModule.GET, "undefined");
});
