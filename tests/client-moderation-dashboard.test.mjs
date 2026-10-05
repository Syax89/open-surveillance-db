/**
 * Client-side interaction tests for ModerationDashboard — QA t_61b90f6a.
 *
 * Covers, in jsdom with @testing-library/react + user-event:
 *   1. the queue renders camera/correction rows from GET /api/moderation;
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
  cameraEditRequests: [], recentEvents: [], reviewers: [], queueItems: [],
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


// ---------------------------------------------------------------------------
// Published queue pagination (keyset published_after_* + native next/previous)
//
// These cases drive the REAL payloads the route would send, through native
// single-use Response bodies (no shared jsonResponse fake), so the client's
// .json() read, its abort/generation handling and its page state are exercised
// exactly as in production.
// ---------------------------------------------------------------------------

// Native JSON Response (single-use body), matching the route's wire shape.
const nativeJson = (payload, { status = 200 } = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

// A native Response whose .json() blocks on a gate: the test can START the
// body read, supersede the request, then release the read to prove the stale
// payload is dropped. `release` is bound to that Response's native .json.
function gatedJsonResponse(payload, { status = 200 } = {}) {
  const response = nativeJson(payload, { status });
  const nativeJsonRead = response.json.bind(response);
  let release;
  let markStarted;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { markStarted = resolve; });
  response.json = async () => { markStarted(); await gate; return nativeJsonRead(); };
  return { response, release, started };
}

const publishedCamerasPage = (start, count, prefix) =>
  Array.from({ length: count }, (_, index) => ({
    id: start + index,
    title: `${prefix} ${start + index}`,
    kind: "Fixed dome",
    status: "active",
    latitude: 41.9,
    longitude: 12.5,
    source: "Community report",
    updated: "2026-03-01T00:00:00.000Z",
    createdAt: "2026-03-01T00:00:00.000Z",
  }));

const pageOneNextCursor = { createdAt: "2026-03-01T00:20:00.000Z", id: 20 };

const paginationBase = {
  cameraReports: [],
  publishedCameras: [],
  reviewCameras: [],
  correctionRequests: [],
  cameraEditRequests: [],
  recentEvents: [],
  reviewers: [{ id: 2, displayName: "Fixture Reviewer", role: "moderator" }],
  queueItems: [],
};

const pendingCamera7 = {
  id: 7,
  title: "Fixture pending camera",
  kind: "Fixed dome",
  status: "pending",
  latitude: 41.9,
  longitude: 12.5,
  address: "Illustrative location, Rome",
  source: "Community report",
  createdAt: "2026-02-10T08:00:00.000Z",
};

const pageOnePayload = () => ({
  ...paginationBase,
  publishedCameras: publishedCamerasPage(100, 20, "Published"),
  publishedNextCursor: pageOneNextCursor,
});
const pageTwoPayload = () => ({
  ...paginationBase,
  cameraReports: [pendingCamera7],
  publishedCameras: publishedCamerasPage(121, 5, "Fresh"),
  publishedNextCursor: null,
});

function queryParamsOf(url) {
  return new URLSearchParams(url.includes("?") ? url.slice(url.indexOf("?") + 1) : "");
}

const publishedNav = (screen) => screen.getByRole("navigation", { name: "Published records" });
const previousButton = (screen) => screen.getByRole("button", { name: /Previous page/ });
const nextButton = (screen) => screen.getByRole("button", { name: /Next page/ });

test("moderation: published pagination requests the exact cursor and shows the matching cards", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    const url = String(input);
    if (url.startsWith("/api/moderation") && init?.method === "PATCH") return nativeJson({}, { status: 200 });
    requests.push(url);
    if (queryParamsOf(url).get("published_after_id") === "20") return nativeJson(pageTwoPayload());
    return nativeJson(pageOnePayload());
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));

  assert.deepEqual(requests, ["/api/moderation"], "the first page has no cursor in the URL");
  assert.equal(screen.queryByText("Fresh 121"), null, "the next page is not prefetched");
  const nav = publishedNav(screen);
  assert.ok(nav.contains(previousButton(screen)) && nav.contains(nextButton(screen)));
  assert.equal(previousButton(screen).disabled, true, "the first page has no previous");
  assert.equal(nextButton(screen).disabled, false);

  await user.click(nextButton(screen));
  await waitFor(() => assert.ok(screen.queryByText("Fresh 121")));
  assert.equal(screen.queryByText("Published 100"), null, "the old page cards are replaced");
  assert.equal(
    requests.at(-1),
    "/api/moderation?published_after_created_at=2026-03-01T00%3A20%3A00.000Z&published_after_id=20",
    "next requests the exact keyset cursor",
  );
  assert.equal(nextButton(screen).disabled, true, "page 2 is terminal");
  assert.equal(previousButton(screen).disabled, false);

  await user.click(previousButton(screen));
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));
  assert.equal(requests.at(-1), "/api/moderation", "previous from page 2 refetches the first page");
  assert.deepEqual(
    requests,
    ["/api/moderation", "/api/moderation?published_after_created_at=2026-03-01T00%3A20%3A00.000Z&published_after_id=20", "/api/moderation"],
    "no walking ahead: only the requested pages were fetched",
  );
});

test("moderation: published pagination is terminal and labelled on the last page", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(() => nativeJson({ ...paginationBase, publishedCameras: publishedCamerasPage(100, 3, "Published"), publishedNextCursor: null }));

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));

  assert.ok(publishedNav(screen));
  assert.equal(previousButton(screen).disabled, true);
  assert.equal(nextButton(screen).disabled, true, "no next cursor = no next page");
  assert.equal(screen.queryByRole("button", { name: "Try again" }), null, "no retry without a failure");
});

test("moderation: a delayed published page keeps aria-busy and never flashes the empty state", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const { response, release } = gatedJsonResponse(pageTwoPayload());
  installFetchMock((input, init) => {
    const url = String(input);
    if (url.startsWith("/api/moderation") && init?.method === "PATCH") return nativeJson({}, { status: 200 });
    if (queryParamsOf(url).get("published_after_id") === "20") return response;
    return nativeJson(pageOnePayload());
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));

  await user.click(nextButton(screen));
  // The page-2 body read is in flight: the section must not claim "no records".
  assert.equal(screen.queryByText("No verified records are available locally."), null, "no false empty state while loading");
  assert.equal(publishedNav(screen).getAttribute("aria-busy"), "true");
  assert.equal(previousButton(screen).disabled, true, "controls are disabled while fetching");
  assert.equal(nextButton(screen).disabled, true);

  release();
  await waitFor(() => assert.ok(screen.queryByText("Fresh 121")));
  assert.equal(publishedNav(screen).getAttribute("aria-busy"), "false");
});

test("moderation: a superseded delayed published success cannot overwrite the current page", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const { response: staleResponse, release } = gatedJsonResponse({
    ...paginationBase,
    cameraReports: [pendingCamera7],
    publishedCameras: publishedCamerasPage(200, 20, "Stale"),
    publishedNextCursor: pageOneNextCursor,
  });
  let pageTwoFetches = 0;
  installFetchMock((input, init) => {
    const url = String(input);
    if (url.startsWith("/api/moderation") && init?.method === "PATCH") return nativeJson({}, { status: 200 });
    if (queryParamsOf(url).get("published_after_id") === "20") {
      pageTwoFetches += 1;
      return pageTwoFetches === 1 ? staleResponse : nativeJson(pageTwoPayload());
    }
    return nativeJson({ ...pageOnePayload(), cameraReports: [pendingCamera7] });
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));

  // Start the page-2 body read, then supersede it with a decision refresh.
  await user.click(nextButton(screen));
  await user.selectOptions(screen.getByRole("combobox", { name: /^Acting reviewer/ }), "2");
  await user.selectOptions(screen.getByLabelText("Required reason", { selector: "#camera-7-reason" }), "verified-public-infrastructure");
  await user.click(screen.getByLabelText("Decision for camera 7").querySelector('button[type="button"]'));
  await waitFor(() => assert.ok(screen.queryByText("Fresh 121")));

  // Release the stale body read now that the newer page is rendered.
  release();
  await waitFor(() => assert.equal(screen.queryByRole("alert"), null));
  assert.ok(screen.queryByText("Fresh 121"), "the newer page survives");
  assert.equal(screen.queryByText("Stale 1"), null, "the superseded response never overwrites the page");
  assert.equal(screen.queryByText("Published 100"), null);
  assert.equal(nextButton(screen).disabled, true, "busy flags follow the newest response");
  assert.equal(previousButton(screen).disabled, false);
  assert.equal(publishedNav(screen).getAttribute("aria-busy"), "false");
});

test("moderation: a superseded delayed published error cannot surface on the current page", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const { response: staleResponse, release } = gatedJsonResponse({ error: "stale page failure" }, { status: 500 });
  let pageTwoFetches = 0;
  installFetchMock((input, init) => {
    const url = String(input);
    if (url.startsWith("/api/moderation") && init?.method === "PATCH") return nativeJson({}, { status: 200 });
    if (queryParamsOf(url).get("published_after_id") === "20") {
      pageTwoFetches += 1;
      return pageTwoFetches === 1 ? staleResponse : nativeJson(pageTwoPayload());
    }
    return nativeJson({ ...pageOnePayload(), cameraReports: [pendingCamera7] });
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));

  await user.click(nextButton(screen));
  await user.selectOptions(screen.getByRole("combobox", { name: /^Acting reviewer/ }), "2");
  await user.selectOptions(screen.getByLabelText("Required reason", { selector: "#camera-7-reason" }), "verified-public-infrastructure");
  await user.click(screen.getByLabelText("Decision for camera 7").querySelector('button[type="button"]'));
  await waitFor(() => assert.ok(screen.queryByText("Fresh 121")));

  release();
  await waitFor(() => assert.equal(screen.queryByRole("alert"), null));
  assert.ok(screen.queryByText("Fresh 121"));
});

test("moderation: a rejected decision is not advertised as a page retry", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input, init) => {
    const url = String(input);
    if (url.startsWith("/api/moderation") && init?.method === "PATCH") return nativeJson({ error: "fixture server rejection" }, { status: 500 });
    return nativeJson({ ...paginationBase, cameraReports: [pendingCamera7], publishedCameras: publishedCamerasPage(100, 20, "Published"), publishedNextCursor: null });
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));

  await user.selectOptions(screen.getByRole("combobox", { name: /^Acting reviewer/ }), "2");
  await user.selectOptions(screen.getByLabelText("Required reason", { selector: "#camera-7-reason" }), "verified-public-infrastructure");
  await user.click(screen.getByLabelText("Decision for camera 7").querySelector('button[type="button"]'));

  const alert = await screen.findByRole("alert");
  assert.equal(alert.textContent, "fixture server rejection");
  // A decision rejection is a PATCH error, not a queue-load failure: the page
  // retry affordance must stay absent while the published cards are shown.
  assert.ok(screen.queryByText("Published 100"));
  assert.equal(screen.queryByRole("button", { name: "Try again" }), null);
  assert.equal(screen.queryByRole("button", { name: /Next page/ }).disabled, true);
});

test("moderation: a failed Previous offers a retry of the current cursor and recovers", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  let pageOneFetches = 0;
  installFetchMock((input, init) => {
    const url = String(input);
    if (url.startsWith("/api/moderation") && init?.method === "PATCH") return nativeJson({}, { status: 200 });
    if (queryParamsOf(url).get("published_after_id") === "20") return nativeJson(pageTwoPayload());
    pageOneFetches += 1;
    // 1st = initial load, 2nd = the failed "previous", 3rd = the retry.
    if (pageOneFetches === 2) return nativeJson({ error: "page one unavailable" }, { status: 500 });
    return nativeJson({ ...pageOnePayload(), cameraReports: [pendingCamera7] });
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));

  await user.click(nextButton(screen));
  await waitFor(() => assert.ok(screen.queryByText("Fresh 121")));

  // Previous (cursor -> first page) fails: the footer must not vanish.
  await user.click(previousButton(screen));
  const alert = await screen.findByRole("alert");
  assert.equal(alert.textContent, "page one unavailable");
  assert.equal(screen.queryByText("Published 100"), null);
  assert.equal(screen.queryByText("No verified records are available locally."), null, "no false empty state after a failed page");
  const retry = screen.getByRole("button", { name: "Try again" });
  assert.equal(retry.disabled, false);

  // Retry reloads the CURRENT (first-page) cursor and clears the stale alert.
  await user.click(retry);
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));
  await waitFor(() => assert.equal(screen.queryByRole("alert"), null));
  assert.equal(screen.queryByRole("button", { name: "Try again" }), null);
  assert.equal(nextButton(screen).disabled, false);
});

test("moderation: a failed first page still offers retry and recovers", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  let attempts = 0;
  installFetchMock(() => {
    attempts += 1;
    if (attempts === 1) return nativeJson({ error: "queue broken" }, { status: 500 });
    return nativeJson(pageOnePayload());
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  const alert = await screen.findByRole("alert");
  assert.equal(alert.textContent, "queue broken");

  const retry = await screen.findByRole("button", { name: "Try again" });
  await user.click(retry);
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));
  await waitFor(() => assert.equal(screen.queryByRole("alert"), null));
});

test("moderation: retry reports aria-busy and disables its controls until the page loads", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  let attempts = 0;
  const { response: retryResponse, release, started } = gatedJsonResponse(pageOnePayload());
  installFetchMock((input, init) => {
    const url = String(input);
    if (url.startsWith("/api/moderation") && init?.method === "PATCH") return nativeJson({}, { status: 200 });
    attempts += 1;
    if (attempts === 1) return nativeJson({ error: "queue broken" }, { status: 500 });
    return retryResponse;
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  assert.equal((await screen.findByRole("alert")).textContent, "queue broken");

  await user.click(await screen.findByRole("button", { name: "Try again" }));
  // The retry body read is in flight: busy state and disabled controls must be
  // visible before the payload arrives (not only after).
  await started;
  assert.equal(publishedNav(screen).getAttribute("aria-busy"), "true");
  assert.equal(screen.getByRole("button", { name: "Try again" }).disabled, true);
  assert.equal(previousButton(screen).disabled, true);
  assert.equal(nextButton(screen).disabled, true);

  release();
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));
  await waitFor(() => assert.equal(screen.queryByRole("alert"), null));
  assert.equal(publishedNav(screen).getAttribute("aria-busy"), "false");
  assert.equal(screen.queryByRole("button", { name: "Try again" }), null);
});

// ---------------------------------------------------------------------------
// Three P2 fixes: truthful busy on every loadQueue, truthful empty copy on a
// later empty page, and a reentrant-safe pagination gate.
// ---------------------------------------------------------------------------

test("moderation: a locale-driven queue reload reports published aria-busy until it settles", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  let moderationGets = 0;
  const { response, release, started } = gatedJsonResponse(pageOnePayload());
  installFetchMock((input, init) => {
    const url = String(input);
    if (url.startsWith("/api/moderation") && init?.method === "PATCH") return nativeJson({}, { status: 200 });
    moderationGets += 1;
    // The mount load resolves at once; the locale-triggered reload is held open.
    return moderationGets === 1 ? nativeJson(pageOnePayload()) : response;
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));

  // Capture the live nodes before switching locale changes the visible labels.
  const nav = publishedNav(screen);
  const previous = previousButton(screen);
  const next = nextButton(screen);

  // Changing locale changes t.loadError, so loadQueue's identity changes and the
  // mount effect re-runs — a trigger the page-nav/retry callers do not cover.
  await user.click(screen.getByRole("button", { name: "IT" }));
  await started;
  assert.equal(nav.getAttribute("aria-busy"), "true", "the effect-driven reload must report busy");
  assert.equal(previous.disabled, true);
  assert.equal(next.disabled, true);

  release();
  await waitFor(() => assert.equal(nav.getAttribute("aria-busy"), "false"));
});

test("moderation: an empty later page shows no empty-state copy and still goes back", async () => {
  const { screen, waitFor } = rtl;
  window.localStorage.removeItem("opensurveillancedb-locale"); document.cookie = "opensurveillancedb-locale=; path=/; max-age=0"; document.cookie = "opensurveillancedb-locale=; path=/; max-age=0"; // the locale test above leaves IT stored (localStorage + cookie)
  const user = rtl.userEvent.setup();
  installFetchMock((input, init) => {
    const url = String(input);
    if (url.startsWith("/api/moderation") && init?.method === "PATCH") return nativeJson({}, { status: 200 });
    if (queryParamsOf(url).get("published_after_id") === "20") {
      // A later page emptied by a concurrent deletion mid-walk: no rows, no next.
      return nativeJson({ ...paginationBase, publishedCameras: [], publishedNextCursor: null });
    }
    return nativeJson(pageOnePayload());
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));

  await user.click(nextButton(screen));
  await waitFor(() => assert.equal(previousButton(screen).disabled, false));

  // Empty later page: no false "no records at all" copy, Previous still works.
  assert.equal(screen.queryByText("No verified records are available locally."), null);
  assert.equal(screen.queryByText("Published 100"), null);
  assert.equal(previousButton(screen).disabled, false);

  await user.click(previousButton(screen));
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));
});

test("moderation: two synchronous Next clicks collapse to a single request", async () => {
  const { screen, waitFor } = rtl;
  window.localStorage.removeItem("opensurveillancedb-locale"); document.cookie = "opensurveillancedb-locale=; path=/; max-age=0";
  const requests = [];
  installFetchMock((input, init) => {
    const url = String(input);
    if (url.startsWith("/api/moderation") && init?.method === "PATCH") return nativeJson({}, { status: 200 });
    requests.push(url);
    if (queryParamsOf(url).get("published_after_id") === "20") return nativeJson(pageTwoPayload());
    return nativeJson(pageOnePayload());
  });

  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Published 100")));

  const next = nextButton(screen);
  // Two clicks in one synchronous frame, before the first response resolves.
  rtl.act(() => { next.click(); next.click(); });
  await waitFor(() => assert.ok(screen.queryByText("Fresh 121")));

  const pageTwoRequests = requests.filter((url) => queryParamsOf(url).get("published_after_id") === "20");
  assert.equal(pageTwoRequests.length, 1, "the synchronous in-flight gate must collapse the double click to one request");
});
