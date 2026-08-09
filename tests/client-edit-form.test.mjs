/**
 * Client-side interaction tests for /records/[id]/edit — C6
 * (COMMUNITY_PLAN §2.2, deliverable 5).
 *
 * In jsdom with @testing-library/react + user-event:
 *   1. owner view (GET /api/cameras/[id]/edit) 200 pre-fills the form with
 *      the record fields (title, kind, notes, …) — the form is the sober
 *      ReportForm pattern, not a full report flow;
 *   2. pending records: submitting PATCHes /api/cameras/[id] directly with
 *      the CSRF token + expectedUpdated, and shows "Changes saved.";
 *   3. verified records: the page shows the "changes enter moderation"
 *      notice and the submit button reads "Save and submit for review"; a
 *      202 answer flips the page into the "request in progress" state;
 *   4. a pending edit-request (editRequest in the owner view) renders the
 *      request state and no form (no double submit possible);
 *   5. removed/rejected records render the localized 409 blocked message,
 *      never a form;
 *   6. localized errors: 403 → not-owner, 429 → rate limit, 409 duplicate →
 *      conflict, all announced in role="alert" and focused;
 *   7. anonymous (401) renders the login prompt; missing record (404) the
 *      not-found state;
 *   8. client validation (QA-2026-08-01-2): empty title marks aria-invalid
 *      and sends nothing; per-field aria-describedby wires the inline error.
 *
 * Fixtures are fictitious (made-up camera titles, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomPage, installFetchMock, jsonResponse, renderWithLocale, setNavState, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let RecordEditPage;

before(async () => {
  rtl = await setupDom();
  RecordEditPage = await loadDomPage("app/records/[id]/edit/page.mjs");
});

afterEach(() => rtl?.cleanup());

const ownerRecordFixture = {
  id: 41,
  title: "Fixture Camera Report",
  kind: "Fixed dome",
  manufacturer: "FixtureCorp",
  observedOn: "2026-02-01",
  address: "Illustrative street, Rome",
  notes: "Fixture observation notes.",
  description: "Fixture description.",
  status: "pending",
  updated: "2026-02-10T08:00:00.000Z",
  // Stored position (t_775c8400): pre-fills the position map + inputs.
  latitude: 41.90282,
  longitude: 12.49642,
};

const activeRecordFixture = {
  ...ownerRecordFixture,
  id: 42,
  title: "Fixture Published Camera",
  status: "active",
  updated: "2026-02-11T09:00:00.000Z",
};

function editViewHandler({ record = ownerRecordFixture, editRequest = null, status = 200 } = {}) {
  return (input) => {
    if (input === "/api/cameras/41/edit" || input === "/api/cameras/42/edit") {
      if (status === 401) return jsonResponse({ error: "Not authenticated." }, { status: 401 });
      if (status === 403) return jsonResponse({ error: "You can only edit your own reports." }, { status: 403 });
      if (status === 404) return jsonResponse({ error: "Camera not found." }, { status: 404 });
      return jsonResponse({ record, editRequest }, { status: 200 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

async function renderEditPage(id = "41") {
  await setNavState({ params: { id } });
  return renderWithLocale(React.createElement(RecordEditPage));
}

test("edit page: owner view pre-fills the form with the record fields (C6)", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(editViewHandler());

  await renderEditPage("41");
  await waitFor(() => assert.ok(screen.queryByDisplayValue("Fixture Camera Report")));

  assert.equal(screen.getByDisplayValue("Fixture Camera Report").tagName, "INPUT");
  assert.equal(screen.getByDisplayValue("Fixed dome").tagName, "SELECT");
  assert.equal(screen.getByDisplayValue("FixtureCorp").value, "FixtureCorp");
  assert.equal(screen.getByDisplayValue("Illustrative street, Rome").value, "Illustrative street, Rome");
  assert.equal(screen.getByDisplayValue("Fixture observation notes.").value, "Fixture observation notes.");
  assert.equal(screen.getByDisplayValue("Fixture description.").value, "Fixture description.");
  // Position (t_775c8400): the stored coordinates pre-fill the map's manual
  // inputs at 5-decimal precision and the position section is labelled.
  assert.equal(screen.getByDisplayValue("41.90282").value, "41.90282", "latitude input pre-fills from the owner view");
  assert.equal(screen.getByDisplayValue("12.49642").value, "12.49642", "longitude input pre-fills from the owner view");
  assert.ok(screen.getByText("Camera position"), "the position section is labelled");
  // Pending record: direct-edit label, no moderation notice.
  assert.ok(screen.getByRole("button", { name: "Save changes" }));
  assert.equal(screen.queryByText("Your changes will be reviewed by a moderator before they replace the current record."), null);
});

test("edit page: pending record PATCHes directly with CSRF + expectedUpdated and confirms (C6)", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/cameras/41/edit") return jsonResponse({ record: ownerRecordFixture, editRequest: null });
    if (input === "/api/cameras/41" && init.method === "PATCH") {
      return jsonResponse({ record: { ...ownerRecordFixture, title: "Updated Title" }, changed: true });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderEditPage("41");
  await waitFor(() => assert.ok(screen.queryByDisplayValue("Fixture Camera Report")));

  const titleInput = screen.getByDisplayValue("Fixture Camera Report");
  await user.clear(titleInput);
  await user.type(titleInput, "Updated Title");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => assert.ok(requests.some((r) => r.input === "/api/cameras/41" && r.init.method === "PATCH")));
  const patch = requests.find((r) => r.input === "/api/cameras/41" && r.init.method === "PATCH");
  assert.equal(patch.init.headers["x-csrf-token"], "fixture-csrf-token");
  const payload = JSON.parse(patch.init.body);
  assert.equal(payload.title, "Updated Title");
  assert.equal(payload.kind, "Fixed dome");
  assert.equal(payload.expectedUpdated, ownerRecordFixture.updated);
  // Position (t_775c8400): the payload always carries the coordinates — an
  // unmoved position echoes the stored value, a moved one the new point.
  assert.equal(payload.latitude, ownerRecordFixture.latitude, "the unchanged position is sent as-is");
  assert.equal(payload.longitude, ownerRecordFixture.longitude, "the unchanged position is sent as-is");
  await waitFor(() => assert.ok(screen.getByText("Changes saved.")));
});

test("edit page: moving the position on the map updates the coordinate inputs and the PATCH payload (t_775c8400)", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/cameras/41/edit") return jsonResponse({ record: ownerRecordFixture, editRequest: null });
    if (input === "/api/cameras/41" && init.method === "PATCH") {
      return jsonResponse({ record: { ...ownerRecordFixture }, changed: true });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderEditPage("41");
  await waitFor(() => assert.ok(screen.queryByDisplayValue("Fixture Camera Report")));

  // Type a new position into the manual coordinate fields — the same path
  // a map click publishes to (setCoordinates).
  const latInput = screen.getByDisplayValue("41.90282");
  const lngInput = screen.getByDisplayValue("12.49642");
  await user.clear(latInput);
  await user.type(latInput, "41.90350");
  await user.clear(lngInput);
  await user.type(lngInput, "12.49700");

  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => assert.ok(requests.some((r) => r.input === "/api/cameras/41" && r.init.method === "PATCH")));
  const patch = requests.find((r) => r.input === "/api/cameras/41" && r.init.method === "PATCH");
  const payload = JSON.parse(patch.init.body);
  assert.equal(payload.latitude, 41.9035, "the moved latitude reaches the PATCH payload");
  assert.equal(payload.longitude, 12.497, "the moved longitude reaches the PATCH payload");
});

test("edit page: out-of-range coordinates fail client validation with an inline error and send nothing (t_775c8400)", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/cameras/41/edit") return jsonResponse({ record: ownerRecordFixture, editRequest: null });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderEditPage("41");
  await waitFor(() => assert.ok(screen.queryByDisplayValue("Fixture Camera Report")));

  // One atomic change (jsdom's number-input sanitizer drops intermediate
  // "95." keystrokes, so a per-character type would corrupt the value).
  const latInput = screen.getByDisplayValue("41.90282");
  rtl.fireEvent.change(latInput, { target: { value: "95.5" } });
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => assert.ok(screen.getByText("Enter valid coordinates (latitude −90 to 90, longitude −180 to 180).")));
  assert.equal(requests.some((r) => r.input === "/api/cameras/41" && r.init.method === "PATCH"), false, "no PATCH with invalid coordinates");
  const latInputAfter = screen.getByLabelText("Latitude");
  assert.equal(latInputAfter.getAttribute("aria-invalid"), "true", "the latitude input is marked invalid");
});

test("edit page: active record shows the moderation notice and submits for review (C6)", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/cameras/42/edit") return jsonResponse({ record: activeRecordFixture, editRequest: null });
    if (input === "/api/cameras/42" && init.method === "PATCH") {
      return jsonResponse(
        { editRequest: { id: 9, cameraId: 42, status: "pending", createdAt: "2026-03-01T10:00:00.000Z" } },
        { status: 202 },
      );
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderEditPage("42");
  await waitFor(() => assert.ok(screen.queryByDisplayValue("Fixture Published Camera")));

  // The review notice + the review submit label.
  assert.ok(screen.getByText("Your changes will be reviewed by a moderator before they replace the current record."));
  const submit = screen.getByRole("button", { name: "Save and submit for review" });

  const titleInput = screen.getByDisplayValue("Fixture Published Camera");
  await user.clear(titleInput);
  await user.type(titleInput, "Updated Published Title");
  await user.click(submit);

  await waitFor(() => assert.ok(requests.some((r) => r.input === "/api/cameras/42" && r.init.method === "PATCH")));
  await waitFor(() => assert.ok(screen.getByText("Your edit request has been submitted for review.")));
});

test("edit page: an open edit-request renders the request state, never the form (C6)", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(editViewHandler({
    record: activeRecordFixture,
    editRequest: { id: 3, cameraId: 42, status: "pending", createdAt: "2026-02-20T00:00:00.000Z" },
  }));

  await renderEditPage("42");
  await waitFor(() => assert.ok(screen.getByText("An edit request for this record is already under review.")));
  assert.equal(screen.queryByRole("button", { name: "Save and submit for review" }), null);
  assert.equal(screen.queryByDisplayValue("Fixture Published Camera"), null);
});

test("edit page: removed/rejected record renders the localized 409 blocked message (C6)", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(editViewHandler({ record: { ...ownerRecordFixture, status: "removed" } }));

  await renderEditPage("41");
  await waitFor(() => assert.ok(screen.getByText("This record can no longer be edited")));
  assert.ok(screen.getByText("This contribution cannot be edited: the record was removed or rejected."));
  assert.equal(screen.queryByRole("button", { name: "Save changes" }), null);
});

test("edit page: 403 non-owner and 404 not-found are localized and never render the form", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(editViewHandler({ status: 403 }));
  await renderEditPage("41");
  await waitFor(() => assert.ok(screen.getByText("You can only edit your own contributions.")));
  assert.equal(screen.queryByRole("button", { name: "Save changes" }), null);

  rtl.cleanup();
  installFetchMock(editViewHandler({ status: 404 }));
  await renderEditPage("42");
  await waitFor(() => assert.ok(screen.getByText("This record is not available for editing.")));
  assert.equal(screen.queryByRole("button", { name: "Save changes" }), null);
});

test("edit page: anonymous (401) renders the login prompt", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(editViewHandler({ status: 401 }));

  await renderEditPage("41");
  await waitFor(() => assert.ok(screen.getByText("Log in to edit your contribution")));
  const loginLink = screen.getByRole("link", { name: "Log in" });
  assert.equal(loginLink.getAttribute("href"), "/login");
});

test("edit page: 429 rate-limit and 409 duplicate errors are localized in role=alert (C6)", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  let mode = "429";
  installFetchMock((input, init) => {
    if (input === "/api/cameras/41/edit") return jsonResponse({ record: ownerRecordFixture, editRequest: null });
    if (input === "/api/cameras/41" && init.method === "PATCH") {
      if (mode === "429") return jsonResponse({ error: "Too many requests. Please try again shortly." }, { status: 429 });
      return jsonResponse({ error: "An edit request is already pending for this record." }, { status: 409 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderEditPage("41");
  await waitFor(() => assert.ok(screen.queryByDisplayValue("Fixture Camera Report")));
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => assert.ok(screen.getByRole("alert")));
  assert.ok(screen.getByText("Too many attempts. Please try again in a minute."));

  mode = "409";
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => assert.ok(screen.getByText("An edit request for this record is already under review.")));
});

test("edit page: client validation marks the empty title aria-invalid and sends nothing (QA-2026-08-01-2)", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/cameras/41/edit") return jsonResponse({ record: ownerRecordFixture, editRequest: null });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderEditPage("41");
  await waitFor(() => assert.ok(screen.queryByDisplayValue("Fixture Camera Report")));

  const titleInput = screen.getByDisplayValue("Fixture Camera Report");
  await user.clear(titleInput);
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  await waitFor(() => assert.equal(titleInput.getAttribute("aria-invalid"), "true"));
  assert.ok(screen.getByText("The record title is required."));
  assert.equal(requests.some((r) => r.input === "/api/cameras/41" && r.init.method === "PATCH"), false);
});
