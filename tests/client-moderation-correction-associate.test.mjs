/**
 * Client-side interaction tests for the H1 moderator association flow
 * (kanban t_69891619): a correction request can be linked to a record
 * outcome from the dashboard, and a record's private correction history is
 * one click away.
 *
 * Covers, in jsdom with @testing-library/react + user-event:
 *   1. a correction row exposes the record-outcome select, the record-id
 *      field and the "Link to record" (associate) action; approve stays
 *      disabled until an outcome is chosen;
 *   2. approve with outcome (+ optional record id) dispatches PATCH with
 *      entity=correction, action=approve, outcome and cameraId;
 *   3. associate dispatches PATCH with action=associate and cameraId
 *      (links without deciding — status stays pending server-side);
 *   4. the record history section fetches GET /api/moderation/corrections
 *      and renders requests with their decision trail;
 *   5. history error and empty states surface correctly.
 *
 * Fixtures are fictitious (example.test contact, made-up titles).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let ModerationDashboard;

before(async () => {
  rtl = await setupDom();
  const mod = await loadDomModule("app/components/ModerationDashboard.mjs");
  ModerationDashboard = mod.ModerationDashboard;
});

afterEach(() => rtl?.cleanup());

const queueFixture = {
  cameraReports: [],
  publishedCameras: [],
  reviewCameras: [],
  correctionRequests: [
    {
      id: 3,
      cameraId: 7,
      issueType: "inaccurate",
      message: "Fixture correction request text",
      contact: "reporter@example.test",
      status: "pending",
      outcome: null,
      createdAt: "2026-02-11T09:00:00.000Z",
    },
  ],
  cameraEditRequests: [],
  photoReports: [],
  recentEvents: [],
  reviewers: [
    { id: 2, displayName: "Fixture Reviewer", role: "moderator" },
  ],
  queueItems: [
    { id: 1, entity: "correction", entityId: 3, state: "queued", sensitivity: "standard" },
  ],
};

const historyFixture = {
  camera: { id: 7, title: "Fixture corner camera", status: "verified" },
  requests: [
    {
      id: 9,
      cameraId: 7,
      issueType: "removal",
      message: "Fixture removal request text",
      contact: "reporter@example.test",
      status: "reviewed",
      outcome: "removed",
      createdAt: "2026-07-28T09:00:00.000Z",
      resolvedAt: "2026-07-29T10:00:00.000Z",
      events: [
        {
          id: 7,
          entity: "correction",
          entityId: 9,
          previousStatus: "pending",
          newStatus: "reviewed",
          action: "approve",
          reasonCode: "privacy-or-safety-concern",
          note: "Confirmed removal",
          actor: "Fixture Reviewer",
          actorRole: "moderator",
          recused: 0,
          escalated: 0,
          secondReviewerId: null,
          createdAt: "2026-07-29T10:00:00.000Z",
        },
      ],
    },
  ],
};

async function renderQueue() {
  await renderWithLocale(React.createElement(ModerationDashboard));
  await rtl.waitFor(() => assert.ok(rtl.screen.queryByText("Fixture correction request text")));
}

test("correction rows offer the record outcome, record id and Link to record action", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock((input) => {
    if (input === "/api/moderation") return jsonResponse(queueFixture);
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderQueue();

  // The correction-only decision fields are present.
  assert.ok(screen.getByLabelText(/Record outcome/, { selector: "#correction-3-outcome" }));
  assert.ok(screen.getByLabelText(/Record ID/, { selector: "#correction-3-camera" }));
  const actions = screen.getByLabelText("Decision for correction 3");
  const buttons = [...actions.querySelectorAll("button")].map((button) => button.textContent);
  assert.deepEqual(buttons, ["Approve", "Reject", "Link to record", "Escalate"]);
  // Approve stays locked until reason + reviewer + outcome are chosen.
  const approve = actions.querySelector("button");
  assert.equal(approve.disabled, true);

  // Select reviewer + reason: approve is still locked (outcome missing).
  const user = rtl.userEvent.setup();
  await user.selectOptions(screen.getByRole("combobox", { name: /^Acting reviewer/ }), "2");
  await user.selectOptions(screen.getByLabelText("Required reason", { selector: "#correction-3-reason" }), "inaccurate-or-outdated");
  await waitFor(() => assert.equal(approve.disabled, true));
  // Choosing a record outcome unlocks approve; associate unlocks only with a record id.
  await user.selectOptions(screen.getByLabelText(/Record outcome/, { selector: "#correction-3-outcome" }), "corrected");
  await waitFor(() => assert.equal(approve.disabled, false));
  const associate = [...actions.querySelectorAll("button")].find((button) => button.textContent === "Link to record");
  assert.equal(associate.disabled, true, "associate stays locked until a record id is entered");
  await user.type(screen.getByLabelText(/Record ID/, { selector: "#correction-3-camera" }), "7");
  await waitFor(() => assert.equal(associate.disabled, false));
});

test("approve on a correction dispatches PATCH with the record outcome and linked record id", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const patchRequests = [];
  installFetchMock((input, init) => {
    if (input === "/api/moderation" && init?.method === "PATCH") {
      patchRequests.push({ input, init });
      return jsonResponse({}, { status: 200 });
    }
    if (input === "/api/moderation") return jsonResponse(queueFixture);
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderQueue();

  await user.selectOptions(screen.getByRole("combobox", { name: /^Acting reviewer/ }), "2");
  await user.selectOptions(screen.getByLabelText("Required reason", { selector: "#correction-3-reason" }), "inaccurate-or-outdated");
  await user.selectOptions(screen.getByLabelText(/Record outcome/, { selector: "#correction-3-outcome" }), "corrected");
  await user.type(screen.getByLabelText(/Record ID/, { selector: "#correction-3-camera" }), "7");
  const actions = screen.getByLabelText("Decision for correction 3");
  await user.click(actions.querySelector("button"));

  await waitFor(() => assert.equal(patchRequests.length, 1));
  const body = JSON.parse(patchRequests[0].init.body);
  assert.deepEqual(body, {
    entity: "correction",
    id: 3,
    action: "approve",
    reasonCode: "inaccurate-or-outdated",
    actorId: 2,
    outcome: "corrected",
    cameraId: 7,
  });
  await waitFor(() => assert.ok(screen.queryByText(/Correction request #3 Decision saved: Approve/)));
});

test("associate links a pending correction to a record without deciding", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const patchRequests = [];
  installFetchMock((input, init) => {
    if (input === "/api/moderation" && init?.method === "PATCH") {
      patchRequests.push({ input, init });
      return jsonResponse({}, { status: 200 });
    }
    if (input === "/api/moderation") return jsonResponse(queueFixture);
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderQueue();

  await user.selectOptions(screen.getByRole("combobox", { name: /^Acting reviewer/ }), "2");
  await user.selectOptions(screen.getByLabelText("Required reason", { selector: "#correction-3-reason" }), "insufficient-evidence");
  await user.type(screen.getByLabelText(/Record ID/, { selector: "#correction-3-camera" }), "7");
  const actions = screen.getByLabelText("Decision for correction 3");
  const associate = [...actions.querySelectorAll("button")].find((button) => button.textContent === "Link to record");
  await user.click(associate);

  await waitFor(() => assert.equal(patchRequests.length, 1));
  const body = JSON.parse(patchRequests[0].init.body);
  assert.deepEqual(body, {
    entity: "correction",
    id: 3,
    action: "associate",
    reasonCode: "insufficient-evidence",
    actorId: 2,
    cameraId: 7,
  });
  assert.equal(body.outcome, undefined, "associate never carries an outcome");
});

test("the record history section renders a record's correction trail", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const historyRequests = [];
  installFetchMock((input) => {
    if (input === "/api/moderation") return jsonResponse(queueFixture);
    if (String(input).startsWith("/api/moderation/corrections")) {
      historyRequests.push(String(input));
      return jsonResponse(historyFixture);
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderQueue();

  const input = screen.getByLabelText(/Record ID/, { selector: "#correction-history-record" });
  await user.type(input, "7");
  await user.click(screen.getByRole("button", { name: "Show history" }));

  await waitFor(() => assert.equal(historyRequests.length, 1));
  assert.equal(historyRequests[0], "/api/moderation/corrections?cameraId=7");

  await waitFor(() => assert.ok(screen.queryByText("Fixture removal request text")));
  assert.ok(screen.getByText(/Related record #7 — Fixture corner camera/));
  // "Removed" appears both as the queue select option and as the history
  // outcome label, so scope the assertion to the history card.
  const historyCard = screen.getByText("Fixture removal request text").closest("article");
  assert.ok(historyCard?.textContent.includes("Removed"), "request outcome label is rendered in the history card");
  assert.ok(screen.getByText("Confirmed removal")); // decision note
  // Actor attribution (the reviewer select option shows the same name, so
  // scope to the history card).
  assert.ok(historyCard?.textContent.includes("Fixture Reviewer"), "actor attribution is rendered in the history card");
  assert.ok(screen.getByText("Approved")); // event action (past tense)
});

test("record history surfaces the not-found and empty states", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input) => {
    if (input === "/api/moderation") return jsonResponse(queueFixture);
    if (String(input).includes("cameraId=4242")) return jsonResponse({ error: "Record not found." }, { status: 404 });
    if (String(input).startsWith("/api/moderation/corrections")) {
      return jsonResponse({ camera: { id: 7, title: "Fixture corner camera", status: "verified" }, requests: [] });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderQueue();

  // Unknown record → server 404 surfaces in role=alert.
  const input = screen.getByLabelText(/Record ID/, { selector: "#correction-history-record" });
  await user.type(input, "4242");
  await user.click(screen.getByRole("button", { name: "Show history" }));
  await waitFor(() => assert.ok(screen.queryByText("Record not found.")));

  // Known record with no requests → empty state.
  await user.clear(input);
  await user.type(input, "7");
  await user.click(screen.getByRole("button", { name: "Show history" }));
  await waitFor(() => assert.ok(screen.queryByText("No correction requests for this record.")));
});
