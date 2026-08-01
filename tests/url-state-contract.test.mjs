/**
 * F4 URL-state contract tests (kanban t_522638a5, docs/FRONTEND_PLAN.md
 * §5.3, parere QA t_8bc7f4e2 punto 1 — "contratto URL PRIMA").
 *
 * The five filter dimensions (q, type, freshness, sort, focus) live in the
 * URL and are the SINGLE source of truth for /mappa and /directory
 * (useCameraFilters, D4). This suite is the contract Grace asked for:
 *
 *   1. parse/stringify: defaults, encoding round-trips, minimal serialization;
 *   2. invalid values → safe fallbacks, NEVER a 500 (lenient parse, page
 *      still renders on garbage query strings);
 *   3. deep-link populates AND applies the filters (demo seed + API data);
 *   4. back/forward preserves state: the URL re-derives the filters on
 *      every navigation (the stub's push/replace model Next's router);
 *   5. ?q= debounce (~250ms): no URL write while typing, ONE replace after,
 *      clearing commits immediately, scroll:false on every filter edit,
 *      replace for filters / push only for navigation (R2 URL churn);
 *   6. server-side filters (F0): kind/freshness forwarded to the API on
 *      EVERY page of the pagination walk (combined filters + pagination);
 *   7. aria-live result counter announces the stabilized result;
 *   8. focus management: /mappa?focus=ID preselects the record;
 *      /directory "Show on map" pushes /mappa with the active filters;
 *   9. noindex guard on /segnala and /correggi (F1, static contract).
 *
 * The API mock simulates the F0 server-side filters (kind exact match,
 * freshness on lastVerifiedAt) so the client memo and the server agree.
 * Fixtures are fictitious (made-up titles, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, setNavState, getNavState, React,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let rtl;
let parseCameraFilters;
let stringifyCameraFilters;
let freshnessCutoffFor;
let applyCameraFilters;
let QUERY_DEBOUNCE_MS;
let DirectoryTool;
let MappaTool;
let usePublicCameras;
let __resetPublicCamerasCache;

before(async () => {
  rtl = await setupDom();
  const filtersMod = await loadDomModule("app/lib/use-camera-filters.mjs");
  parseCameraFilters = filtersMod.parseCameraFilters;
  stringifyCameraFilters = filtersMod.stringifyCameraFilters;
  freshnessCutoffFor = filtersMod.freshnessCutoffFor;
  applyCameraFilters = filtersMod.applyCameraFilters;
  QUERY_DEBOUNCE_MS = filtersMod.QUERY_DEBOUNCE_MS;
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
  MappaTool = (await loadDomModule("app/components/tools/MappaTool.mjs")).MappaTool;
  const camerasMod = await loadDomModule("app/lib/use-public-cameras.mjs");
  usePublicCameras = camerasMod.usePublicCameras;
  __resetPublicCamerasCache = camerasMod.__resetPublicCamerasCache;
});

afterEach(() => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
  setNavState({ pushed: [], replaced: [], replaceCalls: [], search: "", pathname: "/" });
});

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const makeCamera = (id, overrides = {}) => ({
  id,
  title: `Camera ${id}`,
  kind: "Dome",
  status: "verified",
  latitude: 41.9 + id / 1000,
  longitude: 12.49,
  source: "Community report",
  updated: "2026-01-01T00:00:00.000Z",
  description: "Fictitious record used only in tests.",
  address: "Illustrative location, Rome",
  lastVerifiedAt: "2026-07-30T00:00:00.000Z",
  ...overrides,
});

// Two recent records (inside any freshness window) + one old (outside 90d).
const apiCameras = [
  makeCamera(1, { kind: "Dome", title: "Dome camera 1" }),
  makeCamera(2, { kind: "Bullet", title: "Bullet camera 2", lastVerifiedAt: "2026-07-29T00:00:00.000Z" }),
  makeCamera(3, { kind: "Dome", title: "Dome camera 3", lastVerifiedAt: "2026-05-01T00:00:00.000Z" }),
];

/** F0 server-side filter mock: kind (exact) + freshness (on lastVerifiedAt). */
function installApiMock(calls = []) {
  installFetchMock((input) => {
    const url = new URL(String(input), "https://osdb.test");
    if (url.pathname !== "/api/cameras") return jsonResponse({ records: [], total: 0, nextOffset: null });
    calls.push(url);
    let records = apiCameras;
    const kind = url.searchParams.get("kind");
    if (kind) records = records.filter((camera) => camera.kind === kind);
    const freshness = url.searchParams.get("freshness");
    if (freshness && freshness !== "all") {
      const cutoff = Date.now() - Number.parseInt(freshness, 10) * 24 * 60 * 60 * 1000;
      records = records.filter((camera) => new Date(camera.lastVerifiedAt).getTime() >= cutoff);
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 500);
    const page = records.slice(offset, offset + limit);
    return jsonResponse({ records: page, total: records.length, nextOffset: offset + page.length < records.length ? offset + page.length : null });
  });
  return calls;
}

/** Minimal consumer of the filtered walk (pagination contract probe). */
function PaginationProbe({ filters }) {
  const { records, total } = usePublicCameras({ seed: [], filters });
  return React.createElement("div", null,
    React.createElement("span", { "data-testid": "probe-count" }, String(records.length)),
    React.createElement("span", { "data-testid": "probe-total" }, String(total ?? "")),
  );
}

// ---------------------------------------------------------------------------
// 1. parse / stringify contract (pure)
// ---------------------------------------------------------------------------

test("parseCameraFilters: an empty URL yields the safe defaults", () => {
  assert.deepEqual(parseCameraFilters(new URLSearchParams("")), {
    q: "", type: "all", freshness: "all", sort: "alphabetical", focus: null,
  });
});

test("parseCameraFilters: invalid values fall back to safe defaults — never a 500", () => {
  const filters = parseCameraFilters(new URLSearchParams("freshness=99d&sort=sideways&focus=abc"));
  assert.equal(filters.freshness, "all", "unknown freshness window falls back to 'all'");
  assert.equal(filters.sort, "alphabetical", "unknown sort falls back to 'alphabetical'");
  assert.equal(filters.focus, null, "non-numeric focus is ignored");
  // focus edge cases: zero, negative, fractional, huge.
  assert.equal(parseCameraFilters(new URLSearchParams("focus=0")).focus, null);
  assert.equal(parseCameraFilters(new URLSearchParams("focus=-3")).focus, null);
  assert.equal(parseCameraFilters(new URLSearchParams("focus=1.5")).focus, null);
  assert.equal(parseCameraFilters(new URLSearchParams("focus=42")).focus, 42);
});

test("stringifyCameraFilters omits defaults (minimal URL, R2) and round-trips encoding", () => {
  assert.equal(
    stringifyCameraFilters({ q: "", type: "all", freshness: "all", sort: "alphabetical", focus: null }),
    "",
    "all-default filters serialize to no query string",
  );
  const encoded = stringifyCameraFilters({
    q: "Via Roma, 45", type: "Fixed dome", freshness: "7d", sort: "position", focus: 3,
  });
  assert.equal(encoded, "?q=Via+Roma%2C+45&type=Fixed+dome&freshness=7d&sort=position&focus=3");
  assert.deepEqual(parseCameraFilters(new URLSearchParams(encoded.slice(1))), {
    q: "Via Roma, 45", type: "Fixed dome", freshness: "7d", sort: "position", focus: 3,
  });
});

test("freshnessCutoffFor derives the cutoff from the window (never separate state)", () => {
  const now = Date.parse("2026-08-01T00:00:00Z");
  assert.equal(freshnessCutoffFor("all", now), null);
  assert.equal(freshnessCutoffFor("7d", now), now - 7 * 24 * 60 * 60 * 1000);
  assert.equal(freshnessCutoffFor("30d", now), now - 30 * 24 * 60 * 60 * 1000);
  assert.equal(freshnessCutoffFor("90d", now), now - 90 * 24 * 60 * 60 * 1000);
});

test("applyCameraFilters: combined filters + sort, freshness anchored on lastVerifiedAt ?? updated", () => {
  const now = Date.parse("2026-08-01T00:00:00Z");
  const records = [
    makeCamera(1, { title: "Zulu", kind: "Dome", lastVerifiedAt: "2026-07-30T00:00:00.000Z" }),
    makeCamera(2, { title: "Alpha", kind: "Dome", lastVerifiedAt: "2026-05-01T00:00:00.000Z" }),
    makeCamera(3, { title: "Bravo", kind: "Bullet", lastVerifiedAt: "2026-07-29T00:00:00.000Z" }),
    // No lastVerifiedAt: falls back to `updated` (legacy/demo anchor).
    makeCamera(4, { title: "Charlie", kind: "Dome", lastVerifiedAt: null, updated: "2026-07-28T00:00:00.000Z" }),
  ];
  const filtered = applyCameraFilters(records, {
    q: "", type: "Dome", freshness: "7d", sort: "alphabetical", focus: null,
  }, now);
  assert.deepEqual(filtered.map((camera) => camera.title), ["Charlie", "Zulu"],
    "type + freshness combined, sorted alphabetically, legacy anchor falls back to updated");
  const positioned = applyCameraFilters(records, {
    q: "", type: "all", freshness: "all", sort: "position", focus: null,
  }, now);
  // Fixture latitudes ascend with id (41.901 → 41.904): south→north.
  assert.deepEqual(positioned.map((camera) => camera.title), ["Zulu", "Alpha", "Bravo", "Charlie"],
    "position order sorts south→north by latitude");
});

// ---------------------------------------------------------------------------
// 2. deep link / back-forward / invalid URL (DOM)
// ---------------------------------------------------------------------------

test("deep link populates AND applies the filters (server-side kind on the API data)", async () => {
  setNavState({ search: "type=Bullet" });
  const { screen } = rtl;
  installApiMock();
  await renderWithLocale(React.createElement(DirectoryTool));

  // ?type=Bullet → the API answers only Bullet records (server-side filter);
  // the client memo agrees, so only the Bullet record is rendered.
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Bullet camera 2" })));
  assert.ok(screen.queryByRole("heading", { name: "Dome camera 1" }) === null);
  assert.ok(screen.queryByRole("heading", { name: "Dome camera 3" }) === null);
});

test("back/forward preserves state: the URL re-derives the filters on every navigation", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  installApiMock();
  const view = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Dome camera 1" })));

  // Forward: a filter edit writes the URL via replace (no history entry).
  await user.selectOptions(screen.getByLabelText("Camera type"), "Bullet");
  await rtl.waitFor(() => assert.ok(screen.queryByRole("heading", { name: "Dome camera 1" }) === null));

  // Back: the browser restores the previous URL → the hook re-derives from
  // it (no local state to desync), and the shared walk refetches the full
  // list (the filtered walk never seeded the module cache).
  setNavState({ search: "" });
  view.rerender(await wrapWithLocale(React.createElement(DirectoryTool)));
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Dome camera 1" })));
  assert.ok(screen.getByRole("heading", { name: "Bullet camera 2" }));
});

test("invalid query values render with safe fallbacks — the page never 500s", async () => {
  setNavState({ search: "freshness=99d&sort=sideways&focus=abc&type=%E2%82%AC" });
  const { screen } = rtl;
  installApiMock();
  await renderWithLocale(React.createElement(DirectoryTool));

  assert.ok(screen.getByRole("heading", { name: "Public directory" }), "the page renders");
  assert.equal(screen.getByLabelText("Record freshness").value, "all", "invalid freshness falls back to 'all'");
  assert.equal(screen.getByLabelText("Order records").value, "alphabetical", "invalid sort falls back to 'alphabetical'");
});

// ---------------------------------------------------------------------------
// 3. write contract: debounce, replace-vs-push, scroll:false (R2)
// ---------------------------------------------------------------------------

test("?q= is debounced: no URL write while typing, ONE replace after the debounce", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  installApiMock();
  await renderWithLocale(React.createElement(DirectoryTool));

  await user.type(screen.getByLabelText("Search the public directory"), "a");
  const during = await getNavState();
  assert.equal(during.replaced.length, 0, "no URL write inside the debounce window");
  assert.equal(during.pushed.length, 0, "a filter edit must never push");

  await new Promise((resolve) => setTimeout(resolve, QUERY_DEBOUNCE_MS + 100));
  const after = await getNavState();
  assert.equal(after.replaced.length, 1, "exactly one committed write after the debounce");
  assert.equal(after.replaceCalls.length, 1);
  assert.deepEqual(after.replaceCalls[0].opts, { scroll: false }, "filter edits use replace({ scroll: false })");
  assert.match(after.replaced[0], /q=a/);
  assert.equal(after.pushed.length, 0);
});

test("every select filter edit is a replace({ scroll: false }), never a push", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  installApiMock();
  await renderWithLocale(React.createElement(DirectoryTool));

  // Wait for the API data so the kind select offers the real kinds
  // (the first paint shows the demo seed: Fixed dome / Traffic monitoring).
  await rtl.waitFor(() => {
    const select = screen.getByLabelText("Camera type");
    assert.ok(Array.from(select.options).some((option) => option.value === "Bullet"));
  });

  await user.selectOptions(screen.getByLabelText("Camera type"), "Bullet");
  await user.selectOptions(screen.getByLabelText("Record freshness"), "7d");
  await user.selectOptions(screen.getByLabelText("Order records"), "position");

  const nav = await getNavState();
  assert.equal(nav.pushed.length, 0, "filters never push (no history spam)");
  assert.equal(nav.replaced.length, 3, "three filter edits → three replaces");
  assert.equal(nav.replaceCalls.every((call) => call.opts && call.opts.scroll === false), true);
  assert.match(nav.replaced[0], /type=Bullet/);
  assert.match(nav.replaced[1], /freshness=7d/);
  assert.match(nav.replaced[2], /sort=position/);
});

test("clearing the search commits immediately (no debounce dead air) and reset clears every dimension", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  installApiMock();
  await renderWithLocale(React.createElement(DirectoryTool));

  await user.type(screen.getByLabelText("Search the public directory"), "camera");
  await rtl.waitFor(async () => assert.ok((await getNavState()).replaced.length >= 1));

  await user.clear(screen.getByLabelText("Search the public directory"));
  const nav = await getNavState();
  assert.ok(nav.replaced.length >= 2, "clearing writes the URL immediately (no debounce wait)");
  assert.equal(new URLSearchParams(nav.replaced.at(-1).split("?")[1] ?? "").get("q"), null, "cleared q is dropped from the URL");

  await user.click(screen.getByRole("button", { name: /Reset filters/ }));
  const reset = await getNavState();
  const lastHref = reset.replaced.at(-1);
  assert.ok(!lastHref.includes("?"), "reset removes every filter dimension (bare pathname)");
});

// ---------------------------------------------------------------------------
// 4. server-side filters + pagination walk (F0)
// ---------------------------------------------------------------------------

test("combined kind+freshness filters are forwarded to the API on EVERY page of the pagination walk", async () => {
  const calls = [];
  const pageOne = Array.from({ length: 25 }, (_, i) => makeCamera(50 - i, { kind: "Bullet" }));
  const pageTwo = Array.from({ length: 25 }, (_, i) => makeCamera(25 - i, { kind: "Bullet" }));
  installFetchMock((input) => {
    const url = new URL(String(input), "https://osdb.test");
    if (url.pathname !== "/api/cameras") return jsonResponse({ records: [], total: 0, nextOffset: null });
    calls.push(url);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const page = offset === 0
      ? { records: pageOne, total: 50, nextOffset: 25 }
      : offset === 25 ? { records: pageTwo, total: 50, nextOffset: null } : { records: [], total: 50, nextOffset: null };
    return jsonResponse(page);
  });

  const { screen } = rtl;
  await renderWithLocale(React.createElement(PaginationProbe, { filters: { kind: "Bullet", freshness: "7d" } }));

  await rtl.waitFor(() => assert.equal(screen.getByTestId("probe-count").textContent, "50"));
  assert.equal(screen.getByTestId("probe-total").textContent, "50", "total comes from the server, never a first-page count");
  assert.equal(calls.length, 2, "the walk follows nextOffset across pages");
  for (const url of calls) {
    assert.equal(url.searchParams.get("kind"), "Bullet", "kind forwarded on every page");
    assert.equal(url.searchParams.get("freshness"), "7d", "freshness forwarded on every page");
    assert.equal(url.searchParams.get("limit"), "500");
  }
  assert.equal(calls[0].searchParams.get("offset"), "0");
  assert.equal(calls[1].searchParams.get("offset"), "25");
});

// ---------------------------------------------------------------------------
// 5. aria-live counter + focus management
// ---------------------------------------------------------------------------

test("aria-live result counter announces the stabilized result after a filter change", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  installApiMock();
  await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Dome camera 1" })));

  await user.selectOptions(screen.getByLabelText("Camera type"), "Bullet");
  await rtl.waitFor(() => {
    const counter = screen.getAllByRole("status").find((element) => /public record/.test(element.textContent ?? ""));
    assert.ok(counter, "the result counter (role=status) is present");
    assert.match(counter.textContent, /1 public record found/);
  });
});

test("/mappa?focus=ID preselects the record (focus management, FRONTEND_DESIGN §6.2)", async () => {
  setNavState({ search: "focus=2" });
  const { screen } = rtl;
  installApiMock();
  await renderWithLocale(React.createElement(MappaTool));

  // The map card (aria-live) shows the focused record once the API resolves;
  // ?focus= is read from the URL, so a deep link lands on the right record.
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Bullet camera 2" })));
});

test("DirectoryTool 'Show on map' pushes /mappa with the ACTIVE filters and the focus id (push, not replace)", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  installApiMock();
  await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Dome camera 1" })));

  await user.selectOptions(screen.getByLabelText("Camera type"), "Bullet");
  await user.click(screen.getAllByRole("button", { name: /^Show on map/ })[0]);

  const nav = await getNavState();
  assert.equal(nav.replaced.length, 1, "the filter edit used replace");
  assert.equal(nav.pushed.length, 1, "navigation uses push");
  assert.equal(nav.pushed[0], "/mappa?type=Bullet&focus=2", "the map opens with the same filters and the record preselected");
});

// ---------------------------------------------------------------------------
// 6. noindex guard (F1; static contract, F4)
// ---------------------------------------------------------------------------

test("noindex contract: /segnala and /correggi stay noindex (F1, guardia F4)", () => {
  for (const file of ["app/(tools)/segnala/page.tsx", "app/(tools)/correggi/page.tsx"]) {
    const source = readFileSync(path.join(root, file), "utf8");
    assert.match(
      source,
      /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/,
      `${file} must emit robots noindex (form pages are never indexed)`,
    );
  }
  // /directory is the only tool page with real SEO value: it must NOT noindex.
  const directorySource = readFileSync(path.join(root, "app/(tools)/directory/page.tsx"), "utf8");
  assert.ok(!/index:\s*false/.test(directorySource), "/directory stays indexable");
});
