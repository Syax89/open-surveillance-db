/**
 * Map place search — privacy contract (2026-11, replaces the t_b1e192e1 /
 * t_3c4b188e debounce/remount suite: there is no as-you-type traffic left
 * to protect from remounts).
 *
 * The project sends as little as possible to third parties:
 *   1. typing sends NOTHING (no /api/geocode request) and writes no URL;
 *   2. Enter sends exactly ONE /api/geocode request (q, limit=5, lang);
 *   3. pasted coordinates move the map with ZERO requests;
 *   4. "#123" opens the record with ZERO requests;
 *   5. a 429 starts the Retry-After cooldown: a new Enter sends nothing;
 *   6. the visible caption states the promise and is wired to the input.
 * The applyFilters no-op guard (URL churn) is kept: it still protects the
 * filter selects.
 *
 * Fixtures are fictitious (illustrative records, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, fakeCamerasPayload,
  resetLeafletMarkers,
  renderWithLocale, setNavState, getNavState, React, expandMapPoints,
} from "./helpers/dom-harness.mjs";

const POPUP_RECORDS = [
  { id: 1, title: "Illustrative record A", kind: "Fixed dome", status: "demo", latitude: 41.9004, longitude: 12.4936, source: "Development seed", updated: "Demo data", description: "This marker demonstrates how a verified public record will be presented. It is not a claim about a real camera.", address: "Illustrative location, Rome" },
  { id: 2, title: "Illustrative record B", kind: "Traffic monitoring", status: "demo", latitude: 41.9047, longitude: 12.5031, source: "Development seed", updated: "Demo data", description: "The field of view is deliberately approximate and should never be treated as a record of live activity.", address: "Illustrative location, Rome" },
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
let __resetGeocodePending;
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
  const geocodeMod = await loadDomModule("app/components/home/GeocodeSearch.mjs");
  GeocodeSearch = geocodeMod.GeocodeSearch;
  __resetGeocodePending = geocodeMod.__resetGeocodePending;
  useCameraFilters = (await loadDomModule("app/lib/use-camera-filters.mjs")).useCameraFilters;
  const camerasMod = await loadDomModule("app/lib/use-public-cameras.mjs");
  __resetPublicCamerasCache = camerasMod.__resetPublicCamerasCache;
  installGeocodeCountingMock();
});

afterEach(async () => {
  geocodeFetches = 0;
  __resetGeocodePending();
  installGeocodeCountingMock();
  rtl?.cleanup();
  __resetPublicCamerasCache();
  // Reset the navigation stub INCLUDING failReplace (a test that flips it
  // on must not poison the next one) and the URL shell.
  setNavState({ pushed: [], replaced: [], replaceCalls: [], search: "", pathname: "/", failReplace: false });
  await resetLeafletMarkers();
});

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

// ---------------------------------------------------------------------------
// Privacy contract of the map place search
// ---------------------------------------------------------------------------

async function mountMap() {
  setNavState({ pathname: "/mappa" });
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));
  await expandMapPoints();
  const input = rtl.screen.getByRole("combobox", { name: /Find a place/ });
  return { user, input };
}

test("typing sends nothing and writes no URL; Enter sends exactly one /api/geocode request", async () => {
  const historyReplaceCalls = [];
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data, unused, url) => { historyReplaceCalls.push(String(url)); originalReplaceState(data, unused, url); };
  try {
    const { user, input } = await mountMap();
    const requests = [];
    installFetchMock((url) => {
      if (String(url).startsWith("/api/geocode")) { requests.push(String(url)); geocodeFetches += 1; return jsonResponse(FERRARA_SUGGESTIONS); }
      return jsonResponse(fakeCamerasPayload(POPUP_RECORDS));
    });
    await user.type(input, "Ferrara");
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(requests.length, 0, "no geocode request while typing");
    assert.ok(!historyReplaceCalls.some((href) => href.includes("q=")), "typing does not filter the points or touch the URL");

    await user.keyboard("{Enter}");
    const listbox = await rtl.waitFor(() => rtl.screen.getByRole("listbox", { name: "Place suggestions" }), { timeout: 3000 });
    assert.equal(requests.length, 1, "one request per explicit search");
    const sent = new URL(requests[0], "https://osdb.test");
    assert.equal(sent.searchParams.get("q"), "Ferrara");
    assert.equal(sent.searchParams.get("limit"), "5");
    assert.equal(sent.searchParams.get("lang"), "en");
    assert.equal(rtl.within(listbox).getAllByRole("option").length, 2);
  } finally {
    window.history.replaceState = originalReplaceState;
  }
});

test("pasted coordinates move the map without any request", async () => {
  const leaflet = await loadDomModule("node_modules/leaflet/index.mjs");
  const { user, input } = await mountMap();
  await user.type(input, "44.8381, 11.6198{Enter}");
  await rtl.waitFor(() => {
    const map = leaflet.__maps.at(-1);
    assert.ok(map.views.some((view) => Math.abs(view.center[0] - 44.8381) < 1e-6 && Math.abs(view.center[1] - 11.6198) < 1e-6), "the map centres on the typed coordinates");
  }, { timeout: 3000 });
  assert.equal(geocodeFetches, 0, "coordinates never reach the geocoder");
  assert.equal(rtl.screen.queryByRole("listbox"), null);
});

test("\"#123\" opens the record without any request", async () => {
  const opened = [];
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(GeocodeSearch, { onPlaceSelect: () => assert.fail("not a place"), onRecordSelect: (id) => opened.push(id) }));
  await user.type(rtl.screen.getByRole("combobox", { name: /Find a place/ }), "#6302{Enter}");
  assert.deepEqual(opened, [6302]);
  assert.equal(geocodeFetches, 0, "record numbers never reach the geocoder");
});

test("a 429 announces Retry-After and a new Enter during the cooldown sends nothing", async () => {
  const { user, input } = await mountMap();
  let calls = 0;
  installFetchMock((url) => {
    if (String(url).startsWith("/api/geocode")) { calls += 1; return jsonResponse({ error: "rate limited" }, { status: 429, headers: { "retry-after": "30" } }); }
    return jsonResponse(fakeCamerasPayload(POPUP_RECORDS));
  });
  await user.type(input, "Ferrara{Enter}");
  await rtl.waitFor(() => assert.match(document.querySelector(".geocode-status")?.textContent ?? "", /30 seconds/), { timeout: 3000 });
  await user.keyboard("{Enter}");
  assert.equal(calls, 1, "the cooldown suppresses the second request");
});

test("the visible caption states the privacy promise and describes the input", async () => {
  const { input } = await mountMap();
  const caption = document.getElementById("map-list-caption");
  assert.ok(caption, "the caption renders");
  assert.match(caption.textContent, /Nothing is sent while you type/);
  assert.ok((input.getAttribute("aria-describedby") ?? "").split(" ").includes("map-list-caption"), "the caption is announced with the field");
});

