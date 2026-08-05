/**
 * Hydration parity for the mobile map-first points panel (t_66766914, P0).
 *
 * CEO report: React hydration error on /mappa — the server html carried
 * `class="map-list-toggle is-open"` + `aria-expanded="true"` (expanded),
 * while the FIRST client render on a mobile viewport (390px) collapsed the
 * panel (`window.matchMedia("(max-width: 768px)")` read inside a lazy
 * useState initializer returns true on the client, false during SSR).
 *
 * The fix makes the initial state DETERMINISTIC (expanded) on both server
 * and client, and applies the mobile preference ONLY after hydration, in
 * an effect; a later manual toggle (user choice) always wins over a
 * media-query change, so the panel never flickers back.
 *
 * This suite pins the contract:
 *   1. SSR html == FIRST client render at 390px: the toggle is expanded
 *      (is-open, aria-expanded=true) in both — the hydration mismatch is
 *      impossible because no lazy initializer reads window/matchMedia.
 *   2. The mobile preference is applied AFTER hydration: at 390px the
 *      panel collapses post-mount; desktop stays expanded.
 *   3. A later manual toggle is never overridden by a media-query change.
 *   4. Static guard: MapPanel.tsx forbids typeof window / matchMedia in a
 *      useState lazy initializer.
 *
 * Fixtures: fictitious demo records only (privacy & safety by design).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  setupDom, loadDomModule, renderWithLocale, wrapWithLocale, React,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSource = (relativePath) => readFile(path.join(root, relativePath), "utf8");

let rtl;
let MappaTool;
// Restore the harness default matchMedia after every test — the mobile
// stub installed by installMatchMedia must never leak into the next test
// (window.matchMedia is shared process-global state in jsdom).
let restoreMatchMedia = null;

before(async () => {
  rtl = await setupDom();
  MappaTool = (await loadDomModule("app/components/tools/MappaTool.mjs")).MappaTool;
});

afterEach(() => {
  rtl?.cleanup();
  restoreMatchMedia?.();
  restoreMatchMedia = null;
});

/**
 * Install a controllable matchMedia stub for a mobile viewport (390px):
 * the "(max-width: 768px)" query matches; every other query does not.
 * Returns an object with fireChange(next) to simulate a breakpoint
 * crossing (the component subscribes with addEventListener/addListener).
 */
function installMatchMedia() {
  const previous = window.matchMedia;
  const listeners = new Set();
  const mql = {
    matches: true,
    media: "(max-width: 768px)",
    onchange: null,
    addListener: (cb) => { listeners.add(cb); },
    removeListener: (cb) => { listeners.delete(cb); },
    addEventListener: (type, cb) => { if (type === "change") listeners.add(cb); },
    removeEventListener: (type, cb) => { listeners.delete(cb); },
    dispatchEvent: () => false,
  };
  window.matchMedia = (query) => (
    query.includes("max-width: 768px")
      ? mql
      : { matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }
  );
  globalThis.matchMedia = window.matchMedia;
  restoreMatchMedia = () => {
    window.matchMedia = previous;
    globalThis.matchMedia = previous;
  };
  return {
    fireChange(next) {
      mql.matches = next;
      for (const cb of [...listeners]) cb({ matches: next, media: mql.media });
    },
  };
}

/** Extract the map-list-toggle opening tag from an html string. */
function toggleMarkup(html) {
  const match = html.match(/<button[^>]*class="[^"]*map-list-toggle[^"]*"[^>]*>/);
  return match ? match[0] : null;
}

test("SSR html == primo render client a 390px: the toggle is expanded in both (t_66766914)", async () => {
  installMatchMedia(); // 390px mobile: (max-width: 768px) matches
  const wrapped = await wrapWithLocale(React.createElement(MappaTool));

  // SSR: react-dom/server renders with no window — the panel must be
  // expanded (deterministic initial state, never a lazy matchMedia read).
  const ssrHtml = renderToString(wrapped);
  const ssrToggle = toggleMarkup(ssrHtml);
  assert.ok(ssrToggle, "SSR html contains the map-list-toggle button");
  assert.match(ssrToggle, /map-list-toggle is-open/, "SSR renders the toggle expanded (is-open)");
  assert.match(ssrToggle, /aria-expanded="true"/, "SSR aria-expanded=true");

  // FIRST client render at 390px: capture the DOM committed by the
  // initial render, BEFORE the post-hydration effect runs (flushSync
  // commits synchronously; the passive effect is flushed by act only
  // after the callback body). This is exactly the render React compares
  // against the server html during hydration.
  const container = document.createElement("div");
  document.body.appendChild(container);
  const clientRoot = createRoot(container);
  let firstClientToggle = null;
  await rtl.act(() => {
    flushSync(() => clientRoot.render(wrapped));
    firstClientToggle = toggleMarkup(container.innerHTML);
  });
  clientRoot.unmount();
  container.remove();

  assert.ok(firstClientToggle, "first client render contains the map-list-toggle button");
  assert.equal(
    firstClientToggle,
    ssrToggle,
    "first client render at 390px must equal the SSR html — no hydration mismatch on the toggle",
  );
  assert.match(firstClientToggle, /map-list-toggle is-open/, "first client render keeps the panel expanded");
  assert.match(firstClientToggle, /aria-expanded="true"/, "first client render aria-expanded=true");
});

test("mobile preference applied AFTER hydration: at 390px the panel collapses post-mount (t_66766914)", async () => {
  installMatchMedia(); // 390px mobile
  const view = await renderWithLocale(React.createElement(MappaTool));
  const toggle = view.container.querySelector(".map-list-toggle");
  assert.ok(toggle, "the disclosure toggle is rendered");
  // The post-hydration effect has run (renderWithLocale flushes effects):
  // on a mobile viewport the panel is now collapsed — the mobile
  // preference is applied, just not during the first render.
  assert.equal(toggle.getAttribute("aria-expanded"), "false", "mobile preference collapses the panel after hydration");
  assert.ok(!toggle.classList.contains("is-open"), "is-open removed after hydration on mobile");
  // The list is hidden (CSS hook) but still in the DOM (never unmounted).
  const scroll = view.container.querySelector(".map-list-scroll");
  assert.ok(scroll, "the list container stays in the DOM");
  assert.match(scroll.className, /is-collapsed/, "the CSS hook hides the list while collapsed");
});

test("desktop keeps the panel expanded after hydration (t_66766914)", async () => {
  // Default harness matchMedia stub matches nothing → desktop viewport.
  const view = await renderWithLocale(React.createElement(MappaTool));
  const toggle = view.container.querySelector(".map-list-toggle");
  assert.ok(toggle, "the disclosure toggle is rendered");
  assert.equal(toggle.getAttribute("aria-expanded"), "true", "desktop keeps the panel expanded");
  assert.ok(toggle.classList.contains("is-open"), "is-open kept on desktop");
});

test("a later manual toggle is never overridden by a media-query change (t_66766914)", async () => {
  const mm = installMatchMedia(); // 390px mobile
  const view = await renderWithLocale(React.createElement(MappaTool));
  const toggle = view.container.querySelector(".map-list-toggle");
  assert.equal(toggle.getAttribute("aria-expanded"), "false", "starts collapsed on mobile (post-hydration)");

  // User choice: expand the panel from the keyboard/touch.
  await rtl.userEvent.click(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "true", "manual toggle expands the panel");

  // A later media-query change (e.g. a resize crossing the breakpoint)
  // must NOT re-collapse a panel the user explicitly opened.
  mm.fireChange({ matches: false }); // to desktop
  mm.fireChange({ matches: true });  // back to mobile
  assert.equal(
    toggle.getAttribute("aria-expanded"),
    "true",
    "user choice wins over media-query changes — no flicker back",
  );
});

test("static guard: no typeof window / matchMedia in a useState lazy initializer (t_66766914)", async () => {
  const source = await readSource("app/components/home/MapPanel.tsx");
  // The collapse state must be a deterministic literal — never a lazy
  // initializer that reads the viewport (that was the CEO's hydration
  // mismatch: server expanded, first client render collapsed).
  assert.match(source, /useState<boolean>\(false\)/, "pointsCollapsed starts expanded deterministically");
  assert.doesNotMatch(
    source,
    /useState<boolean>\(\(\)\s*=>\s*\{/,
    "pointsCollapsed must not be a lazy initializer",
  );
  // No lazy initializer anywhere in the file may read the browser env.
  assert.doesNotMatch(
    source,
    /useState\(\(\)\s*=>\s*\{[\s\S]*?(?:matchMedia|typeof window)/,
    "no lazy useState initializer reads matchMedia / typeof window",
  );
  // The mobile preference is allowed ONLY inside the hydration effect.
  assert.match(
    source,
    /useEffect\([\s\S]*?window\.matchMedia\("\(max-width: 768px\)"\)/,
    "the mobile preference lives in the post-hydration effect",
  );
  // The user-choice guard exists: a manual toggle is never overwritten.
  assert.match(source, /pointsUserToggledRef/, "user toggle guard ref present");
});
