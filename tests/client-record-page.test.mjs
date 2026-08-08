/**
 * Client-side interaction tests for /records/[id] and the SurveillanceMap
 * marker status gate — QA t_61b90f6a, extended for ADR 0021 FASE 3 UI
 * (kanban t_b533b254): the record page now resolves through the dedicated
 * endpoint (active/demo AND hidden/removed direct-link banner contract),
 * renders the community action widget, the community status badge and the
 * public event timeline, and drops the old moderation change-history.
 *
 * RecordPage (jsdom + @testing-library/react + user-event):
 *   1. loading state is announced while the record and its events are
 *      pending;
 *   2. found: public fields + community badge (never confirmed without a
 *      lastVerifiedAt) + event timeline render;
 *   3. found with confirmations: the badge shows "confirmed N times · last
 *      confirmed <date>" from the aggregate counts;
 *   4. found on a later page: the dedicated endpoint resolves the id with
 *      ONE fetch — no client-side paginated walk (t_cc94f340);
 *   5. hidden record (direct-link banner, ADR §6.3): the banner renders
 *      with the history anchor, the community widget stays mounted, and
 *      the "view on map" action is suppressed;
 *   6. removed record: the removed banner renders with the history link;
 *   7. not-found: an id absent from the public payload renders the "could
 *      not find" state with a browse-directory link;
 *   8. fetch error: the page renders the honest error state with a retry
 *      (a dead API is never reported as "not found" — audit t_c6da60f0);
 *   9. retry: reloading after a failed fetch recovers and renders the
 *      record.
 *
 * SurveillanceMap status-leak gate (unchanged):
 *  10. markers only receive the CSS status class for whitelisted public
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

// Public lifecycle events (ADR 0021 §7): unattributed aggregate rows as the
// /api/cameras/[id]/events endpoint serves them (detail already parsed).
const eventsFixture = {
  events: [
    { id: 1, eventType: "published", detail: null, createdAt: "2026-03-01T00:00:00.000Z" },
    { id: 2, eventType: "confirmed", detail: { count: 3 }, createdAt: "2026-03-02T00:00:00.000Z" },
  ],
};

const emptyEventsFixture = { events: [] };

/**
 * Record mock (QA#5 F1, t_ab0d4c75, FASE 3 UI): the record page resolves a
 * deep link through the DEDICATED endpoint `GET /api/cameras/[id]` — one
 * round trip, never a client-side paginated walk. The endpoint answers
 * `{ record }` for public ids AND for hidden/removed ones (ADR §6.3
 * direct-link banner), 404 for anything else. The page also fetches the
 * public events timeline, the anonymous-friendly personal action state and
 * the session probe.
 */
function recordHandler({
  record = publicRecordFixture,
  events = eventsFixture,
  fail = false,
  personalAction = null,
} = {}) {
  return (input) => {
    if (fail) return Promise.reject(new TypeError("Failed to fetch"));
    const single = typeof input === "string" && input.match(/^\/api\/cameras\/(\d+)$/);
    if (single) {
      const id = Number(single[1]);
      return id === record.id
        ? jsonResponse({ record })
        : jsonResponse({ error: "not found" }, { status: 404 });
    }
    if (typeof input === "string" && input.match(/^\/api\/cameras\/\d+\/events$/)) {
      return jsonResponse(events);
    }
    if (typeof input === "string" && input.match(/^\/api\/cameras\/\d+\/actions$/)) {
      return jsonResponse({ action: personalAction });
    }
    if (input === "/api/auth/me") {
      return jsonResponse({ error: "anonymous" }, { status: 401 });
    }
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
    if (input === "/api/cameras/7/events") return jsonResponse(emptyEventsFixture);
    if (input === "/api/cameras/7/actions") return jsonResponse({ action: null });
    if (input === "/api/auth/me") return jsonResponse({ error: "anonymous" }, { status: 401 });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  assert.ok(screen.getByText("Loading the public record…"));

  resolveRecord(jsonResponse({ record: publicRecordFixture }));
  await screen.findByText("Fixture Public Camera");
});

test("record page: found record renders public fields, community badge and event timeline", async () => {
  const { screen } = rtl;
  installFetchMock(recordHandler());
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");

  // Public label from the whitelisted status ("Active"), never the raw key.
  assert.ok(screen.getByText("Active"));
  assert.equal(screen.getByText("7").tagName, "DD"); // Record ID
  assert.ok(screen.getByText("Community report"));
  // Community status badge: no lastVerifiedAt in the fixture → the neutral
  // "Never confirmed" state (ADR §9.1), never a fabricated count.
  assert.ok(screen.getByText("Never confirmed"));
  // Public event timeline (ADR §7): the published + confirmed rows with the
  // localized labels; the date is rendered through toLocaleDateString
  // (e.g. "1 March 2026"), not raw ISO.
  assert.ok(screen.getByText("Published"));
  assert.ok(screen.getByText("Confirmed present — 3 people"));
  const expectedDate = new Date("2026-03-01T00:00:00.000Z")
    .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  assert.ok(screen.getAllByText(expectedDate).length >= 1);
  // Community action widget is mounted; anonymous session → counts visible
  // + register CTA, buttons disabled.
  const widget = screen.getByRole("region", { name: "Community actions" });
  assert.ok(widget);
  const cta = await screen.findByText("Log in or register to take part");
  assert.ok(cta);
  const useful = screen.getByRole("button", { name: /Mark this record as useful/ });
  assert.ok(useful.disabled);
  assert.ok(screen.getByText("Useful: 0"));
  // Back to directory link resolves.
  const back = screen.getByRole("link", { name: "← Back to directory" });
  assert.equal(back.getAttribute("href"), "/directory");
});

test("record page: confirmed record shows the community badge with count and last-confirmed date", async () => {
  const { screen } = rtl;
  const confirmed = {
    ...publicRecordFixture,
    lastVerifiedAt: "2026-03-02T00:00:00.000Z",
    confirmCount: 3,
  };
  installFetchMock(recordHandler({ record: confirmed }));
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");

  assert.ok(screen.getByText(/Confirmed 3 times/));
  const expectedDate = new Date("2026-03-02T00:00:00.000Z")
    .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  assert.ok(screen.getByText(new RegExp(`Last confirmed: ${expectedDate}`)));
  // Never confirmed is gone once a confirmation exists.
  assert.equal(screen.queryByText("Never confirmed"), null);
});

test("record page: imported record shows provenance next to the never-confirmed badge (FASE C)", async () => {
  const { screen } = rtl;
  // Imported row: raw source 'import:<slug>', never confirmed (ADR §9.1),
  // batch provenance attached by the detail API.
  const imported = {
    ...publicRecordFixture,
    source: "import:fixture-source-2026",
    createdAt: "2026-03-01T00:00:00.000Z",
    importBatch: {
      sourceName: "Fixture Open Data (test)",
      sourceUrl: "https://example.invalid/fixture",
      license: "ODbL 1.0",
      licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
    },
  };
  installFetchMock(recordHandler({ record: imported }));
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");

  // The never-confirmed badge stays (imported rows are never pre-verified).
  assert.ok(screen.getByText("Never confirmed"));
  // Provenance line: "Imported from <source>" with the licence, both
  // linked to the original dataset / licence text.
  const provenance = screen.getByText(/^Imported from:/);
  assert.ok(provenance);
  const sourceLink = screen.getByRole("link", { name: "Fixture Open Data (test)" });
  assert.equal(sourceLink.getAttribute("href"), "https://example.invalid/fixture");
  const licenseLink = screen.getByRole("link", { name: "ODbL 1.0" });
  assert.equal(licenseLink.getAttribute("href"), "https://opendatacommons.org/licenses/odbl/1-0/");
  // The Source fact shows the friendly dataset name, never the raw
  // 'import:fixture-source-2026' internal slug. It appears twice by design:
  // as the provenance link and as the "Source" fact row.
  assert.equal(screen.queryByText("import:fixture-source-2026"), null);
  assert.ok(screen.getAllByText("Fixture Open Data (test)").length >= 2);
  // Creation date fact (FASE C): the "Added" row renders the localized date.
  const expectedAdded = new Date("2026-03-01T00:00:00.000Z")
    .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const addedDt = screen.getByText("Added");
  assert.equal(addedDt.tagName, "DT", "the Added fact row renders its label");
  // The fixture shares the same date for created/updated, so the date
  // appears in both the Added and Last-confirmation rows.
  assert.ok(screen.getAllByText(expectedAdded).length >= 2, "the Added row renders the localized creation date");
});

test("record page: community report shows no import provenance line", async () => {
  const { screen } = rtl;
  installFetchMock(recordHandler({ record: publicRecordFixture }));
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");

  assert.equal(screen.queryByText(/^Imported from:/), null, "community reports never render the provenance line");
  assert.ok(screen.getByText("Community report"));
});

test("record page: hidden record renders the direct-link banner with history anchor (ADR §6.3)", async () => {
  const { screen } = rtl;
  const hidden = { ...publicRecordFixture, status: "hidden" };
  installFetchMock(recordHandler({ record: hidden, events: emptyEventsFixture }));
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");

  // Banner title + body, never the raw internal status.
  assert.ok(screen.getByText("Record hidden"));
  assert.ok(screen.getByText(/This record was withdrawn pending community or legal verification/));
  // The history link is the transparency control → anchors the timeline.
  const historyLink = screen.getByRole("link", { name: /View the public history/ });
  assert.equal(historyLink.getAttribute("href"), "#record-timeline");
  // The status line still carries the safe localized label ("Hidden").
  assert.ok(screen.getByText("Hidden"));
  // Privacy tombstone (security review 2026-08-08): withdrawn records show
  // ONLY the banner contract — no community actions, no location fact, no
  // mini map (their payload carries null coordinates).
  assert.equal(screen.queryByRole("region", { name: "Community actions" }), null);
  assert.equal(screen.queryByText(/General location/), null);
  assert.equal(screen.queryByText(/41\.9/), null);
  // No "view on map" for withdrawn records (it is not on any map).
  assert.equal(screen.queryByRole("link", { name: /View on map/ }), null);
});

test("record page: removed record renders the removed banner with history link", async () => {
  const { screen } = rtl;
  const removed = { ...publicRecordFixture, status: "removed" };
  installFetchMock(recordHandler({ record: removed, events: emptyEventsFixture }));
  await setNavState({ params: { id: "7" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Fixture Public Camera");

  assert.ok(screen.getByText("Reported as no longer present"));
  assert.ok(screen.getByText(/The community reported that this camera is no longer there/));
  assert.ok(screen.getByRole("link", { name: /View the public history/ }));
  assert.ok(screen.getByText("Removed"));
  assert.equal(screen.queryByRole("link", { name: /View on map/ }), null);
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
    if (input === "/api/cameras/6/events") return jsonResponse(emptyEventsFixture);
    if (input === "/api/cameras/6/actions") return jsonResponse({ action: null });
    if (input === "/api/auth/me") return jsonResponse({ error: "anonymous" }, { status: 401 });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ params: { id: "6" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("Older Fixture Camera");
  assert.ok(screen.getByText("6"));
  // F1: exactly ONE record fetch — the dedicated endpoint (the later
  // /events, /actions and /auth/me calls are not part of the resolve),
  // never the paginated list walk (limit=500&offset=... series).
  const recordFetches = calls.filter((input) => typeof input === "string" && input.match(/^\/api\/cameras\/\d+$/));
  assert.deepEqual(recordFetches, ["/api/cameras/6"]);
});

test("record page: unknown id renders the not-found state", async () => {
  const { screen } = rtl;
  installFetchMock(recordHandler({ events: emptyEventsFixture }));
  await setNavState({ params: { id: "99" } });

  await renderWithLocale(React.createElement(RecordPage));
  await screen.findByText("We could not find that public record.");
  assert.ok(screen.getByText(
    "It may have been removed, is not public, or the link is incorrect.",
  ));
  const browse = screen.getByRole("link", { name: "Browse the directory" });
  assert.equal(browse.getAttribute("href"), "/directory");
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
    if (input === "/api/cameras/7/events") return jsonResponse(emptyEventsFixture);
    if (input === "/api/cameras/7/actions") return jsonResponse({ action: null });
    if (input === "/api/auth/me") return jsonResponse({ error: "anonymous" }, { status: 401 });
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
    if (input === "/api/cameras/7/events") return jsonResponse(eventsFixture);
    if (input === "/api/cameras/7/actions") return jsonResponse({ action: null });
    if (input === "/api/auth/me") return jsonResponse({ error: "anonymous" }, { status: 401 });
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
