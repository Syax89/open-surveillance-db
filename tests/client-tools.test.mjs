/**
 * Client-side interaction tests for the F1 tool routes (route group (tools),
 * kanban t_03c0fa15): /mappa, /directory, /segnala, /correggi.
 *
 * Per-route contract (docs/FRONTEND_PLAN.md §5.3, criterio di approve del
 * maintainer):
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
  // P1-2 (design review): the write tools are gated by WriteGateWall, which
  // checks /api/auth/me on mount — the default mock answers a VERIFIED
  // contributor so the form tests exercise the form, not the wall (the wall
  // states get their own dedicated tests below).
  installFetchMock((input) => {
    const url = String(input);
    if (url === "/api/auth/me") {
      return jsonResponse({
        contributor: {
          id: 1,
          email: "contributor@example.test",
          displayName: "Fixture Contributor",
          emailVerifiedAt: "2026-01-15T10:00:00.000Z",
          createdAt: "2026-01-15T10:00:00.000Z",
          updatedAt: "2026-01-15T10:00:00.000Z",
        },
        level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
      });
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
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
  // Restore the default verified-session fetch mock (P1-2): per-test mocks
  // (installRecordsMock/installEmptyMock/geocode…) replace the `before()`
  // default and are NOT restored automatically — without this a later
  // SegnalaTool/CorreggiTool test would see the previous test's records-only
  // mock and the WriteGateWall would render the wall instead of the form.
  installFetchMock((input) => {
    const url = String(input);
    if (url === "/api/auth/me") {
      return jsonResponse({
        contributor: {
          id: 1,
          email: "contributor@example.test",
          displayName: "Fixture Contributor",
          emailVerifiedAt: "2026-01-15T10:00:00.000Z",
          createdAt: "2026-01-15T10:00:00.000Z",
          updatedAt: "2026-01-15T10:00:00.000Z",
        },
        level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
      });
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
});

// ---------------------------------------------------------------------------
// ToolLayout — shared public nav (t_a72a3106)
// ---------------------------------------------------------------------------

test("ToolLayout renders the shared primary public nav with the current page marked aria-current", async () => {
  // The nav shell links the same three primary actions of the home hub on
  // every tool page: Explore map /mappa, Browse records /directory and Add
  // a camera /segnala — with aria-current="page" on the current route.
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
      ["/mappa", "/directory", "/segnala", "/contribuisci"],
      `nav on ${pathname} must be the shared primary public set`,
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
  // the same primary links (previously an unknown path fell back to the full
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
    ["/mappa", "/directory", "/segnala", "/contribuisci"],
    "the shared primary nav must render on unknown paths (no dead ends between tools)",
  );
});

// ---------------------------------------------------------------------------
// /mappa — MappaTool
// ---------------------------------------------------------------------------

test("MappaTool renders the map tool shell with the shared FiltersBar and the viewport-synced record list", async () => {
  installRecordsMock();
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
  // The search lives in the explorer controls above the map; it is now
  // DUAL-FUNCTION (t_b9666d09): it filters the viewport points AND suggests
  // places through the geocoder (combobox). The FiltersBar row keeps
  // kind/freshness/sort/reset — exactly ONE search control on the page.
  assert.ok(screen.getByLabelText("Filter the points in the current view or search a place"), "place/point search above the map");
  assert.ok(screen.queryByLabelText("Search the public directory") === null, "no duplicated FiltersBar search on /mappa");
  assert.ok(screen.getByLabelText("Camera type"), "shared FiltersBar kind filter");

  // The sidebar lists the points inside the current viewport (both mocked
  // records are in the initial view) as buttons, with the aria-live count
  // announcing the visible points, once the mocked fetch resolves.
  await rtl.waitFor(() => {
    assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }), "list row for record A");
    assert.ok(screen.getByRole("button", { name: /Illustrative record B/ }), "list row for record B");
    assert.ok(screen.getByText("Showing all 2 points in the current view"), "aria-live count announces the visible points");
  });

  // Map-task alternative links point at the tool routes, not the home anchors.
  const directoryLink = screen.getByRole("link", { name: "Go to the accessible directory" });
  assert.equal(directoryLink.getAttribute("href"), "/directory");

  // CEO feedback 2026-08-02: the download GeoJSON/CSV row moved to
  // /directory — /mappa must NOT carry the data export footer anymore.
  assert.ok(screen.queryByRole("link", { name: /Download/ }) === null, "no data export row on /mappa (moved to /directory)");
});

test("the /mappa sidebar rows carry the status dot + localized label (status rail is never colour-only)", async () => {
  // t_d089a17e: same status-accent logic as the directory cards — every
  // visible row shows the status-dot AND its whitelisted label (WCAG
  // 1.4.1), so the coloured left rail is never the only signal.
  installRecordsMock();
  const { container } = await renderWithLocale(React.createElement(MappaTool));

  await rtl.waitFor(() => assert.ok(container.querySelectorAll(".map-record").length >= 2, "the sidebar must list the visible points"));
  const rows = container.querySelectorAll(".map-record");
  for (const row of rows) {
    const dot = row.querySelector(".map-record-status .status-dot");
    assert.ok(dot, "each sidebar row has a status dot");
    assert.match(dot?.getAttribute("class") ?? "", /status-dot (verified|demo)/, "only public whitelisted statuses render");
    const statusText = row.querySelector(".map-record-status")?.textContent ?? "";
    assert.match(statusText, /Illustrative record|Verified/, "each row announces the localized status label next to the dot");
  }
});

test("MappaTool kind filter narrows the sidebar list and the markers", async () => {
  installRecordsMock();
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));
  await rtl.waitFor(() => assert.ok(screen.getByRole("button", { name: /Illustrative record A/ })));

  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");

  assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }));
  assert.ok(screen.queryByRole("button", { name: /Illustrative record B/ }) === null);
  assert.match(screen.getByText(/1 public record found/).textContent, /1 public record found/);
});

test("MappaTool freshness filter keeps the map rendered and uses the global reset above it", async () => {
  installRecordsMock();
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));
  await rtl.waitFor(() => assert.ok(screen.getByRole("button", { name: /Illustrative record A/ })));

  // The mocked records carry no finite freshness date ("Demo data"), so any
  // freshness window filters everything out. Map-always-visible contract
  // (t_b9666d09): the map and the sidebar STAY rendered — the truthful
  // empty state moves INSIDE the list while reset stays above the map, it
  // never replaces the map.
  await user.selectOptions(screen.getByLabelText("Record freshness"), "7d");

  // The map region is still on the page (never replaced by an empty state).
  assert.ok(screen.getByRole("region", { name: "Interactive OpenStreetMap map" }), "the map stays rendered with zero matching records");
  // The explorer controls stay above the map; the sidebar is just the list.
  assert.ok(screen.getByLabelText("Filter the points in the current view or search a place"), "the top search stays rendered");
  assert.ok(screen.getByText("No published record matches those filters."), "truthful in-list empty note");
  assert.ok(screen.getByText(/This does not mean that there are no cameras/), "the note never implies an area has no surveillance");
  assert.ok(screen.getByRole("button", { name: /Reset filters/ }), "the top controls offer the reset action");
  // The prototype banner was removed entirely (CEO feedback 2026-08-02):
  // never rendered, with or without matching records.
  assert.ok(screen.queryByText("Prototype mode.") === null, "no prototype banner on /mappa (removed — CEO feedback)");

  await user.click(screen.getByRole("button", { name: /Reset filters/ }));
  assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }), "clearing restores the records to the list");
});

test("MappaTool deep link applies the seeded URL filters fully (type + freshness, mocked records → in-list empty note, map kept)", async () => {
  installRecordsMock();
  setNavState({ search: "type=Traffic monitoring&freshness=7d" });
  const { screen } = rtl;
  await renderWithLocale(React.createElement(MappaTool));

  // F4 (useCameraFilters): the URL is no longer just a shell — the deep link
  // seeds kind AND applies the derived freshness cutoff. The mocked records
  // carry no finite freshness date ("Demo data"), so the truthful in-list
  // empty note shows instead of a half-applied shell — and, per the
  // map-always-visible contract (t_b9666d09), the map itself stays.
  assert.equal(screen.getByLabelText("Record freshness").value, "7d", "?freshness= seeds the select");
  assert.ok(screen.getByRole("region", { name: "Interactive OpenStreetMap map" }), "the map stays rendered on a deep link with zero matching records");
  await rtl.waitFor(() => assert.ok(screen.getByText("No published record matches those filters.", "deep link fully applies the seeded filters (in-list note)")));
});

test("MappaTool with a valid EMPTY /api/cameras answer keeps the map and shows the honest empty state (P0 t_444b15e4: no next[0] dereference)", async () => {
  // P0 hotfix (t_444b15e4, post-#321): the API may answer 200 with a
  // VALID empty list ({records: []}) when the DB has no public records —
  // onRecords must never dereference next[0].id on it (TypeError before
  // the guard). The map stays rendered (map-always-visible contract
  // t_b9666d09), the sidebar shows the truthful in-list empty note, and
  // no exception surfaces.
  installEmptyMock();
  const { screen } = rtl;
  await renderWithLocale(React.createElement(MappaTool));

  // The map region is still on the page (never replaced by an empty state).
  assert.ok(screen.getByRole("region", { name: "Interactive OpenStreetMap map" }), "the map stays rendered with zero records from the API");

  // The sidebar shows the truthful empty state (same note as a filter that
  // matches nothing) with the reset action above the map — never a crash,
  // never a spurious selection/popup/deep link. The points rail starts
  // collapsed (map-first UX, PR #326): expand it to read the note.
  await rtl.waitFor(async () => {
    const toggle = screen.queryByRole("button", { name: /Points in the current view/ });
    if (toggle && toggle.getAttribute("aria-expanded") === "false") {
      const user = rtl.userEvent.setup();
      await user.click(toggle);
    }
    assert.ok(screen.getByText("No published record matches those filters."), "truthful in-list empty note on an empty API answer");
    assert.ok(screen.getByText(/This does not mean that there are no cameras/), "the note never implies an area has no surveillance");
    assert.ok(screen.getByRole("button", { name: /Reset filters/ }), "the controls above the map offer the reset action");
  });
  // No record rows exist — nothing to select, no spurious marker/popup.
  assert.ok(screen.queryByRole("button", { name: /Illustrative record/ }) === null, "no record rows with an empty API answer");
});

// Marker/popup contract (t_702c10af): the API mock returns the two seed
// records so usePublicCameras swaps the seed for a NEW array — the marker
// effect then runs with leaflet ready (same re-render path as production).
const POPUP_RECORDS = [
  { id: 1, title: "Illustrative record A", kind: "Fixed dome", status: "demo", latitude: 41.9004, longitude: 12.4936, source: "Development seed", updated: "Demo data", description: "This marker demonstrates how a verified public record will be presented. It is not a claim about a real camera.", address: "Illustrative location, Rome" },
  { id: 2, title: "Illustrative record B", kind: "Traffic monitoring", status: "demo", latitude: 41.9047, longitude: 12.5031, source: "Development seed", updated: "Demo data", description: "The field of view is deliberately approximate and should never be treated as a record of live activity.", address: "Illustrative location, Rome" },
];
const installRecordsMock = () => installFetchMock(() => jsonResponse(fakeCamerasPayload(POPUP_RECORDS)));
const installEmptyMock = () => installFetchMock(() => jsonResponse({ records: [], total: 0, nextOffset: null }));

/**
 * P1-2 (design review): per-test fetch mocks for the SegnalaTool form tests
 * must answer /api/auth/me with a VERIFIED contributor (the WriteGateWall
 * gates the form on that check); anything else falls through to the given
 * handler. Without this the wall would see the records payload as an
 * unverified session and render the wall instead of the form.
 */
const installSegnalaMock = (handler) => installFetchMock((input, init) => {
  if (String(input) === "/api/auth/me") {
    return jsonResponse({
      contributor: {
        id: 1,
        email: "contributor@example.test",
        displayName: "Fixture Contributor",
        emailVerifiedAt: "2026-01-15T10:00:00.000Z",
        createdAt: "2026-01-15T10:00:00.000Z",
        updatedAt: "2026-01-15T10:00:00.000Z",
      },
      level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
    });
  }
  return handler(input, init);
});

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
  // Redesign t_b7728ad0: the "Report an issue" link is REMOVED from the
  // popup footer — the disclosure's Problema/Privacy community actions are
  // the record-level report surface, so the footer no longer competes with
  // them (the correction form stays on the record detail page).
  assert.ok(!popupByTitle["Illustrative record A"].includes("/correggi"), "popup footer no longer carries the report-issue link");
  assert.ok(!popupByTitle["Illustrative record B"].includes("/correggi"));
  // The footer keeps the single detail action.
  assert.match(popupByTitle["Illustrative record A"], /osm-popup-footer/, "popup footer block");
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

  // Popup policy (PR #326, review fix): NO record is pre-selected on load —
  // arriving viewport data must never auto-open a popup. No row carries
  // aria-current and no marker carries the selected class until the user
  // clicks (explicit intent only).
  assert.equal(screen.getByRole("button", { name: /Illustrative record A/ }).getAttribute("aria-current"), null);
  assert.doesNotMatch(byTitle["Illustrative record A"].opts.icon.html, /selected/);

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
  // resolves. The viewport-bounded data layer (t_bb310428) fetches the
  // records AFTER the map emits its first bounds (debounced), so the list
  // assertions must wait for the viewport payload to land.
  await waitFor(() => assert.ok(leaflet.__maps.length > 0));
  const map = leaflet.__maps.at(-1);
  await waitFor(() => {
    assert.ok(screen.getByText("Showing all 2 points in the current view"));
    assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }));
  });

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

// P0-2 (review 2026-08-07): after a ?focus=ID deep link, an explicit
// marker click must WIN — the focus URL is external state applied only on
// VALUE change, never a binding that overrides the user's next click.
test("MappaTool marker click after a ?focus= deep link keeps the clicked record (no focus bounce-back)", async () => {
  installRecordsMock();
  await resetLeafletMarkers();
  // Seed the URL with a focus deep link on record A.
  setNavState({ pathname: "/mappa", search: "focus=1" });
  const { screen, waitFor } = rtl;
  await renderWithLocale(React.createElement(MappaTool));

  // The deep link resolves record A as the selected camera.
  await waitFor(() => assert.ok(screen.getByRole("button", { name: /Illustrative record A/ })), { timeout: 5000 });

  // Wait for the markers to be materialised (records from the mock).
  const markers = await leafletMarkers();
  assert.ok(markers.length >= 2, "both mock records render as markers");
  const m2 = markers.find((m) => m.latlng && Math.abs(m.latlng[0] - 41.9047) < 1e-9);
  assert.ok(m2, "record B marker exists");

  // Explicit user click on record B's marker: selects B, opens its popup.
  const evt = { latlng: { lat: m2.latlng[0], lng: m2.latlng[1] }, originalEvent: {} };
  m2.handlers.click?.[0]?.(evt);

  // The focus URL must NOT bounce the selection back to A: B stays
  // current (its list row carries aria-current), no re-open of A's popup.
  await waitFor(() => {
    assert.equal(screen.getByRole("button", { name: /Illustrative record B/ }).getAttribute("aria-current"), "true", "the clicked record B stays selected");
  }, { timeout: 3000 });
  assert.equal(m2.popupOpened, true, "the clicked marker's popup is open");
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
  // t_2ec5e072: the close is a state update flushed by act — under heavy
  // parallel-suite contention (CI run 30934261030: 1 fail / 1954 on this
  // assert) the flush can land a tick after the immediate assert. Poll
  // for the closed state instead (same pattern as the pan-land waitFor
  // above and url-state-contract #282).
  await waitFor(() => {
    assert.equal(input.getAttribute("aria-expanded"), "false", "Escape closes the dropdown");
    assert.ok(screen.queryByRole("listbox") === null, "the listbox is removed on close");
  }, { timeout: 5000 });

  // Clicking outside the search wrapper closes the dropdown again. The
  // document-level mousedown listener is attached by a PASSIVE effect that
  // React 19 flushes AFTER the render that shows the listbox (scheduler
  // setImmediate — Node event-loop CHECK phase), while waitFor polls from
  // the TIMERS phase (setInterval) and from MutationObserver microtasks:
  // both can run BEFORE the effect attach. The re-open here comes from the
  // module-level 250ms geocode debounce (a REAL timer, outside act), so the
  // commit that shows the listbox and the effect that attaches the listener
  // land in DIFFERENT event-loop turns. Under parallel-suite contention the
  // waitFor can therefore observe the listbox while the listener is still
  // pending, and the ONE-SHOT fireEvent.mouseDown below is lost — nothing
  // ever closes the dropdown and the waitFor times out (CI run 30951627009,
  // test #794, 1 fail / 1954; t_18d6f344).
  // t_18d6f344 fix: retry the outside mousedown on every poll until the
  // close actually lands. Once the effect has attached the listener, the
  // next poll's mousedown closes the dropdown and the asserts pass; if the
  // close logic itself breaks, the retry still times out and the test fails
  // — the retry covers ONLY the attach race, never the close behavior.
  await user.type(input, "a");
  await waitFor(() => assert.ok(screen.getByRole("listbox", { name: "Place suggestions" })), { timeout: 5000 });
  await waitFor(() => {
    rtl.fireEvent.mouseDown(document.body);
    assert.equal(input.getAttribute("aria-expanded"), "false", "click outside closes the dropdown");
    assert.ok(screen.queryByRole("listbox") === null, "the listbox is removed on click outside");
  }, { timeout: 5000 });
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
  installRecordsMock();
  const { screen, fireEvent } = rtl;
  const user = rtl.userEvent.setup();
  // Whole-world viewport, deterministic start (t_b9666d09): a leftover
  // narrow viewport from a previous test would silently hide record A.
  await resetLeafletMarkers();
  await renderWithLocale(React.createElement(MappaTool));
  await rtl.waitFor(() => assert.ok(screen.getByRole("button", { name: /Illustrative record A/ })));

  // A query that matches no local point empties ONLY the list (the map and
  // the sidebar stay); reset remains in the explorer controls above.
  await user.type(screen.getByLabelText("Filter the points in the current view or search a place"), "no-such-camera");
  await rtl.waitFor(() => assert.ok(screen.getByText("No published record matches those filters.")), { timeout: 5000 });

  assert.ok(screen.getByRole("region", { name: "Interactive OpenStreetMap map" }), "the map stays rendered after a no-match search");
  assert.ok(screen.getByRole("button", { name: /Reset filters/ }), "the top controls offer the reset action");

  fireEvent.change(screen.getByLabelText("Filter the points in the current view or search a place"), { target: { value: "" } });
  await rtl.waitFor(() => assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }), "clearing restores the records"), { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// /directory — DirectoryTool
// ---------------------------------------------------------------------------

test("DirectoryTool renders the directory shell with the shared FiltersBar and both mocked records", async () => {
  installRecordsMock();
  const { screen } = rtl;
  await renderWithLocale(React.createElement(DirectoryTool));

  assert.ok(screen.getByRole("heading", { name: "Public directory" }), "directory pageTitle heading");
  assert.ok(screen.getByLabelText("Search the public directory"), "shared FiltersBar search (inline variant)");
  await rtl.waitFor(() => {
    assert.ok(screen.getByRole("heading", { name: "Illustrative record A" }));
    assert.ok(screen.getByRole("heading", { name: "Illustrative record B" }));
  });

  const explorerSwitch = screen.getByRole("navigation", { name: "Explore records as" });
  const useMap = rtl.within(explorerSwitch).getByRole("link", { name: "Map" });
  assert.equal(useMap.getAttribute("href"), "/mappa", "the directory explorer switch links the map tool route");

  // CEO 2026-08-08 (t_b98b1734): the CSV/GeoJSON downloads moved from the
  // results header to the data-actions footer — small text links on the same
  // row as the data policy link (same font, no buttons). The footer keeps
  // the guide/regole pattern (merge #229 × #231) for the policy link.
  const csvLink = screen.getByRole("link", { name: "Download CSV" });
  const geojsonLink = screen.getByRole("link", { name: "Download GeoJSON" });
  const policyLink = screen.getByRole("link", { name: "Read the data policy" });
  assert.ok(csvLink, "download CSV row on /directory");
  assert.ok(geojsonLink, "download GeoJSON row on /directory");
  assert.equal(policyLink.getAttribute("href"), "/guide", "the data policy link points at /guide");
  const footer = policyLink.closest(".data-actions");
  assert.ok(footer, "downloads + policy links share the data-actions footer");
  assert.ok(footer.contains(csvLink) && footer.contains(geojsonLink), "both download links live in the data-actions footer");
  assert.ok(!footer.querySelector(".export-button"), "footer links are text links, not export buttons");
  assert.ok(!document.querySelector(".directory-results .export-button"), "no export buttons remain in the results header");

  // CEO 2026-08-08: the small circular [+] in the results header top-right
  // links to the report form (/segnala) — a plain link, the write gate there
  // handles anonymous visitors.
  const reportShortcut = screen.getByRole("link", { name: "Report a camera" });
  assert.equal(reportShortcut.getAttribute("href"), "/segnala", "the [+] links the report form route");
  assert.match(reportShortcut.getAttribute("class") ?? "", /add-button/, "the [+] uses the circular add-button style");
});

test("DirectoryTool search narrows the list (debounced URL commit); the empty state offers a clear action that restores it", async (t) => {
  installRecordsMock();
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
  installRecordsMock();
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Illustrative record A" })));

  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");
  assert.ok(screen.getByRole("heading", { name: "Illustrative record A" }));
  assert.ok(screen.queryByRole("heading", { name: "Illustrative record B" }) === null);

  await user.click(screen.getByRole("button", { name: /Reset filters/ }));
  assert.ok(screen.getByRole("heading", { name: "Illustrative record B" }), "reset restores every record");
});

test("DirectoryTool Show on map pushes /mappa?focus=ID through the navigation stub", async () => {
  installRecordsMock();
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(DirectoryTool));

  // Record A is first (alphabetical default order): its action pushes the
  // /mappa deep link with the focus id (F4 wires the focus handling).
  const showButtons = await rtl.waitFor(() => {
    const buttons = screen.getAllByRole("button", { name: /^Show on map/ });
    assert.equal(buttons.length, 2, "every record card exposes the keyboard map path");
    return buttons;
  });
  await user.click(showButtons[0]);

  const navState = await getNavState();
  assert.deepEqual(navState.pushed, ["/mappa?focus=1"]);
});

// ---------------------------------------------------------------------------
// /segnala — SegnalaTool
// ---------------------------------------------------------------------------

test("SegnalaTool renders the report form in its one-column tool layout", async () => {
  const { screen } = rtl;
  await renderWithLocale(React.createElement(SegnalaTool));

  assert.ok(screen.getByRole("heading", { name: "Report a camera" }), "report pageTitle heading");
  // P1-2: the WriteGateWall gates the form on the verified-session check —
  // wait for the /api/auth/me fetch to resolve before asserting the fields.
  assert.ok(await screen.findByLabelText("Record title"), "title field");
  assert.ok(screen.getByLabelText("Camera type"), "kind select");
  assert.ok(screen.getByRole("checkbox"), "privacy/safety consent checkbox");
  assert.ok(screen.getByRole("button", { name: /Publish report/ }), "submit button");

  // /segnala selects its own stacked layout instead of changing ReportForm's
  // default embedding. Guidance stays first in DOM/focus order, above the form.
  const reportSection = document.querySelector(".report-section--tool");
  assert.ok(reportSection, "the tool selects the scoped one-column layout");
  const context = reportSection.querySelector(":scope > div");
  const form = reportSection.querySelector("form.report-form");
  assert.ok(context?.querySelector(".report-rule"), "the guidance remains before the form");
  assert.ok(form, "the report form remains the single editable surface");
  assert.ok(context.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING, "guidance precedes fields in DOM order");
});

test("SegnalaTool refuses a submit without a position with a guidance notice", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(SegnalaTool));

  // Fill the required fields so the submit event fires (jsdom constraint
  // validation), then submit without any coordinates.
  await screen.findByLabelText("Record title");
  await user.type(screen.getByLabelText("Record title"), "Fixture public camera");
  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: /Publish report/ }));

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
  installSegnalaMock(async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.startsWith("/api/cameras/nearby")) return jsonResponse({ records: [] });
    if (url === "/api/cameras" && init?.method === "POST") return jsonResponse({});
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  await renderWithLocale(React.createElement(SegnalaTool));

  // Manual coordinates: the nearby check runs, the position is announced.
  await screen.findByLabelText("Latitude");
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
  await user.click(screen.getByRole("button", { name: /Publish report/ }));

  assert.ok(calls.some((call) => call === "POST /api/cameras"), "report must POST to /api/cameras");
  assert.match(screen.getByRole("status").textContent, /Report published/, "immediate-publication confirmation after a 2xx (ADR 0021 §1)");
});

test("SegnalaTool requires an explicit duplicate confirmation after a 409 gate", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  const postedBodies = [];
  installSegnalaMock(async (input, init) => {
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
  await screen.findByLabelText("Latitude");
  await user.type(screen.getByLabelText("Latitude"), "45.46420");
  await user.type(screen.getByLabelText("Longitude"), "9.19000");
  await user.click(screen.getByRole("button", { name: /Use these coordinates/ }));
  await user.type(screen.getByLabelText("Record title"), "Fixture public camera");
  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: /Publish report/ }));

  // The 409 surfaces the authoritative candidate list and the confirmation
  // checkbox; the submit button is disabled until the checkbox is checked.
  assert.match(screen.getByRole("alert").textContent, /Camera porta nord/, "the 409 candidate must be listed in the duplicate alert");
  const confirmCheckbox = screen.getByRole("checkbox", { name: /I confirm this is a distinct camera/ });
  assert.ok(confirmCheckbox, "the confirmation checkbox must appear after a 409 gate");
  assert.equal(screen.getByRole("button", { name: /Publish report/ }).disabled, true, "submit stays disabled until confirmed");
  assert.equal(postedBodies[0].duplicateConfirmed, undefined, "the first POST must NOT carry the confirmation flag");

  // Acknowledge and resubmit: the second POST carries duplicateConfirmed: true.
  await user.click(confirmCheckbox);
  assert.equal(screen.getByRole("button", { name: /Publish report/ }).disabled, false, "submit re-enables once confirmed");
  await user.click(screen.getByRole("button", { name: /Publish report/ }));
  assert.equal(postedBodies[1].duplicateConfirmed, true, "the confirmed resubmit must carry duplicateConfirmed: true");
  assert.match(screen.getByRole("status").textContent, /Report published/, "the confirmed report lands the immediate-publication confirmation");
});

test("SegnalaTool refuses to resubmit an unconfirmed duplicate via implicit form submission", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  let postCount = 0;
  installSegnalaMock(async (input, init) => {
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

  await screen.findByLabelText("Latitude");
  await user.type(screen.getByLabelText("Latitude"), "45.46420");
  await user.type(screen.getByLabelText("Longitude"), "9.19000");
  await user.click(screen.getByRole("button", { name: /Use these coordinates/ }));
  await user.type(screen.getByLabelText("Record title"), "Fixture public camera");
  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: /Publish report/ }));
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
  // P1-2: wait for the verified-session gate before asserting the form.
  assert.ok(await screen.findByLabelText("Related public record"), "related record select");
  assert.ok(screen.getByRole("button", { name: /Send private request/ }), "submit button");
});

test("CorreggiTool ?record=ID pre-selects the related record and announces it", async () => {
  // CorreggiTool is gated by WriteGateWall (checks /api/auth/me on mount):
  // installRecordsMock() alone would answer /api/auth/me with camera
  // records too, so the wall never resolves to a verified session and the
  // form (and its select) never renders. installSegnalaMock answers the
  // session check correctly and falls through to the cameras payload.
  // The record picker is a record-id field (CEO 2026-08-12): the
  // ?record=ID prefill is resolved by id via GET /api/cameras/[id] (the
  // old native select with every record froze the browser at ~37k options).
  installSegnalaMock((input) => {
    if (String(input) === "/api/cameras/1") {
      return jsonResponse({ record: { id: 1, title: "Illustrative record A", kind: "Fixed dome", status: "demo" } });
    }
    return jsonResponse(fakeCamerasPayload(POPUP_RECORDS));
  });
  setNavState({ search: "record=1" });
  const { screen } = rtl;
  await renderWithLocale(React.createElement(CorreggiTool));

  // P1-2: the verified-session gate resolves before the form (and its
  // pre-selection announcement) renders.
  await screen.findByLabelText("Related public record");
  await rtl.waitFor(() => assert.equal(screen.getByLabelText("Related public record").value, "1", "the field shows the pre-selected record id"));
  await rtl.waitFor(() =>
    assert.ok(
      screen.getByText(/Record 1 preselected: Illustrative record A\./),
      "the prefill must be announced (aria-live)",
    ),
  );
  assert.equal(document.querySelector('input[name="cameraId"]')?.value, "1", "the hidden cameraId carries the pre-selected id");
});

test("CorreggiTool ignores an invalid ?record= value (no prefill, no announcement)", async () => {
  setNavState({ search: "record=abc" });
  const { screen } = rtl;
  await renderWithLocale(React.createElement(CorreggiTool));

  await screen.findByLabelText("Related public record");
  assert.equal(screen.getByLabelText("Related public record").value, "", "no preselection for a non-numeric id");
  assert.equal(document.querySelector('input[name="cameraId"]')?.value, "", "hidden cameraId stays empty");
  assert.ok(!screen.queryByRole("status"), "no announcement when nothing was pre-selected");
});

test("CorreggiTool ignores an unknown ?record= id (no prefill, no announcement)", async () => {
  setNavState({ search: "record=999" });
  const { screen } = rtl;
  await renderWithLocale(React.createElement(CorreggiTool));

  await screen.findByLabelText("Related public record");
  // The field keeps the typed id visible, but nothing is confirmed: the
  // hidden cameraId stays empty and no preselection is announced.
  assert.equal(screen.getByLabelText("Related public record").value, "999", "the typed id stays visible");
  assert.equal(document.querySelector('input[name="cameraId"]')?.value, "", "hidden cameraId stays empty");
  await rtl.waitFor(() => assert.ok(screen.getByText(/No public record with id 999/), "the id field reports the unknown id"));
  assert.ok(!screen.queryByText(/preselected/), "no preselection announcement when nothing was pre-selected");
});

test("CorreggiTool record-id field resolves a typed id and fills cameraId", async () => {
  installSegnalaMock((input) => {
    const url = String(input);
    if (url === "/api/cameras/7") {
      return jsonResponse({ record: { id: 7, title: "Corso Italia corner", kind: "Bullet", status: "active" } });
    }
    return jsonResponse(fakeCamerasPayload(POPUP_RECORDS));
  });
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(CorreggiTool));

  const input = await screen.findByLabelText("Related public record");
  await user.type(input, "7");
  await rtl.waitFor(
    () => assert.ok(screen.getByText(/Record 7 — Corso Italia corner/), "the resolved record is confirmed in the field status"),
    { timeout: 3000 },
  );
  assert.equal(screen.getByLabelText("Related public record").value, "7", "the field keeps the typed id");
  assert.equal(document.querySelector('input[name="cameraId"]')?.value, "7", "the hidden cameraId carries the chosen id");
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

// ---------------------------------------------------------------------------
// P1-2 (design review) — WriteGateWall on the write tools
// ---------------------------------------------------------------------------

test("SegnalaTool preserves a map-picked point through the anonymous login wall", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock((input) => {
    if (String(input) === "/api/auth/me") return jsonResponse({ error: "Not authenticated." }, { status: 401 });
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  await renderWithLocale(React.createElement(SegnalaTool, {
    initialCoordinates: { latitude: 41.9, longitude: 12.5 },
  }));

  // The wall replaces the form for anonymous visitors: no title/consent
  // fields, bilingual CTA with the validated picked point still in returnTo.
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Log in to contribute" })));
  assert.equal(screen.queryByLabelText("Record title"), null, "no form for an anonymous visitor");
  const login = screen.getByRole("link", { name: "Log in" });
  assert.equal(login.getAttribute("href"), "/login?returnTo=%2Fsegnala%3Flat%3D41.9%26lng%3D12.5", "login CTA preserves the picked point");
  assert.ok(screen.getByRole("link", { name: "Create an account" }));
});

test("CorreggiTool shows the login wall for an anonymous visitor (no form, returnTo)", async () => {
  const { screen, waitFor } = rtl;
  setNavState({ search: "record=42" });
  installFetchMock((input) => {
    if (String(input) === "/api/auth/me") return jsonResponse({ error: "Not authenticated." }, { status: 401 });
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  await renderWithLocale(React.createElement(CorreggiTool));

  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Log in to contribute" })));
  assert.equal(screen.queryByLabelText("Related public record"), null, "no form for an anonymous visitor");
  const login = screen.getByRole("link", { name: "Log in" });
  assert.equal(login.getAttribute("href"), "/login?returnTo=%2Fcorreggi%3Frecord%3D42", "login CTA preserves the selected record");
});

test("SegnalaTool shows the verify-email wall for an unverified session (resend action)", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET" });
    if (url === "/api/auth/me") {
      // Live session, contributor NOT verified (emailVerifiedAt null).
      return jsonResponse({
        contributor: {
          id: 1,
          email: "contributor@example.test",
          displayName: "Fixture Contributor",
          emailVerifiedAt: null,
          createdAt: "2026-01-15T10:00:00.000Z",
          updatedAt: "2026-01-15T10:00:00.000Z",
        },
        level: { level: 0, verifiedCount: 0, threshold: 0, nextThreshold: 1 },
      });
    }
    if (url === "/api/auth/verify-email/resend" && init?.method === "POST") return jsonResponse({ sent: true });
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  await renderWithLocale(React.createElement(SegnalaTool));

  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Verify your email to contribute" })));
  assert.equal(screen.queryByLabelText("Record title"), null, "no form for an unverified session");

  await user.click(screen.getByRole("button", { name: "Resend verification email" }));
  await waitFor(() => assert.ok(requests.some((r) => r.url === "/api/auth/verify-email/resend" && r.method === "POST")));
  assert.ok(screen.getByText("Verification email sent."), "the resend confirmation is announced");
});

test("WriteGateWall renders children for a verified contributor (wall never shows)", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock((input) => {
    if (String(input) === "/api/auth/me") {
      return jsonResponse({
        contributor: {
          id: 1,
          email: "contributor@example.test",
          displayName: "Fixture Contributor",
          emailVerifiedAt: "2026-01-15T10:00:00.000Z",
          createdAt: "2026-01-15T10:00:00.000Z",
          updatedAt: "2026-01-15T10:00:00.000Z",
        },
        level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
      });
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  await renderWithLocale(React.createElement(SegnalaTool));

  await waitFor(() => assert.ok(screen.getByLabelText("Record title")));
  assert.equal(screen.queryByRole("heading", { name: "Log in to contribute" }), null, "no wall for a verified contributor");
});

test("WriteGateWall error wall: retry button label matches the retry action (QA#2 F4)", async () => {
  // F4: the error-state retry button used `t.loading ? t.verifyTitle :
  // t.wallLogIn` — t.loading is a TRUTHY string, so the button ALWAYS said
  // "Verify your email" even though its action re-runs the session check.
  // It must say "Try again" and actually retry the /api/auth/me read.
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  let meCalls = 0;
  installFetchMock((input) => {
    if (String(input) === "/api/auth/me") {
      meCalls += 1;
      if (meCalls === 1) return jsonResponse({ error: "Unable to read the session" }, { status: 503 });
      // Retry succeeds as anonymous: the wall must flip to the login wall.
      return jsonResponse({ error: "Not authenticated." }, { status: 401 });
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  await renderWithLocale(React.createElement(SegnalaTool));

  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Log in to contribute" })));
  const retry = screen.getByRole("button", { name: "Try again" });
  assert.equal(
    screen.queryByRole("button", { name: "Verify your email" }),
    null,
    "the retry button must NOT carry the verify-email label (QA#2 F4)",
  );

  await user.click(retry);
  await waitFor(() => assert.ok(screen.getByRole("link", { name: "Log in" })));
  assert.equal(meCalls, 2, "clicking Try again must re-run the session check");
});
