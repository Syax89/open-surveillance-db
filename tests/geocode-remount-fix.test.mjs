/**
 * t_b1e192e1 / t_3c4b188e regression suite: the /api/geocode autocomplete
 * fetch MUST fire when the user types in the /mappa search — and the geocode
 * dropdown must stay VISIBLE and STABLE while the points list re-filters.
 *
 * Deployed diagnosis (CEO, browser live): typing "ferrara" and stopping
 * started the search immediately; the place-suggestion dropdown never had
 * time to appear. 0 requests to /api/geocode in
 * performance.getEntriesByType('resource'), while the console logged the
 * RSC navigation error at every keystroke. Root cause chain:
 *
 *   1. typing commits ?q= via router.replace (applyFilters, ~250ms debounce);
 *   2. the replace THROWS on the deployed environment — ASYNCHRONOUSLY, from
 *      vinext's navigation controller, AFTER router.replace has returned —
 *      so #212's try/catch (which only sees synchronous throws) never caught
 *      it; vinext then forces `window.location.href = currentHref` (a full
 *      reload) which invalidates/remounts the tool tree;
 *   3. the remount closed the geocode dropdown right after it opened, and the
 *      old unmount cleanup cancelled the 300ms debounce timer BEFORE
 *      runGeocode could fetch → 0 network requests, forever.
 *
 * t_3c4b188e fixes the ROOT CAUSE instead of mitigating the symptom: the
 * keyboard ?q= commit in useCameraFilters#applyFilters NEVER calls
 * router.replace — it writes the URL with a PURE window.history.replaceState
 * (no RSC navigation → no digest error → no reload → no remount → the
 * dropdown stays open), and the geocode debounce (250ms) fires BEFORE the
 * ?q= commit debounce (400ms), so the suggestions appear first. The suite
 * keeps two defence layers that remain valuable:
 *
 *   LAYER 1 (use-camera-filters.ts applyFilters): the router path (explicit
 *   selects/reset) is hardened — a no-op guard skips router.replace when the
 *   target URL equals the current one (no churn), and a try/catch falls back
 *   to a SILENT window.history.replaceState when router.replace throws
 *   synchronously, so the tree is never invalidated by a failed navigation.
 *
 *   LAYER 2 (GeocodeSearch.tsx): the debounce timer + AbortController live
 *   at MODULE level (pendingGeocodeByInput), keyed by input id, with NO
 *   unmount cleanup — a remount from ANY other source during the 250ms
 *   window cannot cancel the pending query; the fetch fires regardless of
 *   the component lifecycle.
 *
 * Suite contracts:
 *   1. typing never calls router.replace (pure history.replaceState commit):
 *      the ?q= write cannot trigger the vinext RSC navigation error at all;
 *      the tree survives (same combobox node, draft kept) and the /api/
 *      geocode fetch fires.
 *   2. explicit remount before the 250ms debounce elapses: the fetch still
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
// LAYER 1 + end-to-end: the keyboard ?q= write is a pure history.replaceState
// ---------------------------------------------------------------------------

test("t_3c4b188e: typing never calls router.replace (pure history.replaceState commit) — the vinext RSC error cannot fire and the dropdown stays open", async () => {
  // The deployed failure (CEO, browser live): every keystroke's ?q= commit
  // called router.replace; vinext's navigation controller threw the RSC
  // 'digest' error ASYNCHRONOUSLY (out of reach of #212's try/catch) and
  // forced a full reload, remounting the tool and closing the geocode
  // dropdown right after it opened. t_3c4b188e fixes the root cause: the
  // keyboard ?q= commit NEVER calls router.replace — it writes the URL with
  // a pure history.replaceState. Contract: zero router.replace attempts
  // while typing (even under a hostile router), one history.replaceState
  // commit carrying the typed q, the /api/geocode fetch fires, and the tree
  // is alive (same combobox node, draft kept, dropdown open).
  setNavState({ pathname: "/mappa", failReplace: true });
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  const historyReplaceCalls = [];
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data, unused, url) => {
    historyReplaceCalls.push(String(url));
    originalReplaceState(data, unused, url);
  };
  try {
    const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
    await user.type(input, "Ferrara");

    // The 250ms geocode debounce fires the fetch; the 400ms ?q= debounce
    // then commits the URL through the pure-history path — both well inside
    // the waitFor budget, so waiting for the commit proves the q write ran
    // its course without tearing the tree down.
    await waitFor(() => assert.ok(geocodeFetches >= 1, "the /api/geocode fetch must fire"), { timeout: 5000 });
    await waitFor(() => assert.ok(historyReplaceCalls.length >= 1, "the ?q= commits via history.replaceState"), { timeout: 5000 });

    const nav = await getNavState();
    assert.equal(nav.replaced.length, 0, "router.replace was NEVER attempted for the keyboard ?q= write (failReplace is irrelevant)");
    assert.ok(historyReplaceCalls.some((href) => href.includes("q=Ferrara")), "the committed URL carries the typed q");

    // The tree is alive: the same combobox is still mounted, still holds
    // the typed draft, and the dropdown is open with suggestions.
    const inputAfter = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
    assert.equal(inputAfter, input, "the combobox DOM node is the SAME node — the tree was not invalidated");
    assert.equal(inputAfter.value, "Ferrara", "the typed draft survives");
    assert.equal(inputAfter.getAttribute("aria-expanded"), "true", "the dropdown opened with suggestions");
  } finally {
    window.history.replaceState = originalReplaceState;
  }
});

test("t_3c4b188e: failReplace + clear commits the URL via the pure-history path and fetches nothing for an empty query", async () => {
  // After the ?q= write went through history.replaceState (never touching
  // the router), clearing the search must behave the same: no exception, no
  // remount, no geocode fetch for an empty string (the empty branch aborts
  // instead of fetching).
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

test("t_3c4b188e: the geocode dropdown appears BEFORE the ?q= commit re-filters the list, and stays open after it (debounce ordering)", async () => {
  // CEO's live feedback: "quando inizio a scrivere (es. ferrara) e mi fermo,
  // parte subito la ricerca, non aspetto l'invio; non faccio in tempo a
  // vedere il menu a discesa con gli indirizzi". Contract: the 250ms geocode
  // debounce opens the dropdown with suggestions WHILE the points list is
  // still unfiltered; the 400ms ?q= commit then re-filters the list
  // UNDERNEATH the dropdown — no router.replace, so no remount, so the
  // dropdown stays open and interactive. The records ("Illustrative record
  // A/B") never match "Ferrara", so the ?q= commit empties the list — the
  // strongest version of the reported symptom.
  setNavState({ pathname: "/mappa" });
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
  await user.type(input, "Ferrara");

  // Phase 1: the dropdown opens (250ms) while the list is STILL unfiltered
  // — this compound wait only passes if both hold at the same time, i.e.
  // the suggestions appear before the ?q= commit narrows the list.
  await waitFor(() => {
    assert.ok(screen.getByRole("listbox", { name: "Place suggestions" }), "the suggestion dropdown appears while typing");
    assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }), "the list is still unfiltered when the dropdown opens (no ?q= commit yet)");
  }, { timeout: 5000 });

  // Phase 2: the 400ms ?q= commit re-filters the list underneath — and the
  // dropdown SURVIVES it (same instance, no remount).
  await waitFor(() => assert.ok(screen.queryByRole("button", { name: /Illustrative record A/ }) === null), { timeout: 5000 });
  assert.equal(input.getAttribute("aria-expanded"), "true", "the dropdown stays open after the ?q= commit (no remount)");
  const listbox = screen.getByRole("listbox", { name: "Place suggestions" });
  assert.ok(rtl.within(listbox).getAllByRole("option").length >= 1, "the suggestions remain selectable");
});

test("t_b1e192e1: an unmount before the 250ms debounce elapses does NOT cancel the /api/geocode fetch (module-level timer)", async () => {
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
  // Unmount BEFORE the 250ms debounce fires (user.type finishes in ms).
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
