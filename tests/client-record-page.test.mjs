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
 *      statuses (verified/demo); pending/rejected markers render with an
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
  status: "verified",
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
  status: "verified",
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
    { id: 1, action: "approve", previousStatus: "pending", newStatus: "verified", createdAt: "2026-03-01T00:00:00.000Z" },
  ],
};

/**
 * Paginated GET /api/cameras mock (PR #149 contract): the layer fetches
 * `/api/cameras?limit=500&offset=N`; each page answers
 * `{ records, total, nextOffset }` (nextOffset null on the last page).
 * `pages` is the ordered list of pages the walk should see; an offset past
 * the last page keeps answering the last page (a defensive server stub).
 */
function recordHandler({ pages = [{ records: [publicRecordFixture], total: 1, nextOffset: null }], revisions = revisionsFixture, fail = false } = {}) {
  return (input) => {
    if (fail) return Promise.reject(new TypeError("Failed to fetch"));
    if (typeof input === "string" && input.startsWith("/api/cameras?")) {
      const offset = Number(new URL(input, "https://osdb.test").searchParams.get("offset") ?? 0);
      const pageIndex = Math.min(Math.floor(offset / 500), pages.length - 1);
      return jsonResponse(pages[pageIndex]);
    }
    if (input === "/api/cameras/revisions?cameraId=7") return jsonResponse(revisions);
    if (input === "/api/cameras/revisions?cameraId=99") return jsonResponse({ recordId: 99, revisions: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

test("record page: loading state is announced while fetches are pending", async () => {
  const { screen } = rtl;
  let resolveCameras;
  installFetchMock((input) => {
    if (typeof input === "string" && input.startsWith("/api/cameras?")) {
      return new Promise((resolve) => { resolveCameras = resolve; });
    }
    if (input === "/api/cameras/revisions?cameraId=7") return jsonResponse({ recordId: 7, revisions: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  assert.ok(screen.getByText("Loading the public record…"));

  resolveCameras(jsonResponse({ records: [publicRecordFixture], total: 1, nextOffset: null }));
  await screen.findByText("Fixture Public Camera");
});

test("record page: found record renders public fields and revision history", async () => {
  const { screen } = rtl;
  installFetchMock(recordHandler());
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");

  // Public label from the whitelisted status ("Verified"), never the raw key.
  assert.ok(screen.getByText("Verified"));
  assert.equal(screen.getByText("7").tagName, "DD"); // Record ID
  assert.ok(screen.getByText("Community report"));
  // Revision history row with the localized action label; the date is
  // rendered through toLocaleDateString (e.g. "1 March 2026"), not raw ISO.
  assert.ok(screen.getByText("Approved and published"));
  const expectedDate = new Date("2026-03-01T00:00:00.000Z")
    .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  assert.ok(screen.getByText(expectedDate));
  // Back to directory link resolves.
  const back = screen.getByRole("link", { name: "← Back to directory" });
  assert.equal(back.getAttribute("href"), "/#records");
});

test("record page: a public record beyond the first page still resolves (pagination walk)", async () => {
  const { screen } = rtl;
  // id 6 lives on page 2 (records are id DESC, 500/page): the targeted walk
  // must fetch page 2 and resolve it instead of reporting "not found".
  const calls = [];
  installFetchMock((input) => {
    calls.push(input);
    if (typeof input === "string" && input.startsWith("/api/cameras?")) {
      const offset = Number(new URL(input, "https://osdb.test").searchParams.get("offset") ?? 0);
      return jsonResponse(offset === 0
        ? { records: [publicRecordFixture], total: 2, nextOffset: 500 }
        : { records: [olderRecordFixture], total: 2, nextOffset: null });
    }
    if (input === "/api/cameras/revisions?cameraId=6") return jsonResponse({ recordId: 6, revisions: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ params: { id: "6" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Older Fixture Camera");
  assert.ok(screen.getByText("6"));
  // The targeted walk fetched exactly the pages it needed (early exit on
  // the page that contains the id).
  const cameraFetches = calls.filter((input) => typeof input === "string" && input.startsWith("/api/cameras?"));
  assert.deepEqual(cameraFetches, ["/api/cameras?limit=500&offset=0", "/api/cameras?limit=500&offset=500"]);
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

test("record page: an empty public payload renders the not-found state, not an error", async () => {
  const { screen } = rtl;
  installFetchMock(recordHandler({ pages: [{ records: [], total: 0, nextOffset: null }] }));
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  // The API answered 200 but published nothing: "not public / removed" is
  // the honest reading, not an unreachable-service error.
  await screen.findByText("We could not find that public record.");
});

test("record page: retry after a failed load refetches and renders the record", async () => {
  const { screen } = rtl;
  let cameraCalls = 0;
  installFetchMock((input) => {
    if (typeof input === "string" && input.startsWith("/api/cameras?")) {
      cameraCalls += 1;
      return cameraCalls === 1
        ? Promise.reject(new TypeError("Failed to fetch"))
        : jsonResponse({ records: [publicRecordFixture], total: 1, nextOffset: null });
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
    { id: 1, title: "Verified camera", kind: "Dome", status: "verified", latitude: 41.9004, longitude: 12.4936 },
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
  assert.match(htmlByTitle["Verified camera"], /osm-camera-marker verified/);
  assert.match(htmlByTitle["Demo camera"], /osm-camera-marker demo/);
  // Selected marker also carries the selection class.
  assert.match(htmlByTitle["Verified camera"], /osm-camera-marker verified selected/);

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
