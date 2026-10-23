/**
 * Directory replacement requests (P2 audit 2026-10-22, issue #12).
 *
 * The /directory catalog loads ONE cursor page at a time, so every page/
 * filter change is a REPLACEMENT request for the visible list. The hook used
 * to flip `loading` to true but keep the previous page's records, so the real
 * DirectoryTool showed "Page 2 of 2" next to the 20 rows of page 1 with no
 * loading note (the count kept a known total, the list looked settled).
 *
 * The fix: a replacement request clears the visible records as soon as it
 * starts, while the KNOWN server total survives (it is still a real answer).
 * These tests drive the REAL DirectoryTool with a deferred /api/cameras mock,
 * so both halves are observable deterministically:
 *   - Next (in-tool pagination),
 *   - an external URL change (?page=2 arriving from outside the tool),
 *   - a kind filter select and a free-text ?q= commit, in EN and IT,
 *   - the settled replacement, the settled empty result and the settled error.
 *
 * The deferred gate is always released in teardown (after an unmount), so a
 * throwing test can never leave a pending promise or a leaked fetch mock.
 *
 * Fixtures are fictional demo records — no personal data.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  React,
  camerasApiResponse,
  installFetchMock,
  jsonResponse,
  loadDomModule,
  renderWithLocale,
  setUrlState,
  setupDom,
  wrapWithLocale,
} from "./helpers/dom-harness.mjs";

/** 40 fictional verified records — 2 pages at DIRECTORY_PAGE_SIZE 20.
 * Titles are zero-padded so the alphabetical order matches the numeric
 * order: page 1 = "Record 01".."Record 20" (Fixed dome), page 2 =
 * "Record 21".."Record 40" (Bullet). That makes a stale page visually
 * distinguishable from its replacement. */
const FORTY = Array.from({ length: 40 }, (_, i) => ({
  id: i + 1,
  title: `Record ${String(i + 1).padStart(2, "0")}`,
  kind: i < 20 ? "Fixed dome" : "Bullet",
  status: "active",
  latitude: 41.9 + i * 0.001,
  longitude: 12.49 + i * 0.0001,
  source: "Community report",
  updated: "2026-07-01",
  description: "Illustrative fixture record.",
  address: `Via Test ${i + 1}`,
}));

const EN_LOADING = "Loading the directory…";
const IT_LOADING = "Caricamento dell'elenco…";
const EN_LOAD_ERROR = "The directory could not be loaded.";
const EN_EMPTY = "No published record matches that search.";

let rtl;
let DirectoryTool;
let __resetPublicCamerasCache;

// Saved once, before any mock install: teardown restores it so a leaked mock
// can never bleed into the next test.
const priorFetch = globalThis.fetch;

/** Every list request of the CURRENT test that is still unresolved. */
let openGates = [];
/** The queue of list requests the test has not answered yet. */
let listQueue = [];

test.before(async () => {
  rtl = await setupDom();
  __resetPublicCamerasCache = (await loadDomModule("app/lib/use-public-cameras.mjs")).__resetPublicCamerasCache;
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
});

test.afterEach(async () => {
  // Unmount FIRST: the hook cleanup aborts the in-flight request, so releasing
  // the gates below cannot land a state update on a mounted tree.
  rtl.cleanup();
  // A walked replacement issues its requests one after another, so a released
  // gate can open the NEXT one: drain until nothing is left (each pass runs
  // after the cleanup, so no state update lands anywhere).
  for (let pass = 0; pass < 4 && openGates.length > 0; pass += 1) {
    const gates = openGates;
    openGates = [];
    await rtl.act(async () => { gates.forEach((release) => release()); });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  openGates = [];
  listQueue = [];
  globalThis.fetch = priorFetch;
  __resetPublicCamerasCache();
  window.localStorage.clear();
  const nav = await loadDomModule("node_modules/next/navigation.mjs");
  nav.__setNavState({ url: "/", pushed: [], replaced: [], replaceCalls: [] });
});

/**
 * Install a fetch mock whose /api/cameras LIST requests stay PENDING until the
 * test answers them (facets answer immediately, like the real API). Every
 * pending request is also tracked in `openGates`, so teardown can release it.
 */
function installDeferredCameras(records = FORTY) {
  installFetchMock((input) => {
    const url = String(input);
    // Facets answer immediately (the real API does): the kind select must
    // offer the dataset kinds for the filter replacement to be drivable.
    if (url.includes("facets=")) return camerasApiResponse(input, records);
    if (url.startsWith("/api/cameras?")) {
      return new Promise((resolve) => {
        const answer = (override) => {
          openGates = openGates.filter((gate) => gate !== answer);
          resolve(override ?? camerasApiResponse(input, records));
        };
        openGates.push(answer);
        listQueue.push(answer);
      });
    }
    return jsonResponse({ error: "not found" }, { status: 404 });
  });
}

/** Wait until the hook has issued the next list request, then answer it. */
async function answerNextListRequest(override) {
  await rtl.waitFor(() => assert.ok(listQueue.length > 0, "expected a pending /api/cameras list request"), { timeout: 5000 });
  const answer = listQueue.shift();
  await rtl.act(async () => { answer(override); await Promise.resolve(); });
}

const rows = (container) => container.querySelectorAll("ul.record-list li").length;
const titles = (container) =>
  [...container.querySelectorAll("ul.record-list li h3")].map((node) => (node.textContent ?? "").trim());
const counter = (container) => container.querySelector("#record-search-count");
const text = (element) => (element?.textContent ?? "").trim();
/** The LIST loading note (the place-search note in the collapsible panel
 * above lives outside #records' direct list slot and never renders here). */
const listNote = (container) => container.querySelector("#records > p.loading-note");

async function renderTool() {
  const view = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.act(async () => {});
  return view;
}

/** Settle the initial page-1 load: the hook walks 1 page, so ONE request. */
async function settleFirstPage(container) {
  await answerNextListRequest();
  await rtl.waitFor(() => assert.equal(rows(container), 20, "page 1 must render 20 rows"), { timeout: 5000 });
}

// ---------------------------------------------------------------------------
// Next (in-tool pagination) — the reported Page2of2 + 20 stale rows
// ---------------------------------------------------------------------------

test("Next: the page-1 rows never stand in for the pending page-2 replacement (EN)", async () => {
  await setUrlState("/directory");
  installDeferredCameras();
  const { container } = await renderTool();
  await settleFirstPage(container);

  const nav = container.querySelector(".directory-pagination:not(.directory-pagination-top)");
  assert.match(nav?.textContent ?? "", /Page 1 of 2/);
  const [, next] = nav.querySelectorAll("button.pagination-button");
  await rtl.userEvent.click(next);

  // PENDING replacement: the previous page must NOT be presented as the
  // result for ?page=2, and the existing loading note must be visible.
  await rtl.waitFor(() => assert.equal(rows(container), 0, "a pending replacement must not render the previous page's rows"), { timeout: 5000 });
  assert.equal(text(listNote(container)), EN_LOADING, "the existing loading note becomes visible during the replacement");
  assert.equal(titles(container).length, 0, "no stale record title survives the replacement start");
  // Known total preserved: the count keeps a real answer and the pagination
  // bar still announces where the replacement is going.
  assert.equal(text(counter(container)), "40 public records found", "the KNOWN server total survives the replacement request (never a false zero)");
  assert.match(container.querySelector(".directory-pagination:not(.directory-pagination-top)")?.textContent ?? "", /Page 2 of 2/, "the target page is announced while its rows load");

  // Settled page 2: the walk fetches page 1 (cursor) then page 2.
  await answerNextListRequest();
  await answerNextListRequest();
  await rtl.waitFor(
    () => assert.deepEqual(titles(container).slice(0, 2), ["Record 21", "Record 22"], "page 2 renders its OWN rows once settled"),
    { timeout: 5000 },
  );
  assert.equal(rows(container), 20);
  assert.equal(listNote(container), null, "the loading note disappears once the replacement settles");
});

test("Next (IT): the pending replacement announces the Italian loading note", async () => {
  window.localStorage.setItem("opensurveillancedb-locale", "it");
  await setUrlState("/directory");
  installDeferredCameras();
  const { container } = await renderTool();
  await settleFirstPage(container);

  const [, next] = container.querySelector(".directory-pagination:not(.directory-pagination-top)").querySelectorAll("button.pagination-button");
  await rtl.userEvent.click(next);

  await rtl.waitFor(() => assert.equal(rows(container), 0, "the Italian page behaves identically"), { timeout: 5000 });
  assert.equal(text(listNote(container)), IT_LOADING, "the IT bundle string is the visible note");
  assert.match(text(counter(container)), /40 record pubblici trovati/, "the known total survives in Italian too");

  await answerNextListRequest();
  await answerNextListRequest();
  await rtl.waitFor(() => assert.deepEqual(titles(container).slice(0, 1), ["Record 21"]), { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// External URL change — ?page=2 arriving from outside the tool
// ---------------------------------------------------------------------------

test("an external URL change (?page=2) replaces the visible page instead of keeping page 1", async () => {
  await setUrlState("/directory");
  installDeferredCameras();
  const view = await renderTool();
  const { container } = view;
  await settleFirstPage(container);

  // The browser URL changes outside the tool (share link, back/forward) and
  // the tree re-renders: useCameraFilters re-derives page 2 from the URL.
  await setUrlState("/directory?page=2");
  await rtl.act(async () => { view.rerender(await wrapWithLocale(React.createElement(DirectoryTool))); });

  await rtl.waitFor(() => assert.equal(rows(container), 0, "the new URL's request must clear the previous page"), { timeout: 5000 });
  assert.equal(text(listNote(container)), EN_LOADING, "the loading note covers the replacement");
  assert.match(text(counter(container)), /40 public records found/, "the total is preserved across the URL change");

  await answerNextListRequest();
  await answerNextListRequest();
  await rtl.waitFor(() => assert.deepEqual(titles(container).slice(0, 1), ["Record 21"]), { timeout: 5000 });
});

// ---------------------------------------------------------------------------
// Filter replacements — kind select and free-text query
// ---------------------------------------------------------------------------

test("a kind filter change clears the previous rows while the filtered page loads", async () => {
  await setUrlState("/directory");
  installDeferredCameras();
  const { container } = await renderTool();
  await settleFirstPage(container);

  // Kind select → Bullet (the 20 records of page 2): the replacement must not
  // keep showing the previously loaded Fixed dome rows.
  const kindSelect = container.querySelector("#record-kind-filter");
  assert.ok(kindSelect, "the kind select is part of the shared FiltersBar");
  await rtl.userEvent.selectOptions(kindSelect, "Bullet");

  await rtl.waitFor(() => assert.equal(rows(container), 0, "the filtered replacement clears the previous rows"), { timeout: 5000 });
  assert.equal(text(listNote(container)), EN_LOADING, "the loading note covers the filtered replacement");
  assert.match(text(counter(container)), /40 public records found/, "a KNOWN total stays visible while the replacement loads");

  await answerNextListRequest();
  await rtl.waitFor(
    () => assert.deepEqual(titles(container).slice(0, 2), ["Record 21", "Record 22"], "the filtered page renders its own rows"),
    { timeout: 5000 },
  );
  assert.match(text(counter(container)), /20 public records found/, "the FILTERED total settles");
});

test("a ?q= commit (EN) clears the previous rows and shows the note, never a stale page", async () => {
  await setUrlState("/directory");
  installDeferredCameras();
  const { container } = await renderTool();
  await settleFirstPage(container);

  const search = container.querySelector("#record-search");
  await rtl.userEvent.type(search, "Record 2");

  // Debounced commit (QUERY_DEBOUNCE_MS) → replacement request.
  await rtl.waitFor(() => assert.equal(rows(container), 0, "the query replacement clears the previous rows"), { timeout: 5000 });
  assert.equal(text(listNote(container)), EN_LOADING, "EN loading note while the query page loads");
  assert.equal(text(counter(container)), "40 public records found", "pending is not an empty result (the known total stays)");

  await answerNextListRequest();
  await rtl.waitFor(
    () => assert.match(text(counter(container)), /^10 public records found/, "Record 20–29 match the text query"),
    { timeout: 5000 },
  );
  assert.deepEqual(titles(container).slice(0, 1), ["Record 20"]);
  assert.equal(listNote(container), null, "the note is gone once the query page settles");
});

test("a ?q= commit (IT) uses the Italian note and the Italian count", async () => {
  window.localStorage.setItem("opensurveillancedb-locale", "it");
  await setUrlState("/directory");
  installDeferredCameras();
  const { container } = await renderTool();
  await settleFirstPage(container);

  await rtl.userEvent.type(container.querySelector("#record-search"), "Record 3");

  await rtl.waitFor(() => assert.equal(rows(container), 0, "the Italian query replacement clears the rows"), { timeout: 5000 });
  assert.equal(text(listNote(container)), IT_LOADING, "the IT bundle string is the visible note");

  await answerNextListRequest();
  await rtl.waitFor(
    () => assert.match(text(counter(container)), /^10 record pubblici trovati/, "Record 30–39 match the text query"),
    { timeout: 5000 },
  );
  assert.deepEqual(titles(container).slice(0, 1), ["Record 30"]);
});

// ---------------------------------------------------------------------------
// Settled replacement / empty / error states
// ---------------------------------------------------------------------------

test("a settled replacement that returns no rows renders the truthful EMPTY state (no stale rows, no note)", async () => {
  await setUrlState("/directory");
  installDeferredCameras();
  const { container } = await renderTool();
  await settleFirstPage(container);

  await rtl.userEvent.type(container.querySelector("#record-search"), "zznothing");
  await rtl.waitFor(() => assert.equal(rows(container), 0), { timeout: 5000 });
  assert.equal(text(listNote(container)), EN_LOADING, "pending first");

  await answerNextListRequest();
  await rtl.waitFor(
    () => assert.ok((container.textContent ?? "").includes(EN_EMPTY), "the settled empty result renders the empty state"),
    { timeout: 5000 },
  );
  assert.equal(rows(container), 0, "the empty state renders no rows");
  assert.equal(listNote(container), null, "the loading note is gone once the empty result settles");
  assert.equal(text(counter(container)), "0 public records found", "the settled zero is a real answer");
});

test("a settled replacement that FAILS renders the error state and keeps no stale rows", async () => {
  await setUrlState("/directory");
  installDeferredCameras();
  const { container } = await renderTool();
  await settleFirstPage(container);

  const [, next] = container.querySelector(".directory-pagination:not(.directory-pagination-top)").querySelectorAll("button.pagination-button");
  await rtl.userEvent.click(next);
  await rtl.waitFor(() => assert.equal(rows(container), 0), { timeout: 5000 });

  // Fail the FIRST request of the walked replacement (the walk never reaches
  // page 2 when page 1 errors) — any later gate is released in teardown.
  await answerNextListRequest(jsonResponse({ error: "boom" }, { status: 500 }));
  await rtl.waitFor(
    () => assert.ok((container.textContent ?? "").includes(EN_LOAD_ERROR), "the load failure renders the error state"),
    { timeout: 5000 },
  );
  assert.equal(rows(container), 0, "a failed replacement never falls back to the previous page");
  assert.equal(listNote(container), null, "the error state replaces the loading note");
});
