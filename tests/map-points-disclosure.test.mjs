/**
 * ID 2 (bounded mobile follow-up) — the points disclosure below /mappa.
 *
 * Before: on a phone the header row showed the verbose title + the whole
 * "Showing all N points in the current view" sentence OUTSIDE the toggle,
 * while the toggle itself was a bare 44px chevron in the corner — the row was
 * not the control, and the press carried no verb and no count.
 *
 * Contract asserted here (owner-approved compact design):
 *   1. the ENTIRE visible header row is ONE native <button> carrying ONE
 *      compact localized label — "Show 10 points" / "Hide 10 points" — whose
 *      zero/one/many wording comes from the dictionary (EN + IT), and whose
 *      accessible name is exactly that visible label;
 *   2. the verbose heading + current-view sentence stay in the DOM, clipped by
 *      mobile CSS, for the sidebar label (h2), the role=status live region and
 *      the control's aria-describedby — they are NOT painted twice;
 *   3. aria-expanded / aria-controls follow the collapsed flag; the press works
 *      from the keyboard (native button) and flips the verb;
 *   4. the count is visibleRecords.length — never the accumulated filtered
 *      set — including zero and singular wording;
 *   5. pointing at no records still keeps the map workspace and the list
 *      container rendered (the empty note lives inside it);
 *   6. without onToggleCollapse the original header (text + padding) is
 *      untouched, and the >=769px header keeps its h2 + count + icon-button
 *      geometry with the chevron still painted.
 *
 * Fixtures are fictitious (example.test addresses).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test, { afterEach, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  setupDom, loadDomModule, renderWithLocale, wrapWithLocale, React,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relative) => readFile(path.join(root, relative), "utf8");

let rtl;
let MapRecordList;
let en;
let it;

const CAMERAS = [
  { id: 1, title: "Illustrative record A", kind: "Fixed dome", status: "demo", address: "Via Example 1" },
  { id: 2, title: "Illustrative record B", kind: "Traffic monitoring", status: "demo", address: "Piazza Example 3" },
];

before(async () => {
  rtl = await setupDom();
  MapRecordList = (await loadDomModule("app/components/home/MapRecordList.mjs")).MapRecordList;
  const bundle = await loadDomModule("app/lib/i18n/map.mjs");
  en = bundle.en;
  it = bundle.it;
});

afterEach(() => rtl?.cleanup());

/** Labels from the REAL map dictionary, with listCount calls recorded. */
function labelsFor(dict, calls = []) {
  return {
    ...dict,
    listCount: (visible, total) => {
      calls.push([visible, total]);
      return dict.listCount(visible, total);
    },
  };
}

function props({ filteredRecords = CAMERAS, visibleRecords = CAMERAS, collapsed = true, onToggleCollapse = () => {}, labels = labelsFor(en) } = {}) {
  return {
    filteredRecords,
    visibleRecords,
    selectedId: 1,
    onSelect: () => {},
    labels,
    statusLabel: (status) => status,
    collapsed,
    onToggleCollapse,
  };
}

function element(options) {
  return wrapWithLocale(React.createElement(MapRecordList, props(options)));
}

test("the whole visible header row is ONE button with ONE compact label", async () => {
  const view = await renderWithLocale(await element());
  const header = view.container.querySelector(".map-list-header");
  assert.ok(header, "the header renders");

  const buttons = header.querySelectorAll("button");
  assert.equal(buttons.length, 1, "exactly one control in the header row");
  const toggle = buttons[0];
  assert.equal(toggle.tagName, "BUTTON", "native button semantics");
  assert.equal(toggle.getAttribute("type"), "button", "never a submit button");
  assert.equal(toggle.getAttribute("aria-expanded"), "false", "collapsed by default keeps aria-expanded=false");
  assert.equal(toggle.getAttribute("aria-controls"), "map-list-scroll", "the control still names the list it controls");
  assert.equal(toggle.getAttribute("role"), null, "no ARIA role substitutes the native semantics");

  // ONE visible text block inside the control: the compact verb+count label.
  const state = toggle.querySelectorAll(".map-list-toggle-state");
  assert.equal(state.length, 1, "one label block");
  assert.equal(state[0].textContent, en.listShowCount(2), "the label is the dictionary's compact show+count string");
  assert.equal(state[0].textContent, "Show 2 points");
  const compactText = toggle.textContent.replace(/\s+/g, " ").trim();
  assert.equal(compactText, "Show 2 points", "the row paints only the compact label (the chevron is aria-hidden)");
  assert.ok(!compactText.includes(en.listTitle), "the verbose title is not painted again inside the control");
  assert.ok(!compactText.includes(en.listCount(2, 2)), "the verbose current-view sentence is not painted again");

  // Accessible name == visible label (WCAG 2.5.3), and the current-view
  // context rides along as the accessible description of the live region.
  assert.equal(toggle.getAttribute("aria-label"), "Show 2 points", "accessible name is exactly the visible label");
  assert.equal(toggle.getAttribute("aria-describedby"), "map-list-count", "the current-view context stays available to AT");
  assert.equal(header.querySelector("#map-list-count").getAttribute("role"), "status", "the live count region survives");

  // The heading target of the sidebar's aria-labelledby survives, and the
  // header advertises that it owns a toggle (mobile CSS hook).
  assert.equal(header.querySelector("h2#map-list-title").textContent, en.listTitle);
  assert.ok(header.classList.contains("has-toggle"), "the mobile CSS hook marks a toggle-owning header");
});

test("the pressed state flips the compact verb and keeps ONE label per state", async () => {
  function Harness() {
    const [collapsed, setCollapsed] = React.useState(true);
    return React.createElement(MapRecordList, {
      ...props({ collapsed: true }),
      collapsed,
      onToggleCollapse: () => setCollapsed((current) => !current),
    });
  }
  const view = await renderWithLocale(await wrapWithLocale(React.createElement(Harness)));
  const toggle = () => view.container.querySelector(".map-list-toggle");

  assert.equal(toggle().getAttribute("aria-expanded"), "false");
  assert.equal(toggle().querySelector(".map-list-toggle-state").textContent, "Show 2 points");
  assert.match(view.container.querySelector(".map-list-scroll").className, /is-collapsed/, "the list stays mounted and CSS-hidden");

  await rtl.userEvent.click(toggle());
  assert.equal(toggle().getAttribute("aria-expanded"), "true", "the press flips aria-expanded");
  assert.equal(toggle().querySelector(".map-list-toggle-state").textContent, "Hide 2 points", "expanded shows the hide verb");
  assert.equal(toggle().getAttribute("aria-label"), "Hide 2 points", "name follows the visible label");
  assert.equal(toggle().querySelectorAll(".map-list-toggle-state").length, 1, "still one label block");
  assert.ok(!toggle().textContent.includes("Show 2 points"), "the two verbs never show together");
});

test("the control is reachable and operable from the keyboard", async () => {
  let toggled = 0;
  const view = await renderWithLocale(await element({ collapsed: true, onToggleCollapse: () => { toggled += 1; } }));
  const toggle = view.container.querySelector(".map-list-toggle");
  toggle.focus();
  assert.equal(view.container.ownerDocument.activeElement, toggle, "the row control takes focus");
  await rtl.userEvent.keyboard("{Enter}");
  assert.equal(toggled, 1, "Enter activates the row");
  await rtl.userEvent.keyboard(" ");
  assert.equal(toggled, 2, "Space activates the row");
});

test("the visible count is visibleRecords.length, not the accumulated filtered set", async () => {
  const countCalls = [];
  const filtered = [...CAMERAS, { id: 3, title: "Third", kind: "Bullet", status: "demo" }, { id: 4, title: "Fourth", kind: "Bullet", status: "demo" }];
  const view = await renderWithLocale(await element({ filteredRecords: filtered, visibleRecords: CAMERAS, labels: labelsFor(en, countCalls) }));
  assert.deepEqual(countCalls.at(-1), [2, 2], "the label is built from the in-view count on both sides");
  assert.equal(view.container.querySelectorAll(".map-record").length, 2, "only in-view rows are listed");
  assert.equal(view.container.querySelector(".map-list-toggle-state").textContent, "Show 2 points");
});

test("zero, one and many wording comes from the dictionaries in both locales", async () => {
  // The dictionary owns the grammar: one compact string per state, no English
  // concatenation inside the component.
  const cases = [
    { dict: en, many: "Show 10 points", one: "Show 1 point", zero: "Show 0 points", manyHide: "Hide 10 points", oneHide: "Hide 1 point", zeroHide: "Hide 0 points" },
    { dict: it, many: "Mostra 10 punti", one: "Mostra 1 punto", zero: "Mostra 0 punti", manyHide: "Nascondi 10 punti", oneHide: "Nascondi 1 punto", zeroHide: "Nascondi 0 punti" },
  ];
  const many = Array.from({ length: 10 }, (_, index) => ({ id: 100 + index, title: `Fixture ${index}`, kind: "Bullet", status: "demo" }));

  for (const item of cases) {
    assert.equal(item.dict.listShowCount(10), item.many);
    assert.equal(item.dict.listShowCount(1), item.one);
    assert.equal(item.dict.listShowCount(0), item.zero);
    // Literal expectations: comparing the function to itself would pass even
    // if the singular hide wording regressed (review A finding A2).
    assert.equal(item.dict.listHideCount(10), item.manyHide);
    assert.equal(item.dict.listHideCount(1), item.oneHide);
    assert.equal(item.dict.listHideCount(0), item.zeroHide);
    assert.ok(item.dict.listHideCount(1).length <= 20, "the compact label stays short enough for a 320px row");

    const manyView = await renderWithLocale(await element({ filteredRecords: many, visibleRecords: many, labels: labelsFor(item.dict) }));
    assert.equal(manyView.container.querySelector(".map-list-toggle-state").textContent, item.many);
    manyView.unmount();

    const oneView = await renderWithLocale(await element({ filteredRecords: many, visibleRecords: [many[0]], labels: labelsFor(item.dict) }));
    assert.equal(oneView.container.querySelector(".map-list-toggle-state").textContent, item.one);
    oneView.unmount();

    const zeroView = await renderWithLocale(await element({ filteredRecords: [], visibleRecords: [], labels: labelsFor(item.dict) }));
    const zeroToggle = zeroView.container.querySelector(".map-list-toggle");
    assert.equal(zeroToggle.querySelector(".map-list-toggle-state").textContent, item.zero);
    // Map-always-visible contract: the list container and its truthful note
    // stay mounted under the disclosure row.
    assert.ok(zeroView.container.querySelector(".map-list-scroll"), "the list container stays mounted");
    assert.ok(zeroView.container.querySelector(".map-list-empty-title"), "the truthful empty note lives inside the list");
    zeroView.unmount();
  }

  assert.equal(en.listShowCount(1), "Show 1 point");
  assert.equal(it.listShowCount(1), "Mostra 1 punto");
  assert.equal(it.listHideCount(0), "Nascondi 0 punti");
  assert.equal(en.listHideCount(1), "Hide 1 point");
  assert.equal(it.listHideCount(1), "Nascondi 1 punto");
});

test("without onToggleCollapse the original header text and shape is untouched", async () => {
  const view = await renderWithLocale(await wrapWithLocale(React.createElement(MapRecordList, {
    filteredRecords: CAMERAS,
    visibleRecords: CAMERAS,
    selectedId: 1,
    onSelect: () => {},
    labels: labelsFor(en),
    statusLabel: (status) => status,
  })));
  const header = view.container.querySelector(".map-list-header");
  assert.equal(header.querySelectorAll("button").length, 0, "no disclosure control without a handler");
  assert.ok(!header.classList.contains("has-toggle"), "no mobile hook without a handler");
  assert.equal(header.querySelector("h2#map-list-title").textContent, en.listTitle);
  assert.equal(header.querySelector(".map-list-count").textContent, en.listCount(2, 2));
  assert.equal(header.querySelector(".map-list-count").getAttribute("role"), "status");
});

test("CSS: mobile row control + desktop icon control keep their own geometry", async () => {
  const css = await readSource("app/globals.css");
  const mediaBlocks = (feature, value) => {
    const matcher = new RegExp(`@media\\s*\\(\\s*${feature}\\s*:\\s*${value}\\s*\\)\\s*\\{`, "g");
    const blocks = [];
    while (matcher.exec(css)) {
      let depth = 1;
      let cursor = matcher.lastIndex;
      const start = cursor;
      while (cursor < css.length && depth > 0) {
        if (css[cursor] === "{") depth += 1;
        if (css[cursor] === "}") depth -= 1;
        cursor += 1;
      }
      if (depth === 0) blocks.push(css.slice(start, cursor - 1));
    }
    return blocks.join("\n");
  };
  const mobile = mediaBlocks("max-width", "768px");
  const desktop = mediaBlocks("min-width", "769px");
  const base = css.slice(0, css.indexOf("@media (max-width:768px)"));

  // Mobile: the button owns the row and paints the compact label.
  assert.match(mobile, /\.map-list-toggle \{[^}]*width:100%/, "the mobile button spans the header row");
  assert.match(mobile, /\.map-list-toggle \{[^}]*min-height:44px/, "the row keeps a >=44px touch target");
  assert.match(mobile, /\.map-list-toggle-state \{ display:inline-flex;/, "the compact label is painted on mobile");
  // The padding reset belongs to headers that OWN a toggle (icon-only headers
  // keep the original geometry).
  assert.match(mobile, /\.map-list-header\.has-toggle \{ padding:0; \}/, "only a toggle-owning header drops its padding");
  assert.doesNotMatch(mobile, /\.map-list-header \{ padding:0; \}/, "the icon-only header keeps its original padding");
  // The verbose heading/live count are clipped on mobile, not painted twice.
  assert.match(mobile, /\.map-list-header\.has-toggle h2,[\s\S]*?\.map-list-header\.has-toggle \.map-list-count \{[^}]*clip:rect\(0,0,0,0\)/, "heading + current-view sentence are clipped (kept for AT) on mobile only");

  // Desktop: the accepted 32px icon control and the h2 + count header stay,
  // and the chevron keeps its original display (only the added label hides).
  assert.match(desktop, /\.map-list-toggle \{[^}]*width:32px/, "desktop keeps the 32px icon control");
  assert.match(base, /\.map-list-toggle-state \{ display:none; \}/, "only the ADDED compact label is hidden on desktop");
  assert.doesNotMatch(base, /\.map-list-toggle[^{,]*svg[^{]*\{[^}]*display:none/, "the desktop chevron is never hidden");
  assert.doesNotMatch(base, /\.map-list-toggle \{[^}]*display:none/, "the desktop control itself is never hidden");
  assert.match(desktop, /\.map-sidebar\.is-collapsed \.map-list-header h2/, "desktop keeps its collapsed-rail header rules");
});
