/**
 * Browse-record redesign (t_f13fcb1c) — interaction contracts of the new
 * /directory catalog: pagination (?page=, URL-backed), active-filter chips,
 * the A–Z alphabetical index and the place-search toggle in the controls
 * row. The flat-catalog suites (browse-filter-record, client-tools,
 * url-state-contract) keep covering the shared filter/search contract; this
 * file covers what the redesign ADDED.
 *
 * Client layer only (dom-harness + real DirectoryTool): same isolation
 * contract as browse-filter-record — deterministic fetch mock, fictional
 * fixtures, URL state via the navigation stub (deep links, replace).
 *
 * Fixtures are fictional demo records — no personal data.
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

let rtl;
let __resetPublicCamerasCache;
let DirectoryTool;

/** 25 fictional verified records — spans 2 pages at DIRECTORY_PAGE_SIZE 20.
 * 22 are "Fixed dome" so a kind filter can still span 2 pages (page-reset
 * test); 3 are "Bullet" (chip test). */
const TWENTY_FIVE = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  title: `Record number ${i + 1}`,
  kind: i < 22 ? "Fixed dome" : "Bullet",
  status: "active",
  latitude: 41.9 + i * 0.001,
  longitude: 12.49 + i * 0.0001,
  source: "Community report",
  updated: "2026-07-01",
  description: "Illustrative fixture record.",
  address: `Via Test ${i + 1}`,
}));

/** 4 records whose titles start with distinct letters (A/B/G/D). */
const FOUR_LETTERS = [
  { id: 1, title: "Alpha one", kind: "Fixed dome", status: "active", latitude: 41.9, longitude: 12.49, source: "Community report", updated: "2026-07-01", description: "Illustrative fixture record.", address: "Via Alpha 1" },
  { id: 2, title: "Beta two", kind: "Bullet", status: "active", latitude: 41.91, longitude: 12.5, source: "Community report", updated: "2026-07-01", description: "Illustrative fixture record.", address: "Via Beta 2" },
  { id: 3, title: "Gamma three", kind: "Fixed dome", status: "active", latitude: 41.92, longitude: 12.51, source: "Community report", updated: "2026-07-01", description: "Illustrative fixture record.", address: "Via Gamma 3" },
  { id: 4, title: "Delta four", kind: "Bullet", status: "active", latitude: 41.93, longitude: 12.52, source: "Community report", updated: "2026-07-01", description: "Illustrative fixture record.", address: "Via Delta 4" },
];

function installRecords(records) {
  installFetchMock(() => jsonResponse({ records, total: records.length, nextOffset: null }));
}

const rows = (container) => container.querySelectorAll("ul.record-list li").length;

test.before(async () => {
  rtl = await setupDom();
  const camerasMod = await loadDomModule("app/lib/use-public-cameras.mjs");
  __resetPublicCamerasCache = camerasMod.__resetPublicCamerasCache;
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
});

test.afterEach(async () => {
  rtl.cleanup();
  __resetPublicCamerasCache();
  const nav = await loadDomModule("node_modules/next/navigation.mjs");
  nav.__setNavState({ url: "/", pushed: [], replaced: [], replaceCalls: [] });
});

// ---------------------------------------------------------------------------
// Pagination (?page=)
// ---------------------------------------------------------------------------

test("25 records render 20 rows on page 1; Next commits ?page=2 and renders the rest", async () => {
  await setUrlState("/directory");
  installRecords(TWENTY_FIVE);
  const { container } = await renderWithLocale(React.createElement(DirectoryTool));

  await rtl.waitFor(() => assert.equal(rows(container), 20, "page 1 must show the first 20 records"));
  const counter = container.querySelector("#record-search-count");
  assert.match(counter?.textContent ?? "", /25 public records found/, "the count reports the FILTERED total, not the page size");

  // Pagination bar: Previous disabled on page 1, summary "Showing 1–20 of 25".
  const nav = container.querySelector(".directory-pagination");
  assert.ok(nav, "the pagination bar renders only when the set spans pages");
  assert.match(nav.textContent ?? "", /Showing 1–20 of 25 records/);
  assert.match(nav.textContent ?? "", /Page 1 of 2/);
  const [prev, next] = nav.querySelectorAll("button.pagination-button");
  assert.ok(prev.disabled, "Previous is disabled on page 1");
  assert.ok(!next.disabled, "Next is enabled on page 1");

  await rtl.userEvent.click(next);
  await rtl.waitFor(() => assert.equal(rows(container), 5, "page 2 must show the remaining 5 records"));
  assert.match(nav.textContent ?? "", /Showing 21–25 of 25 records/);
  assert.match(nav.textContent ?? "", /Page 2 of 2/);
  assert.ok(!nav.querySelectorAll("button.pagination-button")[0].disabled, "Previous becomes enabled on page 2");
  assert.ok(nav.querySelectorAll("button.pagination-button")[1].disabled, "Next is disabled on the last page");

  const navMod = await loadDomModule("node_modules/next/navigation.mjs");
  const replaced = navMod.__getNavState().replaced;
  assert.ok(replaced.some((href) => href.includes("page=2")), "the page commit writes ?page=2");
});

test("deep link /directory?page=2 renders the second page (URL is the source of truth)", async () => {
  await setUrlState("/directory?page=2");
  installRecords(TWENTY_FIVE);
  const { container } = await renderWithLocale(React.createElement(DirectoryTool));

  await rtl.waitFor(() => assert.equal(rows(container), 5, "a deep link to page 2 must render the last 5 records"));
  const nav = container.querySelector(".directory-pagination");
  assert.match(nav?.textContent ?? "", /Page 2 of 2/);
});

test("a filter change resets the page to 1 (the ?page= param is dropped from the URL)", async () => {
  await setUrlState("/directory?page=2");
  installRecords(TWENTY_FIVE);
  const { container } = await renderWithLocale(React.createElement(DirectoryTool));

  await rtl.waitFor(() => assert.equal(rows(container), 5, "page 2 visible before the filter change"));
  await rtl.userEvent.selectOptions(container.querySelector("#record-kind-filter"), "Fixed dome");
  await rtl.waitFor(() => assert.equal(rows(container), 20, "22 of 25 records are Fixed dome — page 1 after the reset"));

  const navMod = await loadDomModule("node_modules/next/navigation.mjs");
  const lastReplace = navMod.__getNavState().replaceCalls.at(-1)?.href ?? "";
  assert.ok(lastReplace.includes("type=Fixed+dome"), "the kind filter commits ?type=Fixed dome");
  assert.ok(!lastReplace.includes("page="), "the filter change drops the stale ?page=");
  const nav = container.querySelector(".directory-pagination");
  assert.match(nav?.textContent ?? "", /Page 1 of 2/, "the paginated set restarts at page 1 after the filter change");
});

// ---------------------------------------------------------------------------
// Active-filter chips
// ---------------------------------------------------------------------------

test("active filters render as removable chips; a chip click clears that filter", async () => {
  await setUrlState("/directory");
  installRecords(TWENTY_FIVE);
  const { container } = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.waitFor(() => assert.equal(rows(container), 20));

  assert.equal(container.querySelectorAll(".filter-chips .filter-chip").length, 0, "no chips with default filters");

  await rtl.userEvent.selectOptions(container.querySelector("#record-kind-filter"), "Bullet");
  await rtl.waitFor(() => assert.equal(rows(container), 3));
  const chips = container.querySelectorAll(".filter-chips .filter-chip");
  assert.equal(chips.length, 1, "one chip for the active kind filter");
  const chip = chips[0];
  assert.equal(chip.getAttribute("aria-label"), "Remove filter: Bullet", "the chip announces its one-shot removal");

  await rtl.userEvent.click(chip);
  await rtl.waitFor(() => assert.equal(rows(container), 20, "removing the chip restores the full list"));
  assert.equal(container.querySelector("#record-kind-filter")?.value, "all", "the kind select returns to All types");
  assert.equal(container.querySelectorAll(".filter-chips .filter-chip").length, 0, "chips disappear once every filter is cleared");
});

// ---------------------------------------------------------------------------
// A–Z alphabetical index
// ---------------------------------------------------------------------------

test("the A–Z index links the present letters and mutes the absent ones (aria-current on the current page)", async () => {
  await setUrlState("/directory");
  installRecords(FOUR_LETTERS);
  const { container } = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.waitFor(() => assert.equal(rows(container), 4));

  const index = container.querySelector("nav.alpha-index");
  assert.ok(index, "the alphabetical index renders in alphabetical order");
  const linkLabels = [...index.querySelectorAll("button.alpha-index-link")].map((b) => b.getAttribute("aria-label"));
  assert.deepEqual(linkLabels, [
    "Jump to records starting with A",
    "Jump to records starting with B",
    "Jump to records starting with D",
    "Jump to records starting with G",
  ], "only the letters present in the set are jump links (A, B, D, G)");

  // Absent letters are muted placeholders, not links (aria-hidden).
  const muted = [...index.querySelectorAll(".alpha-index-link.is-muted")];
  assert.ok(muted.length > 0, "absent letters render as muted placeholders");
  assert.ok(muted.every((span) => span.getAttribute("aria-hidden") === "true"), "muted letters are decorative (aria-hidden)");

  // Single page → every present letter is on the current page (aria-current).
  const current = [...index.querySelectorAll("button[aria-current='true']")];
  assert.equal(current.length, 4, "on a single page every present letter carries aria-current");
});

test("the alphabetical index hides in positional order (and the sort select still works)", async () => {
  await setUrlState("/directory");
  installRecords(FOUR_LETTERS);
  const { container } = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.waitFor(() => assert.equal(rows(container), 4));

  await rtl.userEvent.selectOptions(container.querySelector("#record-sort"), "position");
  await rtl.waitFor(() => assert.equal(container.querySelector("nav.alpha-index"), null, "positional order has no A–Z index"));
});

// ---------------------------------------------------------------------------
// Single directory search: records while typing, places on Enter
// ---------------------------------------------------------------------------

test("the directory search is the only search field and submits a place lookup on Enter", async () => {
  await setUrlState("/directory");
  installRecords(FOUR_LETTERS);
  const { container } = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.waitFor(() => assert.equal(rows(container), 4));

  const search = container.querySelector("#record-search");
  assert.ok(search, "the primary search remains available");
  assert.equal(container.querySelector("#place-search"), null, "there is no separate place-search field");
  assert.equal(container.querySelector(".place-search-toggle"), null, "there is no second search trigger");
  assert.match(search.getAttribute("placeholder") ?? "", /place/, "the field explains that it accepts a place");
});
