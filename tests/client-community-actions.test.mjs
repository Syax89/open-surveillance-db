/**
 * Community action widget — ADR 0021 §3, FASE 3 UI (kanban t_b533b254).
 *
 * The five-action surface (like / confirm / gone / problem / privacy) with
 * live aggregate counts, login-aware rendering and full keyboard/a11y
 * contract, exercised with jsdom + @testing-library/react + user-event:
 *
 *   1. anonymous session: counts render (role="status" per count), the
 *      log-in/register CTA shows and every button is disabled;
 *   2. signed-in session: buttons enable; aria-pressed tracks the active
 *      action;
 *   3. toggle on: clicking a button PUTs the action and the live counts
 *      from the response render (aria-live region updates);
 *   4. toggle off: clicking the active action DELETEs it and the visible
 *      count drops by one;
 *   5. switch: from one action to another the server answers with the new
 *      counts and the active action moves;
 *   6. 403 self-action: the honest alert renders, no optimistic state;
 *   7. 409 duplicate: the server state wins and the alert explains;
 *   8. 401 mid-action: the session probe failed → anonymous CTA returns
 *      and the alert names the cause;
 *   9. compact variant (map popup): the same widget with the compact class
 *      and a pre-resolved bundle (standalone root outside the Next tree).
 *
 * Fixtures are fictitious (example.test). The fetch mock speaks the exact
 * contract of GET/PUT/DELETE /api/cameras/[id]/actions and /api/auth/me.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let CommunityActions;

const zeroCounts = { like: 0, confirm: 0, gone: 0, problem: 0, privacy: 0 };
const likeCounts = { like: 12, confirm: 0, gone: 0, problem: 0, privacy: 0 };

/**
 * Default widget mock: the personal-state read answers `{ action: null }`
 * and the session probe answers 200 (signed in), unless overridden.
 */
function widgetMock({ personal = null, me = { id: 7, displayName: "Contributor" } } = {}) {
  return (input, init) => {
    const method = init?.method ?? "GET";
    if (input === "/api/auth/me") {
      return me === null
        ? jsonResponse({ error: "anonymous" }, { status: 401 })
        : jsonResponse(me);
    }
    if (input === "/api/cameras/7/actions") {
      if (method === "GET") return jsonResponse({ action: personal });
      return jsonResponse({ error: "unexpected PUT/DELETE in default mock" }, { status: 500 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

before(async () => {
  rtl = await setupDom();
  const mod = await loadDomModule("app/components/CommunityActions.mjs");
  CommunityActions = mod.CommunityActions;
});

afterEach(() => {
  rtl?.cleanup();
});

test("community actions: anonymous session shows counts + register CTA, buttons disabled", async () => {
  const { screen } = rtl;
  installFetchMock(widgetMock({ me: null }));
  await renderWithLocale(React.createElement(CommunityActions, {
    recordId: 7,
    counts: { like: 3, confirm: 1, gone: 0, problem: 0, privacy: 0 },
  }));

  // The session probe and personal-state read are async: the anonymous
  // surface (CTA) only appears once they settle.
  const cta = await screen.findByRole("link", { name: /Log in or register to take part/ });
  assert.equal(cta.getAttribute("href"), "/login");

  // The five labelled buttons, all disabled for anonymous callers.
  const useful = screen.getByRole("button", { name: /Mark this record as useful/ });
  assert.ok(useful.disabled);
  assert.equal(useful.getAttribute("aria-pressed"), "false");
  assert.ok(screen.getByRole("button", { name: /I confirm this record is still present/ }).disabled);
  assert.ok(screen.getByRole("button", { name: /I believe this camera is no longer there/ }).disabled);
  assert.ok(screen.getByRole("button", { name: /Something is wrong with this record/ }).disabled);
  assert.ok(screen.getByRole("button", { name: /privacy or legal concern/ }).disabled);

  // Counts as live regions: the sr-only text carries the label, the visible
  // number is aria-hidden (one announcement per change, no five-region spam).
  assert.ok(screen.getByText("Useful: 3"));
  assert.ok(screen.getByText("Confirm: 1"));
  assert.ok(screen.getByText("No longer there: 0"));
});

test("community actions: signed-in session enables buttons and exposes the active action", async () => {
  const { screen } = rtl;
  installFetchMock(widgetMock({ personal: "like" }));
  await renderWithLocale(React.createElement(CommunityActions, {
    recordId: 7,
    counts: likeCounts,
  }));

  // Wait for the session probe: buttons start disabled while it is in
  // flight ("checking" state) and enable once it settles.
  const useful = await screen.findByRole("button", { name: /Mark this record as useful/ });
  await rtl.waitFor(() => assert.equal(useful.disabled, false));
  assert.equal(useful.disabled, false);
  assert.equal(useful.getAttribute("aria-pressed"), "true");
  assert.equal(screen.getByRole("button", { name: /I confirm this record is still present/ }).disabled, false);
  // Anonymous CTA disappears once signed in.
  assert.equal(screen.queryByRole("link", { name: /Log in or register to take part/ }), null);
});

test("community actions: toggle on PUTs the action and renders the live counts", async () => {
  const { screen } = rtl;
  const calls = [];
  installFetchMock((input, init) => {
    const method = init?.method ?? "GET";
    calls.push({ input, method, body: init?.body });
    if (input === "/api/auth/me") return jsonResponse({ id: 7, displayName: "Contributor" });
    if (input === "/api/cameras/7/actions" && method === "GET") return jsonResponse({ action: null });
    if (input === "/api/cameras/7/actions" && method === "PUT") {
      assert.equal(init.headers["x-csrf-token"], undefined); // no cookie in jsdom
      return jsonResponse({ action: "like", counts: likeCounts });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await renderWithLocale(React.createElement(CommunityActions, {
    recordId: 7,
    counts: zeroCounts,
  }));

  const useful = screen.getByRole("button", { name: /Mark this record as useful/ });
  const user = rtl.userEvent.setup();
  await user.click(useful);

  // PUT with the action payload.
  const put = calls.find((call) => call.method === "PUT");
  assert.ok(put, "PUT expected");
  assert.equal(put.body, JSON.stringify({ action: "like" }));
  // Server counts are authoritative: 12 render in the live region.
  assert.ok(screen.getByText("Useful: 12"));
  // The button flips to active (aria-pressed) once the server confirms.
  await rtl.waitFor(() => assert.equal(
    screen.getByRole("button", { name: /Mark this record as useful/ }).getAttribute("aria-pressed"),
    "true",
  ));
});

test("community actions: toggle off DELETEs the action and the visible count drops by one", async () => {
  const { screen } = rtl;
  const calls = [];
  installFetchMock((input, init) => {
    const method = init?.method ?? "GET";
    calls.push({ input, method });
    if (input === "/api/auth/me") return jsonResponse({ id: 7, displayName: "Contributor" });
    if (input === "/api/cameras/7/actions" && method === "GET") return jsonResponse({ action: "like" });
    if (input === "/api/cameras/7/actions" && method === "DELETE") {
      return jsonResponse({ action: null });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await renderWithLocale(React.createElement(CommunityActions, {
    recordId: 7,
    counts: likeCounts,
  }));

  const useful = screen.getByRole("button", { name: /Mark this record as useful/ });
  const user = rtl.userEvent.setup();
  await user.click(useful);

  assert.ok(calls.some((call) => call.method === "DELETE"), "DELETE expected");
  // DELETE answers { action: null } without counts → the client decrements
  // its own visible count by exactly one (12 → 11).
  assert.ok(screen.getByText("Useful: 11"));
  await rtl.waitFor(() => assert.equal(
    screen.getByRole("button", { name: /Mark this record as useful/ }).getAttribute("aria-pressed"),
    "false",
  ));
});

test("community actions: switching action PUTs the new one and moves aria-pressed", async () => {
  const { screen } = rtl;
  const switchCounts = { like: 0, confirm: 2, gone: 0, problem: 0, privacy: 0 };
  installFetchMock((input, init) => {
    const method = init?.method ?? "GET";
    if (input === "/api/auth/me") return jsonResponse({ id: 7, displayName: "Contributor" });
    if (input === "/api/cameras/7/actions" && method === "GET") return jsonResponse({ action: "like" });
    if (input === "/api/cameras/7/actions" && method === "PUT") {
      return jsonResponse({ action: "confirm", switchedFrom: "like", counts: switchCounts });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await renderWithLocale(React.createElement(CommunityActions, {
    recordId: 7,
    counts: likeCounts,
  }));

  const confirm = screen.getByRole("button", { name: /I confirm this record is still present/ });
  const user = rtl.userEvent.setup();
  await user.click(confirm);

  await rtl.waitFor(() => assert.equal(
    screen.getByRole("button", { name: /I confirm this record is still present/ }).getAttribute("aria-pressed"),
    "true",
  ));
  assert.equal(
    screen.getByRole("button", { name: /Mark this record as useful/ }).getAttribute("aria-pressed"),
    "false",
  );
  assert.ok(screen.getByText("Confirm: 2"));
});

test("community actions: 403 self-action renders the alert, no optimistic state", async () => {
  const { screen } = rtl;
  installFetchMock((input, init) => {
    const method = init?.method ?? "GET";
    if (input === "/api/auth/me") return jsonResponse({ id: 7, displayName: "Contributor" });
    if (input === "/api/cameras/7/actions" && method === "GET") return jsonResponse({ action: null });
    if (input === "/api/cameras/7/actions" && method === "PUT") {
      return jsonResponse({ error: "self" }, { status: 403 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await renderWithLocale(React.createElement(CommunityActions, {
    recordId: 7,
    counts: zeroCounts,
  }));

  const useful = screen.getByRole("button", { name: /Mark this record as useful/ });
  const user = rtl.userEvent.setup();
  await user.click(useful);

  // role="alert" with the self-action copy; aria-pressed stays false.
  assert.ok(screen.getByRole("alert"));
  assert.ok(screen.getByText("You cannot mark your own report as useful or confirm it."));
  assert.equal(useful.getAttribute("aria-pressed"), "false");
  assert.ok(screen.getByText("Useful: 0"));
});

test("community actions: 409 duplicate — server state wins and the alert explains", async () => {
  const { screen } = rtl;
  installFetchMock((input, init) => {
    const method = init?.method ?? "GET";
    if (input === "/api/auth/me") return jsonResponse({ id: 7, displayName: "Contributor" });
    if (input === "/api/cameras/7/actions" && method === "GET") return jsonResponse({ action: null });
    if (input === "/api/cameras/7/actions" && method === "PUT") {
      return jsonResponse({ error: "duplicate" }, { status: 409 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await renderWithLocale(React.createElement(CommunityActions, {
    recordId: 7,
    counts: zeroCounts,
  }));

  const useful = screen.getByRole("button", { name: /Mark this record as useful/ });
  const user = rtl.userEvent.setup();
  await user.click(useful);

  assert.ok(screen.getByText("You already set this action."));
  // 409 means the server DOES see the action: the widget mirrors it.
  assert.equal(useful.getAttribute("aria-pressed"), "true");
});

test("community actions: 401 mid-action returns the anonymous CTA and names the cause", async () => {
  const { screen } = rtl;
  installFetchMock((input, init) => {
    const method = init?.method ?? "GET";
    if (input === "/api/auth/me") return jsonResponse({ id: 7, displayName: "Contributor" });
    if (input === "/api/cameras/7/actions" && method === "GET") return jsonResponse({ action: null });
    if (input === "/api/cameras/7/actions" && method === "PUT") {
      return jsonResponse({ error: "session" }, { status: 401 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await renderWithLocale(React.createElement(CommunityActions, {
    recordId: 7,
    counts: zeroCounts,
  }));

  const useful = screen.getByRole("button", { name: /Mark this record as useful/ });
  const user = rtl.userEvent.setup();
  await user.click(useful);

  // The session died mid-action: the widget flips back to the anonymous
  // surface (CTA + disabled buttons) and the alert names the cause.
  assert.ok(screen.getByRole("alert"));
  assert.ok(screen.getByText("Your session has ended. Log in again to take part."));
  assert.ok(screen.getByRole("link", { name: /Log in or register to take part/ }));
});

test("community actions: compact variant (map popup) renders the toolbar and disclosure (t_b7728ad0)", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(widgetMock({ me: null }));
  // The popup root lives OUTSIDE the Next tree: the bundle prop is the
  // contract (LocaleProvider context is unavailable there).
  const mod = await loadDomModule("app/lib/i18n/index.mjs");
  const bundle = mod.messages.en;
  await renderWithLocale(React.createElement(CommunityActions, {
    recordId: 7,
    counts: likeCounts,
    compact: true,
    bundle,
  }));

  const section = screen.getByRole("region", { name: "Community actions" });
  assert.match(section.className, /community-actions-compact/);
  // The two primary actions are visible with count + icon; the disclosure
  // trigger is present and the remaining actions are behind it.
  assert.ok(screen.getByText("Useful: 12"));
  assert.ok(await screen.findByRole("link", { name: /Log in or register to take part/ }));
  const useful = screen.getByRole("button", { name: /Mark this record as useful/ });
  assert.ok(useful.querySelector("svg"), "the visible action carries an icon (t_b7728ad0)");
  assert.ok(screen.getByRole("button", { name: /I confirm this record is still present/ }));
  const trigger = screen.getByRole("button", { name: /More actions for this record/ });
  assert.equal(trigger.getAttribute("aria-expanded"), "false", "disclosure starts closed");
  assert.ok(trigger.getAttribute("aria-controls"), "disclosure names its panel");

  // The three remaining actions live behind the disclosure, not as cards.
  assert.ok(!screen.queryByRole("button", { name: /I believe this camera is no longer there/ }), "gone is hidden until opened");
  assert.ok(!screen.queryByRole("button", { name: /This record raises a privacy or legal concern/ }), "privacy is hidden until opened");

  // Opening the disclosure exposes them; Escape closes it.
  await rtl.userEvent.click(trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.ok(await screen.findByRole("button", { name: /I believe this camera is no longer there/ }));
  assert.ok(screen.getByRole("button", { name: /Something is wrong with this record/ }));
  await rtl.userEvent.keyboard("{Escape}");
  assert.equal(trigger.getAttribute("aria-expanded"), "false", "Escape closes the disclosure");
  await waitFor(() => {});
});

test("community actions: compact privacy action asks explicit confirmation before sending (t_b7728ad0)", async () => {
  const { screen, waitFor } = rtl;
  // Signed-in session: the write gate is open, so clicking Privacy must
  // show the confirm step instead of sending immediately.
  let putCount = 0;
  const countingMock = (input, init) => {
    const method = init?.method ?? "GET";
    if (input === "/api/auth/me") return jsonResponse({ id: 7, displayName: "Contributor" });
    if (input === "/api/cameras/7/actions") {
      if (method === "GET") return jsonResponse({ action: null });
      putCount += 1;
      return jsonResponse({ error: "unexpected PUT in counting mock" }, { status: 500 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
  installFetchMock(countingMock);
  const mod = await loadDomModule("app/lib/i18n/index.mjs");
  const bundle = mod.messages.en;
  await renderWithLocale(React.createElement(CommunityActions, {
    recordId: 7,
    counts: likeCounts,
    compact: true,
    bundle,
  }));

  const trigger = await screen.findByRole("button", { name: /More actions for this record/ });
  await rtl.userEvent.click(trigger);
  await rtl.userEvent.click(await screen.findByRole("button", { name: /This record raises a privacy or legal concern/ }));

  // The panel swaps to the explicit confirm step.
  assert.ok(await screen.findByText("Confirm the privacy report?"), "the privacy confirm step shows explicit copy");
  assert.ok(screen.getByRole("button", { name: /Report privacy concern/ }), "the confirm action is explicit");
  assert.ok(screen.getByRole("button", { name: /Cancel/ }), "cancel returns to the menu");
  // No PUT has been sent yet — the widget only mirrors the server.
  assert.equal(putCount, 0, "no action sent before confirmation");

  // Cancelling returns to the three-action menu without sending.
  await rtl.userEvent.click(screen.getByRole("button", { name: /Cancel/ }));
  assert.ok(await screen.findByRole("button", { name: /I believe this camera is no longer there/ }), "cancel goes back to the menu");
  assert.equal(putCount, 0, "cancel sends nothing");
  await waitFor(() => {});
});
