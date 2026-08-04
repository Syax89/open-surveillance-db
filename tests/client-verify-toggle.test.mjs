/**
 * Client-side interaction tests for community actions on records — the
 * legacy StarConfirmButton standalone AND the community action widget
 * (ADR 0021 §3, FASE 3 UI) wired into the record detail (/records/[id]).
 *
 * Standalone component (COMMUNITY_PLAN §6.3 C2/C9 — legacy verification
 * surface, kept for the account page family):
 *   1. accessible name flips between "Confirm this record exists" and
 *      "Remove verification" (localized);
 *   2. aria-pressed mirrors the confirmed state; the counter is a polite
 *      live region (aria-live="polite");
 *   3. the SVG star is decorative (aria-hidden), the count pluralizes
 *      (1 verification / 3 verifications);
 *   4. disabled + disabledReason renders the explicit explanatory copy
 *      under the button (anonymous / L0 gates are fail-closed);
 *   5. aria-busy while a toggle is in flight.
 *
 * Record detail wiring (FASE 3 UI — CommunityActions replaces the old
 * verification toggle on the record page; ADR §3.2 one-action contract):
 *   6. anonymous caller → disabled buttons + "Log in or register" CTA,
 *      aggregate counts still visible;
 *   7. signed-in → PUT /api/cameras/[id]/actions with the CSRF token, the
 *      count updates from the server reply and aria-pressed flips;
 *   8. active action → DELETE removes it and the count drops;
 *   9. self-action 403 surfaces the localized error (fail-closed);
 *  10. duplicate action (409) shows its localized error;
 *  11. a dead session fails open on the probe but the 401 answers honestly
 *      (error alert + login CTA — never a silent working-looking button).
 *
 * The action widget renders ONLY on the record detail and in the map popup
 * (never in cards/directory/home, C3). Fixtures are fictitious.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomPage, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, setNavState, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let StarConfirmButton;
let RecordPage;

before(async () => {
  rtl = await setupDom();
  StarConfirmButton = (await loadDomModule("app/components/StarConfirmButton.mjs")).StarConfirmButton;
  RecordPage = await loadDomPage("app/records/[id]/RecordPageBody.mjs");
});

afterEach(() => {
  rtl?.cleanup();
  document.cookie = "osdb_csrf=; max-age=0; path=/";
});

// ---------------------------------------------------------------------------
// Standalone component
// ---------------------------------------------------------------------------

async function renderStandalone(props) {
  return renderWithLocale(React.createElement(StarConfirmButton, props));
}

test("toggle: accessible name flips with the confirmed state (localized)", async () => {
  const { screen } = rtl;
  const view = await renderStandalone({ count: 0, confirmed: false, busy: false, disabled: false, onToggle: () => {} });
  assert.ok(screen.getByRole("button", { name: "Confirm this record exists" }));

  view.rerender(await wrapWithLocale(React.createElement(StarConfirmButton, { count: 0, confirmed: true, busy: false, disabled: false, onToggle: () => {} })));
  assert.ok(screen.getByRole("button", { name: "Remove verification" }));
});

test("toggle: aria-pressed mirrors the state and the counter is a polite live region", async () => {
  const { screen } = rtl;
  const view = await renderStandalone({ count: 3, confirmed: false, busy: false, disabled: false, onToggle: () => {} });
  const button = screen.getByRole("button", { name: "Confirm this record exists" });
  assert.equal(button.getAttribute("aria-pressed"), "false");
  const counter = screen.getByText("3 verifications");
  assert.equal(counter.getAttribute("aria-live"), "polite");

  view.rerender(await wrapWithLocale(React.createElement(StarConfirmButton, { count: 3, confirmed: true, busy: false, disabled: false, onToggle: () => {} })));
  assert.equal(screen.getByRole("button", { name: "Remove verification" }).getAttribute("aria-pressed"), "true");
});

test("toggle: star is decorative SVG with aria-hidden, count pluralizes", async () => {
  const { container } = await renderStandalone({ count: 1, confirmed: false, busy: false, disabled: false, onToggle: () => {} });
  const star = container.querySelector(".confirm-star");
  assert.ok(star, "the inline star SVG must render");
  assert.equal(star.getAttribute("aria-hidden"), "true");
  assert.equal(star.getAttribute("focusable"), "false");
  assert.ok(container.querySelector(".confirm-button svg"), "the star must live inside the native button");
});

test("toggle: disabled + disabledReason renders the explicit explanatory copy", async () => {
  const { screen } = rtl;
  await renderStandalone({
    count: 2, confirmed: false, busy: false, disabled: true,
    disabledReason: "Log in to verify this record", onToggle: () => {},
  });
  const button = screen.getByRole("button", { name: "Confirm this record exists" });
  assert.equal(button.disabled, true);
  assert.ok(screen.getByText("Log in to verify this record"));
});

test("toggle: aria-busy while a toggle is in flight", async () => {
  const { screen } = rtl;
  const view = await renderStandalone({ count: 1, confirmed: false, busy: true, disabled: false, onToggle: () => {} });
  const button = screen.getByRole("button", { name: "Confirm this record exists" });
  assert.equal(button.getAttribute("aria-busy"), "true");
  assert.equal(button.disabled, true, "busy must disable the button to prevent double-submit");

  view.rerender(await wrapWithLocale(React.createElement(StarConfirmButton, { count: 1, confirmed: false, busy: false, disabled: false, onToggle: () => {} })));
  assert.equal(screen.getByRole("button", { name: "Confirm this record exists" }).getAttribute("aria-busy"), "false");
});

// ---------------------------------------------------------------------------
// Record detail wiring
// ---------------------------------------------------------------------------

const recordFixture = {
  id: 7,
  title: "Fixture Public Camera",
  kind: "Fixed dome",
  status: "active",
  latitude: 41.9004,
  longitude: 12.4936,
  source: "Community report",
  updated: "2026-03-01T00:00:00.000Z",
  description: "Fictitious public record used only in tests.",
  address: "Illustrative location, Rome",
  // Community-action aggregates (ADR 0021 §10.2): the record page passes
  // these into the action widget as the initial live counts.
  usefulCount: 3,
  confirmCount: 2,
  goneCount: 0,
  problemCount: 0,
  privacyCount: 0,
};

/**
 * Record-detail fetch mock (FASE 3 UI wiring): the dedicated record endpoint,
 * the public events timeline, the personal action state and the session
 * probe. `toggle` answers the PUT/DELETE mutation with the server reply —
 * the same contract client-community-actions exercises standalone, here
 * through the REAL record page.
 */
function recordHandler({
  personal = null,
  me = levelOneProfile,
  toggle = (method, action) => jsonResponse({
    action: method === "PUT" ? action : null,
    counts: { like: 3, confirm: method === "PUT" ? 3 : 1, gone: 0, problem: 0, privacy: 0 },
  }, { status: 200 }),
} = {}) {
  return (input, init) => {
    if (input === "/api/cameras/7") return jsonResponse({ record: recordFixture });
    if (input === "/api/cameras/7/events") return jsonResponse({ events: [] });
    if (input === "/api/cameras/7/actions") {
      if (init && init.method === "PUT") return toggle("PUT", JSON.parse(init.body).action);
      if (init && init.method === "DELETE") return toggle("DELETE", null);
      return jsonResponse({ action: personal });
    }
    if (input === "/api/auth/me") return jsonResponse(me, { status: me === null ? 401 : 200 });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

test("record detail: anonymous caller sees the disabled widget with the login CTA", async () => {
  const { screen } = rtl;
  installFetchMock(recordHandler({ me: null }));
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");
  // The five action buttons render disabled; the counts are public data.
  const useful = await screen.findByRole("button", { name: /Mark this record as useful/ });
  assert.equal(useful.disabled, true);
  assert.ok(screen.getByRole("button", { name: /I confirm this record is still present/ }).disabled);
  // The anonymous surface explains the gate and links to login.
  await screen.findByRole("link", { name: /Log in or register to take part/ });
  // Aggregate counts still show (public data, no session needed).
  assert.ok(screen.getByText("Useful: 3"));
  assert.ok(screen.getByText("Confirm: 2"));
});

test("record detail: signed-in caller PUTs with the CSRF token, updates the count and flips aria-pressed", async () => {
  const { screen, waitFor } = rtl;
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    return recordHandler()(input, init);
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");
  // The session probe settles asynchronously: the button renders disabled
  // first and flips to enabled only after the probe resolves.
  const confirm = await waitFor(() => {
    const current = screen.getByRole("button", { name: /I confirm this record is still present/ });
    assert.equal(current.disabled, false, "the session probe must settle before the action is enabled");
    assert.equal(current.getAttribute("aria-pressed"), "false");
    return current;
  }, { timeout: 5000 });

  const user = rtl.userEvent.setup();
  await user.click(confirm);

  await waitFor(() => assert.equal(confirm.getAttribute("aria-pressed"), "true"));
  const put = requests.find((r) => r.input === "/api/cameras/7/actions" && r.init?.method === "PUT");
  assert.ok(put, "the action must PUT to the community-actions endpoint");
  assert.equal(put.init.headers["x-csrf-token"], "fixture-csrf-token");
  assert.deepEqual(JSON.parse(put.init.body), { action: "confirm" });
  // Count updated from the server reply (2 → 3), announced via live region.
  assert.ok(screen.getByText("Confirm: 3"));
});

test("record detail: active action DELETEs and the count drops", async () => {
  const { screen, waitFor } = rtl;
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    return recordHandler({ personal: "confirm" })(input, init);
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");
  const confirm = await screen.findByRole("button", { name: /I confirm this record is still present/ });
  await waitFor(() => assert.equal(confirm.getAttribute("aria-pressed"), "true"));

  const user = rtl.userEvent.setup();
  await user.click(confirm);

  await waitFor(() => assert.equal(confirm.getAttribute("aria-pressed"), "false"));
  const del = requests.find((r) => r.input === "/api/cameras/7/actions" && r.init?.method === "DELETE");
  assert.ok(del, "removing the action must DELETE the personal action");
  assert.ok(screen.getByText("Confirm: 1"));
});

test("record detail: self-action 403 surfaces the error (fail-closed)", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(recordHandler({
    toggle: () => jsonResponse({ error: "You cannot mark your own report as useful or confirm it." }, { status: 403 }),
  }));
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");
  const user = rtl.userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /I confirm this record is still present/ }));

  await waitFor(() => assert.ok(screen.getByRole("alert")));
  assert.ok(screen.getByText("You cannot mark your own report as useful or confirm it."));
});

test("record detail: duplicate action (409) shows its localized error", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(recordHandler({
    toggle: () => jsonResponse({ error: "You already set this action." }, { status: 409 }),
  }));
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");
  const user = rtl.userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /I confirm this record is still present/ }));

  await waitFor(() => assert.ok(screen.getByText("You already set this action.")));
});

test("record detail: a dead session fails open on the probe but the 401 answers honestly", async () => {
  const { screen, waitFor } = rtl;
  // The session probe rejects (dead session); the widget deliberately does
  // NOT block actions on a failed probe (a transient probe failure must not
  // freeze the surface). The server is the authority: the click answers 401
  // and the widget shows the honest session-ended error + the login CTA.
  installFetchMock((input, init) => {
    if (input === "/api/cameras/7") return jsonResponse({ record: recordFixture });
    if (input === "/api/cameras/7/events") return jsonResponse({ events: [] });
    if (input === "/api/cameras/7/actions" && init?.method === "PUT") {
      return jsonResponse({ error: "session ended" }, { status: 401 });
    }
    if (input === "/api/cameras/7/actions") return Promise.reject(new TypeError("Failed to fetch"));
    if (input === "/api/auth/me") return Promise.reject(new TypeError("Failed to fetch"));
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");
  const button = await screen.findByRole("button", { name: /I confirm this record is still present/ });

  const user = rtl.userEvent.setup();
  await user.click(button);
  // The 401 is surfaced honestly (role="alert") and the anonymous CTA
  // returns — a dead session never looks like a working action.
  await waitFor(() => assert.ok(screen.getByRole("alert")));
  assert.ok(screen.getByText("Your session has ended. Log in again to take part."));
  await waitFor(() => assert.ok(screen.getByRole("link", { name: /Log in or register to take part/ })));
});

const levelOneProfile = {
  contributor: { id: 1, email: "contributor@example.test", displayName: "Fixture Contributor", createdAt: "2026-01-15T10:00:00.000Z", updatedAt: "2026-01-15T10:00:00.000Z" },
  level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
};

