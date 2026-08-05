/**
 * Mobile map-first points panel (t_b7728ad0 extension) — MapRecordList
 * collapse toggle contract.
 *
 * The "Points in the current view" panel on small screens starts collapsed
 * below the map (the map is the primary function); the header keeps the
 * title + live count and carries an accessible disclosure toggle
 * (aria-expanded, aria-controls, keyboard reachable). The list itself is
 * hidden while collapsed (CSS), the React side just flips the flag.
 *
 * jsdom has no matchMedia by default, so MapPanel initialises the panel
 * expanded (desktop/SSR-safe); the toggle contract is exercised directly.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let MapRecordList;

const labels = {
  listTitle: "Points in the current view",
  listCount: (visible, total) => `Showing all ${visible} of ${total} points`,
  listMapSyncHelp: "The list updates as you move or zoom the map.",
  listEmptyInView: "No documented points in the current view.",
  emptyTitle: "No published record matches those filters.",
  emptyBody: "Reset the filters or browse the directory.",
  clearSearch: "Clear filters",
};

const cameras = [
  { id: 1, title: "Illustrative record A", kind: "Fixed dome", status: "demo", address: "Via Nazionale 12, Roma" },
  { id: 2, title: "Illustrative record B", kind: "Traffic monitoring", status: "demo", address: "Piazza Venezia 3, Roma" },
];

before(async () => {
  rtl = await setupDom();
  MapRecordList = (await loadDomModule("app/components/home/MapRecordList.mjs")).MapRecordList;
});

afterEach(() => rtl?.cleanup());

function renderList({ collapsed = false, onToggleCollapse = () => {} } = {}) {
  return renderWithLocale(React.createElement(MapRecordList, {
    filteredRecords: cameras,
    visibleRecords: cameras,
    selectedId: 1,
    onSelect: () => {},
    onReset: () => {},
    labels,
    statusLabel: (status) => (status === "demo" ? "Illustrative record" : status),
    collapsed,
    onToggleCollapse,
  }));
}

test("map points panel: header keeps title + count and carries the disclosure toggle (t_b7728ad0)", async () => {
  const { screen } = rtl;
  const view = await renderList();
  assert.ok(screen.getByRole("heading", { name: "Points in the current view" }));
  assert.ok(screen.getAllByText(/Showing all 2 of 2 points/).length >= 1);
  const toggle = screen.getByRole("button", { name: /Points in the current view: Showing all 2 of 2 points/ });
  assert.equal(toggle.getAttribute("aria-expanded"), "true", "expanded when the panel is open");
  assert.equal(toggle.getAttribute("aria-controls"), "map-list-scroll", "toggle names the list it controls");
  // The list is present and the records are reachable.
  assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }));
  assert.ok(view.container.querySelector(".map-list-scroll"), "the scroll container is in the DOM");
});

test("map points panel: collapsed flag hides the list and flips aria-expanded (t_b7728ad0)", async () => {
  const { screen } = rtl;
  let toggled = 0;
  const view = await renderList({ collapsed: true, onToggleCollapse: () => { toggled += 1; } });
  const toggle = screen.getByRole("button", { name: /Points in the current view/ });
  assert.equal(toggle.getAttribute("aria-expanded"), "false", "aria-expanded=false when collapsed");
  const scroll = view.container.querySelector(".map-list-scroll");
  assert.ok(scroll, "the list container stays in the DOM");
  assert.match(scroll.className, /is-collapsed/, "the CSS hook hides the list while collapsed");
  // The header remains — the count is still announced.
  assert.ok(screen.getAllByText(/Showing all 2 of 2 points/).length >= 1);
  // Clicking the toggle asks the parent to expand.
  await rtl.userEvent.click(toggle);
  assert.equal(toggled, 1, "toggle click routes to the parent handler");
});

test("map points panel: no toggle is rendered without a handler (desktop/list-internal usage)", async () => {
  const { screen } = rtl;
  const view = await renderWithLocale(React.createElement(MapRecordList, {
    filteredRecords: cameras,
    visibleRecords: cameras,
    selectedId: 1,
    onSelect: () => {},
    labels,
    statusLabel: (status) => status,
  }));
  assert.ok(!screen.queryByRole("button", { name: /Points in the current view/ }), "no toggle without onToggleCollapse");
  assert.ok(view.container.querySelector(".map-list-scroll"), "the list still renders");
  assert.ok(screen.getByRole("button", { name: /Illustrative record A/ }));
});
