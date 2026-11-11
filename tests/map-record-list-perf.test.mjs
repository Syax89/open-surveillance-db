/**
 * /mappa points list render cap (perf) — MapRecordList.
 *
 * At national zoom the viewport holds thousands of points; one <li> per
 * point (rendered even while the panel was CSS-collapsed) made a small pan
 * cost seconds on a throttled phone. Contract asserted here:
 *   1. collapsed → no rows rendered, header/toggle/count + the aria-controls
 *      target stay;
 *   2. expanded with 3×N records → N rows + an accessible "Show more";
 *   3. "Show more" appends the next page, keeps focus on the button,
 *      announces the listed count politely, and the full count text is
 *      unchanged;
 *   4. the page count resets when the visible set changes (new array);
 *   5. the selected record is always rendered (aria-current sync);
 *   6. React.memo: an unrelated parent re-render with the same props does
 *      not re-render the rows.
 *
 * Fixtures are fictitious.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, wrapWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let mod;
let en;
let it;

before(async () => {
  rtl = await setupDom();
  mod = await loadDomModule("app/components/home/MapRecordList.mjs");
  const bundle = await loadDomModule("app/lib/i18n/map.mjs");
  en = bundle.en;
  it = bundle.it;
});

afterEach(() => rtl?.cleanup());

const N = () => mod.MAP_LIST_PAGE_SIZE ?? 50;
const records = (count, offset = 0) => Array.from({ length: count }, (_, index) => ({
  id: offset + index + 1, title: `Fixture point ${offset + index + 1}`, kind: "Bullet", status: "demo",
}));

function baseProps(overrides = {}) {
  const list = overrides.visibleRecords ?? records(3 * N());
  return {
    filteredRecords: list,
    visibleRecords: list,
    selectedId: null,
    onSelect: () => {},
    labels: en,
    statusLabel: (status) => status,
    collapsed: false,
    onToggleCollapse: () => {},
    ...overrides,
  };
}

const rows = (container) => container.querySelectorAll(".map-record-list > li");

test("exports a sensible page size constant", () => {
  assert.equal(typeof mod.MAP_LIST_PAGE_SIZE, "number");
  assert.ok(mod.MAP_LIST_PAGE_SIZE >= 20 && mod.MAP_LIST_PAGE_SIZE <= 100);
});

test("collapsed: no rows are rendered, the header, count and controlled container stay", async () => {
  const props = baseProps({ collapsed: true });
  const view = await renderWithLocale(React.createElement(mod.MapRecordList, props));
  assert.equal(rows(view.container).length, 0, "no <li> while collapsed");
  assert.equal(view.container.querySelectorAll(".map-record").length, 0);
  const toggle = view.container.querySelector(".map-list-toggle");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(toggle.getAttribute("aria-controls"), "map-list-scroll");
  assert.ok(view.container.querySelector("#map-list-scroll"), "the aria-controls target exists");
  assert.equal(toggle.getAttribute("aria-label"), en.listShowCount(3 * N()), "full count in the toggle");
  assert.equal(view.container.querySelector("#map-list-count").textContent, en.listCount(3 * N(), 3 * N()));
});

test("expanded with 3×N records: N rows + Show more; clicking appends, keeps focus, announces", async () => {
  const total = 3 * N();
  const view = await renderWithLocale(React.createElement(mod.MapRecordList, baseProps()));
  assert.equal(rows(view.container).length, N(), "first page only");
  assert.equal(rows(view.container)[0].textContent.includes("Fixture point 1"), true, "existing order kept");
  const more = rtl.screen.getByRole("button", { name: en.listShowMore(N(), 2 * N()) });
  assert.equal(more.getAttribute("type"), "button");
  assert.ok(view.container.textContent.includes(en.listShownOf(N(), total)), "visible listed-of summary");
  // The full in-view count is unchanged by the cap.
  assert.equal(view.container.querySelector("#map-list-count").textContent, en.listCount(total, total));
  assert.equal(view.container.querySelector(".map-list-toggle").getAttribute("aria-label"), en.listHideCount(total));

  more.focus();
  await rtl.userEvent.click(more);
  assert.equal(rows(view.container).length, 2 * N(), "the next page is appended");
  const again = rtl.screen.getByRole("button", { name: en.listShowMore(N(), N()) });
  assert.equal(again, more, "the same button element persists");
  assert.equal(view.container.ownerDocument.activeElement, more, "focus stays on Show more");
  const live = view.container.querySelector("[aria-live=\"polite\"]");
  assert.ok(live, "a polite live region exists");
  assert.equal(live.textContent, en.listShownOf(2 * N(), total), "the new listed count is announced");
  assert.equal(view.container.querySelector("#map-list-count").textContent, en.listCount(total, total), "full count unchanged");

  await rtl.userEvent.click(more);
  assert.equal(rows(view.container).length, total, "everything listed");
  assert.equal(view.container.querySelector(".map-list-more"), null, "no Show more once everything is listed");
  assert.equal(view.container.ownerDocument.activeElement, rows(view.container)[2 * N()].querySelector("button"), "focus moves to the first appended row, never <body>");
});

test("the page count resets when the visible set changes (new viewport/filter result)", async () => {
  const first = records(3 * N());
  const view = await renderWithLocale(React.createElement(mod.MapRecordList, baseProps({ visibleRecords: first, filteredRecords: first })));
  await rtl.userEvent.click(rtl.screen.getByRole("button", { name: en.listShowMore(N(), 2 * N()) }));
  assert.equal(rows(view.container).length, 2 * N());
  // Same array (unrelated re-render): pages kept.
  view.rerender(await wrapWithLocale(React.createElement(mod.MapRecordList, baseProps({ visibleRecords: first, filteredRecords: first, selectedId: 3 }))));
  assert.equal(rows(view.container).length, 2 * N(), "same visible set keeps the expanded pages");
  const next = records(3 * N(), 1000);
  view.rerender(await wrapWithLocale(React.createElement(mod.MapRecordList, baseProps({ visibleRecords: next, filteredRecords: next }))));
  assert.equal(rows(view.container).length, N(), "a new visible set resets to one page");
});

test("the selected record is always rendered, even beyond the first page", async () => {
  const list = records(3 * N());
  const selectedId = list[2 * N() + 5].id;
  const view = await renderWithLocale(React.createElement(mod.MapRecordList, baseProps({ visibleRecords: list, filteredRecords: list, selectedId })));
  const current = view.container.querySelector("[aria-current=\"true\"]");
  assert.ok(current, "the selected row is rendered");
  assert.ok(current.textContent.includes(`Fixture point ${selectedId}`));
});

test("Italian strings exist with parity", () => {
  assert.equal(typeof it.listShowMore, "function");
  assert.equal(typeof it.listShownOf, "function");
  assert.notEqual(it.listShowMore(50, 120), en.listShowMore(50, 120));
  assert.match(it.listShownOf(50, 120), /50.*120/);
  assert.match(en.listShowMore(1, 1), /point/);
});

test("React.memo: an unrelated parent re-render does not re-render the rows", async () => {
  let statusCalls = 0;
  const list = records(5);
  const statusLabel = (status) => { statusCalls += 1; return status; };
  const onSelect = () => {};
  const onToggleCollapse = () => {};
  function Parent() {
    const [tick, setTick] = React.useState(0);
    return React.createElement(React.Fragment, null,
      React.createElement("button", { type: "button", onClick: () => setTick(tick + 1) }, `tick ${tick}`),
      React.createElement(mod.MapRecordList, { filteredRecords: list, visibleRecords: list, selectedId: null, onSelect, labels: en, statusLabel, collapsed: false, onToggleCollapse }));
  }
  await renderWithLocale(React.createElement(Parent));
  const before = statusCalls;
  assert.ok(before >= 5, "rows rendered once");
  await rtl.userEvent.click(rtl.screen.getByRole("button", { name: "tick 0" }));
  assert.ok(rtl.screen.getByRole("button", { name: "tick 1" }), "the parent did re-render");
  assert.equal(statusCalls, before, "the memoized list did not re-render");
});

test("pages grown to reveal the selected row persist when an earlier row is selected", async () => {
  const list = records(3 * N());
  const props = baseProps({ visibleRecords: list, filteredRecords: list, selectedId: list[2 * N() + 5].id });
  const view = await renderWithLocale(React.createElement(mod.MapRecordList, props));
  assert.equal(rows(view.container).length, 3 * N(), "the list grew to the selected row's page");
  view.rerender(await wrapWithLocale(React.createElement(mod.MapRecordList, { ...props, selectedId: list[3].id })));
  assert.equal(rows(view.container).length, 3 * N(), "selecting an earlier row does not shrink the list (no jump)");
});
