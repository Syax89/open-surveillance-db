/**
 * B02 — the shared filter disclosure must survive a responsive round trip and
 * a manual mobile close.
 *
 * Historically the desktop CSS hid the native `summary`, so a stale
 * `filtersOpen=false` left the controls unreachable (no way to reopen), and
 * the programmatic media-query sync was mistaken for a user toggle. Since
 * the CLS fix (perf 2026-11) the disclosure is a button + CSS-only
 * breakpoint, so these tests pin that state never follows the viewport.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import { setupDom, loadDomModule, renderWithLocale, React } from "./helpers/dom-harness.mjs";

let rtl;
let FiltersBar;

before(async () => {
  rtl = await setupDom();
  FiltersBar = (await loadDomModule("app/components/FiltersBar.mjs")).FiltersBar;
});

afterEach(() => rtl?.cleanup());

/** A controllable matchMedia: setMatches toggles the media query + notifies listeners. */
function installMedia(initialMatches) {
  const state = { matches: initialMatches, listeners: new Set() };
  const original = window.matchMedia;
  window.matchMedia = (query) => ({
    get matches() { return state.matches; },
    media: query,
    onchange: null,
    addEventListener: (type, fn) => { if (type === "change") state.listeners.add(fn); },
    removeEventListener: (type, fn) => { state.listeners.delete(fn); },
    addListener: (fn) => state.listeners.add(fn),
    removeListener: (fn) => state.listeners.delete(fn),
    dispatchEvent: () => false,
  });
  return {
    restore: () => { window.matchMedia = original; },
    async setMatches(next) {
      state.matches = next;
      await rtl.act(async () => {
        for (const fn of state.listeners) fn({ matches: next });
      });
    },
  };
}

function renderBar() {
  return renderWithLocale(React.createElement(FiltersBar, {
    variant: "panel",
    cameraKinds: ["Dome", "Bullet"],
    search: "",
    setSearch: () => {},
    kindFilter: "all",
    setKindFilter: () => {},
    freshnessFilter: "all",
    setFreshnessFilter: () => {},
    sortOrder: "alphabetical",
    setSortOrder: () => {},
    resultCount: 3,
    onReset: () => {},
  }));
}

async function activationClick(element) {
  await rtl.act(async () => {
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// CLS fix (perf 2026-11): the disclosure no longer syncs to matchMedia at
// all — the ≤820px breakpoint is pure CSS and desktop CSS ignores the open
// state (tests/filters-bar-cls.test.mjs pins the CSS). B02 therefore holds by
// construction: a breakpoint change never mutates the state, and a manual
// mobile close can never hide the controls on desktop.

test("B02: 1440 -> 390 -> 1440 never changes the disclosure state and the controls stay reachable", async () => {
  const media = installMedia(false); // desktop
  try {
    const { container } = await renderBar();
    const group = container.querySelector(".filters-disclosure");
    const toggle = group.querySelector(".filters-disclosure-toggle");
    assert.equal(group.dataset.open, "false", "collapsed state (desktop CSS shows the controls regardless)");

    await media.setMatches(true); // 390px
    assert.equal(group.dataset.open, "false", "no JS-driven change at the compact breakpoint (no layout shift)");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");

    await media.setMatches(false); // back to 1440
    assert.equal(group.dataset.open, "false");
    assert.ok(container.querySelector("#record-kind-filter"), "the kind select stays reachable after the round trip");
  } finally {
    media.restore();
  }
});

test("B02: a manual mobile open/close is kept across a desktop round trip", async () => {
  const media = installMedia(true); // mobile
  try {
    const { container } = await renderBar();
    const group = container.querySelector(".filters-disclosure");
    const toggle = group.querySelector(".filters-disclosure-toggle");
    assert.equal(toggle.getAttribute("aria-expanded"), "false", "mobile starts compact");

    await activationClick(toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "true", "the user's open toggle is applied");
    await activationClick(toggle);
    assert.equal(toggle.getAttribute("aria-expanded"), "false", "the user's close toggle is applied");

    // Desktop: the toggle is display:none and the controls are shown by CSS
    // whatever the state, so the closed preference cannot strand them.
    await media.setMatches(false);
    assert.equal(group.dataset.open, "false", "the user's preference is not overridden");
    assert.ok(container.querySelector("#record-freshness-filter"), "the freshness select is reachable on desktop");
  } finally {
    media.restore();
  }
});
