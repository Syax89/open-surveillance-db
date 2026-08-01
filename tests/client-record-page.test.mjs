/**
 * Client-side interaction tests for /records/[id] and the SurveillanceMap
 * marker status gate — QA t_61b90f6a.
 *
 * RecordPage (jsdom + @testing-library/react + user-event):
 *   1. loading state is announced while both fetches are pending;
 *   2. found: the record's public fields render (title, status label, id,
 *      source, revision history);
 *   3. not-found: an id absent from the public payload renders the "could
 *      not find" state with a browse-directory link;
 *   4. fetch error: the page degrades to the local prototype records
 *      (defense-in-depth) instead of crashing.
 *
 * SurveillanceMap status-leak gate:
 *   5. markers only receive the CSS status class for whitelisted public
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

before(async () => {
  rtl = await setupDom();
  RecordPage = await loadDomPage("app/records/[id]/page.mjs");
  const mapMod = await loadDomModule("app/components/SurveillanceMap.mjs");
  SurveillanceMap = mapMod.SurveillanceMap;
});

afterEach(() => rtl?.cleanup());

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

const revisionsFixture = {
  recordId: 7,
  revisions: [
    { id: 1, action: "approve", previousStatus: "pending", newStatus: "verified", createdAt: "2026-03-01T00:00:00.000Z" },
  ],
};

function recordHandler({ records = [publicRecordFixture], revisions = revisionsFixture, fail = false } = {}) {
  return (input) => {
    if (fail) return Promise.reject(new TypeError("Failed to fetch"));
    if (input === "/api/cameras") return jsonResponse({ records });
    if (input === "/api/cameras/revisions?cameraId=7") return jsonResponse(revisions);
    if (input === "/api/cameras/revisions?cameraId=99") return jsonResponse({ recordId: 99, revisions: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

test("record page: loading state is announced while fetches are pending", async () => {
  const { screen } = rtl;
  let resolveCameras;
  installFetchMock((input) => {
    if (input === "/api/cameras") return new Promise((resolve) => { resolveCameras = resolve; });
    if (input === "/api/cameras/revisions?cameraId=7") return jsonResponse({ recordId: 7, revisions: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  assert.ok(screen.getByText("Loading the public record…"));

  resolveCameras(jsonResponse({ records: [publicRecordFixture] }));
  await screen.findByText("Fixture Public Camera");
});

test("record page: found record renders public fields and revision history", async () => {
  const { screen, waitFor } = rtl;
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

test("record page: fetch failure degrades to local prototype data instead of crashing", async () => {
  const { screen } = rtl;
  installFetchMock(recordHandler({ fail: true }));
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  // No crash; the local prototype records (ids 1 and 2, demo status) remain
  // the fallback dataset, so id 7 is absent -> not-found, not a blank page.
  await screen.findByText("We could not find that public record.");
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
