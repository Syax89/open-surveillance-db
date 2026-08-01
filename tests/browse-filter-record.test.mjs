/**
 * E2E journey 1: browse → filtri → record (F-QA t_7b716c97, item 5).
 *
 * The roadmap's first required journey: a visitor lands on the home hub,
 * reaches the directory, narrows it with the filter controls (search text,
 * kind, freshness, sort) and opens a record.
 *
 * Two layers, both real:
 *   - client: the REAL DirectoryTool (/directory) runs in the dom-harness
 *     (jsdom + @testing-library + user-event) against a deterministic
 *     fetch mock. The filter interaction on the tool route — typing,
 *     selecting, live count, empty state, record links — is exercised end
 *     to end on the real component tree (FiltersBar + EmptyState +
 *     RecordCard via PublicDirectory).
 *   - SSR: the built worker (Miniflare) serves the home hub with the tool
 *     cards and the record detail resolves, so the whole journey works
 *     without client JS too (progressive enhancement). The /directory SSR
 *     shell and the /records/[id] loading shell render server-side; the
 *     interactive halves live in client-tools.test.mjs / client-record-page
 *     (the F1/F3 suites already own those contracts).
 *
 * Fixtures are fictional demo records — no personal data.
 *
 * Requires `npm run build` first (npm test already builds before running).
 */
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import {
  React,
  installFetchMock,
  jsonResponse,
  loadDomModule,
  renderWithLocale,
  setUrlState,
  setupDom,
} from "./helpers/dom-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "dist", "server");

// Fictional fixtures (privacy & safety by design: no real personal data).
const TWO_RECORDS = [
  {
    id: 1,
    title: "Corner shop entrance",
    kind: "Fixed dome",
    status: "verified",
    latitude: 41.9004,
    longitude: 12.4936,
    source: "Community report",
    updated: "2026-07-01",
    description: "Illustrative fixture record.",
    address: "Via Roma 1",
    manufacturer: "Acme Cameras",
    observedOn: "2026-07-01",
  },
  {
    id: 2,
    title: "Main square pillar",
    kind: "Bullet",
    status: "verified",
    latitude: 41.9047,
    longitude: 12.5031,
    source: "Community report",
    updated: "2026-06-15",
    description: "Illustrative fixture record.",
    address: "Piazza Centrale 3",
    manufacturer: "Beta Optics",
  },
];

function installDirectoryFetch() {
  installFetchMock((input) => {
    if (String(input).startsWith("/api/cameras")) {
      return jsonResponse({ records: TWO_RECORDS, total: TWO_RECORDS.length, nextOffset: null });
    }
    return jsonResponse({ error: "not found" }, { status: 404 });
  });
}

async function loadDirectoryTool() {
  const mod = await loadDomModule("app/components/tools/DirectoryTool.mjs");
  return mod.DirectoryTool;
}

// ---------------------------------------------------------------------------
// Client layer — filter interaction on the /directory tool route
// ---------------------------------------------------------------------------

test("journey browse→filtri: search narrows the directory and the live count follows", async () => {
  const rtl = await setupDom();
  await setUrlState("/directory");
  installDirectoryFetch();

  const DirectoryTool = await loadDirectoryTool();
  const { container } = await renderWithLocale(React.createElement(DirectoryTool));

  // The harness runs REAL timers, so the search narrows only after the
  // ~250ms debounce (QUERY_DEBOUNCE_MS) commits the URL plus a re-render.
  // Under CI load (full suite in parallel + NODE_V8_COVERAGE) that window
  // has blown past testing-library's default 1000ms waitFor — same latent
  // flake fixed in client-tools (t_08bfe97d / PR #183) — so the three
  // debounce-sensitive waits carry an explicit generous timeout. The asserts
  // are unchanged and stay honest: the narrowing, the live counter and the
  // empty state all still only appear once the debounce/commit has run.
  const DEBOUNCE_WAIT = { timeout: 5000 };

  const searchInput = container.querySelector("#record-search");
  assert.ok(searchInput, "the directory search input must render");
  const cards = () => container.querySelectorAll("ul.record-list li").length;

  assert.equal(cards(), 2, "the directory must show both fictional records");

  // Search narrows to the matching record. F4 (useCameraFilters) debounces
  // the ?q= URL commit (~250ms, R2 URL churn): the input feels instant but
  // the narrowing applies once the debounce writes the URL — wait for it
  // (same pattern as client-tools' debounced-search test, t_522638a5).
  await rtl.userEvent.type(searchInput, "corner");
  await rtl.waitFor(() => assert.equal(cards(), 1, "search 'corner' must leave one record"), DEBOUNCE_WAIT);
  assert.match(container.querySelector("ul.record-list")?.textContent ?? "", /Corner shop entrance/);

  // The live counter announces the filtered result (role=status region).
  const counter = container.querySelector("#record-search-count");
  assert.ok(counter, "the result counter must be a status/aria-live region");
  await rtl.waitFor(() => assert.match(counter?.textContent ?? "", /1/), DEBOUNCE_WAIT);

  // Empty state is truthful and offers a way back.
  await rtl.userEvent.selectOptions(container.querySelector("#record-kind-filter"), "Bullet");
  await rtl.waitFor(() => assert.equal(cards(), 0, "no record matches corner+Bullet"), DEBOUNCE_WAIT);
  const emptyState = container.querySelector(".empty-state");
  assert.ok(emptyState, "the zero-result state must render (never a silent blank)");
  assert.match(emptyState?.textContent ?? "", /clear search|reset/i);
});

test("journey browse→filtri: kind filter and sort order drive the directory", async () => {
  const rtl = await setupDom();
  await setUrlState("/directory");
  installDirectoryFetch();

  const DirectoryTool = await loadDirectoryTool();
  const { container } = await renderWithLocale(React.createElement(DirectoryTool));

  // Position sort orders by latitude (41.9004 Corner before 41.9047 Main)
  // over the WHOLE filtered set — assert it with both records visible first,
  // then narrow with the kind filter (a kind-filtered set can be 1 record,
  // so sort must be verified on the full set to prove ordering).
  await rtl.userEvent.selectOptions(container.querySelector("#record-sort"), "position");
  const titles = [...container.querySelectorAll("ul.record-list li")].map((li) => li.textContent ?? "");
  assert.equal(titles.length, 2);
  assert.ok(titles[0].includes("Corner shop entrance"), `position sort must lead with the lower latitude, got: ${titles[0]}`);

  // Kind filter narrows the same sorted list to the Bullet record only.
  await rtl.userEvent.selectOptions(container.querySelector("#record-kind-filter"), "Bullet");
  const remaining = [...container.querySelectorAll("ul.record-list li")].map((li) => li.textContent ?? "");
  assert.equal(remaining.length, 1, "kind filter must keep only Bullet records");
  assert.match(remaining[0] ?? "", /Main square pillar/);
});

test("journey browse→record: the directory card links to a resolvable record detail", async () => {
  await setUrlState("/directory");
  installDirectoryFetch();
  const DirectoryTool = await loadDirectoryTool();
  const { container } = await renderWithLocale(React.createElement(DirectoryTool));

  const openLinks = [...container.querySelectorAll("a.text-button")].filter((a) =>
    /\/records\/\d+/.test(a.getAttribute("href") ?? ""),
  );
  assert.ok(openLinks.length >= 2, "every record card must offer an 'open record' link");
  assert.ok(
    openLinks.some((a) => a.getAttribute("href") === "/records/1") &&
      openLinks.some((a) => a.getAttribute("href") === "/records/2"),
    "the links must point at the record detail routes",
  );
});

// ---------------------------------------------------------------------------
// SSR layer — the same journey works without client JS
// ---------------------------------------------------------------------------

async function workerModules() {
  const found = [];
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".js")) found.push({ type: "ESModule", path: full });
    }
  };
  await walk(serverDir);
  const entry = found.find((m) => m.path === path.join(serverDir, "index.js"));
  assert.ok(entry, "dist/server/index.js is missing — run `npm run build` first");
  return [entry, ...found.filter((m) => m !== entry)];
}

async function ssr(route) {
  const mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
    bindings: {},
  });
  try {
    const response = await mf.dispatchFetch(`http://localhost${route}`, {
      headers: { accept: "text/html" },
    });
    return { response, html: await response.text() };
  } finally {
    await mf.dispose();
  }
}

test("journey SSR: the home hub links the directory tool and the record detail resolves", async () => {
  const home = await ssr("/");
  assert.equal(home.response.status, 200);
  assert.match(home.html, /href="\/directory"/, "the hub must link the directory tool");
  assert.match(home.html, /href="\/segnala"/, "the hub must link the report tool");

  // The /directory route SSRs its shell (heading + FiltersBar) so the page
  // paints server-side; the interactive filter halves are client-tools'.
  const directory = await ssr("/directory");
  assert.equal(directory.response.status, 200, "the directory tool must render server-side");
  assert.match(directory.html, /id="directory-tool-title"/, "the directory tool heading must SSR");
  assert.match(directory.html, /id="record-search"/, "the FiltersBar must be part of the SSR shell");

  // The record detail is a client-fetched page: SSR renders the accessible
  // loading shell (aria-live region) so the browser paints the page and the
  // client fetch fills the record in — progressive enhancement. The title
  // itself is asserted at client level in the interaction tests above.
  const detail = await ssr("/records/1");
  assert.equal(detail.response.status, 200, "the record detail must render server-side");
  assert.match(detail.html, /class="record-detail"[^>]*aria-live="polite"/, "the detail shell must be an aria-live region");
  assert.match(detail.html, /loading-note/, "the SSR shell must announce the loading state");
});
