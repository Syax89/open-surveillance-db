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
let DirectoryTool;
let SegnalaTool;
let CorreggiTool;
let __resetPublicCamerasCache;

before(async () => {
  rtl = await setupDom();
  ToolLayout = (await loadDomModule("app/components/ToolLayout.mjs")).ToolLayout;
  MappaTool = (await loadDomModule("app/components/tools/MappaTool.mjs")).MappaTool;
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

afterEach(() => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
  // Reset the navigation stub: URL shell empty, pathname back to the
  // fallback, router.push/replace logs cleared.
  setNavState({ pushed: [], replaced: [], replaceCalls: [], search: "", pathname: "/" });
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

  assert.ok(screen.getByRole("heading", { name: "Interactive map" }), "map pageTitle heading");
  // The search moved into the sidebar column (t_702c10af): the FiltersBar
  // row keeps kind/freshness/sort/reset, the search lives at the top of the
  // left column — exactly ONE search control on the page.
  assert.ok(screen.getByLabelText("Filter the points in the current view"), "sidebar search at the top of the left column");
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

test("MappaTool freshness filter on the demo seed yields the truthful empty state with a clear action", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  // The prototype seed has no finite freshness date ("Demo data"), so any
  // freshness window filters everything out — never a silent empty map.
  await user.selectOptions(screen.getByLabelText("Record freshness"), "7d");

  assert.ok(screen.getByRole("heading", { name: "No published record matches those filters." }), "truthful empty state");
  assert.ok(screen.getByRole("button", { name: /Clear filters/ }), "empty state offers a clear action");

  await user.click(screen.getByRole("button", { name: /Clear filters/ }));
  assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }), "clearing restores the records to the list");
});

test("MappaTool deep link applies the seeded URL filters fully (type + freshness, demo seed → truthful empty state)", async () => {
  setNavState({ search: "type=Traffic monitoring&freshness=7d" });
  const { screen } = rtl;
  await renderWithLocale(React.createElement(MappaTool));

  // F4 (useCameraFilters): the URL is no longer just a shell — the deep link
  // seeds kind AND applies the derived freshness cutoff. The demo seed has
  // no finite freshness date ("Demo data"), so the truthful empty state
  // shows instead of a half-applied shell, and the select reflects the URL.
  assert.equal(screen.getByLabelText("Record freshness").value, "7d", "?freshness= seeds the select");
  assert.ok(screen.getByRole("heading", { name: "No published record matches those filters." }), "deep link fully applies the seeded filters");
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
});

test("DirectoryTool search narrows the list (debounced URL commit); the empty state offers a clear action that restores it", async () => {
  const { screen, fireEvent } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(DirectoryTool));

  // The harness runs REAL timers, so every URL commit below goes through the
  // ~250ms debounce (QUERY_DEBOUNCE_MS) plus a re-render. Under CI load (full
  // suite in parallel + NODE_V8_COVERAGE instrumentation) that window has
  // blown past testing-library's default 1000ms waitFor (flake observed on
  // PR #182 coverage job), so the debounce-sensitive waits carry an explicit
  // generous timeout. The asserts themselves are unchanged: they still pin
  // the debounced behaviour — A disappears only AFTER the debounce fires,
  // clearing commits right away, and the empty state offers the clear action.
  const DEBOUNCE_WAIT = { timeout: 5000 };

  // F4 (useCameraFilters): the search input feels instant but commits to the
  // URL (and therefore filters) after the ~250ms debounce (R2 URL churn).
  await user.type(screen.getByLabelText("Search the public directory"), "Illustrative record B");
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
  const navAfterClear = await getNavState();
  assert.ok(
    !navAfterClear.replaced.at(-1).includes("q="),
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
