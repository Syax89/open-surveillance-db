/**
 * Client-side interaction tests for the F1 tool routes (route group (tools),
 * kanban t_03c0fa15): /mappa, /directory, /segnala, /correggi.
 *
 * Per-route contract (docs/FRONTEND_PLAN.md §5.3, criterio di approve Grace):
 * SSR smoke (pages-render.test.mjs) + i18n parity (i18n-pages.test.mjs) +
 * a11y contract (publication-boundaries.test.mjs) live in their own suites.
 * THIS suite is the jsdom interaction layer for the four tool bodies:
 *
 *   ToolLayout  — the shared route-group chrome links the per-page nav sets
 *                 (F3 t_2ca69725, FRONTEND_DESIGN §2.5): every tool page
 *                 links the other tools + contextual pages + home, with a
 *                 full cross-tool fallback on unknown paths;
 *   MappaTool   — FiltersBar (panel variant) renders, the URL filters
 *                 (F4 useCameraFilters) narrow the records, the empty state
 *                 is truthful with a clear action, deep links apply the
 *                 seeded filters fully, and the card actions point at the
 *                 tool routes (/correggi, /directory);
 *   DirectoryTool — shared FiltersBar (inline variant), search/kind filters,
 *                 reset, truthful empty state, "Show on map" pushes
 *                 /mappa?focus=ID through the navigation stub;
 *   SegnalaTool — the report form renders with the report bundle; submit
 *                 without a position is refused with a guidance notice;
 *                 manual coordinates + nearby check + full submit reach the
 *                 moderation API (fetch mock);
 *   CorreggiTool — ?record=ID pre-selects the related record and announces
 *                 it (aria-live); invalid or unknown ids are ignored.
 *
 * The data layer (use-public-cameras.ts) is NOT touched (F2/F4 gate): the
 * tests exercise the prototype seed, which renders synchronously and is the
 * same demo set the tools show while the API is unreachable.
 *
 * Fixtures are fictitious (illustrative records, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, fakeCamerasPayload,
  leafletMarkers, resetLeafletMarkers,
  renderWithLocale, setNavState, getNavState, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let ToolLayout;
let MappaTool;
let SurveillanceMap;
let DirectoryTool;
let SegnalaTool;
let CorreggiTool;
let __resetPublicCamerasCache;

before(async () => {
  rtl = await setupDom();
  ToolLayout = (await loadDomModule("app/components/ToolLayout.mjs")).ToolLayout;
  MappaTool = (await loadDomModule("app/components/tools/MappaTool.mjs")).MappaTool;
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
  SegnalaTool = (await loadDomModule("app/components/tools/SegnalaTool.mjs")).SegnalaTool;
  CorreggiTool = (await loadDomModule("app/components/tools/CorreggiTool.mjs")).CorreggiTool;
  const camerasMod = await loadDomModule("app/lib/use-public-cameras.mjs");
  __resetPublicCamerasCache = camerasMod.__resetPublicCamerasCache;
  // Default fetch mock: the API answers with an empty public list, so the
  // tools keep their prototype seed (same as a healthy-but-empty DB) and no
  // test ever trips an unhandled ReferenceError on a missing fetch.
  installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));
});

afterEach(async () => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
  // Reset the navigation stub: URL shell empty, pathname back to the
  // fallback, router.push/replace logs cleared.
  setNavState({ pushed: [], replaced: [], replaceCalls: [], search: "", pathname: "/" });
  // Reset the leaflet recording stub (markers, maps AND the viewport
  // bounds — t_b9666d09): the geocode tests shrink the viewport to assert
  // the pan landing; a stale narrow viewport leaking into the next test
  // would silently filter its list (records outside the leftover bounds
  // disappear). Every test must start whole-world. AWAITED: the helper is
  // async (module load), and skipping the await lets the next test race
  // the bounds restore under a slow/instrumented runner (coverage).
  await resetLeafletMarkers();
});

// ---------------------------------------------------------------------------
// ToolLayout — shared public nav (t_a72a3106)
// ---------------------------------------------------------------------------

test("ToolLayout renders the shared public nav (six home links) with the current page marked aria-current", async () => {
  // The nav shell links the SAME six links of the home hub on every tool
  // page (PublicNavLinks, t_a72a3106): Explore map /mappa, Browse records
  // /directory, How it works /guide, Rules /regole, Manifesto /manifesto,
  // Add a camera /segnala — with aria-current="page" on the current route.
  // This replaced the previous per-page compact sets (4 links,
  // FRONTEND_DESIGN §2.5 hand-off pattern, CEO check 2026-08-02).
  const cases = {
    "/mappa": "/mappa",
    "/directory": "/directory",
    "/segnala": "/segnala",
    "/correggi": null, // /correggi is not in the public nav (home has no
                       // correction link either) — no link is current.
  };
  for (const [pathname, currentHref] of Object.entries(cases)) {
    setNavState({ pathname });
    const { screen } = rtl;
    await renderWithLocale(
      React.createElement(ToolLayout, null, React.createElement("p", null, "tool body")),
    );

    const main = screen.getByRole("main");
    assert.equal(main.id, "main-content", "the tool layout must keep the main-content landmark");

    const links = Array.from(main.querySelectorAll(".nav-links a"));
    const hrefs = links.map((a) => a.getAttribute("href"));
    assert.deepEqual(
      hrefs,
      ["/mappa", "/directory", "/guide", "/regole", "/manifesto", "/segnala"],
      `nav on ${pathname} must be the shared six-link public set`,
    );
    const current = links.filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.getAttribute("href"));
    assert.deepEqual(
      current,
      currentHref ? [currentHref] : [],
      `aria-current must mark exactly ${currentHref ?? "no link"} on ${pathname}`,
    );
    // The children (the tool body) must render inside the layout.
    assert.ok(main.textContent.includes("tool body"));

    rtl.cleanup();
  }
});

test("ToolLayout renders the shared public nav on unknown paths too (no per-page fallback needed)", async () => {
  // With the shared set there is no per-page fallback: every route renders
  // the same six links (previously an unknown path fell back to the full
  // cross-tool set — now that set IS the nav).
  setNavState({ pathname: "/some-future-route" });
  const { screen } = rtl;
  await renderWithLocale(
    React.createElement(ToolLayout, null, React.createElement("p", null, "tool body")),
  );

  const main = screen.getByRole("main");
  const links = Array.from(main.querySelectorAll(".nav-links a")).map((a) => a.getAttribute("href"));
  assert.deepEqual(
    links,
    ["/mappa", "/directory", "/guide", "/regole", "/manifesto", "/segnala"],
    "the shared public nav must render on unknown paths (no dead ends between tools)",
  );
});

// ---------------------------------------------------------------------------
// /mappa — MappaTool
// ---------------------------------------------------------------------------

test("MappaTool renders the map tool shell with the shared FiltersBar and the viewport-synced record list", async () => {
  const { screen } = rtl;
  await renderWithLocale(React.createElement(MappaTool));

  assert.ok(screen.getByRole("heading", { name: "Interactive map" }), "map pageTitle heading (sr-only h1 kept for a11y)");
  // Integrated layout (t_966254a1) + heading cleanup (t_11e38eab): no
  // visible tool header — the page starts directly with the map. The h1 is
  // sr-only (still the accessible page heading), the duplicated section
  // heading ("Explore documented cameras") is gone (the prototype banner
  // above the map card was removed too — CEO feedback 2026-08-02) and the
  // FiltersBar is attached to the card top edge. The visible eyebrow
  // ("Live prototype") is also gone.
  assert.ok(screen.queryByRole("heading", { name: "Explore documented cameras" }) === null, "no duplicated section heading on /mappa");
  // CEO feedback 2026-08-02: the prototype banner was REMOVED from /mappa —
  // the page starts directly with the map card, the map is no longer framed
  // as a prototype (truthfulness stays in pageIntro and the in-list notes).
  assert.ok(screen.queryByText("Prototype mode.") === null, "no prototype banner on /mappa (CEO feedback)");
  assert.ok(screen.getByLabelText("Camera type").closest(".map-card"), "the FiltersBar row is attached to the map card");
  // The search moved into the sidebar column (t_702c10af); it is now
  // DUAL-FUNCTION (t_b9666d09): it filters the viewport points AND suggests
  // places through the geocoder (combobox). The FiltersBar row keeps
  // kind/freshness/sort/reset — exactly ONE search control on the page.
  assert.ok(screen.getByLabelText("Filter the points in the current view or search a place"), "sidebar search at the top of the left column");
  assert.ok(screen.queryByLabelText("Search the public directory") === null, "no duplicated FiltersBar search on /mappa");
  assert.ok(screen.getByLabelText("Camera type"), "shared FiltersBar kind filter");

  // The sidebar lists the points inside the current viewport (prototype
  // seed: both records are in the initial view) as buttons, with the
  // aria-live count announcing the visible points.
  assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }), "list row for record A");
  assert.ok(screen.getByRole("button", { name: /Illustrative record B/ }), "list row for record B");
  assert.ok(screen.getByText("Showing all 2 points in the current view"), "aria-live count announces the visible points");

  // Map-task alternative links point at the tool routes, not the home anchors.
  const directoryLink = screen.getByRole("link", { name: "Go to the accessible directory" });
  assert.equal(directoryLink.getAttribute("href"), "/directory");

  // CEO feedback 2026-08-02: the download GeoJSON/CSV row moved to
  // /directory — /mappa must NOT carry the data export footer anymore.
  assert.ok(screen.queryByRole("link", { name: /Download/ }) === null, "no data export row on /mappa (moved to /directory)");
});

test("MappaTool kind filter narrows the sidebar list and the markers", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");

  assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }));
  assert.ok(screen.queryByRole("button", { name: /Illustrative record B/ }) === null);
  assert.match(screen.getByText(/1 public record found/).textContent, /1 public record found/);
});

test("MappaTool freshness filter on the demo seed keeps the map rendered and shows the truthful in-list empty note with a clear action", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  // The prototype seed has no finite freshness date ("Demo data"), so any
  // freshness window filters everything out. Map-always-visible contract
  // (t_b9666d09): the map and the sidebar STAY rendered — the truthful
  // empty state moves INSIDE the list as a note with a clear action, it
  // never replaces the map.
  await user.selectOptions(screen.getByLabelText("Record freshness"), "7d");

  // The map region is still on the page (never replaced by an empty state).
  assert.ok(screen.getByRole("region", { name: "Interactive OpenStreetMap map" }), "the map stays rendered with zero matching records");
  // The sidebar keeps the search + the list header, and the in-list note
  // carries the truthful wording and the clear action.
  assert.ok(screen.getByLabelText("Filter the points in the current view or search a place"), "the sidebar search stays rendered");
  assert.ok(screen.getByText("No published record matches those filters."), "truthful in-list empty note");
  assert.ok(screen.getByText(/This does not mean that there are no cameras/), "the note never implies an area has no surveillance");
  assert.ok(screen.getByRole("button", { name: /Clear filters/ }), "the in-list note offers a clear action");
  // The prototype banner was removed entirely (CEO feedback 2026-08-02):
  // never rendered, with or without matching records.
  assert.ok(screen.queryByText("Prototype mode.") === null, "no prototype banner on /mappa (removed — CEO feedback)");

  await user.click(screen.getByRole("button", { name: /Clear filters/ }));
  assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }), "clearing restores the records to the list");
});

test("MappaTool deep link applies the seeded URL filters fully (type + freshness, demo seed → in-list empty note, map kept)", async () => {
  setNavState({ search: "type=Traffic monitoring&freshness=7d" });
  const { screen } = rtl;
  await renderWithLocale(React.createElement(MappaTool));

  // F4 (useCameraFilters): the URL is no longer just a shell — the deep link
  // seeds kind AND applies the derived freshness cutoff. The demo seed has
  // no finite freshness date ("Demo data"), so the truthful in-list empty
  // note shows instead of a half-applied shell — and, per the
  // map-always-visible contract (t_b9666d09), the map itself stays.
  assert.equal(screen.getByLabelText("Record freshness").value, "7d", "?freshness= seeds the select");
  assert.ok(screen.getByRole("region", { name: "Interactive OpenStreetMap map" }), "the map stays rendered on a deep link with zero matching records");
  assert.ok(screen.getByText("No published record matches those filters."), "deep link fully applies the seeded filters (in-list note)");
});

// Marker/popup contract (t_702c10af): the API mock returns the two seed
// records so usePublicCameras swaps the seed for a NEW array — the marker
// effect then runs with leaflet ready (same re-render path as production).
const POPUP_RECORDS = [
  { id: 1, title: "Illustrative record A", kind: "Fixed dome", status: "demo", latitude: 41.9004, longitude: 12.4936, source: "Prototype seed", updated: "Demo data", description: "This marker demonstrates how a verified public record will be presented. It is not a claim about a real camera.", address: "Illustrative location, Rome" },
  { id: 2, title: "Illustrative record B", kind: "Traffic monitoring", status: "demo", latitude: 41.9047, longitude: 12.5031, source: "Prototype seed", updated: "Demo data", description: "The field of view is deliberately approximate and should never be treated as a record of live activity.", address: "Illustrative location, Rome" },
];
const installRecordsMock = () => installFetchMock(() => jsonResponse(fakeCamerasPayload(POPUP_RECORDS)));
const installEmptyMock = () => installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));

test("MappaTool marker popup carries record info and the correction/detail links", async () => {
  installRecordsMock();
  await resetLeafletMarkers();
  const { waitFor } = rtl;
  await renderWithLocale(React.createElement(MappaTool));

  await waitFor(async () => assert.equal((await leafletMarkers()).length, 2));
  const popupByTitle = Object.fromEntries((await leafletMarkers()).map((marker) => [marker.opts.title, marker.popupHtml]));

  assert.match(popupByTitle["Illustrative record A"], /<h3>Illustrative record A<\/h3>/, "popup title");
  assert.match(popupByTitle["Illustrative record A"], /Record ID/, "popup record-id label");
  assert.match(popupByTitle["Illustrative record A"], /<dd>1<\/dd>/, "popup record id");
  assert.match(popupByTitle["Illustrative record A"], /41\.9004, 12\.4936/, "popup coordinates");
  assert.match(popupByTitle["Illustrative record A"], /Illustrative record/, "popup status label comes from the public safe helper");
  assert.match(popupByTitle["Illustrative record A"], /href="\/records\/1"/, "popup detail link");
  assert.match(popupByTitle["Illustrative record A"], /href="\/correggi\?record=1"/, "popup correction link pre-selects the record");
  assert.match(popupByTitle["Illustrative record B"], /href="\/correggi\?record=2"/);
  // Record fields are escaped: hostile markup in a title stays inert.
  assert.doesNotMatch(popupByTitle["Illustrative record A"], /<script>/);
  installEmptyMock();
});

test("MappaTool list row click selects the marker and opens its popup (marker ↔ list sync)", async () => {
  installRecordsMock();
  await resetLeafletMarkers();
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  await waitFor(async () => assert.equal((await leafletMarkers()).length, 2));
  const markers = await leafletMarkers();
  const byTitle = Object.fromEntries(markers.map((marker) => [marker.opts.title, marker]));

  // Record A is the default selection: its row carries aria-current and its
  // marker carries the selected icon class.
  assert.equal(screen.getByRole("button", { name: /Illustrative record A/ }).getAttribute("aria-current"), "true");
  assert.match(byTitle["Illustrative record A"].opts.icon.html, /osm-camera-marker demo selected/);

  // Clicking row B: the marker icon swaps, the popup opens, aria-current
  // moves to the new row (the reverse direction is the same onSelect path
  // the marker click uses). Markers are re-read AFTER the click — a render
  // may rebuild the marker layer, so the assertions must target the live
  // markers on the map, exactly like the browser would.
  await user.click(screen.getByRole("button", { name: /Illustrative record B/ }));
  const liveByTitle = Object.fromEntries((await leafletMarkers()).map((marker) => [marker.opts.title, marker]));
  assert.equal(screen.getByRole("button", { name: /Illustrative record B/ }).getAttribute("aria-current"), "true");
  assert.equal(screen.getByRole("button", { name: /Illustrative record A/ }).getAttribute("aria-current"), null);
  assert.equal(liveByTitle["Illustrative record B"].popupOpened, true, "row click opens the marker popup");
  assert.match(liveByTitle["Illustrative record B"].opts.icon.html, /osm-camera-marker demo selected/);
  assert.doesNotMatch(liveByTitle["Illustrative record A"].opts.icon.html, /selected/);
  installEmptyMock();
});

test("SurveillanceMap populates the marker pane from a stable cameras prop once the map is ready (t_eb2e33a3)", async () => {
  // Regression t_eb2e33a3: with a STABLE `cameras` array (prototype seed,
  // unreachable API — the CEO reproduction on the LXC browser) the
  // marker-population effect early-returns at mount because the lazy
  // leaflet import has not resolved yet (leafletRef.current === null), and
  // with `cameras` never changing identity no later render re-triggers it
  // → .leaflet-marker-pane stays empty (0 children) while the sidebar
  // lists the same points.
  //
  // This is a component-level test ON PURPOSE: through MappaTool the race
  // is masked in the harness because the navigation stub rebuilds
  // `URLSearchParams` on every render, which changes `filters` →
  // `filteredRecords` → `cameras` identity after every parent re-render —
  // the buggy code would get re-triggered by that noise. The real
  // `useSearchParams` is stable across renders, so the component test with
  // fixed props is the faithful reproduction.
  await resetLeafletMarkers();
  const { waitFor } = rtl;
  const cameras = [
    { id: 1, title: "Illustrative record A", kind: "Fixed dome", status: "demo", latitude: 41.9004, longitude: 12.4936 },
    { id: 2, title: "Illustrative record B", kind: "Traffic monitoring", status: "demo", latitude: 41.9047, longitude: 12.5031 },
  ];
  await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras,
    selectedId: 1,
    onSelect: () => {},
    onPick: () => {},
  }));

  // The marker pane must be populated once the lazy leaflet import
  // resolves — the mapReady flag is the ONLY trigger when cameras is
  // stable, so without the fix this waitFor times out (0 markers).
  await waitFor(async () => assert.equal((await leafletMarkers()).length, 2, "marker pane is populated from the stable cameras prop"), { timeout: 2000 });
  const titles = (await leafletMarkers()).map((marker) => marker.opts.title).sort();
  assert.deepEqual(titles, ["Illustrative record A", "Illustrative record B"]);
});

test("MappaTool zoom/pan updates the list to the points in the new viewport (debounced)", async () => {
  installRecordsMock();
  await resetLeafletMarkers();
  const { screen, waitFor } = rtl;
  const leaflet = await loadDomModule("node_modules/leaflet/index.mjs");
  await renderWithLocale(React.createElement(MappaTool));

  // The map (and its moveend handler) exists after the lazy leaflet import
  // resolves; the viewport starts whole-world so both rows are listed.
  await waitFor(() => assert.ok(leaflet.__maps.length > 0));
  const map = leaflet.__maps.at(-1);
  assert.ok(screen.getByText("Showing all 2 points in the current view"));
  assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }));

  // Zoom in: a narrow viewport excludes every record — the list empties
  // truthfully (the map itself keeps all markers) and the aria-live count
  // announces the change after the 200ms debounce.
  leaflet.__setBounds({
    getSouth: () => 41.91, getNorth: () => 41.92,
    getWest: () => 12.5, getEast: () => 12.51,
    contains: () => false,
  });
  for (const handler of map.handlers["moveend zoomend"] ?? []) handler();
  await waitFor(() => assert.ok(screen.getByText("No points in the current view")));
  assert.ok(screen.queryByRole("button", { name: /Illustrative record A/ }) === null);
  assert.ok(screen.getByText(/No documented points in the current view/), "truthful in-view empty note");

  // Zoom out again: the wide viewport restores both rows.
  leaflet.__setBounds({
    getSouth: () => -90, getNorth: () => 90,
    getWest: () => -180, getEast: () => 180,
    contains: () => true,
  });
  for (const handler of map.handlers["moveend zoomend"] ?? []) handler();
  await waitFor(() => assert.ok(screen.getByText("Showing all 2 points in the current view")));
  assert.ok(screen.getByRole("button", { name: /Illustrative record B/ }));
  installEmptyMock();
});

// ---------------------------------------------------------------------------
// /mappa — geocode autocomplete + map-always-visible (t_b9666d09)
// ---------------------------------------------------------------------------

// Combined fetch mock: the cameras API returns the two seed records, the
// geocode proxy returns the Ferrara suggestions (fictitious places).
const installGeocodeMock = (geocodePayload) => installFetchMock((input) => {
  if (String(input).startsWith("/api/geocode")) return jsonResponse(geocodePayload);
  return jsonResponse(fakeCamerasPayload(POPUP_RECORDS));
});
const FERRARA_SUGGESTIONS = {
  results: [
    { display_name: "Ferrara, Emilia-Romagna, Italia", lat: 44.838124, lng: 11.619791, type: "administrative", boundingbox: ["44.7198493", "44.9637886", "11.5109915", "11.8870544"] },
    { display_name: "Via del Duomo, Ferrara, Italia", lat: 44.8355, lng: 11.619, type: "road", boundingbox: ["44.83", "44.84", "11.61", "11.63"] },
  ],
};

test("MappaTool geocode autocomplete suggests places in a combobox; keyboard selection pans the map and clears the local filter", async (t) => {
  installGeocodeMock(FERRARA_SUGGESTIONS);
  await resetLeafletMarkers();
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  // t_3c4b188e: ?q= writes (typing AND the selection clear) commit via the
  // pure history.replaceState path — spy on it to assert the committed URL.
  const historyReplaceCalls = [];
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data, unused, url) => {
    historyReplaceCalls.push(String(url));
    originalReplaceState(data, unused, url);
  };
  t.after(() => { window.history.replaceState = originalReplaceState; });

  const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
  assert.equal(input.getAttribute("aria-expanded"), "false", "the combobox starts collapsed");

  // Typing a query that does not match any local point opens the geocode
  // dropdown after the ~250ms debounce (the map itself stays rendered).
  await user.type(input, "Ferrara");
  const listbox = await waitFor(() => screen.getByRole("listbox", { name: "Place suggestions" }), { timeout: 5000 });
  assert.equal(input.getAttribute("aria-expanded"), "true", "typing expands the combobox");
  assert.ok(input.getAttribute("aria-controls") !== null, "aria-controls points at the listbox while open");
  // Scoped to the listbox: the FiltersBar selects also carry native
  // <option> elements, so getAllByRole("option") must not count them.
  const options = rtl.within(listbox).getAllByRole("option");
  assert.equal(options.length, 2);
  assert.match(options[0].textContent, /Ferrara, Emilia-Romagna, Italia/);
  assert.match(options[1].textContent, /Via del Duomo/);

  // t_3c4b188e: the 400ms ?q= commit fires AFTER the dropdown opened — it
  // must NOT close it (pure history.replaceState, no remount). Waiting for
  // the commit here also gives the selection clear something real to clear.
  await waitFor(() => assert.ok(historyReplaceCalls.some((href) => href.includes("q=Ferrara")), "the typed q committed via history.replaceState"), { timeout: 5000 });
  assert.equal(input.getAttribute("aria-expanded"), "true", "the dropdown stays open after the ?q= commit");

  // Keyboard: ArrowDown highlights the first option (aria-activedescendant
  // follows), Enter selects it — the combobox pattern.
  await user.keyboard("{ArrowDown}");
  assert.equal(options[0].getAttribute("aria-selected"), "true", "ArrowDown highlights the first option");
  assert.equal(input.getAttribute("aria-activedescendant"), "geocode-option-0");
  await user.keyboard("{Enter}");

  // Selection: the dropdown closes, the input keeps the chosen display
  // name, and the LOCAL point filter (?q=) is cleared so the list can
  // follow the new viewport unfiltered. t_3c4b188e: the clear is a pure
  // history.replaceState — router.replace was never involved.
  assert.equal(input.getAttribute("aria-expanded"), "false", "selection closes the dropdown");
  assert.equal(input.value, "Ferrara, Emilia-Romagna, Italia", "the input keeps the chosen place name");
  const nav = await getNavState();
  assert.equal(nav.replaced.length, 0, "selecting a place never called router.replace (pure-history ?q= writes)");
  assert.ok(historyReplaceCalls.length >= 2, "the ?q= commit + selection clear both went through history.replaceState");
  assert.ok(!historyReplaceCalls.at(-1).includes("q="), "selecting a place clears the local point filter");

  // The map panned to the place: setView([lat,lng], zoom ≥ 15).
  const leaflet = await loadDomModule("node_modules/leaflet/index.mjs");
  await waitFor(() => assert.ok(leaflet.__maps.length > 0));
  const map = leaflet.__maps.at(-1);
  const lastView = map.views.at(-1);
  assert.deepEqual(lastView.center, [44.838124, 11.619791], "the map pans to the selected place");
  assert.ok(lastView.zoom >= 15, "the pan zooms to at least 15");

  // Simulate the pan landing (new viewport bounds) → the list follows the
  // viewport and the first point in view is focused ("focus sul primo
  // punto se presente"). The new bounds contain only record B, so the
  // selection must move from A to B.
  leaflet.__setBounds({
    getSouth: () => 41.9, getNorth: () => 41.95,
    getWest: () => 12.5, getEast: () => 12.52,
    contains: () => true,
  });
  for (const handler of map.handlers["moveend zoomend"] ?? []) handler();
  // Wait for the pan to land AND the focus effect to select the first
  // visible point: the list-update render and the onSelect(…[0].id) effect
  // commit in sequence, so asserting outside the waitFor would race the
  // second render (flaky in the full suite, deterministic alone).
  await waitFor(() => {
    assert.ok(screen.getByText("Showing 1 of 2 points in the current view"));
    assert.equal(screen.getByRole("button", { name: /Illustrative record B/ }).getAttribute("aria-current"), "true", "the first visible point is focused after the pan");
  }, { timeout: 3000 });
  // The new bounds contain only record B — record A is OUTSIDE the new
  // viewport and must leave the list (the sidebar follows the map).
  assert.ok(screen.queryByRole("button", { name: /Illustrative record A/ }) === null, "records outside the new viewport leave the list");
  installEmptyMock();
});

test("MappaTool geocode dropdown closes on Escape and on click outside", async () => {
  installGeocodeMock(FERRARA_SUGGESTIONS);
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
  await user.type(input, "Ferrara");
  await waitFor(() => assert.ok(screen.getByRole("listbox", { name: "Place suggestions" })), { timeout: 5000 });
  assert.equal(input.getAttribute("aria-expanded"), "true");

  await user.keyboard("{Escape}");
  assert.equal(input.getAttribute("aria-expanded"), "false", "Escape closes the dropdown");
  assert.ok(screen.queryByRole("listbox") === null, "the listbox is removed on close");

  // Clicking outside the search wrapper closes the dropdown again.
  await user.type(input, "a");
  await waitFor(() => assert.ok(screen.getByRole("listbox", { name: "Place suggestions" })), { timeout: 5000 });
  rtl.fireEvent.mouseDown(document.body);
  assert.equal(input.getAttribute("aria-expanded"), "false", "click outside closes the dropdown");
  installEmptyMock();
});

test("MappaTool geocode autocomplete shows honest no-results and unavailable states", async () => {
  // No place matches the query → the dropdown states it, with attribution.
  installGeocodeMock({ results: [] });
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));
  const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });

  await user.type(input, "Xyzzy");
  await waitFor(() => assert.ok(screen.getByText("No results for “Xyzzy”")), { timeout: 5000 });
  assert.ok(screen.getByText("Places © OpenStreetMap contributors"), "the dropdown keeps the ODbL attribution");

  // The geocoder fails (503) → an honest "unavailable" note, never a
  // fabricated "no places" claim; the local filter and the map keep working.
  installFetchMock((input) => {
    if (String(input).startsWith("/api/geocode")) return jsonResponse({ error: "unavailable" }, { status: 503 });
    return jsonResponse(fakeCamerasPayload(POPUP_RECORDS));
  });
  rtl.fireEvent.change(input, { target: { value: "Roma" } });
  await waitFor(() => assert.ok(screen.getByText("Place search is temporarily unavailable.")), { timeout: 5000 });
  assert.ok(screen.getByRole("region", { name: "Interactive OpenStreetMap map" }), "a geocoder failure never breaks the map");
  installEmptyMock();
});

test("MappaTool text search with no matching record keeps the map rendered (in-list note, map-always-visible)", async () => {
  const { screen, fireEvent } = rtl;
  const user = rtl.userEvent.setup();
  // Whole-world viewport, deterministic start (t_b9666d09): a leftover
  // narrow viewport from a previous test would silently hide record A.
  await resetLeafletMarkers();
  await renderWithLocale(React.createElement(MappaTool));

  // A query that matches no local point empties ONLY the list (the map and
  // the sidebar stay); the truthful in-list note offers the clear action.
  await user.type(screen.getByLabelText("Filter the points in the current view or search a place"), "no-such-camera");
  await rtl.waitFor(() => assert.ok(screen.getByText("No published record matches those filters.")), { timeout: 5000 });

  assert.ok(screen.getByRole("region", { name: "Interactive OpenStreetMap map" }), "the map stays rendered after a no-match search");
  assert.ok(screen.getByRole("button", { name: /Clear filters/ }), "the in-list note offers the clear action");

  fireEvent.change(screen.getByLabelText("Filter the points in the current view or search a place"), { target: { value: "" } });
  await rtl.waitFor(() => assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }), "clearing restores the records"), { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// /directory — DirectoryTool
// ---------------------------------------------------------------------------

test("DirectoryTool renders the directory shell with the shared FiltersBar and both seed records", async () => {
  const { screen } = rtl;
  await renderWithLocale(React.createElement(DirectoryTool));

  assert.ok(screen.getByRole("heading", { name: "Public directory" }), "directory pageTitle heading");
  assert.ok(screen.getByLabelText("Search the public directory"), "shared FiltersBar search (inline variant)");
  assert.ok(screen.getByRole("heading", { name: "Illustrative record A" }));
  assert.ok(screen.getByRole("heading", { name: "Illustrative record B" }));

  const useMap = screen.getByRole("link", { name: /Use the map instead/ });
  assert.equal(useMap.getAttribute("href"), "/mappa", "the directory links the map tool route");

  // CEO feedback 2026-08-02: the data export row moved from /mappa to
  // /directory — the catalog meta row (DirectoryCatalog) owns the
  // filter-aware CSV/GeoJSON downloads (t_127492f1) and the data-actions
  // footer keeps the data policy link (guide/regole pattern, merge #229 × #231).
  assert.ok(screen.getByRole("link", { name: "Download GeoJSON" }), "download GeoJSON row on /directory");
  assert.ok(screen.getByRole("link", { name: "Download CSV" }), "download CSV row on /directory");
  assert.equal(screen.getByRole("link", { name: "Read the data policy" }).getAttribute("href"), "/guide", "the data policy link points at /guide");
});

test("DirectoryTool search narrows the list (debounced URL commit); the empty state offers a clear action that restores it", async (t) => {
  const { screen, fireEvent } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(DirectoryTool));

  // t_3c4b188e: ?q= writes (typing AND clearing) commit via the pure
  // history.replaceState path — spy on it to assert the committed URL.
  const historyReplaceCalls = [];
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data, unused, url) => {
    historyReplaceCalls.push(String(url));
    originalReplaceState(data, unused, url);
  };
  t.after(() => { window.history.replaceState = originalReplaceState; });

  // The harness runs REAL timers, so every URL commit below goes through the
  // ~400ms debounce (QUERY_DEBOUNCE_MS) plus a re-render. Under CI load (full
  // suite in parallel + NODE_V8_COVERAGE instrumentation) that window has
  // blown past testing-library's default 1000ms waitFor (flake observed on
  // PR #182 coverage job), so the debounce-sensitive waits carry an explicit
  // generous timeout. The asserts themselves are unchanged: they still pin
  // the debounced behaviour — A disappears only AFTER the debounce fires,
  // clearing commits right away, and the empty state offers the clear action.
  const DEBOUNCE_WAIT = { timeout: 5000 };

  // F4 (useCameraFilters): the search input feels instant but commits to the
  // URL (and therefore filters) after the ~400ms debounce (R2 URL churn; t_3c4b188e: pure history.replaceState).
  //
  // Determinism gate (t_2c1a8518): the debounce-sensitive asserts below are
  // meaningful only once the seed list is actually rendered — "A disappeared"
  // is ALSO true while the list is still loading (A never mounted), so pin
  // the precondition explicitly instead of inferring it from the waitFor.
  await rtl.waitFor(() => {
    assert.ok(screen.getByRole("heading", { name: "Illustrative record A" }), "seed list rendered (record A) before typing");
    assert.ok(screen.getByRole("heading", { name: "Illustrative record B" }), "seed list rendered (record B) before typing");
  }, DEBOUNCE_WAIT);

  await user.type(screen.getByLabelText("Search the public directory"), "Illustrative record B");

  // t_2c1a8518 (CI flake on main after PR #213): wait for the EXPLICIT ?q=
  // URL commit before the clear below. The clear is a no-op while the
  // committed mirror (filtersRef.q) is still "" (the debounce has not fired),
  // so "A is gone" is not a safe proxy — under CI load A may never have
  // mounted, making waitFor(A===null) pass BEFORE the 400ms commit, and then
  // the immediate clear hits the guard and commits nothing (the assert below
  // would count ONE replaceState, not two). historyReplaceCalls is a spy
  // local to this test and the typed commit is the only q=-bearing URL it
  // ever sees, so the assertion is precise, not just more generous.
  await rtl.waitFor(() => assert.ok(
    historyReplaceCalls.some((href) => href.includes("q=")),
    "the typed q committed via history.replaceState",
  ), DEBOUNCE_WAIT);
  await rtl.waitFor(() => assert.ok(screen.queryByRole("heading", { name: "Illustrative record A" }) === null), DEBOUNCE_WAIT);
  assert.ok(screen.getByRole("heading", { name: "Illustrative record B" }));

  // A new query replaces the old one; a no-match query yields the truthful
  // empty state. NOTE: the input clear goes through fireEvent.change instead
  // of user.clear(): user-event's clear() (focus → selectAll → delete) can
  // lose its input event under V8-coverage load (React value-tracker race —
  // the input stays on the old value and the URL keeps ?q=), which no
  // waitFor timeout can recover from. fireEvent.change drives the same
  // onChange → setQ("") → immediate-commit path the app wires, determinis-
  // tically, and the stub asserts the URL really was cleared in that step.
  fireEvent.change(screen.getByLabelText("Search the public directory"), { target: { value: "" } });
  assert.ok(historyReplaceCalls.length >= 2, "typing + clearing committed twice via history.replaceState");
  assert.ok(
    !historyReplaceCalls.at(-1).includes("q="),
    "clearing the search commits the bare URL immediately (no ?q= dead air)",
  );
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Illustrative record A" })), DEBOUNCE_WAIT);
  await user.type(screen.getByLabelText("Search the public directory"), "no-such-camera");
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "No published record matches that search." })), DEBOUNCE_WAIT);

  // Clearing the search commits immediately (no debounce dead air); the
  // restore is still async under coverage load, so wait for it.
  await user.click(screen.getByRole("button", { name: /Clear search/ }));
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Illustrative record A" }), "clearing restores the list"), DEBOUNCE_WAIT);
});

test("DirectoryTool kind filter narrows and Reset filters restores the full list", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(DirectoryTool));

  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");
  assert.ok(screen.getByRole("heading", { name: "Illustrative record A" }));
  assert.ok(screen.queryByRole("heading", { name: "Illustrative record B" }) === null);

  await user.click(screen.getByRole("button", { name: /Reset filters/ }));
  assert.ok(screen.getByRole("heading", { name: "Illustrative record B" }), "reset restores every record");
});

test("DirectoryTool Show on map pushes /mappa?focus=ID through the navigation stub", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(DirectoryTool));

  // Record A is first (alphabetical default order): its action pushes the
  // /mappa deep link with the focus id (F4 wires the focus handling).
  const showButtons = screen.getAllByRole("button", { name: /^Show on map/ });
  assert.equal(showButtons.length, 2, "every record card exposes the keyboard map path");
  await user.click(showButtons[0]);

  const navState = await getNavState();
  assert.deepEqual(navState.pushed, ["/mappa?focus=1"]);
});

// ---------------------------------------------------------------------------
// /segnala — SegnalaTool
// ---------------------------------------------------------------------------

test("SegnalaTool renders the report form with the report bundle", async () => {
  const { screen } = rtl;
  await renderWithLocale(React.createElement(SegnalaTool));

  assert.ok(screen.getByRole("heading", { name: "Report a camera" }), "report pageTitle heading");
  assert.ok(screen.getByLabelText("Record title"), "title field");
  assert.ok(screen.getByLabelText("Camera type"), "kind select");
  assert.ok(screen.getByRole("checkbox"), "privacy/safety consent checkbox");
  assert.ok(screen.getByRole("button", { name: /Send to moderation/ }), "submit button");
});

test("SegnalaTool refuses a submit without a position with a guidance notice", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(SegnalaTool));

  // Fill the required fields so the submit event fires (jsdom constraint
  // validation), then submit without any coordinates.
  await user.type(screen.getByLabelText("Record title"), "Fixture public camera");
  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: /Send to moderation/ }));

  assert.match(
    screen.getByRole("status").textContent,
    /Choose the approximate camera position/,
    "submitting without a position must guide the user, not send a report",
  );
});

test("SegnalaTool manual coordinates + full submit reach the moderation API", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  const calls = [];
  installFetchMock(async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.startsWith("/api/cameras/nearby")) return jsonResponse({ records: [] });
    if (url === "/api/cameras" && init?.method === "POST") return jsonResponse({});
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  await renderWithLocale(React.createElement(SegnalaTool));

  // Manual coordinates: the nearby check runs, the position is announced.
  await user.type(screen.getByLabelText("Latitude"), "45.46420");
  await user.type(screen.getByLabelText("Longitude"), "9.19000");
  await user.click(screen.getByRole("button", { name: /Use these coordinates/ }));
  assert.match(screen.getByRole("status").textContent, /Position selected/);
  assert.ok(calls.some((call) => call.startsWith("GET /api/cameras/nearby")), "nearby check must hit the API");

  // Full submit: title + kind + consent are required; the POST must carry
  // the chosen coordinates and land the saved confirmation.
  await user.type(screen.getByLabelText("Record title"), "Fixture public camera");
  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: /Send to moderation/ }));

  assert.ok(calls.some((call) => call === "POST /api/cameras"), "report must POST to /api/cameras");
  assert.match(screen.getByRole("status").textContent, /Report saved/, "saved confirmation after a 2xx");
});

test("SegnalaTool requires an explicit duplicate confirmation after a 409 gate", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  const postedBodies = [];
  installFetchMock(async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/cameras/nearby")) return jsonResponse({ records: [] });
    if (url === "/api/cameras" && init?.method === "POST") {
      if (init.body) postedBodies.push(JSON.parse(String(init.body)));
      // First submit: the server gate refuses with a high-strength candidate.
      if (postedBodies.length === 1) {
        return jsonResponse(
          {
            error: "A very similar public record already exists nearby.",
            possibleDuplicates: [
              { id: 7, title: "Camera porta nord", kind: "Fixed dome", distanceMeters: 12, similarity: 0.82, matchStrength: "high" },
            ],
          },
          { status: 409 },
        );
      }
      return jsonResponse({});
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  await renderWithLocale(React.createElement(SegnalaTool));

  // Fill the report like the plain-submit test.
  await user.type(screen.getByLabelText("Latitude"), "45.46420");
  await user.type(screen.getByLabelText("Longitude"), "9.19000");
  await user.click(screen.getByRole("button", { name: /Use these coordinates/ }));
  await user.type(screen.getByLabelText("Record title"), "Fixture public camera");
  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: /Send to moderation/ }));

  // The 409 surfaces the authoritative candidate list and the confirmation
  // checkbox; the submit button is disabled until the checkbox is checked.
  assert.match(screen.getByRole("alert").textContent, /Camera porta nord/, "the 409 candidate must be listed in the duplicate alert");
  const confirmCheckbox = screen.getByRole("checkbox", { name: /I confirm this is a distinct camera/ });
  assert.ok(confirmCheckbox, "the confirmation checkbox must appear after a 409 gate");
  assert.equal(screen.getByRole("button", { name: /Send to moderation/ }).disabled, true, "submit stays disabled until confirmed");
  assert.equal(postedBodies[0].duplicateConfirmed, undefined, "the first POST must NOT carry the confirmation flag");

  // Acknowledge and resubmit: the second POST carries duplicateConfirmed: true.
  await user.click(confirmCheckbox);
  assert.equal(screen.getByRole("button", { name: /Send to moderation/ }).disabled, false, "submit re-enables once confirmed");
  await user.click(screen.getByRole("button", { name: /Send to moderation/ }));
  assert.equal(postedBodies[1].duplicateConfirmed, true, "the confirmed resubmit must carry duplicateConfirmed: true");
  assert.match(screen.getByRole("status").textContent, /Report saved/, "the confirmed report lands the saved confirmation");
});

test("SegnalaTool refuses to resubmit an unconfirmed duplicate via implicit form submission", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  let postCount = 0;
  installFetchMock(async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/cameras/nearby")) return jsonResponse({ records: [] });
    if (url === "/api/cameras" && init?.method === "POST") {
      postCount += 1;
      if (postCount === 1) {
        return jsonResponse(
          {
            error: "A very similar public record already exists nearby.",
            possibleDuplicates: [
              { id: 7, title: "Camera porta nord", kind: "Fixed dome", distanceMeters: 12, similarity: 0.82, matchStrength: "high" },
            ],
          },
          { status: 409 },
        );
      }
      return jsonResponse({});
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  await renderWithLocale(React.createElement(SegnalaTool));

  await user.type(screen.getByLabelText("Latitude"), "45.46420");
  await user.type(screen.getByLabelText("Longitude"), "9.19000");
  await user.click(screen.getByRole("button", { name: /Use these coordinates/ }));
  await user.type(screen.getByLabelText("Record title"), "Fixture public camera");
  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: /Send to moderation/ }));
  assert.equal(postCount, 1, "the gate rejects the first POST");

  // Enter in the title field submits the form even with a disabled button;
  // the hook must refuse to fire another POST until the checkbox is checked.
  await user.type(screen.getByLabelText("Record title"), " x");
  await user.keyboard("{Enter}");
  assert.equal(postCount, 1, "no second POST without the explicit confirmation");
  assert.match(screen.getByRole("status").textContent, /Confirm that this is a distinct camera/, "the notice explains the gate");
});

// ---------------------------------------------------------------------------
// /correggi — CorreggiTool
// ---------------------------------------------------------------------------

test("CorreggiTool renders the correction form with the correction bundle", async () => {
  const { screen } = rtl;
  await renderWithLocale(React.createElement(CorreggiTool));

  assert.ok(screen.getByRole("heading", { name: "Correct a record" }), "correction pageTitle heading");
  assert.ok(screen.getByLabelText("Related public record"), "related record select");
  assert.ok(screen.getByRole("button", { name: /Send private request/ }), "submit button");
});

test("CorreggiTool ?record=ID pre-selects the related record and announces it", async () => {
  setNavState({ search: "record=1" });
  const { screen } = rtl;
  await renderWithLocale(React.createElement(CorreggiTool));

  assert.equal(screen.getByLabelText("Related public record").value, "1", "the select is pre-selected");
  assert.match(
    screen.getByRole("status").textContent,
    /Record 1 preselected: Illustrative record A\./,
    "the prefill must be announced (aria-live)",
  );
});

test("CorreggiTool ignores an invalid ?record= value (no prefill, no announcement)", async () => {
  setNavState({ search: "record=abc" });
  const { screen } = rtl;
  await renderWithLocale(React.createElement(CorreggiTool));

  assert.equal(screen.getByLabelText("Related public record").value, "", "no preselection for a non-numeric id");
  assert.ok(!screen.queryByRole("status"), "no announcement when nothing was pre-selected");
});

test("CorreggiTool ignores an unknown ?record= id (no prefill, no announcement)", async () => {
  setNavState({ search: "record=999" });
  const { screen } = rtl;
  await renderWithLocale(React.createElement(CorreggiTool));

  assert.equal(screen.getByLabelText("Related public record").value, "", "no preselection for an unknown id");
  assert.ok(!screen.queryByRole("status"), "no announcement when nothing was pre-selected");
});

// ---------------------------------------------------------------------------
// /404 + /500 — ErrorPage document title (F5 P3-3, WCAG 2.4.2)
// ---------------------------------------------------------------------------

test("ErrorPage sets a page-specific document.title for 404 and 500 (WCAG 2.4.2)", async () => {
  // The SSR <title> comes from the root layout; not-found.tsx cannot export
  // metadata in this build and error.tsx is a client boundary, so the page
  // must set its own <title> client-side (F5 P3-3). A tab on an error page
  // must not show the home title.
  const ErrorPage = (await loadDomModule("app/components/ErrorPage.mjs")).default;

  document.title = "unrelated";
  await renderWithLocale(React.createElement(ErrorPage, { statusCode: 404 }));
  assert.equal(
    document.title,
    "Page not found — OpenSurveillanceDB",
    "the 404 page owns its <title> (EN bundle)",
  );

  document.title = "unrelated";
  await renderWithLocale(React.createElement(ErrorPage, { statusCode: 500 }));
  assert.equal(
    document.title,
    "Something went wrong — OpenSurveillanceDB",
    "the 500 page owns its <title> (EN bundle)",
  );
});
