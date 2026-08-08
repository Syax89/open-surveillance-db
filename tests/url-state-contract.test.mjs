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
 *   5. ?q= debounce (~400ms): no URL write while typing, ONE
 *      history.replaceState commit after (never router.replace — t_3c4b188e
 *      removes the vinext RSC navigation failure mode), clearing commits
 *      immediately, replace({ scroll: false }) for explicit select edits /
 *      push only for navigation (R2 URL churn);
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
let exploreMapHref;
let exploreDirectoryHref;
let freshnessCutoffFor;
let applyCameraFilters;
let DirectoryTool;
let MappaTool;
let usePublicCameras;
let __resetPublicCamerasCache;

before(async () => {
  rtl = await setupDom();
  const filtersMod = await loadDomModule("app/lib/use-camera-filters.mjs");
  parseCameraFilters = filtersMod.parseCameraFilters;
  stringifyCameraFilters = filtersMod.stringifyCameraFilters;
  exploreMapHref = filtersMod.exploreMapHref;
  exploreDirectoryHref = filtersMod.exploreDirectoryHref;
  freshnessCutoffFor = filtersMod.freshnessCutoffFor;
  applyCameraFilters = filtersMod.applyCameraFilters;
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
  MappaTool = (await loadDomModule("app/components/tools/MappaTool.mjs")).MappaTool;
  const camerasMod = await loadDomModule("app/lib/use-public-cameras.mjs");
  usePublicCameras = camerasMod.usePublicCameras;
  __resetPublicCamerasCache = camerasMod.__resetPublicCamerasCache;
});

afterEach(() => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
  setNavState({ pushed: [], replaced: [], replaceCalls: [], failReplace: false, search: "", pathname: "/" });
});

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const makeCamera = (id, overrides = {}) => ({
  id,
  title: `Camera ${id}`,
  kind: "Dome",
  status: "active",
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
    q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", origin: "all", focus: null, page: 1,
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
    stringifyCameraFilters({ q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", origin: "all", focus: null, page: 1 }),
    "",
    "all-default filters serialize to no query string",
  );
  const encoded = stringifyCameraFilters({
    q: "Via Roma, 45", type: "Fixed dome", freshness: "7d", sort: "position", state: "all", origin: "all", focus: 3, page: 1,
  });
  assert.equal(encoded, "?q=Via+Roma%2C+45&type=Fixed+dome&freshness=7d&sort=position&focus=3");
  assert.deepEqual(parseCameraFilters(new URLSearchParams(encoded.slice(1))), {
    q: "Via Roma, 45", type: "Fixed dome", freshness: "7d", sort: "position", state: "all", origin: "all", focus: 3, page: 1,
  });
  // t_f13fcb1c: ?page= is a real dimension — >1 serializes, 1 is omitted.
  assert.equal(
    stringifyCameraFilters({ q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", origin: "all", focus: null, page: 2 }),
    "?page=2",
    "page 2 serializes to ?page=2",
  );
  assert.equal(parseCameraFilters(new URLSearchParams("page=2")).page, 2);
  assert.equal(parseCameraFilters(new URLSearchParams("page=0")).page, 1, "page 0 falls back to 1 (lenient parse)");
  assert.equal(parseCameraFilters(new URLSearchParams("page=abc")).page, 1, "non-numeric page falls back to 1");
});

test("explorer view switch preserves shared filters but clears view-only state", () => {
  const filters = parseCameraFilters(new URLSearchParams("q=Via+Roma&type=Bullet&freshness=30d&sort=recent&state=confirmed&origin=imported&focus=8&page=3"));
  const expectedQuery = "?q=Via+Roma&type=Bullet&freshness=30d&sort=recent&state=confirmed&origin=imported";
  assert.equal(exploreMapHref(filters), `/mappa${expectedQuery}`);
  assert.equal(exploreDirectoryHref(filters), `/directory${expectedQuery}`);
});

test("parseCameraFilters: confirmation-state dimension (?state=) parses and serializes (FASE 3 UI)", () => {
  // Default: "all" — absent from the URL, safe on invalid values.
  assert.equal(parseCameraFilters(new URLSearchParams("")).state, "all");
  assert.equal(parseCameraFilters(new URLSearchParams("state=sideways")).state, "all", "unknown state falls back to 'all'");
  assert.equal(parseCameraFilters(new URLSearchParams("state=confirmed")).state, "confirmed");
  assert.equal(parseCameraFilters(new URLSearchParams("state=never")).state, "never");
  // Serialization: default omitted, non-default written.
  assert.equal(
    stringifyCameraFilters({ q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", origin: "all", focus: null, page: 1 }),
    "",
    "state=all is the default and is omitted",
  );
  assert.equal(
    stringifyCameraFilters({ q: "", type: "all", freshness: "all", sort: "alphabetical", state: "never", origin: "all", focus: null, page: 1 }),
    "?state=never",
  );
  // Round-trip: parse(stringify(x)) === x.
  const encoded = stringifyCameraFilters({ q: "", type: "all", freshness: "all", sort: "useful", state: "confirmed", origin: "all", focus: null, page: 1 });
  assert.equal(encoded, "?sort=useful&state=confirmed");
  assert.deepEqual(parseCameraFilters(new URLSearchParams(encoded.slice(1))), {
    q: "", type: "all", freshness: "all", sort: "useful", state: "confirmed", origin: "all", focus: null, page: 1,
  });
});

test("parseCameraFilters: import-origin dimension (?origin=) parses and serializes (FASE C)", () => {
  // Default: "all" — absent from the URL, safe on invalid values.
  assert.equal(parseCameraFilters(new URLSearchParams("")).origin, "all");
  assert.equal(parseCameraFilters(new URLSearchParams("origin=sideways")).origin, "all", "unknown origin falls back to 'all'");
  assert.equal(parseCameraFilters(new URLSearchParams("origin=reports")).origin, "reports");
  assert.equal(parseCameraFilters(new URLSearchParams("origin=imported")).origin, "imported");
  // Serialization: default omitted, non-default written.
  assert.equal(
    stringifyCameraFilters({ q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", origin: "all", focus: null, page: 1 }),
    "",
    "origin=all is the default and is omitted",
  );
  assert.equal(
    stringifyCameraFilters({ q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", origin: "imported", focus: null, page: 1 }),
    "?origin=imported",
  );
  // Round-trip: parse(stringify(x)) === x.
  const encoded = stringifyCameraFilters({ q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", origin: "reports", focus: null, page: 1 });
  assert.equal(encoded, "?origin=reports");
  assert.deepEqual(parseCameraFilters(new URLSearchParams(encoded.slice(1))), {
    q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", origin: "reports", focus: null, page: 1,
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
    q: "", type: "Dome", freshness: "7d", sort: "alphabetical", state: "all", focus: null,
  }, now);
  assert.deepEqual(filtered.map((camera) => camera.title), ["Charlie", "Zulu"],
    "type + freshness combined, sorted alphabetically, legacy anchor falls back to updated");
  const positioned = applyCameraFilters(records, {
    q: "", type: "all", freshness: "all", sort: "position", state: "all", focus: null,
  }, now);
  // Fixture latitudes ascend with id (41.901 → 41.904): south→north.
  assert.deepEqual(positioned.map((camera) => camera.title), ["Zulu", "Alpha", "Bravo", "Charlie"],
    "position order sorts south→north by latitude");
});

test("applyCameraFilters: confirmation-state filter (?state=) and community sort (FASE 3 UI)", () => {
  const now = Date.parse("2026-08-01T00:00:00Z");
  const records = [
    makeCamera(1, { title: "Alpha", status: "active", lastVerifiedAt: "2026-07-30T00:00:00.000Z", confirmCount: 5, usefulCount: 12 }),
    makeCamera(2, { title: "Bravo", status: "active", lastVerifiedAt: null, confirmCount: 0, usefulCount: 3 }),
    makeCamera(3, { title: "Charlie", status: "active", lastVerifiedAt: "2026-05-01T00:00:00.000Z", confirmCount: 2, usefulCount: 8 }),
  ];
  // state=confirmed: only records with a confirmation anchor.
  const confirmed = applyCameraFilters(records, {
    q: "", type: "all", freshness: "all", sort: "alphabetical", state: "confirmed", focus: null,
  }, now);
  assert.deepEqual(confirmed.map((camera) => camera.title), ["Alpha", "Charlie"]);
  // state=never: only records without one.
  const never = applyCameraFilters(records, {
    q: "", type: "all", freshness: "all", sort: "alphabetical", state: "never", focus: null,
  }, now);
  assert.deepEqual(never.map((camera) => camera.title), ["Bravo"]);
  // state=all is a no-op.
  const all = applyCameraFilters(records, {
    q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", focus: null,
  }, now);
  assert.equal(all.length, 3);
  // sort=useful (ranking, ADR §10): most useful first.
  const useful = applyCameraFilters(records, {
    q: "", type: "all", freshness: "all", sort: "useful", state: "all", focus: null,
  }, now);
  assert.deepEqual(useful.map((camera) => camera.title), ["Alpha", "Charlie", "Bravo"]);
  // sort=recent: last confirmed first, never-confirmed sink to the bottom.
  const recent = applyCameraFilters(records, {
    q: "", type: "all", freshness: "all", sort: "recent", state: "all", focus: null,
  }, now);
  assert.deepEqual(recent.map((camera) => camera.title), ["Alpha", "Charlie", "Bravo"]);
  // sort=confirmations: confirmation volume first.
  const confirmations = applyCameraFilters(records, {
    q: "", type: "all", freshness: "all", sort: "confirmations", state: "all", focus: null,
  }, now);
  assert.deepEqual(confirmations.map((camera) => camera.title), ["Alpha", "Charlie", "Bravo"]);
});

test("applyCameraFilters: import-origin filter (?origin=) separates reports from imported rows (FASE C)", () => {
  const now = Date.parse("2026-08-01T00:00:00Z");
  const records = [
    makeCamera(1, { title: "Community A", source: "Community report" }),
    makeCamera(2, { title: "Imported Z", source: "import:fixture-zurigo-2026" }),
    makeCamera(3, { title: "Imported O", source: "import:fixture-osm-2026" }),
    makeCamera(4, { title: "Demo pin", status: "demo", source: "Development seed" }),
  ];
  const base = { q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", focus: null };
  const reports = applyCameraFilters(records, { ...base, origin: "reports" }, now);
  assert.deepEqual(reports.map((camera) => camera.title), ["Community A"], "origin=reports keeps only community reports");
  const imported = applyCameraFilters(records, { ...base, origin: "imported" }, now);
  assert.deepEqual(imported.map((camera) => camera.title).sort(), ["Imported O", "Imported Z"],
    "origin=imported keeps only rows whose source starts with 'import:'");
  // Demo seed matches neither origin — illustrative, not a community report.
  const all = applyCameraFilters(records, { ...base, origin: "all" }, now);
  assert.equal(all.length, 4, "origin=all is a no-op and keeps the demo pins");
});

test("applyCameraFilters P1-2: a real record with a non-parseable updated is KEPT under a freshness window (never silently dropped)", () => {
  const now = Date.parse("2026-08-01T00:00:00Z");
  // Legacy row: written before the ISO-only contract, `updated` carries the
  // old prose label and there is no lastVerifiedAt. The client gate must not
  // compute NaN and drop a verified record — it has no freshness signal, so
  // it stays visible (the descriptive text lives in the moderation note).
  const records = [
    makeCamera(1, { title: "Legacy verified", status: "active", lastVerifiedAt: null, updated: "Local moderation: rejected" }),
    makeCamera(2, { title: "Modern verified", status: "active", lastVerifiedAt: "2026-07-30T00:00:00.000Z" }),
  ];
  const filtered = applyCameraFilters(records, {
    q: "", type: "all", freshness: "7d", sort: "alphabetical", state: "all", focus: null,
  }, now);
  assert.deepEqual(filtered.map((camera) => camera.title), ["Legacy verified", "Modern verified"],
    "a non-parseable updated must not drop a real record; a fresh lastVerifiedAt anchors as usual");
});

test("applyCameraFilters P1-2: demo pins keep the truthful empty-note contract (excluded when they have no freshness date)", () => {
  const now = Date.parse("2026-08-01T00:00:00Z");
  // Development seed records carry the literal "Demo data" label by design:
  // they are illustrative and must never masquerade as "recently verified"
  // under a freshness window (t_b9666d09). The P1-2 keep-if-no-signal rule
  // applies to REAL records only.
  const records = [
    makeCamera(1, { title: "Illustrative record A", status: "demo", lastVerifiedAt: null, updated: "Demo data" }),
    makeCamera(2, { title: "Verified real", status: "active", lastVerifiedAt: "2026-07-30T00:00:00.000Z" }),
  ];
  const filtered = applyCameraFilters(records, {
    q: "", type: "all", freshness: "7d", sort: "alphabetical", state: "all", focus: null,
  }, now);
  assert.deepEqual(filtered.map((camera) => camera.title), ["Verified real"],
    "demo pins without a freshness date are excluded; real records are never dropped");
  const unfiltered = applyCameraFilters(records, {
    q: "", type: "all", freshness: "all", sort: "alphabetical", state: "all", focus: null,
  }, now);
  assert.deepEqual(unfiltered.map((camera) => camera.title), ["Illustrative record A", "Verified real"],
    "with freshness=all the demo pins render as usual");
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
  await setNavState({ search: "" });
  view.rerender(await wrapWithLocale(React.createElement(DirectoryTool)));
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Dome camera 1" })));
  assert.ok(screen.getByRole("heading", { name: "Bullet camera 2" }));
});

test("origin filter (?origin=, FASE C): the select narrows the directory to imported rows or community reports", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  const mixed = [
    makeCamera(1, { kind: "Dome", title: "Community dome", source: "Community report" }),
    makeCamera(2, { kind: "Bullet", title: "Imported bullet", source: "import:fixture-zurigo-2026" }),
    makeCamera(3, { kind: "Dome", title: "Imported dome", source: "import:fixture-osm-2026" }),
  ];
  installFetchMock(() => jsonResponse({ records: mixed, total: mixed.length, nextOffset: null }));
  await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Community dome" })));

  // The shared control row exposes the localized origin select.
  const origin = screen.getByLabelText("Origin");
  assert.equal(origin.value, "all");

  // Imported only: the two imported rows stay, the community report goes.
  await user.selectOptions(origin, "imported");
  await rtl.waitFor(() => assert.ok(screen.queryByRole("heading", { name: "Community dome" }) === null));
  assert.ok(screen.getByRole("heading", { name: "Imported bullet" }));
  assert.ok(screen.getByRole("heading", { name: "Imported dome" }));

  // Reports only: the community report comes back, imports go.
  await user.selectOptions(screen.getByLabelText("Origin"), "reports");
  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Community dome" })));
  assert.ok(screen.queryByRole("heading", { name: "Imported bullet" }) === null);
  assert.ok(screen.queryByRole("heading", { name: "Imported dome" }) === null);
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

test("?q= is debounced: no URL write while typing, ONE history.replaceState commit after the debounce (never router.replace) — and the mirror drives the list", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installApiMock();
  await renderWithLocale(React.createElement(DirectoryTool));
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Dome camera 1" })));

  const historyReplaceCalls = [];
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data, unused, url) => {
    historyReplaceCalls.push(String(url));
    originalReplaceState(data, unused, url);
  };
  try {
    await user.type(screen.getByLabelText("Search the public directory"), "Bullet");
    const during = await getNavState();
    assert.equal(during.replaced.length, 0, "no router.replace inside the debounce window");
    assert.equal(during.pushed.length, 0, "a filter edit must never push");

    // t_3c4b188e: the ?q= commit is a PURE history.replaceState — no RSC
    // navigation, so the vinext digest error / remount cannot fire. The
    // committed mirror drives the filtering: the list narrows after the
    // debounce even though the router was never involved.
    await waitFor(() => assert.ok(screen.queryByRole("heading", { name: "Dome camera 1" }) === null), { timeout: 5000 });
    assert.ok(screen.getByRole("heading", { name: "Bullet camera 2" }), "the mirror re-filtered the list to the matching record");

    const after = await getNavState();
    assert.equal(after.replaced.length, 0, "the keyboard ?q= commit never calls router.replace");
    assert.equal(historyReplaceCalls.length, 1, "exactly one committed history.replaceState after the debounce");
    assert.match(historyReplaceCalls[0], /q=Bullet/);
    assert.equal(after.pushed.length, 0);
  } finally {
    window.history.replaceState = originalReplaceState;
  }
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

  const historyReplaceCalls = [];
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data, unused, url) => {
    historyReplaceCalls.push(String(url));
    originalReplaceState(data, unused, url);
  };
  try {
    await user.type(screen.getByLabelText("Search the public directory"), "camera");
    await rtl.waitFor(() => assert.ok(historyReplaceCalls.length >= 1), { timeout: 5000 });

    await user.clear(screen.getByLabelText("Search the public directory"));
    // Clearing commits immediately (no debounce wait), through the same
    // pure-history path — the committed URL must drop q. The commit lands
    // on a React effect tick, so poll with waitFor like the type above
    // (CI coverage runs are timing-sensitive — t_c8dc3281).
    await rtl.waitFor(() => {
      assert.ok(historyReplaceCalls.length >= 2, "clearing writes the URL immediately (no debounce wait)");
      assert.equal(new URLSearchParams(historyReplaceCalls.at(-1).split("?")[1] ?? "").get("q"), null, "cleared q is dropped from the URL");
    }, { timeout: 5000 });

    await user.click(screen.getByRole("button", { name: /Reset filters/ }));
    // Reset is an EXPLICIT action → router.replace (the R2 churn guard may
    // skip it: the clear already committed the bare URL). Either way the
    // URL ends with no filter dimension.
    const nav = await getNavState();
    const lastWrite = historyReplaceCalls.at(-1) ?? nav.replaced.at(-1);
    assert.ok(!String(lastWrite).includes("?"), "reset removes every filter dimension (bare pathname)");
  } finally {
    window.history.replaceState = originalReplaceState;
  }
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
    assert.equal(url.searchParams.get("limit"), "2000");
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

  // The sidebar list is the keyboard/text equivalent of the map: a ?focus=
  // deep link lands with the focused record selected (aria-current on its
  // row, t_702c10af), and the marker selection follows the same onSelect
  // path as a click — the map card is gone, replaced by the list.
  await rtl.waitFor(() => assert.equal(
    screen.getByRole("button", { name: /Bullet camera 2/ }).getAttribute("aria-current"),
    "true",
  ));
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

// ---------------------------------------------------------------------------
// 7. geocode autocomplete resilience (t_b1e192e1 + t_3c4b188e)
// ---------------------------------------------------------------------------
//
// The deployed environment logged a vinext RSC navigation error on every
// /mappa keystroke ("Cannot read properties of undefined (reading
// 'digest')" from router.replace in applyFilters); vinext's navigation
// controller reacted with a full reload / tree invalidation that unmounts
// GeocodeSearch and closed the suggestion dropdown right after it opened.
// t_3c4b188e removes the ROOT CAUSE: the keyboard ?q= commit never calls
// router.replace — applyFilters writes the URL with a PURE
// window.history.replaceState (no RSC navigation → no digest error → no
// remount). Two defences remain valuable:
//
//   1. GeocodeSearch keeps the debounce timer + AbortController at MODULE
//      level (keyed by input id): a remount from ANY other source during
//      the debounce window no longer cancels the pending query — the fetch
//      fires anyway.
//   2. the explicit-write path (selects/reset) keeps the hardened
//      router.replace (no-op guard + try/catch → silent history.replaceState
//      fallback), so a throwing navigation commits without an RSC
//      round-trip or reload.
//
// Both are regression-tested below against the harness's simulated
// environment (throwing router + forced remount).

/** Combined mock: /api/cameras (records) + /api/geocode (recorded calls). */
function installMappaMock(geocodeCalls = []) {
  installFetchMock((input) => {
    const url = new URL(String(input), "https://osdb.test");
    if (url.pathname === "/api/geocode") {
      geocodeCalls.push(url.searchParams.get("q") ?? "");
      return jsonResponse({ results: [] });
    }
    if (url.pathname !== "/api/cameras") return jsonResponse({ records: [], total: 0, nextOffset: null });
    return jsonResponse({ records: apiCameras, total: apiCameras.length, nextOffset: null });
  });
  return geocodeCalls;
}

test("t_b1e192e1: typing in GeocodeSearch fires /api/geocode even under a forced remount inside the debounce window", async () => {
  const geocodeCalls = [];
  installMappaMock(geocodeCalls);
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  // Deterministic start (t_b9666d09): the whole-world viewport.
  const leaflet = await loadDomModule("node_modules/leaflet/index.mjs");
  leaflet.__resetMarkers();
  const view = await renderWithLocale(React.createElement(MappaTool));

  const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
  // A single keystroke schedules the 250ms debounce...
  await user.type(input, "B");
  // ...and the tree is invalidated immediately (the vinext RSC navigation
  // failure mode): a key change forces React to unmount MappaTool and mount
  // a fresh instance before the timer can fire. The module-level timer must
  // survive the unmount and still emit the fetch.
  view.rerender(await wrapWithLocale(React.createElement(MappaTool, { key: "remounted" })));

  await waitFor(() => assert.ok(geocodeCalls.length >= 1, "the /api/geocode fetch fires despite the remount"), { timeout: 5000 });
  assert.equal(geocodeCalls[0], "B", "the debounced query reaches the proxy");
});

test("t_3c4b188e: typing under a hostile router (failReplace) — the ?q= still commits via pure history.replaceState and /api/geocode fires", async () => {
  const geocodeCalls = [];
  installMappaMock(geocodeCalls);
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const leaflet = await loadDomModule("node_modules/leaflet/index.mjs");
  leaflet.__resetMarkers();

  // Spy on the silent-commit fallback (jsdom implements the History API).
  const historyReplaceCalls = [];
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data, unused, url) => {
    historyReplaceCalls.push(String(url));
    originalReplaceState(data, unused, url);
  };
  try {
    // Simulate the deployed vinext: the RSC navigation throws on replace.
    await setNavState({ failReplace: true, pathname: "/mappa" });

    await renderWithLocale(React.createElement(MappaTool));
    const input = screen.getByRole("combobox", { name: /Filter the points in the current view or search a place/ });
    await user.type(input, "Ferrara");

    // t_3c4b188e: the ?q= commit never calls router.replace at all — the
    // pure history.replaceState path is the ONLY URL write while typing, so
    // the deployed vinext RSC navigation error cannot fire even with a
    // hostile router (failReplace). The geocode autocomplete fires at 250ms,
    // BEFORE the 400ms ?q= commit — the CEO's exact symptom was the
    // dropdown never having time to appear.
    await waitFor(() => assert.ok(geocodeCalls.length >= 1, "the /api/geocode fetch still fires (the tree was not torn down)"), { timeout: 5000 });
    await waitFor(() => assert.ok(historyReplaceCalls.some((href) => href.includes("q=Ferrara")), "the ?q= commits via the pure history.replaceState path"), { timeout: 5000 });
    const nav = await getNavState();
    assert.equal(nav.replaced.length, 0, "router.replace was never attempted for the keyboard ?q= write");
    assert.ok(geocodeCalls.some((q) => q === "Ferrara"), "the typed query reaches the proxy");
    assert.equal(input.value, "Ferrara", "the input keeps the typed text");
  } finally {
    window.history.replaceState = originalReplaceState;
  }
});
