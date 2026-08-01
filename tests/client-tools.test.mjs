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
  setupDom, loadDomModule, installFetchMock, jsonResponse,
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
// ToolLayout — per-page nav sets (F3 t_2ca69725, FRONTEND_DESIGN §2.5)
// ---------------------------------------------------------------------------

test("ToolLayout renders the per-page nav sets from FRONTEND_DESIGN §2.5 (no dead ends)", async () => {
  // The nav shell links the OTHER tools + contextual pages + the home CTA;
  // the current page is never linked to itself. The route-group layout picks
  // the set from usePathname() (the layout cannot know the route statically).
  const cases = {
    "/mappa": ["/directory", "/segnala", "/guide", "/"],
    "/directory": ["/mappa", "/segnala", "/guide", "/"],
    "/segnala": ["/directory", "/mappa", "/guide", "/regole", "/"],
    "/correggi": ["/directory", "/mappa", "/contatti", "/"],
  };
  for (const [pathname, expected] of Object.entries(cases)) {
    setNavState({ pathname });
    const { screen } = rtl;
    await renderWithLocale(
      React.createElement(ToolLayout, null, React.createElement("p", null, "tool body")),
    );

    const main = screen.getByRole("main");
    assert.equal(main.id, "main-content", "the tool layout must keep the main-content landmark");

    const links = Array.from(main.querySelectorAll(".nav-links a")).map((a) => a.getAttribute("href"));
    assert.deepEqual(links, expected, `nav set on ${pathname} must match FRONTEND_DESIGN §2.5`);
    // The children (the tool body) must render inside the layout.
    assert.ok(main.textContent.includes("tool body"));

    rtl.cleanup();
  }
});

test("ToolLayout falls back to the full cross-tool set on unknown paths (defensive)", async () => {
  setNavState({ pathname: "/some-future-route" });
  const { screen } = rtl;
  await renderWithLocale(
    React.createElement(ToolLayout, null, React.createElement("p", null, "tool body")),
  );

  const main = screen.getByRole("main");
  const links = Array.from(main.querySelectorAll(".nav-links a")).map((a) => a.getAttribute("href"));
  for (const href of ["/mappa", "/directory", "/segnala", "/correggi", "/guide", "/"]) {
    assert.ok(links.includes(href), `fallback nav must link ${href} (no dead ends between tools)`);
  }
});

// ---------------------------------------------------------------------------
// /mappa — MappaTool
// ---------------------------------------------------------------------------

test("MappaTool renders the map tool shell with the shared FiltersBar and the record card", async () => {
  const { screen } = rtl;
  await renderWithLocale(React.createElement(MappaTool));

  assert.ok(screen.getByRole("heading", { name: "Interactive map" }), "map pageTitle heading");
  assert.ok(screen.getByLabelText("Search the public directory"), "shared FiltersBar search (panel variant)");
  assert.ok(screen.getByLabelText("Camera type"), "shared FiltersBar kind filter");

  // Record card for the selected record (prototype seed, record A first).
  assert.ok(screen.getByRole("heading", { name: "Illustrative record A" }), "record card shows the selected record");

  // Map-task alternative links point at the tool routes, not the home anchors.
  const reportIssue = screen.getByRole("link", { name: /Report an issue/ });
  assert.equal(reportIssue.getAttribute("href"), "/correggi");
  const directoryLink = screen.getByRole("link", { name: "Go to the accessible directory" });
  assert.equal(directoryLink.getAttribute("href"), "/directory");
});

test("MappaTool kind filter narrows the markers and the record card", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(MappaTool));

  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");

  assert.ok(screen.getByRole("heading", { name: "Illustrative record A" }));
  assert.ok(screen.queryByRole("heading", { name: "Illustrative record B" }) === null);
  assert.match(screen.getByRole("status").textContent, /1 public record found/);
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
  assert.ok(screen.getByRole("heading", { name: "Illustrative record A" }), "clearing restores the records");
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
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(DirectoryTool));

  // F4 (useCameraFilters): the search input feels instant but commits to the
  // URL (and therefore filters) after the ~250ms debounce (R2 URL churn).
  await user.type(screen.getByLabelText("Search the public directory"), "Illustrative record B");
  await rtl.waitFor(() => assert.ok(screen.queryByRole("heading", { name: "Illustrative record A" }) === null));
  assert.ok(screen.getByRole("heading", { name: "Illustrative record B" }));

  // A new query replaces the old one; a no-match query yields the truthful
  // empty state.
  await user.clear(screen.getByLabelText("Search the public directory"));
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Illustrative record A" })));
  await user.type(screen.getByLabelText("Search the public directory"), "no-such-camera");
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "No published record matches that search." })));

  // Clearing the search commits immediately (no debounce dead air).
  await user.click(screen.getByRole("button", { name: /Clear search/ }));
  assert.ok(screen.getByRole("heading", { name: "Illustrative record A" }), "clearing restores the list");
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
