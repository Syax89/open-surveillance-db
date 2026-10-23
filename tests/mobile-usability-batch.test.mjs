/**
 * Mobile usability batch 2026-10-23 — F1/F2/F3 on /directory and the public
 * record page. Client layer only (dom-harness + the real DirectoryTool /
 * RecordPageBody), same isolation contract as browse-directory-redesign and
 * client-record-page.
 *
 * F1 — /directory, MOBILE ONLY: the native filter disclosure starts CLOSED on
 *   a phone, so the summary now states a truthful active-selection count and
 *   the removable chips below the results header cover EVERY active
 *   dimension (q, type, freshness, confirmation state, origin and a
 *   non-default order). State/origin/order chips are phone-only: the accepted
 *   desktop row keeps exactly q/type/freshness, so an origin-only desktop
 *   filter adds no empty margin block. Chip removal goes through the existing
 *   URL setters (which also reset ?page=), all-default shows no count and no
 *   chips, and a place search owns the context (count + chips + pagers off).
 *
 * F2 — /directory, MOBILE ONLY: the SAME pagination bar (one renderer) also
 *   renders above the first card, so changing page never requires scrolling
 *   the list. Paging math, ?page= commit, clamping, disabled bounds and the
 *   results-heading focus stay shared; a one-page/empty set and a place
 *   result hide BOTH bars.
 *
 * F3 — public record page, MOBILE ONLY: the map action is exposed early
 *   (right after title/kind/summary) through the supported
 *   `/mappa?focus=<id>` contract, while the accepted lower action keeps its
 *   own href/geometry. Exactly one is visible per breakpoint (CSS), and
 *   withdrawn records keep NEITHER.
 *
 * jsdom applies no stylesheet, so the responsive variants coexist in the DOM
 * here: the behavioural assertions are scoped to the variant a breakpoint
 * shows, and the visibility itself is pinned on the CSS rules (device pixels
 * stay with the browser QA pass).
 *
 * Fixtures are fictional — no personal data.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { afterEach, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  React,
  camerasApiResponse,
  installCamerasApiMock,
  installFetchMock,
  jsonResponse,
  loadDomModule,
  loadDomPage,
  renderWithLocale,
  setNavState,
  setUrlState,
  setupDom,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relative) => readFile(path.join(root, relative), "utf8");

// ---------------------------------------------------------------------------
// CSS helper (mirrors the other contract suites)
// ---------------------------------------------------------------------------

function mediaBlocks(source, feature, value) {
  const matcher = new RegExp(`@media\\s*\\(\\s*${feature}\\s*:\\s*${value}\\s*\\)\\s*\\{`, "g");
  const blocks = [];
  for (let match = matcher.exec(source); match !== null; match = matcher.exec(source)) {
    let depth = 1;
    let cursor = matcher.lastIndex;
    const start = cursor;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth === 0) blocks.push(source.slice(start, cursor - 1));
  }
  return blocks;
}

let rtl;
let DirectoryTool;
let RecordPage;
let __resetPublicCamerasCache;

/** 25 fictional records: 22 "Fixed dome" / 3 "Bullet", alternating
 * confirmation state, every 5th row imported — enough dimensions to exercise
 * every chip while still spanning 2 pages at DIRECTORY_PAGE_SIZE 20. */
const RECORDS = Array.from({ length: 25 }, (_, index) => {
  const id = index + 1;
  return {
    id,
    title: `Fixture record ${String(id).padStart(2, "0")}`,
    kind: index >= 22 ? "Bullet" : "Fixed dome",
    status: "active",
    latitude: 41.9 + index * 0.001,
    longitude: 12.49 + index * 0.0001,
    source: index % 5 === 0 ? "import:fixture-source-2026" : "Community report",
    updated: "2026-07-01",
    lastVerifiedAt: index % 2 === 0 ? "2026-07-05T00:00:00.000Z" : null,
    description: "Illustrative fixture record.",
    address: `Via Test ${id}`,
  };
});

const FEW = RECORDS.slice(0, 4);

const rows = (container) => container.querySelectorAll("ul.record-list li").length;
const text = (element) => (element?.textContent ?? "").replace(/\s+/g, " ").trim();
const chipLabels = (container, variant) =>
  [...container.querySelectorAll(`.filter-chips-${variant} .filter-chip`)].map((chip) => chip.getAttribute("aria-label"));
const pagers = (container) => container.querySelectorAll(".directory-pagination");
const pagerTop = (container) => container.querySelector(".directory-pagination-top");
const pagerBottom = (container) => container.querySelector(".directory-pagination:not(.directory-pagination-top)");
const summary = (container) => container.querySelector(".filters-disclosure > summary");

before(async () => {
  rtl = await setupDom();
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
  RecordPage = await loadDomPage("app/records/[id]/RecordPageBody.mjs");
  __resetPublicCamerasCache = (await loadDomModule("app/lib/use-public-cameras.mjs")).__resetPublicCamerasCache;
});

afterEach(async () => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
  if (typeof window !== "undefined") window.localStorage.removeItem("opensurveillancedb-locale");
  const nav = await loadDomModule("node_modules/next/navigation.mjs");
  nav.__setNavState({ url: "/", pushed: [], replaced: [], replaceCalls: [] });
});

async function renderDirectory({ url = "/directory", records = RECORDS, locale = "en", extraFetch } = {}) {
  await setUrlState(url);
  if (extraFetch) installFetchMock((input) => extraFetch(String(input)) ?? camerasApiResponse(String(input), records));
  else installCamerasApiMock(records);
  if (locale !== "en") window.localStorage.setItem("opensurveillancedb-locale", locale);
  const view = await renderWithLocale(React.createElement(DirectoryTool));
  // Flush the first client tick (import-source cache, cursor/legacy walk)
  // inside act so no late state update leaks into the next test.
  await rtl.act(async () => {});
  return view;
}

async function lastReplaceHref() {
  const nav = await loadDomModule("node_modules/next/navigation.mjs");
  return nav.__getNavState().replaceCalls.at(-1)?.href ?? "";
}

// ---------------------------------------------------------------------------
// F1 — active-selection count in the filter summary + chips
// ---------------------------------------------------------------------------

test("F1: the closed filter summary states the active count, synchronized with the chips (EN singular/plural)", async () => {
  const { container } = await renderDirectory();
  await rtl.waitFor(() => assert.equal(rows(container), 20));

  // All-default: no count, no chips — the accepted neutral state.
  assert.equal(text(summary(container)), "Filters", "an all-default directory shows no count in the summary");
  assert.equal(container.querySelectorAll(".filter-chip").length, 0, "and no chips of either breakpoint row");

  await rtl.userEvent.selectOptions(container.querySelector("#record-kind-filter"), "Bullet");
  await rtl.waitFor(() => assert.equal(rows(container), 3));
  assert.equal(text(summary(container)), "Filters · 1 active filter", "singular copy for a single active selection");
  assert.deepEqual(chipLabels(container, "mobile"), ["Remove filter: Bullet"], "the phone row carries the kind chip");
  assert.deepEqual(chipLabels(container, "desktop"), ["Remove filter: Bullet"], "desktop keeps the accepted kind chip");

  // Confirmation state is a NEW (phone-only) dimension: count and phone row
  // must grow together, while the desktop row keeps its accepted set.
  await rtl.userEvent.selectOptions(container.querySelector("#record-state-filter"), "confirmed");
  await rtl.waitFor(() => assert.equal(rows(container), 2, "Bullet + confirmed narrows to the 2 confirmed bullets"));
  assert.equal(text(summary(container)), "Filters · 2 active filters", "plural copy for two active selections");
  assert.deepEqual(
    chipLabels(container, "mobile"),
    ["Remove filter: Bullet", "Remove filter: Confirmed"],
    "the phone row lists every active dimension",
  );
  assert.deepEqual(chipLabels(container, "desktop"), ["Remove filter: Bullet"], "the desktop row stays q/type/freshness only");
});

test("F1: state/origin/order chips are phone-only, so an origin-only desktop filter renders no empty chips row", async () => {
  const { container } = await renderDirectory({ url: "/directory?state=confirmed&origin=reports" });
  await rtl.waitFor(() => assert.equal(rows(container), 10, "confirmed + community reports keeps 10 fixture rows"));

  assert.deepEqual(
    chipLabels(container, "mobile"),
    ["Remove filter: Confirmed", "Remove filter: Community reports"],
    "both new dimensions surface as removable phone chips",
  );
  assert.equal(container.querySelector(".filter-chips-desktop"), null, "no desktop chips row at all → no empty margin block");
  assert.equal(text(summary(container)), "Filters · 2 active filters");

  // One-shot removal keeps the other dimension and commits through the URL.
  await rtl.userEvent.click(container.querySelector('[aria-label="Remove filter: Community reports"]'));
  await rtl.waitFor(() => assert.equal(rows(container), 13, "removing origin keeps the confirmation-state filter"));
  const href = await lastReplaceHref();
  assert.ok(href.includes("state=confirmed"), `the surviving dimension stays in the URL (${href})`);
  assert.ok(!href.includes("origin="), `only the removed dimension leaves the URL (${href})`);
  assert.deepEqual(chipLabels(container, "mobile"), ["Remove filter: Confirmed"]);
  assert.equal(text(summary(container)), "Filters · 1 active filter", "the count follows the chips down");

  // Reset clears everything: no chips, no count.
  await rtl.userEvent.click(container.querySelector(".filters-disclosure .text-button"));
  await rtl.waitFor(() => assert.equal(rows(container), 20, "reset restores the default list"));
  assert.equal(container.querySelectorAll(".filter-chip").length, 0, "reset leaves no chip behind");
  assert.equal(text(summary(container)), "Filters", "and no count");
});

test("F1: the order chip names the ordering, and removing it keeps every other dimension and resets ?page=", async () => {
  const { container } = await renderDirectory({ url: "/directory?type=Fixed+dome&sort=useful&page=2" });
  await rtl.waitFor(() => assert.equal(rows(container), 2, "22 Fixed dome rows: page 2 holds the last 2"));

  assert.deepEqual(
    chipLabels(container, "mobile"),
    ["Remove filter: Fixed dome", "Remove filter: Order: Most useful"],
    "the ordering chip identifies an order, not a restrictive filter",
  );
  const bottom = pagerBottom(container);
  assert.match(text(bottom), /Page 2 of 2/, "page 2 of the narrowed set renders before the removal");

  await rtl.userEvent.click(container.querySelector('[aria-label="Remove filter: Order: Most useful"]'));
  await rtl.waitFor(() => assert.equal(rows(container), 20, "the order removal resets to page 1 of the kind filter"));

  const href = await lastReplaceHref();
  assert.ok(href.includes("type=Fixed+dome"), `the kind filter survives (${href})`);
  assert.ok(!href.includes("sort="), `the order leaves the URL (${href})`);
  assert.ok(!href.includes("page="), `the existing URL hook resets the page (${href})`);
  assert.deepEqual(chipLabels(container, "mobile"), ["Remove filter: Fixed dome"], "only the order chip is gone");
  assert.equal(container.querySelector("#record-sort")?.value, "alphabetical", "the sort select returns to the default");
  assert.equal(text(summary(container)), "Filters · 1 active filter");
});

test("F1 (IT): the count and the new chips are localized with correct singular/plural", async () => {
  const { container } = await renderDirectory({ url: "/directory?type=Bullet", locale: "it" });
  await rtl.waitFor(() => assert.equal(rows(container), 3));

  assert.equal(text(summary(container)), "Filtri · 1 filtro attivo", "Italian singular copy");
  assert.deepEqual(chipLabels(container, "mobile"), ["Rimuovi filtro: Bullet"]);

  await rtl.userEvent.selectOptions(container.querySelector("#record-origin-filter"), "reports");
  await rtl.waitFor(() => assert.equal(rows(container), 3, "all three Bullet fixtures are community reports"));
  assert.equal(text(summary(container)), "Filtri · 2 filtri attivi", "Italian plural copy");
  assert.deepEqual(
    chipLabels(container, "mobile"),
    ["Rimuovi filtro: Bullet", "Rimuovi filtro: Segnalazioni"],
    "the origin chip carries the existing localized label",
  );
  const orderChip = () => container.querySelector('[aria-label^="Rimuovi filtro: Ordine"]');
  await rtl.userEvent.selectOptions(container.querySelector("#record-sort"), "position");
  await rtl.waitFor(() => assert.ok(orderChip(), "the order chip renders in Italian too"));
  assert.equal(orderChip()?.getAttribute("aria-label"), "Rimuovi filtro: Ordine: Posizione (da sud a nord)");
});

test("F1: a place search owns the context — count, chips and both pagers step aside, then come back", async () => {
  const area = { kind: "place", displayName: "Roma", latitude: 41.9, longitude: 12.49, radiusMeters: 1000, radiusLabel: "1 km" };
  const nearRecords = RECORDS.map((record) => ({ ...record, distanceMeters: 100 + record.id }));
  const { container } = await renderDirectory({
    extraFetch: (input) => (input.startsWith("/api/cameras/search")
      ? jsonResponse({ area, records: nearRecords })
      : null),
  });
  await rtl.waitFor(() => assert.equal(rows(container), 20));
  assert.equal(pagers(container).length, 2, "the paged list keeps both bars before the place search");

  const search = container.querySelector("#record-search");
  await rtl.userEvent.type(search, "Roma{Enter}");
  await rtl.waitFor(() => assert.ok(container.querySelector(".place-banner"), "the place banner owns the results"));

  assert.equal(container.querySelectorAll(".filter-chip").length, 0, "no chips while a place search owns the results");
  assert.equal(text(summary(container)), "Filters", "so the summary states no active-selection count either");
  assert.equal(pagers(container).length, 0, "neither pager renders for a place result");

  await rtl.userEvent.click(container.querySelector(".place-banner .text-button"));
  await rtl.waitFor(() => assert.equal(container.querySelector(".place-banner"), null, "clearing the place search returns the list"));
  assert.equal(text(summary(container)), "Filters · 1 active filter", "the typed query is an active selection again");
  assert.deepEqual(chipLabels(container, "mobile"), ["Remove filter: Roma"]);
});

test("F1 (CSS): both chip rows and the summary count are responsive, one variant per breakpoint", async () => {
  const css = await readSource("app/globals.css");

  assert.match(css, /\.filter-chips-mobile \{ display:none; \}/, "the phone row is off by default (desktop)");
  assert.match(css, /\.filters-summary-count \{ display:none; \}/, "the count is off by default (desktop and AT)");
  const mobile = mediaBlocks(css, "max-width", "700px").join("\n");
  assert.match(mobile, /\.filter-chips-mobile \{ display:flex; \}/, "phones show the full chips row");
  assert.match(mobile, /\.filter-chips-desktop \{ display:none; \}/, "and hide the accepted desktop row");
  assert.match(mobile, /\.filters-summary-count \{ display:inline; \}/, "phones show the count");
  // The accepted desktop chips geometry is untouched.
  assert.match(css, /\.filter-chips \{ display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 0; padding:0; list-style:none; \}/);
});

// ---------------------------------------------------------------------------
// F2 — the same pager above the first card (mobile only)
// ---------------------------------------------------------------------------

test("F2: the pager also renders above the first card and both bars stay in sync", async () => {
  const { container } = await renderDirectory();
  await rtl.waitFor(() => assert.equal(rows(container), 20));

  const top = pagerTop(container);
  const bottom = pagerBottom(container);
  assert.ok(top && bottom, "both the top and the bottom pagination bar render");
  assert.equal(pagers(container).length, 2, "exactly two bars, never a third copy");
  assert.equal(text(top), text(bottom), "same paging maths, same summary");
  assert.match(text(top), /Showing 1–20 of 25 records · Page 1 of 2/);

  // Above the first card: the list follows the top bar in document order.
  const list = container.querySelector("ul.record-list");
  const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING
  assert.ok(top.compareDocumentPosition(list) & FOLLOWING, "the top bar precedes the record list");

  const [topPrev, topNext] = top.querySelectorAll("button.pagination-button");
  assert.ok(topPrev.disabled, "Previous is disabled on page 1 in the top bar too");
  assert.ok(!topNext.disabled, "Next is enabled on page 1");

  await rtl.userEvent.click(topNext);
  await rtl.waitFor(() => assert.equal(rows(container), 5, "the top bar drives the same URL-backed paging"));

  for (const bar of [pagerTop(container), pagerBottom(container)]) {
    assert.match(text(bar), /Showing 21–25 of 25 records · Page 2 of 2/, "both bars follow the new page");
    const [prev, next] = bar.querySelectorAll("button.pagination-button");
    assert.ok(!prev.disabled, "Previous becomes enabled on page 2");
    assert.ok(next.disabled, "Next is disabled on the last page");
  }
  assert.ok((await lastReplaceHref()).includes("page=2"), "the commit goes through the existing ?page= hook");
  assert.equal(document.activeElement?.id, "directory-results-title", "the shared results-heading focus is reused");
});

test("F2: a one-page or empty set renders neither bar", async () => {
  const few = await renderDirectory({ records: FEW });
  await rtl.waitFor(() => assert.equal(rows(few.container), 4));
  assert.equal(pagers(few.container).length, 0, "no pager at all for a single-page set");

  rtl.cleanup();
  __resetPublicCamerasCache();
  const empty = await renderDirectory({ records: [] });
  await rtl.waitFor(() => assert.ok(text(empty.container).includes("No published record matches that search.")));
  assert.equal(pagers(empty.container).length, 0, "and none for an empty set");
});

test("F2 (CSS): the top bar is phone-only, compact, wrapping and 44px", async () => {
  const css = await readSource("app/globals.css");

  assert.match(css, /\.directory-pagination-top \{ display:none; \}/, "desktop keeps only the accepted bottom bar");
  const mobile = mediaBlocks(css, "max-width", "700px").join("\n");
  assert.match(mobile, /\.directory-pagination-top \{ display:flex;/, "phones show the bar above the first card");
  assert.match(mobile, /\.directory-pagination \{ justify-content:center; \}/, "the compact centred wrap still applies");
  // 320px IT/EN: the bar wraps instead of overflowing and the buttons keep
  // their ≥44px activation box.
  assert.match(css, /\.directory-pagination \{[^}]*flex-wrap:wrap/, "the bar wraps at 320px in both languages");
  assert.match(css, /\.pagination-button \{ min-height:44px/, "the reused buttons keep the 44px target");
});

// ---------------------------------------------------------------------------
// F3 — early "View on map" action on the public record page
// ---------------------------------------------------------------------------

const BASE_RECORD = {
  id: 7,
  title: "Fixture Record Title",
  kind: "Fixed dome",
  status: "active",
  latitude: 41.9004,
  longitude: 12.4936,
  source: "Community report",
  updated: "2026-07-01T00:00:00.000Z",
  createdAt: "2026-03-01T00:00:00.000Z",
  description: "Fictitious public record used only in tests.",
  address: "Illustrative location, Rome",
};

function recordHandler(record) {
  return (input) => {
    const single = typeof input === "string" && input.match(/^\/api\/cameras\/(\d+)$/);
    if (single) return Number(single[1]) === record.id ? jsonResponse({ record }) : jsonResponse({ error: "not found" }, { status: 404 });
    if (typeof input === "string" && input.match(/^\/api\/cameras\/\d+\/events$/)) return jsonResponse({ events: [] });
    if (typeof input === "string" && input.match(/^\/api\/cameras\/\d+\/actions$/)) return jsonResponse({ action: null });
    if (input === "/api/auth/me") return jsonResponse({ error: "anonymous" }, { status: 401 });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

async function renderRecord(record, { locale = "en" } = {}) {
  if (locale !== "en") window.localStorage.setItem("opensurveillancedb-locale", locale);
  installFetchMock(recordHandler(record));
  await setNavState({ params: { id: String(record.id) } });
  const view = await renderWithLocale(React.createElement(RecordPage));
  await view.findByText(record.title);
  await rtl.act(async () => {});
  return view;
}

test("F3: the map action is exposed early with the /mappa?focus contract, and the lower action is preserved", async () => {
  const { container } = await renderRecord(BASE_RECORD);

  const early = container.querySelector("a.record-map-early");
  assert.ok(early, "the early map action renders for a published record");
  assert.equal(early.getAttribute("href"), "/mappa?focus=7", "it uses the supported ?focus=<id> contract to open that point");
  assert.equal(text(early), "View on map ↗", "the existing localized label and button design are reused");
  assert.ok(early.classList.contains("button") && early.classList.contains("button-primary"), "the existing primary button design");

  // Reading position: after the summary, before the community metadata/facts.
  const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING
  const summaryEl = container.querySelector(".record-detail-summary");
  const badge = container.querySelector(".community-badge");
  const facts = container.querySelector(".record-detail-facts");
  assert.ok(summaryEl.compareDocumentPosition(early) & FOLLOWING, "the link follows the summary");
  assert.ok(early.compareDocumentPosition(badge) & FOLLOWING, "and precedes the community metadata");
  assert.ok(early.compareDocumentPosition(facts) & FOLLOWING, "and the facts");

  // The accepted lower action is untouched: same label, same href, own class.
  const late = container.querySelector(".record-detail-actions a.record-map-late");
  assert.ok(late, "the lower action still renders in the accepted action row");
  assert.equal(late.getAttribute("href"), "/mappa", "with its original href");
  assert.equal(text(late), "View on map ↗");
  assert.equal(container.querySelectorAll("a.record-map-early, a.record-map-late").length, 2, "one link per breakpoint, never a third copy");
});

test("F3: withdrawn records expose neither the early nor the lower map action", async () => {
  for (const status of ["hidden", "removed"]) {
    const view = await renderRecord({ ...BASE_RECORD, status });
    assert.equal(view.container.querySelector("a.record-map-early"), null, `${status} records render no early map action`);
    assert.equal(view.container.querySelector("a.record-map-late"), null, `${status} records render no lower map action`);
    assert.equal(view.container.querySelectorAll('a[href^="/mappa"]').length, 0, `${status} records expose no /mappa link at all`);
    rtl.cleanup();
    __resetPublicCamerasCache();
  }
});

test("F3: a demo record keeps the early focused action, localized in IT", async () => {
  const { container } = await renderRecord({ ...BASE_RECORD, status: "demo", source: "Development seed" }, { locale: "it" });

  const early = container.querySelector("a.record-map-early");
  assert.ok(early, "demo records are shown on the map, so they keep the early action");
  assert.equal(early.getAttribute("href"), "/mappa?focus=7");
  assert.equal(text(early), "Vedi sulla mappa ↗", "the existing Italian label is reused");
  assert.equal(container.querySelector("a.record-map-late")?.getAttribute("href"), "/mappa", "the lower action is unchanged in IT too");
});

test("F3 (CSS): exactly one map action is visible per breakpoint", async () => {
  const css = await readSource("app/globals.css");

  assert.match(css, /\.record-map-early \{ display:none; \}/, "desktop hides the early action from layout and AT");
  const mobile = mediaBlocks(css, "max-width", "700px").join("\n");
  assert.match(mobile, /\.record-map-early \{ display:inline-flex;/, "phones show the early action");
  assert.match(mobile, /\.record-map-late \{ display:none; \}/, "phones hide the lower action (no duplicate focusable link)");
});
