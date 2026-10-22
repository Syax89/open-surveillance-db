/**
 * /directory loading-area reservation (P2 audit 2026-10-22, issue #13).
 *
 * The initial load of /directory rendered a single line of text where the
 * list goes, so the results area collapsed and the footer jumped up for one
 * frame (measured CLS .3979 at 1440x900 / .2273 at 390x844 with a 20-record,
 * total-40 fixture). The fix reserves 24rem for the LIST loading note only —
 * no skeleton, no 100vh, no layout redesign — via a dedicated class on that
 * existing note plus one narrowly scoped rule in app/globals.css.
 *
 * Contract pinned here:
 *   1. CSS source: exactly one rule, exactly 24rem, scoped to the /directory
 *      catalog's list slot; the shared .loading-note geometry is untouched so
 *      every other note (place search included) keeps its rendered size;
 *   2. markup: the REAL DirectoryTool renders a note the scoped selector
 *      actually matches while the list is pending (and only then);
 *   3. the place-search loading note is a different <p> and keeps the bare
 *      .loading-note;
 *   4. the settled populated / empty / error states render NO element with
 *      the reservation class — their DOM is unchanged.
 *
 * Fixtures are fictional demo records — no personal data.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  React,
  camerasApiResponse,
  installFetchMock,
  jsonResponse,
  loadDomModule,
  renderWithLocale,
  setUrlState,
  setupDom,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Comments are stripped once: prose may name a selector or a value, and it
// must never satisfy a declaration assertion.
const cssPromise = readFile(path.join(root, "app", "globals.css"), "utf8")
  .then((raw) => raw.replace(/\/\*[\s\S]*?\*\//g, ""));

const RESERVATION_CLASS = "directory-list-loading";
const EN_LOADING = "Loading the directory…";
const IT_LOADING = "Caricamento dell'elenco…";
const EN_PLACE_LOADING = "Searching public records near that place…";
const EN_EMPTY = "No published record matches that search.";
const EN_LOAD_ERROR = "The directory could not be loaded.";

const THREE = [
  { id: 1, title: "Alpha fixture", kind: "Fixed dome", status: "active", latitude: 41.9, longitude: 12.49, source: "Community report", updated: "2026-07-01", description: "Illustrative fixture record.", address: "Via Test 1" },
  { id: 2, title: "Beta fixture", kind: "Bullet", status: "active", latitude: 41.91, longitude: 12.5, source: "Community report", updated: "2026-07-01", description: "Illustrative fixture record.", address: "Via Test 2" },
  { id: 3, title: "Gamma fixture", kind: "PTZ", status: "active", latitude: 41.92, longitude: 12.51, source: "Community report", updated: "2026-07-01", description: "Illustrative fixture record.", address: "Via Test 3" },
];

let rtl;
let DirectoryCatalog;
let DirectoryTool;
let __resetPublicCamerasCache;

const priorFetch = globalThis.fetch;
let openGates = [];

test.before(async () => {
  rtl = await setupDom();
  __resetPublicCamerasCache = (await loadDomModule("app/lib/use-public-cameras.mjs")).__resetPublicCamerasCache;
  DirectoryCatalog = (await loadDomModule("app/components/tools/DirectoryCatalog.mjs")).DirectoryCatalog;
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
});

test.afterEach(async () => {
  rtl.cleanup();
  const gates = openGates;
  openGates = [];
  if (gates.length > 0) await rtl.act(async () => { gates.forEach((release) => release()); });
  globalThis.fetch = priorFetch;
  __resetPublicCamerasCache();
  window.localStorage.clear();
  const nav = await loadDomModule("node_modules/next/navigation.mjs");
  nav.__setNavState({ url: "/", pushed: [], replaced: [], replaceCalls: [] });
});

// ---------------------------------------------------------------------------
// 1. CSS source contract
// ---------------------------------------------------------------------------

test("the reservation is ONE scoped rule of exactly 24rem on the list note", async () => {
  const css = await cssPromise;

  // Exactly one rule owns the reservation, and it targets the /directory
  // catalog's list slot (a direct child of .records-section).
  const rules = [...css.matchAll(/[^{}]*\.directory-list-loading[^{}]*\{[^}]*\}/g)].map((match) => match[0].trim());
  assert.equal(rules.length, 1, `expected exactly one reservation rule, found ${rules.length}: ${rules.join(" | ")}`);
  assert.match(
    rules[0],
    /^\.directory-tool \.records-section > \.directory-list-loading\s*\{\s*min-block-size:\s*24rem;?\s*\}$/,
    "the reservation must be scoped to the /directory list slot and reserve 24rem",
  );

  // No viewport/skeleton/redesign escape hatch in that rule.
  assert.doesNotMatch(rules[0], /100(vh|svh|dvh)|min-height|height:|padding|animation/);

  // The shared note geometry is untouched: the place-search note (and every
  // other .loading-note) keeps exactly its previous declarations.
  assert.match(
    css,
    /\.loading-note\s*\{\s*margin:14px 0 0;\s*color:var\(--muted\);\s*font-size:var\(--text-sm\);\s*\}/,
    "the shared .loading-note rule must stay byte-identical (no size reservation)",
  );
});

// ---------------------------------------------------------------------------
// 2. Markup contract on the REAL DirectoryTool
// ---------------------------------------------------------------------------

/** Deferred /api/cameras mock: list requests stay pending until released;
 * the place-search proxy also stays pending (for the place-note assertion). */
function installDeferredCameras({ placePending = false, records = THREE } = {}) {
  installFetchMock((input) => {
    const url = String(input);
    if (url.includes("facets=")) return camerasApiResponse(input, records);
    if (url.startsWith("/api/cameras/search")) {
      if (!placePending) return jsonResponse({ error: "not found" }, { status: 404 });
      return new Promise((resolve) => {
        const release = () => resolve(jsonResponse({ error: "not found" }, { status: 404 }));
        openGates.push(release);
      });
    }
    if (url.startsWith("/api/cameras?")) {
      return new Promise((resolve) => {
        const release = () => resolve(camerasApiResponse(input, records));
        openGates.push(release);
      });
    }
    return jsonResponse({ error: "not found" }, { status: 404 });
  });
}

async function releaseAllGates() {
  const gates = openGates;
  openGates = [];
  await rtl.act(async () => { gates.forEach((release) => release()); await Promise.resolve(); });
}

const reservationNodes = (container) => container.querySelectorAll(`.${RESERVATION_CLASS}`);

test("while the list is pending the note is reserved — and the scoped selector matches the real DOM (EN + IT)", async () => {
  await setUrlState("/directory");
  installDeferredCameras();
  const view = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.act(async () => {});
  const { container } = view;

  // The scoped rule from globals.css resolves against the real markup: this
  // selector is the exact one pinned in the CSS assertion above.
  const reserved = container.querySelector(".directory-tool .records-section > .directory-list-loading");
  assert.ok(reserved, "the pending list note must be the element the scoped reservation rule targets");
  assert.equal(reserved.className, "loading-note directory-list-loading", "the note keeps .loading-note and adds only the reservation class");
  assert.equal(reserved.getAttribute("role"), "status", "the existing live region is intact");
  assert.equal((reserved.textContent ?? "").trim(), EN_LOADING, "the existing note text is intact");
  assert.equal(reservationNodes(container).length, 1, "exactly one reserved element while the list is pending");

  // Italian: same class, same rule, localized text.
  await setUrlState("/directory");
  installDeferredCameras();
  window.localStorage.setItem("opensurveillancedb-locale", "it");
  rtl.cleanup();
  const it = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.act(async () => {});
  const itReserved = it.container.querySelector(".directory-tool .records-section > .directory-list-loading");
  assert.ok(itReserved, "the IT pending list note is reserved too");
  assert.equal((itReserved.textContent ?? "").trim(), IT_LOADING);
});

test("the place-search loading note is NOT reserved (list pending + place pending at once)", async () => {
  await setUrlState("/directory");
  installDeferredCameras({ placePending: true });
  const { container } = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.act(async () => {});

  // Trigger the place search (Enter submits it); the request stays pending, so
  // the place note and the list note are on screen together.
  await rtl.userEvent.type(container.querySelector("#record-search"), "Fixture Town{Enter}");
  await rtl.waitFor(
    () => assert.equal(container.querySelectorAll("#records > p.loading-note").length, 2, "both notes are pending"),
    { timeout: 5000 },
  );

  const [placeNote, listNote] = container.querySelectorAll("#records > p.loading-note");
  assert.equal((placeNote.textContent ?? "").trim(), EN_PLACE_LOADING, "the first note is the place-search one");
  assert.equal(placeNote.className, "loading-note", "the place-search note keeps the bare .loading-note (no reservation)");
  assert.equal(listNote.className, "loading-note directory-list-loading", "only the LIST note is reserved");
  assert.equal(reservationNodes(container).length, 1, "the place note never joins the reservation");

  await releaseAllGates();
});

// ---------------------------------------------------------------------------
// 3. Settled states keep their exact DOM (no reservation class anywhere)
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
  return renderWithLocale(React.createElement(DirectoryCatalog, { ...CATALOG_PROPS, filteredRecords: [], ...props }));
}

test("settled populated / empty / error states render NO reserved element", async () => {
  const populated = await renderCatalog({ loading: false, filteredRecords: THREE, totalRecords: 3 });
  assert.equal(reservationNodes(populated.container).length, 0, "a settled list has no reservation");
  assert.equal(populated.container.querySelectorAll("ul.record-list li").length, 3, "the rows are unchanged");
  assert.equal(populated.container.querySelectorAll("p.loading-note").length, 0);
  populated.unmount();

  const empty = await renderCatalog({ loading: false, filteredRecords: [], totalRecords: 0 });
  assert.equal(reservationNodes(empty.container).length, 0, "the empty state has no reservation");
  assert.ok((empty.container.textContent ?? "").includes(EN_EMPTY), "the truthful empty state is unchanged");
  empty.unmount();

  const error = await renderCatalog({ loading: false, loadError: true, onRetryLoad: () => {} });
  assert.equal(reservationNodes(error.container).length, 0, "the error state has no reservation (its geometry is untouched)");
  assert.ok((error.container.textContent ?? "").includes(EN_LOAD_ERROR));
  error.unmount();
});

test("the reservation disappears the moment the pending list settles", async () => {
  await setUrlState("/directory");
  installDeferredCameras();
  const view = await renderWithLocale(React.createElement(DirectoryTool));
  await rtl.act(async () => {});
  assert.equal(reservationNodes(view.container).length, 1, "reserved while pending");

  await releaseAllGates();
  await rtl.waitFor(
    () => assert.equal(view.container.querySelectorAll("ul.record-list li").length, 3, "the rows arrive"),
    { timeout: 5000 },
  );
  assert.equal(reservationNodes(view.container).length, 0, "the settled list carries no reservation");
  assert.equal(view.container.querySelectorAll("p.loading-note").length, 0, "and no loading note");
});
