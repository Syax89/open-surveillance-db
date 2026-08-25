// Urgent-report notification (issue #438): the /correggi intake forwards a
// persisted correction to privacy@opensurveillancedb.org through sendMail.
//
// Contracts under test:
//   1. after a 201 the route calls sendMail once with the noreply sender,
//      the privacy recipient, and the escaped report content;
//   2. a mail failure (sendMail throws OR answers {ok:false}) NEVER fails
//      the intake — the response stays 201 with the reference id;
//   3. URGENT_REPORT_TO overrides the default recipient;
//   4. the email renderer escapes user-supplied values (no HTML injection).
//
// Fixtures are fictitious (example.test addresses, illustrative text).

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, cleanupRouteTree, loadRoute, responseBody } from "./helpers/api-harness.mjs";
import { callArgs, resetMockState, stub } from "./helpers/mock-state.mjs";

beforeEach(() => {
  resetMockState();
  // Write gate: a VERIFIED session by default (same fixture as the intake
  // suite — these tests focus on the notification path).
  stub("findSessionByToken", async () => ({ ...session, contributor }));
  stub("getContributorVerification", async (id) => ({ id, emailVerifiedAt: "2026-08-01T00:00:00.000Z", authProvider: "password" }));
  stub("createCorrectionRequest", async (input) => ({ kind: "created", correction: { id: 77, ...input } }));
});
after(async () => cleanupRouteTree());

const route = () => loadRoute("app/api/corrections/route.mjs");

const session = {
  id: 7,
  tokenHash: "hash",
  csrfToken: "csrf-token-123",
  createdAt: "2026-08-01T00:00:00.000Z",
  expiresAt: "2026-09-01T00:00:00.000Z",
  revokedAt: null,
};
const contributor = { id: 11, email: "alice@example.test", displayName: "Alice", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" };

function sessionPost(body) {
  return apiRequest("/api/corrections", {
    method: "POST",
    body,
    headers: {
      cookie: "osdb_session=raw-session-token-abc123; osdb_csrf=csrf-token-123",
      "x-csrf-token": "csrf-token-123",
    },
  });
}

test("a created report is forwarded to privacy@ from the noreply sender", async () => {
  const mailCalls = [];
  stub("sendMail", async (message) => {
    mailCalls.push(message);
    return { ok: true, messageId: "m-1" };
  });
  const { POST } = await route();
  const response = await POST(sessionPost({ cameraId: 42, issueType: "removal", message: "Urgent removal", contact: "" }));

  assert.equal(response.status, 201);
  assert.deepEqual(await responseBody(response), { referenceId: 77 });
  assert.equal(mailCalls.length, 1, "exactly one notification per created report");
  assert.equal(mailCalls[0].from, "noreply@opensurveillancedb.org");
  assert.equal(mailCalls[0].to, "privacy@opensurveillancedb.org");
  assert.match(mailCalls[0].subject, /#77/);
  assert.ok(mailCalls[0].text.includes("#77"), "the text body carries the reference");
  assert.ok(mailCalls[0].html.includes("#77"), "the html body carries the reference");
});

test("a mail failure never fails the intake (throw and ok:false both stay 201)", async () => {
  const { POST } = await route();

  stub("sendMail", async () => { throw new Error("smtp down"); });
  const thrown = await POST(sessionPost({ cameraId: null, issueType: "other", message: "boom case", contact: "" }));
  assert.equal(thrown.status, 201);
  assert.deepEqual(await responseBody(thrown), { referenceId: 77 });

  stub("sendMail", async () => ({ ok: false, code: "E_BINDING_MISSING", message: "EMAIL binding is not configured" }));
  const notOk = await POST(sessionPost({ cameraId: null, issueType: "other", message: "binding missing case", contact: "" }));
  assert.equal(notOk.status, 201);
  assert.deepEqual(await responseBody(notOk), { referenceId: 77 });
});

test("URGENT_REPORT_TO redirects the notification without changing the intake contract", async () => {
  const mailCalls = [];
  stub("sendMail", async (message) => {
    mailCalls.push(message);
    return { ok: true, messageId: "m-2" };
  });
  const { loadTreeModule } = await import("./helpers/api-harness.mjs");
  const cfw = await loadTreeModule("tests/helpers/mocks/cloudflare-workers.mjs").catch(() => null);
  // The env mock is a live module instance shared with the routes.
  if (cfw) {
    cfw.env.URGENT_REPORT_TO = "soccorso@example.test";
    try {
      const { POST } = await route();
      const response = await POST(sessionPost({ cameraId: null, issueType: "abuse", message: "redirected", contact: "" }));
      assert.equal(response.status, 201);
      assert.equal(mailCalls.at(-1).to, "soccorso@example.test", "the override wins over the default");
    } finally {
      delete cfw.env.URGENT_REPORT_TO;
    }
  }
});

test("the urgent-report renderer escapes user-supplied values", async () => {
  // The renderer is a pure lib module: import the TS source through the
  // same esbuild transpiler the api-harness uses for routes.
  const { buildRouteTree, loadTreeModule } = await import("./helpers/api-harness.mjs");
  await buildRouteTree();
  const { renderUrgentReportEmail } = await loadTreeModule("app/lib/email-templates-urgent.mjs");
  const { html, subject, text } = renderUrgentReportEmail({
    referenceId: 9,
    issueType: "<script>alert(1)</script>",
    recordId: 3,
    message: "line1\n<b>bold</b>",
    contact: 'evil"@example.test',
  });
  assert.ok(!html.includes("<script>"), "script tags are escaped in html");
  assert.ok(html.includes("&lt;script&gt;"), "escaped entities present");
  assert.ok(text.includes("<b>bold</b>"), "the plain-text body keeps raw content");
  assert.match(subject, /#9/);
});
