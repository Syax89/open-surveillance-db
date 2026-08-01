/**
 * Client-side interaction tests for ModerationDashboard — QA t_61b90f6a.
 *
 * Covers, in jsdom with @testing-library/react + user-event:
 *   1. the queue renders camera/correction/photo rows from GET /api/moderation;
 *   2. per-row action groups carry an accessible aria-label ("Decision for
 *      camera 1") and the approve/reject/hide buttons are disabled until a
 *      reason and an acting reviewer are selected;
 *   3. approve dispatches PATCH /api/moderation with entity/id/action/reason
 *      and actorId, then shows the saved message (role=status);
 *   4. a failed PATCH surfaces the server error (role=alert);
 *   5. a failed initial load surfaces the load error (role=alert).
 *
 * Fixtures are fictitious: made-up camera titles, example.test contact, no
 * real personal data.
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
  cameraReports: [
    {
      id: 7,
      title: "Fixture pending camera",
      kind: "Fixed dome",
      status: "pending",
      latitude: 41.9004,
      longitude: 12.4936,
      address: "Illustrative location, Rome",
      source: "Community report",
      createdAt: "2026-02-10T08:00:00.000Z",
    },
  ],
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
      createdAt: "2026-02-11T09:00:00.000Z",
    },
  ],
  photoReports: [],
  recentEvents: [],
  reviewers: [
    { id: 2, displayName: "Fixture Reviewer", role: "moderator" },
  ],
  queueItems: [
    { id: 1, entity: "camera", entityId: 7, state: "queued", sensitivity: "standard" },
  ],
};

const emptyQueue = {
  cameraReports: [], publishedCameras: [], reviewCameras: [], correctionRequests: [],
  cameraEditRequests: [], photoReports: [], recentEvents: [], reviewers: [], queueItems: [],
};

test("moderation: renders the queue rows and accessible per-row action labels", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock((input) => {
    if (input === "/api/moderation") return jsonResponse(queueFixture);
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Fixture pending camera")));

  assert.ok(screen.getByText("Fixture correction request text"));
  assert.ok(screen.getByText("reporter@example.test"));
  // Action group labels (aria-label on the wrapper div).
  const cameraActions = screen.getByLabelText("Decision for camera 7");
  assert.ok(cameraActions);
  const correctionActions = screen.getByLabelText("Decision for correction 3");
  assert.ok(correctionActions);
  // Buttons are present but disabled until reason + reviewer are chosen.
  const approve = screen.getAllByRole("button", { name: "Approve" });
  assert.ok(approve.length >= 2);
  for (const button of approve) assert.equal(button.disabled, true);
  // Loading state announced politely, then replaced by the summary.
  await waitFor(() => assert.ok(screen.queryByText("2 items awaiting a local decision")));
});

test("moderation: approve dispatches PATCH with entity, id, action, reason and actor", async () => {
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

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Fixture pending camera")));

  // Select the acting reviewer.
  await user.selectOptions(screen.getByRole("combobox", { name: /^Acting reviewer/ }), "2");
  // Select a required reason for camera 7.
  await user.selectOptions(screen.getByLabelText("Required reason", { selector: "#camera-7-reason" }), "verified-public-infrastructure");
  // Now the approve button for the camera row is enabled.
  const cameraActions = screen.getByLabelText("Decision for camera 7");
  const approve = cameraActions.querySelector('button[type="button"]');
  assert.equal(approve.disabled, false);
  await user.click(approve);

  await waitFor(() => assert.equal(patchRequests.length, 1));
  const patch = patchRequests[0];
  assert.equal(patch.input, "/api/moderation");
  assert.equal(patch.init.method, "PATCH");
  const body = JSON.parse(patch.init.body);
  assert.deepEqual(body, {
    entity: "camera",
    id: 7,
    action: "approve",
    reasonCode: "verified-public-infrastructure",
    actorId: 2,
    // No manufacturer/observedOn on the fixture → both publication choices
    // default to false (private by default).
    publishManufacturer: false,
    publishObservedOn: false,
  });

  // Feedback message appears in role=status.
  await waitFor(() => assert.ok(screen.queryByText(/Camera report #7 Decision saved: Approve/)));
  const status = screen.getByRole("status");
  assert.match(status.textContent, /Camera report #7 Decision saved: Approve\. Reason: Verified public infrastructure\./);
});

test("moderation: a failed decision surfaces the server error in role=alert", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input, init) => {
    if (input === "/api/moderation" && init?.method === "PATCH") {
      return jsonResponse({ error: "fixture server rejection" }, { status: 500 });
    }
    if (input === "/api/moderation") return jsonResponse(queueFixture);
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Fixture pending camera")));

  await user.selectOptions(screen.getByRole("combobox", { name: /^Acting reviewer/ }), "2");
  await user.selectOptions(screen.getByLabelText("Required reason", { selector: "#camera-7-reason" }), "insufficient-evidence");
  const cameraActions = screen.getByLabelText("Decision for camera 7");
  const approve = cameraActions.querySelector('button[type="button"]');
  await user.click(approve);

  const alert = await screen.findByRole("alert");
  assert.equal(alert.textContent, "fixture server rejection");
});

test("moderation: failed initial load surfaces the load error", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(() => jsonResponse({ error: "queue broken" }, { status: 500 }));

  await renderWithLocale(React.createElement(ModerationDashboard));
  const alert = await screen.findByRole("alert");
  assert.equal(alert.textContent, "queue broken");
  // The loading note is replaced, not stuck.
  await waitFor(() => assert.equal(screen.queryByText("Loading local moderation queue…"), null));
});

test("moderation: empty queue shows empty states per section", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(() => jsonResponse(emptyQueue));

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("No camera reports are waiting.")));
  assert.ok(screen.getByText("No correction requests are waiting."));
  assert.ok(screen.getByText("No decisions recorded yet."));
  assert.equal(screen.getAllByRole("heading", { level: 1 }).length, 1);
});

test("moderation: hide action available on a pending camera row", async () => {
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

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Fixture pending camera")));

  await user.selectOptions(screen.getByRole("combobox", { name: /^Acting reviewer/ }), "2");
  await user.selectOptions(screen.getByLabelText("Required reason", { selector: "#camera-7-reason" }), "private-or-sensitive-location");
  const cameraActions = screen.getByLabelText("Decision for camera 7");
  const hide = [...cameraActions.querySelectorAll("button")].find((button) => button.textContent === "Hide");
  assert.ok(hide, "Hide button present");
  await user.click(hide);

  await waitFor(() => assert.equal(patchRequests.length, 1));
  const body = JSON.parse(patchRequests[0].init.body);
  assert.deepEqual(body, {
    entity: "camera",
    id: 7,
    action: "hide",
    reasonCode: "private-or-sensitive-location",
    actorId: 2,
  });
});

test("moderation: camera_edit rows render the old/new diff and decide through camera_edit entity", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const patchRequests = [];
  const editFixture = {
    ...queueFixture,
    cameraEditRequests: [
      {
        id: 12,
        cameraId: 7,
        contributorId: 9,
        status: "pending",
        createdAt: "2026-08-01T10:00:00.000Z",
        proposedTitle: "Corrected shop name",
        proposedKind: null,
        proposedManufacturer: "Acme Cameras",
        proposedAddress: null,
        proposedNotes: null,
        proposedObservedOn: null,
        proposedDescription: "Renamed after a signage update",
        currentTitle: "Fixture pending camera",
        currentKind: "Fixed dome",
        currentManufacturer: null,
        currentAddress: null,
        currentNotes: null,
        currentObservedOn: null,
        currentDescription: "",
        cameraStatus: "verified",
      },
    ],
    queueItems: [
      ...queueFixture.queueItems,
      { id: 9, entity: "camera_edit", entityId: 12, state: "queued", sensitivity: "standard" },
    ],
  };
  installFetchMock((input, init) => {
    if (input === "/api/moderation" && init?.method === "PATCH") {
      patchRequests.push({ input, init });
      return jsonResponse({}, { status: 200 });
    }
    if (input === "/api/moderation") return jsonResponse(editFixture);
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Edit request")));

  // The diff card shows the record link, the proposed values and the
  // old/new labels — only changed columns appear (unchanged stay hidden).
  assert.ok(screen.getByText(/Edit request #12/));
  assert.ok(screen.getByText(/Proposed: Corrected shop name/));
  assert.ok(screen.getByText(/Proposed: Renamed after a signage update/));
  assert.ok(screen.getByText(/Current: Fixture pending camera/));
  assert.ok(screen.getByText(/Proposed: Corrected shop name/));
  assert.ok(screen.getByText(/Proposed: Acme Cameras/));
  // Unchanged columns (kind, address, notes, observedOn) are not listed.
  assert.equal(screen.queryByText(/Proposed: Fixed dome/), null);

  // The camera_edit row has its own accessible decision group and the
  // approve/reject buttons are gated like every other row.
  const editActions = screen.getByLabelText("Decision for camera_edit 12");
  assert.ok(editActions);
  const approve = editActions.querySelector('button[type="button"]');
  assert.equal(approve.disabled, true, "approve stays disabled until reason + reviewer");

  // Deciding dispatches entity camera_edit (approve applies the diff).
  await user.selectOptions(screen.getByRole("combobox", { name: /^Acting reviewer/ }), "2");
  await user.selectOptions(screen.getByLabelText("Required reason", { selector: "#camera_edit-12-reason" }), "verified-public-infrastructure");
  assert.equal(approve.disabled, false);
  await user.click(approve);

  await waitFor(() => assert.equal(patchRequests.length, 1));
  const body = JSON.parse(patchRequests[0].init.body);
  assert.deepEqual(body, {
    entity: "camera_edit",
    id: 12,
    action: "approve",
    reasonCode: "verified-public-infrastructure",
    actorId: 2,
  });
  await waitFor(() => assert.ok(screen.queryByText(/Edit request #12 Decision saved: Approve/)));
});
