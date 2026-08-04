/**
 * Client-side DOM tests for LegalTableWrap — the keyboard-access fix for
 * the scrollable legal tables (QA#2 F1, axe serious /
 * scrollable-region-focusable on /privacy).
 *
 * The wrapper is overflow-x: auto on narrow viewports; a scrollable region
 * must be keyboard-reachable (WCAG 2.1.1). The component measures overflow
 * client-side (scrollWidth > clientWidth — impossible to know at SSR time)
 * and applies tabIndex=0 + role=region + aria-label ONLY when the table
 * actually overflows, so the desktop tab order is never polluted.
 *
 * jsdom reports scrollWidth = clientWidth = 0, so the overflow branch is
 * exercised by defining the layout properties on the real wrapper node and
 * firing a window resize (the component listens to resize as the
 * ResizeObserver fallback — jsdom has no ResizeObserver).
 *
 * Fixtures are fictitious (made-up table cells); no personal data.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let LegalTableWrap;

before(async () => {
  rtl = await setupDom();
  LegalTableWrap = (await loadDomModule("app/components/LegalTableWrap.mjs")).LegalTableWrap;
});

afterEach(() => rtl?.cleanup());

function tableFixture() {
  return React.createElement(
    "table",
    { className: "legal-table" },
    React.createElement("caption", null, "Personal data processed by the Service"),
    React.createElement("tbody", null,
      React.createElement("tr", null,
        React.createElement("td", null, "Report content: location, description"),
      ),
    ),
  );
}

async function renderWrap() {
  return renderWithLocale(React.createElement(LegalTableWrap, null, tableFixture()));
}

test("LegalTableWrap renders a plain wrapper when the table fits (no tab stop)", async () => {
  const view = await renderWrap();
  const wrap = view.container.querySelector(".legal-table-wrap");
  assert.ok(wrap, "the wrapper div must render");
  assert.equal(wrap.getAttribute("tabindex"), null, "a fitting table must not add a tab stop");
  assert.equal(wrap.getAttribute("role"), null, "a fitting table is not a region");
  assert.equal(wrap.getAttribute("aria-label"), null);
  assert.ok(wrap.querySelector("table.legal-table"), "the table stays inside the wrapper");
});

test("LegalTableWrap makes an overflowing table a labelled focusable region", async () => {
  const view = await renderWrap();
  const wrap = view.container.querySelector(".legal-table-wrap");
  assert.ok(wrap);

  // Simulate overflow: the wrapper is wider than its client box. jsdom
  // layout is all zeros, so define the metrics and re-trigger the check.
  Object.defineProperty(wrap, "scrollWidth", { value: 640, configurable: true });
  Object.defineProperty(wrap, "clientWidth", { value: 320, configurable: true });
  window.dispatchEvent(new Event("resize"));

  await rtl.waitFor(() => {
    assert.equal(wrap.getAttribute("tabindex"), "0", "an overflowing table must be keyboard-reachable");
  });
  assert.equal(wrap.getAttribute("role"), "region", "the scrollable region is announced as a region");
  assert.ok(
    wrap.getAttribute("aria-label"),
    "the region carries a localized accessible name",
  );
});

test("LegalTableWrap drops the tab stop when the table stops overflowing", async () => {
  const view = await renderWrap();
  const wrap = view.container.querySelector(".legal-table-wrap");
  assert.ok(wrap);

  Object.defineProperty(wrap, "scrollWidth", { value: 640, configurable: true });
  Object.defineProperty(wrap, "clientWidth", { value: 320, configurable: true });
  window.dispatchEvent(new Event("resize"));
  await rtl.waitFor(() => assert.equal(wrap.getAttribute("tabindex"), "0"));

  // The region fits again: the tab stop must disappear.
  Object.defineProperty(wrap, "scrollWidth", { value: 280, configurable: true });
  window.dispatchEvent(new Event("resize"));
  await rtl.waitFor(() => assert.equal(wrap.getAttribute("tabindex"), null));
  assert.equal(wrap.getAttribute("role"), null);
});
