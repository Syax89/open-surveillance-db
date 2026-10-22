/**
 * FRONTEND-4 regression (P2 audit 2026-10-22) — the /directory result count
 * must announce the LOADING state, never a false "0 public records found",
 * while the first data fetch is still in flight.
 *
 * The bug: DirectoryCatalog's countLabel (app/components/tools/DirectoryCatalog.tsx)
 * had no loading branch, so during the initial fetch it fell through to the
 * count fallback:
 *   - cursor mode (default sort=alphabetical, usePublicCamerasPage): the
 *     server total is `null` until the first page answers → `?? filteredRecords.length`
 *     → 0 → "0 public records found" while the list region already showed the
 *     truthful "Loading the directory…" note;
 *   - legacy walk mode (other sorts, usePublicCameras): records are [] until
 *     the walk settles → the same false zero.
 * The count is a role="status" region (aria-describedby target of the search
 * input), so AT users were told the directory was empty on every load.
 *
 * The fix contract pinned here (minimal, no redesign):
 *   - while loading AND no known server total → the existing `t.loading` string;
 *   - a KNOWN total keeps its count even while loading (0 and 1 included):
 *     "0 public records found" is legitimate only once the fetch has completed;
 *   - the legacy loaded-array count and the completed true-zero state are
 *     unchanged;
 *   - loadError still wins, and a completed place search
 *     (success / empty / not-found) still wins over the loading note.
 *
 * Client layer only, existing patterns (dom-harness + the REAL DirectoryTool /
 * DirectoryCatalog): jsdom, @testing-library, deterministic fetch mock. The
 * fetch mock is CONTROLLABLE (a deferred promise gated by release()) so the
 * initial loading state is observable deterministically instead of being
 * inferred from real-timer races. Fixtures are fictional demo records — no
 * personal data.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  React,
  installFetchMock,
  jsonResponse,
  loadDomModule,
  renderWithLocale,
  setUrlState,
  setupDom,
} from "./helpers/dom-harness.mjs";

// Fictional fixtures (privacy & safety by design: no real personal data).
const THREE = [
  { id: 1, title: "Alpha fixture", kind: "Fixed dome", status: "active", latitude: 41.9, longitude: 12.49, source: "Community report", updated: "2026-07-01", description: "Illustrative fixture record.", address: "Via Test 1" },
  { id: 2, title: "Beta fixture", kind: "Bullet", status: "active", latitude: 41.91, longitude: 12.5, source: "Community report", updated: "2026-07-01", description: "Illustrative fixture record.", address: "Via Test 2" },
  { id: 3, title: "Gamma fixture", kind: "PTZ", status: "active", latitude: 41.92, longitude: 12.51, source: "Community report", updated: "2026-07-01", description: "Illustrative fixture record.", address: "Via Test 3" },
];

const EN_LOADING = "Loading the directory…";
const IT_LOADING = "Caricamento dell'elenco…";

let rtl;
let DirectoryTool;
let DirectoryCatalog;
let __resetPublicCamerasCache;

test.before(async () => {
  rtl = await setupDom();
  __resetPublicCamerasCache = (await loadDomModule("app/lib/use-public-cameras.mjs")).__resetPublicCamerasCache;
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
  DirectoryCatalog = (await loadDomModule("app/components/tools/DirectoryCatalog.mjs")).DirectoryCatalog;
});

test.afterEach(async () => {
  rtl.cleanup();
  __resetPublicCamerasCache();
  window.localStorage.clear();
  const nav = await loadDomModule("node_modules/next/navigation.mjs");
  nav.__setNavState({ url: "/", pushed: [], replaced: [], replaceCalls: [] });
});

const counter = (container) => container.querySelector("#record-search-count");
const text = (element) => (element?.textContent ?? "").trim();

/**
 * Install a fetch mock whose /api/cameras LIST request stays PENDING until
 * the returned release() is called. This is the only deterministic way to
 * observe the initial loading state: the mocked API otherwise answers before
 * any assertion can run. Facets and the place-search proxy are answered
 * immediately (facets: empty; place search: `placeHandler`, default 404).
 */
function installPendingCamerasFetch(respond, placeHandler) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  installFetchMock((input) => {
    const url = String(input);
    if (url.startsWith("/api/cameras/search")) {
      return placeHandler ? placeHandler(url) : jsonResponse({ error: "not found" }, { status: 404 });
    }
    if (url.includes("facets=")) return jsonResponse({ facets: { kinds: [] } });
    if (url.startsWith("/api/cameras?")) return gate.then(() => respond(url));
    return jsonResponse({ error: "not found" }, { status: 404 });
  });
  return () => release();
}

const listPayload = (records, total = records.length) =>
  jsonResponse({ records, total, nextOffset: null });

/** Render the REAL DirectoryTool and flush the immediately-answered facet
 * request inside act (the mock resolves it synchronously, so its state
 * update must not land outside an act() window). */
async function renderTool() {
  const view = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.act(async () => {});
  return view;
}

// ---------------------------------------------------------------------------
// Real DirectoryTool — cursor mode (default sort=alphabetical)
// ---------------------------------------------------------------------------

test("cursor mode: the count announces LOADING (never '0 public records found') until the first page settles, then the server total", async () => {
  await setUrlState("/directory");
  const release = installPendingCamerasFetch(() => listPayload(THREE));

  const { container } = await renderTool();

  // The first cursor page is in flight: the count must NOT claim zero.
  assert.equal(text(counter(container)), EN_LOADING, "the count region announces the loading state");
  assert.doesNotMatch(text(counter(container)), /0 public records found/, "a pending fetch must never read as an empty dataset");

  // Settled: the count reports the server total of the filtered set.
  await rtl.act(async () => { release(); });
  await rtl.waitFor(() => assert.equal(text(counter(container)), "3 public records found"), { timeout: 5000 });
});

test("cursor mode (IT): the loading note is the Italian bundle string, then the settled count", async () => {
  window.localStorage.setItem("opensurveillancedb-locale", "it");
  await setUrlState("/directory");
  const release = installPendingCamerasFetch(() => listPayload(THREE));

  const { container } = await renderTool();

  assert.equal(text(counter(container)), IT_LOADING, "the count reuses the existing IT loading string");
  assert.doesNotMatch(text(counter(container)), /0 record pubblici trovati/);

  await rtl.act(async () => { release(); });
  await rtl.waitFor(() => assert.equal(text(counter(container)), "3 record pubblici trovati"), { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Real DirectoryTool — legacy walk mode (no cursor pagination)
// ---------------------------------------------------------------------------

test("legacy walk mode (?sort=position): the count announces LOADING until the walk settles, then the walked count", async () => {
  await setUrlState("/directory?sort=position");
  const release = installPendingCamerasFetch(() => listPayload([THREE[0], THREE[1]]));

  const { container } = await renderTool();

  assert.equal(text(counter(container)), EN_LOADING, "legacy mode must not announce 0 records while the walk is in flight");
  assert.doesNotMatch(text(counter(container)), /0 public records found/);

  await rtl.act(async () => { release(); });
  await rtl.waitFor(() => assert.equal(text(counter(container)), "2 public records found"), { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Real DirectoryTool — completed states keep their truthful counts
// ---------------------------------------------------------------------------

test("cursor mode: a COMPLETED empty dataset still reads '0 public records found' (the loading fix must not swallow the true zero)", async () => {
  await setUrlState("/directory");
  const release = installPendingCamerasFetch(() => listPayload([], 0));

  const { container } = await renderTool();

  assert.equal(text(counter(container)), EN_LOADING, "loading first");
  await rtl.act(async () => { release(); });
  await rtl.waitFor(
    () => assert.equal(text(counter(container)), "0 public records found", "a settled zero is a real answer, not a loading lie"),
    { timeout: 5000 },
  );
});

test("cursor mode with an active filter: LOADING while pending, then the FILTERED server total", async () => {
  await setUrlState("/directory?type=Fixed+dome");
  const release = installPendingCamerasFetch(() => listPayload([THREE[0]], 7));

  const { container } = await renderTool();

  assert.equal(text(counter(container)), EN_LOADING, "a pending filtered fetch announces loading, not 0");
  await rtl.act(async () => { release(); });
  await rtl.waitFor(() => assert.equal(text(counter(container)), "7 public records found"), { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Real place search — completed precedence over the loading note
// ---------------------------------------------------------------------------

async function renderDirectoryWithPlaceSearch(placeHandler) {
  await setUrlState("/directory");
  // Directory list stays PENDING for the whole test: the count must take the
  // completed place-search branch while the directory is still loading.
  installPendingCamerasFetch(() => listPayload(THREE), placeHandler);
  const { container } = await renderTool();
  return container;
}

async function submitPlaceSearch(container, query) {
  await rtl.userEvent.type(container.querySelector("#record-search"), `${query}{Enter}`);
}

test("real place search (success) during directory loading: the count reports the place hits, not the loading note", async () => {
  const container = await renderDirectoryWithPlaceSearch(() =>
    jsonResponse({
      area: { kind: "place", displayName: "Fixture Town", latitude: 41.9, longitude: 12.49, radiusMeters: 2000, radiusLabel: "2 km" },
      records: [
        { ...THREE[0], distanceMeters: 120 },
        { ...THREE[1], distanceMeters: 340 },
      ],
    }),
  );

  assert.equal(text(counter(container)), EN_LOADING, "directory fetch still pending before the place search");
  await submitPlaceSearch(container, "Fixture Town");
  await rtl.waitFor(
    () => assert.equal(text(counter(container)), "2 public records found near this place", "a completed place search owns the count"),
    { timeout: 5000 },
  );
});

test("real place search (empty) during directory loading: the count reports the truthful zero of the search area", async () => {
  const container = await renderDirectoryWithPlaceSearch(() =>
    jsonResponse({
      area: { kind: "place", displayName: "Emptyville", latitude: 41.9, longitude: 12.49, radiusMeters: 2000, radiusLabel: "2 km" },
      records: [],
    }),
  );

  await submitPlaceSearch(container, "Emptyville");
  await rtl.waitFor(
    () => assert.equal(text(counter(container)), "0 public records found near this place", "the empty search reports its own zero, not the directory loading note"),
    { timeout: 5000 },
  );
});

test("real place search (not-found) during directory loading: the count keeps the place wording", async () => {
  const container = await renderDirectoryWithPlaceSearch(() =>
    jsonResponse({ error: "not found" }, { status: 404 }),
  );

  await submitPlaceSearch(container, "Nowhere At All");
  await rtl.waitFor(
    () => assert.equal(text(counter(container)), "0 public records found near this place", "an unresolvable place still owns the count over the loading note"),
    { timeout: 5000 },
  );
});

// ---------------------------------------------------------------------------
// Real DirectoryCatalog — direct props: known totals, legacy arrays, error
// ---------------------------------------------------------------------------

const CATALOG_PROPS = {
  cameraKinds: [],
  search: "",
  setSearch: () => {},
  kindFilter: "all",
  setKindFilter: () => {},
  freshnessFilter: "all",
  setFreshnessFilter: () => {},
  sortOrder: "alphabetical",
  setSortOrder: () => {},
  showRecordOnMap: () => {},
  setCoordinates: () => {},
  onResetFilters: () => {},
  reportHref: "/segnala",
};

async function renderCatalog(props) {
  const view = await renderWithLocale(
    React.createElement(DirectoryCatalog, { ...CATALOG_PROPS, filteredRecords: [], ...props }),
  );
  return { view, count: text(counter(view.container)) };
}

test("known server totals are preserved WHILE loading (including the true zero and the single-record wording)", async () => {
  // Cursor mode passes `total` only once a page answered, but a later reload
  // keeps the known total: the count must not be replaced by the loading note.
  const zero = await renderCatalog({ loading: true, totalRecords: 0 });
  assert.equal(zero.count, "0 public records found", "a KNOWN zero is a real total and must survive the loading branch");
  zero.view.unmount();

  const one = await renderCatalog({ loading: true, totalRecords: 1 });
  assert.equal(one.count, "1 public record found", "the singular wording is preserved");
  one.view.unmount();

  const many = await renderCatalog({ loading: true, totalRecords: 25, serverPaginated: true, filteredRecords: THREE });
  assert.equal(many.count, "25 public records found", "the server total, not the page length");
  many.view.unmount();

  // No known total → the loading note (never a fabricated 0).
  const unknown = await renderCatalog({ loading: true });
  assert.equal(unknown.count, EN_LOADING, "loading without a known total announces loading");
  unknown.view.unmount();
});

test("legacy loaded-array counts and the load-error precedence are unchanged", async () => {
  const legacy = await renderCatalog({ loading: false, filteredRecords: THREE });
  assert.equal(legacy.count, "3 public records found", "legacy mode counts the loaded (filtered) array");
  legacy.view.unmount();

  const error = await renderCatalog({ loading: true, loadError: true, onRetryLoad: () => {} });
  assert.equal(error.count, "The directory could not be loaded.", "a load failure still wins over both loading and the count");
  error.view.unmount();
});
