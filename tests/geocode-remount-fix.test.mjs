/**
 * t_b1e192e1 regression suite: the /api/geocode autocomplete fetch MUST
 * fire when the user types in the /mappa search — even when the vinext RSC
 * navigation error ("Cannot read properties of undefined (reading
 * 'digest')") makes router.replace throw in useCameraFilters#applyFilters
 * (app/lib/use-camera-filters.ts).
 *
 * Deployed diagnosis (CEO, browser live): 0 requests to /api/geocode in
 * performance.getEntriesByType('resource'), while the console logged the
 * RSC navigation error at every keystroke. Root cause chain:
 *
 *   1. typing commits ?q= via router.replace (applyFilters, ~250ms debounce);
 *   2. the replace THROWS on the deployed environment (unserializable
 *      redirect error) → vinext invalidates/remounts the tool tree;
 *   3. the remount runs GeocodeSearch's unmount cleanup, which cancelled the
 *      300ms debounce timer + AbortController BEFORE runGeocode could fetch
 *      → 0 network requests, forever.
 *
 * The fix has two independent layers (either alone solves the symptom):
 *
 *   LAYER 1 (use-camera-filters.ts applyFilters): the write is hardened —
 *   a no-op guard skips router.replace when the target URL equals the
 *   current one (no churn), and a try/catch falls back to a SILENT
 *   window.history.replaceState when router.replace throws, so the tree is
 *   never invalidated by a failed navigation.
 *
 *   LAYER 2 (GeocodeSearch.tsx): the debounce timer + AbortController live
 *   at MODULE level (pendingGeocodeByInput), keyed by input id, with NO
 *   unmount cleanup — a remount during the 300ms window cannot cancel the
 *   pending query; the fetch fires regardless of the component lifecycle.
 *
 * Suite contracts:
 *   1. failReplace=true (router.replace throws): typing still produces a
 *      /api/geocode fetch; the combobox survives (tree alive, draft kept).
 *   2. explicit remount before the 300ms debounce elapses: the fetch still
 *      fires (module-level timer survives unmount).
 *   3. applyFilters no-op guard: a filter write that would produce the
 *      CURRENT URL performs NO router.replace (zero churn); a genuinely
 *      different write still replaces once.
 *
 * Fixtures are fictitious (illustrative records, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, fakeCamerasPayload,
  resetLeafletMarkers,
  renderWithLocale, setNavState, getNavState, React,
} from "./helpers/dom-harness.mjs";

const POPUP_RECORDS = [
  { id: 1, title: "Illustrative record A", kind: "Fixed dome", status: "demo", latitude: 41.9004, longitude: 12.4936, source: "Prototype seed", updated: "Demo data", description: "This marker demonstrates how a verified public record will be presented. It is not a claim about a real camera.", address: "Illustrative location, Rome" },
  { id: 2, title: "Illustrative record B", kind: "Traffic monitoring", status: "demo", latitude: 41.9047, longitude: 12.5031, source: "Prototype seed", updated: "Demo data", description: "The field of view is deliberately approximate and should never be treated as a record of live activity.", address: "Illustrative location, Rome" },
];

const FERRARA_SUGGESTIONS = {
  results: [
    { display_name: "Ferrara, Emilia-Romagna, Italia", lat: 44.838124, lng: 11.619791, type: "administrative", boundingbox: ["44.7198493", "44.9637886", "11.5109915", "11.8870544"] },
    { display_name: "Via del Duomo, Ferrara, Italia", lat: 44.8355, lng: 11.619, type: "road", boundingbox: ["44.83", "44.84", "11.61", "11.63"] },
  ],
};

let rtl;
let MappaTool;
let GeocodeSearch;
let useCameraFilters;
let __resetPublicCamerasCache;

// Fetch counter: every /api/geocode request is recorded. The cameras API
// answers with the seed so the map/list render (the geocode fetch is the
// contract under test, the cameras fetch is just background).
let geocodeFetches = 0;
const installGeocodeCountingMock = () => installFetchMock((input) => {
  if (String(input).startsWith("/api/geocode")) {
    geocodeFetches += 1;
    return jsonResponse(FERRARA_SUGGESTIONS);
  }
  return jsonResponse(fakeCamerasPayload(POPUP_RECORDS));
});

before(async () => {
  rtl = await setupDom();
  MappaTool = (await loadDomModule("app/components/tools/MappaTool.mjs")).MappaTool;
  GeocodeSearch = (await loadDomModule("app/components/home/GeocodeSearch.mjs")).GeocodeSearch;
  useCameraFilters = (await loadDomModule("app/lib/use-camera-filters.mjs")).useCameraFilters;
  const camerasMod = await loadDomModule("app/lib/use-public-cameras.mjs");
  __resetPublicCamerasCache = camerasMod.__resetPublicCamerasCache;
  installGeocodeCountingMock();
});

afterEach(async () => {
  geocodeFetches = 0;
  rtl?.cleanup();
  __resetPublicCamerasCache();
  // Reset the navigation stub INCLUDING failReplace (a test that flips it
  // on must not poison the next one) and the URL shell.
  setNavState({ pushed: [], replaced: [], replaceCalls: [], search: "", pathname: "/", failReplace: false });
  await resetLeafletMarkers();
});

// ---------------------------------------------------------------------------
// LAYER 1 + end-to-end: router.replace throws → the fetch still fires
// ---------------------------------------------------------------------------

test("t_b1e192e1: typing under failReplace (router.replace throws) still fires /api/geocode and keeps the tree alive", async () => {
  // Reproduce the deployed failure: every applyFilters ?q= write throws the
  // vinext RSC navigation error. Before the fix this killed the tree → the
  // geocode debounce was cancelled on unmount → 0 fetches.
  setNavState({ pathname: "/mappa", failReplace: true });
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
  await user.type(input, "Ferrara");

  // LAYER 1 contract: the hardened applyFilters must swallow the throwing
  // router.replace (try/catch → history.replaceState fallback) and the
  // ~250ms ?q= write must NOT invalidate the tree. The 300ms geocode
  // debounce then survives and fires the fetch.
  await waitFor(() => assert.ok(geocodeFetches >= 1, "the /api/geocode fetch must fire despite router.replace throwing"), { timeout: 5000 });

  // The tree is alive: the same combobox is still mounted and still holds
  // the typed draft (a remount would reset it via the external search prop).
  const inputAfter = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
  assert.equal(inputAfter.value, "Ferrara", "the typed draft survives — no remount happened");
  assert.equal(inputAfter, input, "the combobox DOM node is the SAME node — the tree was not invalidated");
  assert.equal(inputAfter.getAttribute("aria-expanded"), "true", "the dropdown opened with suggestions");
});

test("t_b1e192e1: failReplace + clear commits the URL silently (history.replaceState fallback) and fetches nothing for an empty query", async () => {
  // After the ?q= write survived a throwing replace, clearing the search
  // must behave the same: no exception, no remount, no geocode fetch for an
  // empty string (the empty branch aborts instead of fetching).
  setNavState({ pathname: "/mappa", failReplace: true });
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
  await user.type(input, "Ferrara");
  await waitFor(() => assert.ok(geocodeFetches >= 1), { timeout: 5000 });

  await user.clear(input);
  // Give any stray timer a chance to misbehave (a buggy empty branch would
  // fetch with q= or crash the tree).
  await new Promise((resolve) => setTimeout(resolve, 400));
  const nav = await getNavState();
  assert.equal(geocodeFetches, 1, "clearing the search must NOT fire another geocode fetch (empty branch aborts)");
  assert.ok(screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ }), "the tree is still alive after clearing");
  assert.equal(nav.replaced.length, 0, "router.replace never succeeded (failReplace) — the fallback path wrote the URL");
});

// ---------------------------------------------------------------------------
// LAYER 2: the debounce is immune to an explicit remount
// ---------------------------------------------------------------------------

test("t_b1e192e1: an unmount before the 300ms debounce elapses does NOT cancel the /api/geocode fetch (module-level timer)", async () => {
  // Direct component-level proof of LAYER 2: mount GeocodeSearch, type,
  // unmount the WHOLE tree BEFORE the debounce window, remount. The pending
  // query lives at module level (pendingGeocodeByInput) with no unmount
  // cleanup, so the timer still fires and the fetch still goes out.
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();

  const first = await renderWithLocale(React.createElement(GeocodeSearch, {
    search: "", onSearchChange: () => {}, onPlaceSelect: () => {},
  }));
  const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
  await user.type(input, "Ferrara");
  // Unmount BEFORE the 300ms debounce fires (user.type finishes in ms).
  first.unmount();

  // Remount a fresh instance: it shares the module-level pending entry.
  await renderWithLocale(React.createElement(GeocodeSearch, {
    search: "", onSearchChange: () => {}, onPlaceSelect: () => {},
  }));

  await waitFor(() => assert.ok(geocodeFetches >= 1, "the pending geocode fetch must fire even though the scheduling instance unmounted"), { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// LAYER 1: applyFilters no-op guard (URL churn)
// ---------------------------------------------------------------------------

test("t_b1e192e1: applyFilters no-op guard — a write producing the CURRENT URL performs ZERO router.replace", async () => {
  // R2 URL churn check (CEO): committing ?q= (or any filter) that is
  // already the current URL must not re-replace. A tiny harness exposes the
  // hook's setType; "all" is the default, so with a bare /mappa URL the
  // write would produce the identical href → the guard must skip the
  // replace entirely.
  const FilterHarness = () => {
    const { setType, setFreshness } = useCameraFilters();
    return React.createElement("div", null,
      React.createElement("button", { onClick: () => setType("all"), id: "set-all" }, "all"),
      React.createElement("button", { onClick: () => setFreshness("7d"), id: "set-7d" }, "7d"),
    );
  };
  setNavState({ pathname: "/mappa" });
  await renderWithLocale(React.createElement(FilterHarness));

  const { screen, waitFor } = rtl;
  // Same-value write: href === currentHref → guarded, zero replace.
  rtl.fireEvent.click(screen.getByRole("button", { name: "all" }));
  let nav = await getNavState();
  assert.equal(nav.replaced.length, 0, "a no-op filter write must not call router.replace");

  // Genuinely different write: exactly ONE replace, with scroll:false.
  rtl.fireEvent.click(screen.getByRole("button", { name: "7d" }));
  await waitFor(async () => {
    const n = await getNavState();
    assert.equal(n.replaced.length, 1, "a real filter write replaces exactly once");
    assert.equal(n.replaced[0], "/mappa?freshness=7d", "the committed URL carries the new filter");
  }, { timeout: 3000 });

  // Writing the same freshness again is a no-op → still one replace total.
  rtl.fireEvent.click(screen.getByRole("button", { name: "7d" }));
  nav = await getNavState();
  assert.equal(nav.replaced.length, 1, "re-writing the committed filter must not churn the URL");
});
