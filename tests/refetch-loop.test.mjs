/**
 * Regression: infinite refetch loop with server filters active (F4 PR #165,
 * CTO review t_6e9c812d / issuecomment-5152025598 — BLOCKER).
 *
 * Root cause: `usePublicCameras`'s walk effect depended on the `filters`
 * OBJECT identity (`[attempt, filterKey, serverActive, filters]`). The tool
 * call sites (MappaTool, DirectoryTool) build `serverFiltersFrom(filters)`
 * inline on every render, so with server filters active the chain loops:
 *   fetch walk → setRecords(new array) → re-render tool → new filters
 *   object → effect re-runs → abort + new walk → fetch → setRecords → LOOP ∞
 * (measured on the real MappaTool with ?type=Dome: 62 fetches at first
 * settle, 770 after 500ms idle; production would hit 429 rate limits).
 *
 * The effect now keys on the SEMANTIC filter key (filterKey/serverActive —
 * already computed from the filter values) and reads the current filters
 * through a ref, so an unrelated parent re-render never restarts the walk.
 *
 * These tests render the REAL tools with `?type=` active and assert the
 * camera fetch count is FLAT after the walk settles (stable at 100ms and
 * 500ms). They FAIL on the pre-fix code (count keeps growing) and PASS
 * after the fix.
 *
 * Fixtures are fictitious (made-up camera titles, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, setNavState, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let MappaTool;
let DirectoryTool;
let __resetPublicCamerasCache;

before(async () => {
  rtl = await setupDom();
  MappaTool = (await loadDomModule("app/components/tools/MappaTool.mjs")).MappaTool;
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
  const camerasMod = await loadDomModule("app/lib/use-public-cameras.mjs");
  __resetPublicCamerasCache = camerasMod.__resetPublicCamerasCache;
});

afterEach(() => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
  setNavState({ pushed: [], replaced: [], replaceCalls: [], search: "", pathname: "/" });
});

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

/** One public Dome camera the filtered walk returns (single page). */
const domeCamera = {
  id: 1,
  title: "Fixture public camera",
  kind: "Dome",
  status: "active",
  latitude: 41.9,
  longitude: 12.49,
  source: "Community report",
  // Recent timestamp: the client memo re-applies the freshness window as a
  // last-mile gate (same anchor as the server), so a fixture that must
  // render under ?freshness= has to be fresh relative to the test clock.
  updated: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  description: "Fictitious record used only in tests.",
};

/**
 * Counting fetch mock: every GET /api/cameras? page answers with the single
 * Dome camera and nextOffset null (one fetch per walk), and records the
 * request URL in `calls`.
 */
function installCountingCameraMock(calls) {
  installFetchMock((input) => {
    const url = String(input);
    if (url.startsWith("/api/cameras?")) {
      calls.push(url);
      return jsonResponse({ records: [domeCamera], total: 1, nextOffset: null });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The shared regression assertion: after the first walk settles, the camera
 * fetch count must stay FLAT — no refetch loop. Sampled at settle, +100ms and
 * +500ms (the probe measured 62 → 770 fetches over the same window on the
 * buggy code, so a loop fails this hard).
 */
async function assertFetchCountIsFlat(screen, calls) {
  // Wait for the walk to settle: the server record is rendered. /mappa
  // (t_702c10af) renders records as sidebar list buttons instead of the old
  // record card, /directory keeps the card heading — accept either shape so
  // the shared regression assertion works for both tools.
  await rtl.waitFor(() => {
    const asHeading = screen.queryAllByRole("heading", { name: "Fixture public camera" });
    const asButton = screen.queryAllByRole("button", { name: /Fixture public camera/ });
    assert.ok(asHeading.length > 0 || asButton.length > 0, "the server record is rendered");
  });
  // Let the state flush (setRecords → re-render) before the first sample.
  await pause(50);
  const settled = calls.length;
  assert.ok(settled >= 1, "the filtered walk must fetch at least once");

  await pause(100);
  const at100ms = calls.length;
  await pause(400);
  const at500ms = calls.length;

  assert.equal(
    at100ms,
    settled,
    `camera fetch count must be flat 100ms after settle (settled=${settled}, at100ms=${at100ms})`,
  );
  assert.equal(
    at500ms,
    settled,
    `camera fetch count must be flat 500ms after settle (settled=${settled}, at500ms=${at500ms})`,
  );
}

// ---------------------------------------------------------------------------
// /mappa — MappaTool with an active server filter (?type=Dome)
// ---------------------------------------------------------------------------

test("MappaTool: ?type= active — camera fetch count is FLAT after the filtered walk settles (no refetch loop)", async () => {
  setNavState({ search: "type=Dome" });
  const calls = [];
  installCountingCameraMock(calls);

  const { screen } = rtl;
  await renderWithLocale(React.createElement(MappaTool));

  await assertFetchCountIsFlat(screen, calls);

  // The URL kind filter reached the API (server-side filter contract F0).
  assert.ok(
    calls[0].includes("kind=Dome"),
    `the filtered walk must forward kind to the API (got ${calls[0]})`,
  );
});

test("MappaTool: ?type= + ?freshness= active — camera fetch count is FLAT after the filtered walk settles", async () => {
  setNavState({ search: "type=Dome&freshness=30d" });
  const calls = [];
  installCountingCameraMock(calls);

  const { screen } = rtl;
  await renderWithLocale(React.createElement(MappaTool));

  await assertFetchCountIsFlat(screen, calls);

  // Both server filter dimensions reached the API.
  assert.ok(
    calls[0].includes("kind=Dome") && calls[0].includes("freshness=30d"),
    `the filtered walk must forward kind AND freshness (got ${calls[0]})`,
  );
});

// ---------------------------------------------------------------------------
// /directory — DirectoryTool with an active server filter (?type=Dome)
// ---------------------------------------------------------------------------

test("DirectoryTool: ?type= active — camera fetch count is FLAT after the filtered walk settles (no refetch loop)", async () => {
  setNavState({ search: "type=Dome" });
  const calls = [];
  installCountingCameraMock(calls);

  const { screen } = rtl;
  await renderWithLocale(React.createElement(DirectoryTool));

  await assertFetchCountIsFlat(screen, calls);
});
