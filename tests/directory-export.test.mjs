/**
 * Issue #409 (t_c319c619) — export CSV/GeoJSON must respect the active
 * filters on /directory.
 *
 * Two layers:
 *  1. pure serialisers (app/lib/directory-export.ts) — CSV/GeoJSON shapes
 *     mirror the server exports byte-for-byte (header, escaping, feature
 *     properties, ODbL attribution) and the filename builder reflects the
 *     active filters (osdb-traffic-confirmed.geojson, AC3);
 *  2. DirectoryTool integration — the export links are generated
 *     client-side from the exact visible set (q/type/freshness/state/origin
 *     + sort), and while the walk is loading/failed the links fall back to
 *     the plain server href (kind + freshness) instead of downloading an
 *     empty file.
 *
 * Fixtures are fictitious (illustrative records, example.test addresses).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  React,
  installFetchMock,
  installCamerasApiMock,
  jsonResponse,
  loadDomModule,
  renderWithLocale,
  setUrlState,
  setupDom,
} from "./helpers/dom-harness.mjs";

let rtl;
let __resetPublicCamerasCache;
let DirectoryTool;
let exportFileName;
let camerasToCsv;
let camerasToGeoJson;

/** 6 fictitious records spanning kind/state/origin so every filter
 * dimension can be asserted on the downloaded content. */
const SIX_RECORDS = [
  { id: 1, title: "Fixed dome one", kind: "Fixed dome", status: "active", latitude: 41.9, longitude: 12.49, source: "Community report", updated: "2026-07-01", description: "Illustrative fixture record.", address: "Via Test 1", lastVerifiedAt: "2026-07-10T08:00:00.000Z", direction: null },
  { id: 2, title: "Bullet two", kind: "Bullet", status: "active", latitude: 41.91, longitude: 12.5, source: "Community report", updated: "2026-07-02", description: "Illustrative fixture record.", address: "Via Test 2", lastVerifiedAt: "2026-06-20T08:00:00.000Z", direction: 45 },
  { id: 3, title: "Fixed dome three", kind: "Fixed dome", status: "active", latitude: 41.92, longitude: 12.51, source: "import:fixture-city", updated: "2026-07-03", description: "Illustrative fixture record.", address: "Via Test 3" },
  { id: 4, title: "PTZ four", kind: "PTZ", status: "active", latitude: 41.93, longitude: 12.52, source: "Community report", updated: "2026-07-04", description: "Illustrative fixture record.", address: "Via Test 4", lastVerifiedAt: "2026-07-11T08:00:00.000Z", direction: 180 },
  { id: 5, title: "Bullet five", kind: "Bullet", status: "active", latitude: 41.94, longitude: 12.53, source: "import:fixture-city", updated: "2026-07-05", description: "Illustrative fixture record.", address: "Via Test 5" },
  { id: 6, title: "Fixed dome six", kind: "Fixed dome", status: "active", latitude: 41.95, longitude: 12.54, source: "Community report", updated: "2026-07-06", description: "Illustrative fixture record.", address: "Via Test 6", lastVerifiedAt: "2026-05-30T08:00:00.000Z", direction: 270 },
];

function installRecords(records) {
  installCamerasApiMock(records);
}

/** 500 on every request: the walk fails and the tool surfaces the truthful
 * load-error state (kanban t_e11080eb). */
function installFailingMock() {
  installFetchMock(() => jsonResponse({ error: "Database unavailable" }, { status: 503 }));
}

// Capture client-side downloads: stub URL.createObjectURL (jsdom does not
// implement it) and the anchor .click() so tests can read the generated
// Blob and the download filename. revokeObjectURL is also absent from
// jsdom — stub it so downloadTextFile's cleanup does not throw.
function stubDownloads(t) {
  const blobs = [];
  const anchors = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (blob) => {
    blobs.push(blob);
    return "blob:mock-download";
  };
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function click() {
    anchors.push(this);
  };
  t.after(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    HTMLAnchorElement.prototype.click = originalClick;
  });
  return { blobs, anchors };
}

function readBlob(blob) {
  // jsdom Blob supports .text(); FileReader is not on the Node global.
  return blob.text();
}

test.before(async () => {
  rtl = await setupDom();
  const camerasMod = await loadDomModule("app/lib/use-public-cameras.mjs");
  __resetPublicCamerasCache = camerasMod.__resetPublicCamerasCache;
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
  const exportMod = await loadDomModule("app/lib/directory-export.mjs");
  exportFileName = exportMod.exportFileName;
  camerasToCsv = exportMod.camerasToCsv;
  camerasToGeoJson = exportMod.camerasToGeoJson;
});

test.afterEach(async () => {
  rtl.cleanup();
  __resetPublicCamerasCache();
  const nav = await loadDomModule("node_modules/next/navigation.mjs");
  nav.__setNavState({ url: "/", pushed: [], replaced: [], replaceCalls: [] });
});

// ---------------------------------------------------------------------------
// exportFileName (AC3: the download filename reflects the active filters)
// ---------------------------------------------------------------------------

test("exportFileName: osdb-public.<ext> when no filter is active", () => {
  const none = { type: "all", freshness: "all", state: "all", origin: "all" };
  assert.equal(exportFileName(none, "csv"), "osdb-public.csv");
  assert.equal(exportFileName(none, "geojson"), "osdb-public.geojson");
});

test("exportFileName: appends only the ACTIVE filters, slugged for the filesystem", () => {
  const kindOnly = { type: "Traffic camera", freshness: "all", state: "all", origin: "all" };
  assert.equal(exportFileName(kindOnly, "csv"), "osdb-traffic-camera.csv");
  const kindAndState = { type: "Traffic camera", freshness: "all", state: "confirmed", origin: "all" };
  assert.equal(exportFileName(kindAndState, "geojson"), "osdb-traffic-camera-confirmed.geojson");
  const all = { type: "Traffic camera", freshness: "7d", state: "confirmed", origin: "imported" };
  assert.equal(exportFileName(all, "csv"), "osdb-traffic-camera-confirmed-imported-7d.csv");
});

test("exportFileName: slugs are filesystem-safe (spaces, case, punctuation)", () => {
  const weird = { type: "Fixed Dome!! (v2)", freshness: "all", state: "never", origin: "all" };
  assert.equal(exportFileName(weird, "geojson"), "osdb-fixed-dome-v2-never.geojson");
});

// ---------------------------------------------------------------------------
// camerasToCsv / camerasToGeoJson (parity with the server export shapes)
// ---------------------------------------------------------------------------

test("camerasToCsv: same header as the API, one row per record, ODbL notice footer", () => {
  const csv = camerasToCsv([SIX_RECORDS[0]]);
  const [header, ...rest] = csv.split("\n");
  assert.equal(header, "id,title,kind,manufacturer,observed_on,status,source,updated,description,address,latitude,longitude,direction");
  assert.match(rest[0], /^"1","Fixed dome one","Fixed dome","","","active","Community report","2026-07-01"/);
  assert.match(csv, /\n# © OpenSurveillanceDB contributors — ODbL 1\.0/);
});

test("camerasToCsv: escapes quotes and neutralises spreadsheet formulas (same as the server route)", () => {
  const evil = { id: 9, title: `=HYPERLINK("http://example.test")`, kind: "=cmd|' /C calc'!A0", status: "active", latitude: 1, longitude: 2, source: "Community report", updated: "2026-07-01", description: `He said "hi"`, address: "-1; DROP TABLE cameras;--" };
  const csv = camerasToCsv([evil]);
  const row = csv.split("\n")[1];
  assert.match(row, /^"9","'=HYPERLINK/);
  assert.match(row, /"'=cmd\|' \/C calc'!A0"/);
  assert.match(row, /"He said ""hi"""/);
  assert.match(row, /"'-1; DROP TABLE cameras;--"/);
});

test("camerasToCsv: a directional camera keeps its bearing in the trailing direction column", () => {
  const csv = camerasToCsv([SIX_RECORDS[3]]);
  const row = csv.split("\n")[1];
  assert.match(row, /,"180"$/);
});

test("camerasToGeoJson: FeatureCollection with ODbL foreign members and lon/lat points (no address)", () => {
  const collection = camerasToGeoJson(SIX_RECORDS);
  assert.equal(collection.type, "FeatureCollection");
  assert.equal(collection.license, "ODbL-1.0");
  assert.match(collection.attribution, /ODbL 1\.0/);
  assert.equal(collection.features.length, 6);
  const feature = collection.features[0];
  assert.equal(feature.type, "Feature");
  assert.deepEqual(feature.geometry, { type: "Point", coordinates: [12.49, 41.9] });
  assert.equal(feature.properties.id, 1);
  assert.equal("address" in feature.properties, false, "the GeoJSON export carries no address field (server parity)");
  assert.equal(feature.properties.direction, null);
  assert.equal(collection.features[3].properties.direction, 180);
});

// ---------------------------------------------------------------------------
// DirectoryTool integration: the download contains exactly the visible set
// ---------------------------------------------------------------------------

test("Download CSV on /directory exports ONLY the records matching the active filters, with a filter-aware filename", async (t) => {
  await setUrlState("/directory?type=Fixed%20dome&state=confirmed&origin=reports");
  installRecords(SIX_RECORDS);
  const { screen } = rtl;
  await renderWithLocale(React.createElement(DirectoryTool));

  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Fixed dome one" })));
  const { blobs, anchors } = stubDownloads(t);

  const csvLink = screen.getByRole("link", { name: "Download CSV" });
  assert.equal(csvLink.getAttribute("download"), "osdb-fixed-dome-confirmed-reports.csv", "the download attribute reflects the active filters");
  rtl.fireEvent.click(csvLink);

  assert.equal(blobs.length, 1, "the click generates exactly one client-side Blob");
  const csv = await readBlob(blobs[0]);
  const rows = csv.split("\n").slice(1).filter((line) => line.length > 0 && !line.startsWith("#"));
  // Fixed dome + confirmed (lastVerifiedAt present) + Community report.
  const ids = rows.map((row) => Number(JSON.parse(row.split(",")[0])));
  assert.deepEqual(ids, [1, 6], "only records 1 and 6 pass type+state+origin");
  assert.equal(anchors[0].download, "osdb-fixed-dome-confirmed-reports.csv", "the temp anchor triggers the download with the filter-aware filename");
});

test("Download GeoJSON on /directory exports exactly the visible features (client-side q and sort also apply)", async (t) => {
  await setUrlState("/directory?type=Bullet&q=five");
  installRecords(SIX_RECORDS);
  const { screen } = rtl;
  await renderWithLocale(React.createElement(DirectoryTool));

  await rtl.waitFor(() => assert.ok(screen.getByRole("heading", { name: "Bullet five" })));
  const { blobs, anchors } = stubDownloads(t);

  rtl.fireEvent.click(screen.getByRole("link", { name: "Download GeoJSON" }));
  assert.equal(blobs.length, 1);
  const collection = JSON.parse(await readBlob(blobs[0]));
  assert.deepEqual(collection.features.map((f) => f.properties.id), [5], "type=Bullet + q=five keeps only record 5");
  assert.equal(anchors[0].download, "osdb-bullet.geojson", "the q dimension does not leak into the filename (server-side dims only)");
});

test("export links fall back to the server href while the walk failed (no empty client-side download)", async (t) => {
  await setUrlState("/directory?type=Fixed%20dome");
  installFailingMock();
  const { screen } = rtl;
  await renderWithLocale(React.createElement(DirectoryTool));

  await rtl.waitFor(() => assert.ok(screen.getAllByText("The directory could not be loaded.").length > 0));
  const { blobs } = stubDownloads(t);

  const csvLink = screen.getByRole("link", { name: "Download CSV" });
  assert.equal(csvLink.getAttribute("download"), null, "no misleading client-side filename while the walk failed");
  assert.match(csvLink.getAttribute("href") ?? "", /^\/api\/cameras\?format=csv&kind=Fixed(\+|%20)dome/, "the href keeps the server-side kind filter");
  rtl.fireEvent.click(csvLink);
  assert.equal(blobs.length, 0, "a failed walk must not generate an empty Blob download");
});
