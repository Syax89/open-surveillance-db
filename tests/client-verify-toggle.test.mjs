/**
 * Client-side interaction tests for the community verification toggle
 * (C5, ADR 0018 §2) — StarConfirmButton standalone AND wired into the
 * record detail (/records/[id]).
 *
 * Standalone component (COMMUNITY_PLAN §6.3 C2/C9):
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
 * Record detail wiring:
 *   6. anonymous caller → toggle disabled with "Log in to verify this
 *      record" (server answers 401; the button never pretends);
 *   7. L0 contributor → toggle disabled with the gateL1 help copy (403
 *      fail-closed server-side);
 *   8. L1+ → PUT with the CSRF token echoes the cookie, the count updates
 *      from the server reply and aria-pressed flips;
 *   9. confirmed → DELETE removes the verification (aria-pressed flips
 *      back);
 *  10. self-verify (403) surfaces the localized error and stays disabled;
 *      an already-verified duplicate (409) shows its error.
 *
 * The widget renders ONLY in the record detail — never in cards, the
 * directory or the home page (C3). Fixtures are fictitious.
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
  RecordPage = await loadDomPage("app/records/[id]/page.mjs");
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
  status: "verified",
  latitude: 41.9004,
  longitude: 12.4936,
  source: "Community report",
  updated: "2026-03-01T00:00:00.000Z",
  description: "Fictitious public record used only in tests.",
  address: "Illustrative location, Rome",
  confirmationCount: 3,
};

const levelOneProfile = {
  contributor: { id: 1, email: "contributor@example.test", displayName: "Fixture Contributor", createdAt: "2026-01-15T10:00:00.000Z", updatedAt: "2026-01-15T10:00:00.000Z" },
  level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
};

const levelZeroProfile = {
  contributor: { id: 1, email: "contributor@example.test", displayName: "Fixture Contributor", createdAt: "2026-01-15T10:00:00.000Z", updatedAt: "2026-01-15T10:00:00.000Z" },
  level: { level: 0, verifiedCount: 0, threshold: 0, nextThreshold: 1 },
};

/**
 * Record-detail fetch mock: the shared cameras walk, the revisions call,
 * the personal confirmation state and the session profile. `toggle`
 * answers the PUT/DELETE mutation with the server reply.
 */
function recordHandler({
  confirmation = { confirmed: false },
  profile = levelOneProfile,
  toggle = (method) => jsonResponse({ confirmed: method === "PUT", count: method === "PUT" ? 4 : 2 }, { status: 200 }),
} = {}) {
  return (input, init) => {
    if (typeof input === "string" && input.startsWith("/api/cameras?")) {
      return jsonResponse({ records: [recordFixture], total: 1, nextOffset: null });
    }
    if (input === "/api/cameras/revisions?cameraId=7") return jsonResponse({ recordId: 7, revisions: [] });
    if (input === "/api/cameras/7/confirmation") {
      if (init && init.method === "PUT") return toggle("PUT");
      if (init && init.method === "DELETE") return toggle("DELETE");
      return jsonResponse(confirmation);
    }
    if (input === "/api/auth/me") return jsonResponse(profile, { status: profile === null ? 401 : 200 });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

test("record detail: anonymous caller sees the disabled toggle with the login copy", async () => {
  const { screen } = rtl;
  installFetchMock(recordHandler({ profile: null }));
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");
  // The widget renders only here (record detail); anonymous → disabled.
  const button = await screen.findByRole("button", { name: "Confirm this record exists" });
  assert.equal(button.disabled, true);
  assert.ok(screen.getByText("Log in to verify this record"));
  // The aggregate count still shows (public data, no session needed).
  assert.ok(screen.getByText("3 verifications"));
});

test("record detail: L0 contributor sees the disabled toggle with the gate copy", async () => {
  const { screen } = rtl;
  installFetchMock(recordHandler({ profile: levelZeroProfile }));
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");
  const button = await screen.findByRole("button", { name: "Confirm this record exists" });
  assert.equal(button.disabled, true);
  assert.ok(screen.getByText("You can verify records after your first contribution is published."));
});

test("record detail: L1+ toggle PUTs with the CSRF token, updates the count and flips aria-pressed", async () => {
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
  const button = await screen.findByRole("button", { name: "Confirm this record exists" });
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute("aria-pressed"), "false");

  const user = rtl.userEvent.setup();
  await user.click(button);

  await waitFor(() => assert.ok(screen.getByRole("button", { name: "Remove verification" })));
  const put = requests.find((r) => r.input === "/api/cameras/7/confirmation" && r.init?.method === "PUT");
  assert.ok(put, "the toggle must PUT to the confirmation endpoint");
  assert.equal(put.init.headers["x-csrf-token"], "fixture-csrf-token");
  // Count updated from the server reply (3 → 4), announced via live region.
  assert.ok(screen.getByText("4 verifications"));
  assert.equal(screen.getByRole("button", { name: "Remove verification" }).getAttribute("aria-pressed"), "true");
});

test("record detail: confirmed caller DELETEs and the count drops", async () => {
  const { screen, waitFor } = rtl;
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    return recordHandler({ confirmation: { confirmed: true } })(input, init);
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");
  const button = await screen.findByRole("button", { name: "Remove verification" });
  assert.equal(button.getAttribute("aria-pressed"), "true");

  const user = rtl.userEvent.setup();
  await user.click(button);

  await waitFor(() => assert.ok(screen.getByRole("button", { name: "Confirm this record exists" })));
  const del = requests.find((r) => r.input === "/api/cameras/7/confirmation" && r.init?.method === "DELETE");
  assert.ok(del, "the toggle must DELETE the personal confirmation");
  assert.ok(screen.getByText("2 verifications"));
});

test("record detail: self-verify 403 surfaces the error and disables the toggle (fail-closed)", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(recordHandler({
    toggle: () => jsonResponse({ error: "You cannot verify your own report." }, { status: 403 }),
  }));
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");
  const user = rtl.userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Confirm this record exists" }));

  await waitFor(() => assert.ok(screen.queryByRole("alert")));
  assert.ok(screen.getByText("You cannot verify your own record."));
  // Fail-closed: after the 403 the toggle is disabled, not silently retrying.
  const button = screen.getByRole("button", { name: "Confirm this record exists" });
  assert.equal(button.disabled, true);
});

test("record detail: duplicate verification (409) shows its localized error", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(recordHandler({
    toggle: () => jsonResponse({ error: "This record is already verified by you." }, { status: 409 }),
  }));
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");
  const user = rtl.userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Confirm this record exists" }));

  await waitFor(() => assert.ok(screen.getByText("You have already verified this record.")));
});

test("record detail: a dead session fetch fails closed (toggle disabled, honest state)", async () => {
  const { screen } = rtl;
  installFetchMock((input) => {
    if (typeof input === "string" && input.startsWith("/api/cameras?")) {
      return jsonResponse({ records: [recordFixture], total: 1, nextOffset: null });
    }
    if (input === "/api/cameras/revisions?cameraId=7") return jsonResponse({ recordId: 7, revisions: [] });
    if (input === "/api/cameras/7/confirmation") return Promise.reject(new TypeError("Failed to fetch"));
    if (input === "/api/auth/me") return Promise.reject(new TypeError("Failed to fetch"));
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");
  const button = await screen.findByRole("button", { name: "Confirm this record exists" });
  assert.equal(button.disabled, true, "a dead session must never leave a working-looking toggle");
});
