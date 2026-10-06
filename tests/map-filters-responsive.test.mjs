/**
 * B02 — the shared filter disclosure must survive a responsive round trip and
 * a manual mobile close.
 *
 * The desktop CSS hides `summary` when the group is closed, so a stale
 * `filtersOpen=false` left the controls unreachable (no way to reopen). The
 * native `toggle` event fires for the PROGRAMMATIC media-query sync too; only
 * a real user toggle may persist as a preference, and desktop always opens.
 *
 * jsdom fires `toggle` asynchronously when `open` changes (verified), so the
 * bug is reproducible in the harness.
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

test("B02: 1440 -> 390 -> 1440 keeps the filter group open and the controls reachable", async () => {
  const media = installMedia(false); // desktop
  try {
    const { container } = await renderBar();
    const details = container.querySelector(".filters-disclosure");
    assert.equal(details.open, true, "desktop starts open");

    await media.setMatches(true); // 390px → compact, auto-closed
    await rtl.waitFor(() => assert.equal(details.open, false, "the compact layout auto-closes the group"));

    await media.setMatches(false); // back to 1440 → must be open again
    await rtl.waitFor(() => assert.equal(details.open, true, "the wide layout reopens the group"));
    assert.ok(container.querySelector("#record-kind-filter"), "the kind select stays reachable after the round trip");
  } finally {
    media.restore();
  }
});

test("B02: a manual mobile close does not leave the group stuck closed on desktop", async () => {
  const media = installMedia(true); // mobile
  try {
    const { container } = await renderBar();
    const details = container.querySelector(".filters-disclosure");
    await rtl.waitFor(() => assert.equal(details.open, false, "mobile starts compact"));

    // The user opens then CLOSES the group by hand on mobile.
    await activationClick(details.querySelector("summary"));
    await rtl.waitFor(() => assert.equal(details.open, true, "the user's open toggle is applied"));
    await activationClick(details.querySelector("summary"));
    await rtl.waitFor(() => assert.equal(details.open, false, "the user's close toggle is applied"));

    // Resize to desktop: the summary is display:none there, so the group MUST
    // be open (a manual mobile close can never carry over into an
    // unreopenable desktop state).
    await media.setMatches(false);
    await rtl.waitFor(() => assert.equal(details.open, true, "desktop forces the group open"));
    assert.ok(container.querySelector("#record-freshness-filter"), "the freshness select is reachable on desktop");
  } finally {
    media.restore();
  }
});
