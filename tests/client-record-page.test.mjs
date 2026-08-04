/**
 * Client-side interaction tests for /records/[id] and the SurveillanceMap
 * marker status gate — QA t_61b90f6a.
 *
 * RecordPage (jsdom + @testing-library/react + user-event):
 *   1. loading state is announced while both fetches are pending;
 *   2. found: the record's public fields render (title, status label, id,
 *      source, revision history);
 *   3. found on a later page: with the paginated GET /api/cameras
 *      (PR #149, { records, total, nextOffset }, limit 500), a public id
 *      that lives beyond the first page still resolves — the shared layer
 *      walks pages until it finds the id (t_cc94f340);
 *   4. not-found: an id absent from the public payload renders the "could
 *      not find" state with a browse-directory link;
 *   5. fetch error: the page renders the honest error state with a retry
 *      (a dead API is never reported as "not found" — audit t_c6da60f0);
 *   6. empty public payload: an API that answers with no records renders the
 *      not-found state, not an error;
 *   7. retry: reloading after a failed fetch recovers and renders the record.
 *
 * SurveillanceMap status-leak gate:
 *   8. markers only receive the CSS status class for whitelisted public
 *      statuses (active/demo); pending/rejected markers render with an
 *      empty status class (reuses the isPublicStatus whitelist).
 *
 * Fixtures are fictitious (made-up camera titles, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomPage, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, setNavState, leafletMarkers, resetLeafletMarkers, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let RecordPage;
let SurveillanceMap;
let __resetPublicCamerasCache;

before(async () => {
  rtl = await setupDom();
  RecordPage = await loadDomPage("app/records/[id]/RecordPageBody.mjs");
  const mapMod = await loadDomModule("app/components/SurveillanceMap.mjs");
  SurveillanceMap = mapMod.SurveillanceMap;
  // The usePublicCameras module keeps a module-level cache across tests in
  // this process; each test installs its own fetch mock, so the cache must
  // be dropped between tests (same instance the page module imports).
  const camerasMod = await loadDomModule("app/lib/use-public-cameras.mjs");
  __resetPublicCamerasCache = camerasMod.__resetPublicCamerasCache;
});

afterEach(() => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
});

const publicRecordFixture = {
  id: 7,
  title: "Fixture Public Camera",
  kind: "Fixed dome",
  status: "active",
  latitude: 41.9004,
  longitude: 12.4936,
  source: "Community report",
  updated: "2026-03-01T00:00:00.000Z",
  description: "Fictitious public record used only in tests.",
  address: "Illustrative location, Rome",
};

const olderRecordFixture = {
  id: 6,
  title: "Older Fixture Camera",
  kind: "Dome",
  status: "active",
  latitude: 41.901,
  longitude: 12.494,
  source: "Community report",
  updated: "2026-02-01T00:00:00.000Z",
  description: "Fictitious older public record used only in tests.",
  address: "Illustrative location, Rome",
};

const revisionsFixture = {
  recordId: 7,
  revisions: [
    { id: 1, action: "approve", previousStatus: "pending", newStatus: "active", createdAt: "2026-03-01T00:00:00.000Z" },
  ],
};

/**
 * Record mock (QA#5 F1, t_ab0d4c75): the record page resolves a deep link
 * through the DEDICATED endpoint `GET /api/cameras/[id]` — one round trip,
 * never a client-side paginated walk (the PR #149 list contract is still
 * used by the home directory walk, tested in client-public-cameras-layer).
 * The endpoint answers `{ record }` for the public id and 404 for anything
 * else (fail-closed: same answer the old walk would give after exhausting
 * every page, at 1/N of the cost).
 */
function recordHandler({ record = publicRecordFixture, revisions = revisionsFixture, fail = false } = {}) {
  return (input) => {
    if (fail) return Promise.reject(new TypeError("Failed to fetch"));
    const single = typeof input === "string" && input.match(/^\/api\/cameras\/(\d+)$/);
    if (single) {
      const id = Number(single[1]);
      return id === record.id
        ? jsonResponse({ record })
        : jsonResponse({ error: "not found" }, { status: 404 });
    }
    if (input === "/api/cameras/revisions?cameraId=7") return jsonResponse(revisions);
    if (input === "/api/cameras/revisions?cameraId=99") return jsonResponse({ recordId: 99, revisions: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

test("record page: loading state is announced while fetches are pending", async () => {
  const { screen } = rtl;
  let resolveRecord;
  installFetchMock((input) => {
    if (input === "/api/cameras/7") {
      return new Promise((resolve) => { resolveRecord = resolve; });
    }
    if (input === "/api/cameras/revisions?cameraId=7") return jsonResponse({ recordId: 7, revisions: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  assert.ok(screen.getByText("Loading the public record…"));

  resolveRecord(jsonResponse({ record: publicRecordFixture }));
  await screen.findByText("Fixture Public Camera");
});

test("record page: found record renders public fields and revision history", async () => {
  const { screen } = rtl;
  installFetchMock(recordHandler());
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");

  // Public label from the whitelisted status ("Active"), never the raw key.
  assert.ok(screen.getByText("Active"));
  assert.equal(screen.getByText("7").tagName, "DD"); // Record ID
  assert.ok(screen.getByText("Community report"));
  // Revision history row with the localized action label; the date is
  // rendered through toLocaleDateString (e.g. "1 March 2026"), not raw ISO.
  // P2 (formatPublicDate): the record's own `lastVerification` fact is now
  // formatted the same way, so the date may legitimately appear twice
  // (the fact + the history row) when they share the fixture timestamp.
  assert.ok(screen.getByText("Approved and published"));
  const expectedDate = new Date("2026-03-01T00:00:00.000Z")
    .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  assert.ok(screen.getAllByText(expectedDate).length >= 1);
  // Back to directory link resolves.
  const back = screen.getByRole("link", { name: "← Back to directory" });
  assert.equal(back.getAttribute("href"), "/#records");
});

test("record page: a deep link resolves via the dedicated endpoint — no client-side paginated walk (F1)", async () => {
  const { screen } = rtl;
  // id 6 is not on the first page (records are id DESC, 500/page): the old
  // client walk would serialize the list pages until the id showed up. F1
  // resolves it with ONE fetch to GET /api/cameras/6 — the id not being on
  // the first page costs nothing extra.
  const calls = [];
  installFetchMock((input) => {
    calls.push(input);
    if (input === "/api/cameras/6") return jsonResponse({ record: olderRecordFixture });
    if (input === "/api/cameras/revisions?cameraId=6") return jsonResponse({ recordId: 6, revisions: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ params: { id: "6" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Older Fixture Camera");
  assert.ok(screen.getByText("6"));
  // F1: exactly ONE record fetch — the dedicated endpoint (the later
  // /confirmation and /edit calls are not part of the resolve), never the
  // paginated list walk (limit=500&offset=... series).
  const recordFetches = calls.filter((input) => typeof input === "string" && input.match(/^\/api\/cameras\/\d+$/));
  assert.deepEqual(recordFetches, ["/api/cameras/6"]);
});

test("record page: unknown id renders the not-found state", async () => {
  const { screen } = rtl;
  installFetchMock(recordHandler());
  await setNavState({ params: { id: "99" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("We could not find that public record.");
  assert.ok(screen.getByText(
    "It may have been removed, is not public, or the link is incorrect.",
  ));
  const browse = screen.getByRole("link", { name: "Browse the directory" });
  assert.equal(browse.getAttribute("href"), "/#records");
});

test("record page: fetch failure renders the honest error state, never a fake 'not found'", async () => {
  const { screen } = rtl;
  installFetchMock(recordHandler({ fail: true }));
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  // A dead API must be surfaced as an error with a retry, not reported as
  // "record not found" — the swallowed-error defect from audit t_c6da60f0.
  await screen.findByText("Could not load the public record.");
  assert.ok(screen.getByText(
    "The record service is unreachable right now. Check your connection and try again.",
  ));
  assert.ok(screen.getByRole("button", { name: "Try again" }));
});

test("record page: the dedicated endpoint answers 404 for a non-public id (fail-closed, F1)", async () => {
  const { screen } = rtl;
  installFetchMock((input) => {
    if (input === "/api/cameras/7") return jsonResponse({ error: "not found" }, { status: 404 });
    if (input === "/api/cameras/revisions?cameraId=7") return jsonResponse({ recordId: 7, revisions: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  // The endpoint shares the public predicate: a 404 means "not public /
  // removed" — the honest reading, not an unreachable-service error.
  await screen.findByText("We could not find that public record.");
});

test("record page: retry after a failed load refetches and renders the record", async () => {
  const { screen } = rtl;
  let cameraCalls = 0;
  installFetchMock((input) => {
    if (input === "/api/cameras/7") {
      cameraCalls += 1;
      return cameraCalls === 1
        ? Promise.reject(new TypeError("Failed to fetch"))
        : jsonResponse({ record: publicRecordFixture });
    }
    if (input === "/api/cameras/revisions?cameraId=7") return jsonResponse(revisions);
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Could not load the public record.");
  const user = rtl.userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Fixture Public Camera");
});

test("map: markers only carry the CSS status class for whitelisted public statuses", async () => {
  const { waitFor } = rtl;
  await resetLeafletMarkers();

  const cameras = [
    { id: 1, title: "Active camera", kind: "Dome", status: "active", latitude: 41.9004, longitude: 12.4936 },
    { id: 2, title: "Demo camera", kind: "Dome", status: "demo", latitude: 41.9047, longitude: 12.5031 },
    { id: 3, title: "Pending camera", kind: "Dome", status: "pending", latitude: 41.91, longitude: 12.5 },
    { id: 4, title: "Rejected camera", kind: "Dome", status: "rejected", latitude: 41.92, longitude: 12.51 },
  ];
  const onSelect = () => {};
  const onPick = () => {};

  // First render with an empty list so the lazy leaflet import resolves
  // (SurveillanceMap loads leaflet asynchronously on mount); the markers
  // effect then runs on the next cameras change.
  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: 1, onSelect, onPick,
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  view.rerender(await wrapWithLocale(React.createElement(SurveillanceMap, {
    cameras, selectedId: 1, onSelect, onPick,
  })));

  await waitFor(async () => assert.equal((await leafletMarkers()).length, 4));
  const markers = await leafletMarkers();
  const htmlByTitle = Object.fromEntries(markers.map((marker) => [marker.opts.title, marker.opts.icon.html]));

  // Whitelisted statuses get the status class on the marker span.
  assert.match(htmlByTitle["Active camera"], /osm-camera-marker active/);
  assert.match(htmlByTitle["Demo camera"], /osm-camera-marker demo/);
  // Selected marker also carries the selection class.
  assert.match(htmlByTitle["Active camera"], /osm-camera-marker active selected/);

  // Non-public statuses must NOT leak as marker classes.
  assert.doesNotMatch(htmlByTitle["Pending camera"], /osm-camera-marker pending/);
  assert.doesNotMatch(htmlByTitle["Rejected camera"], /osm-camera-marker rejected/);
  assert.match(htmlByTitle["Pending camera"], /osm-camera-marker /);
});

test("map: public-status whitelist is the single gate (defense in depth)", async () => {
  const { waitFor } = rtl;
  await resetLeafletMarkers();

  // A camera whose status is not in PUBLIC_CAMERA_STATUSES at all
  // (e.g. "needs_review") renders a plain marker with no status class.
  const cameras = [
    { id: 1, title: "Review camera", kind: "Dome", status: "needs_review", latitude: 41.9, longitude: 12.49 },
  ];
  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: 1, onSelect: () => {}, onPick: () => {},
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  view.rerender(await wrapWithLocale(React.createElement(SurveillanceMap, {
    cameras, selectedId: 1, onSelect: () => {}, onPick: () => {},
  })));

  await waitFor(async () => assert.equal((await leafletMarkers()).length, 1));
  const html = (await leafletMarkers())[0].opts.icon.html;
  assert.doesNotMatch(html, /needs_review/);
  assert.match(html, /osm-camera-marker /);
});
