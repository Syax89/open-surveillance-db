/**
 * Shared public-cameras data layer tests — pagination adaptation t_cc94f340.
 *
 * GET /api/cameras now answers `{ records, total, nextOffset }` (PR #149):
 * the default JSON is at most 500 records per page (id DESC) and the UI must
 * keep working — map with ALL public records, hero with the real total, and
 * a record detail that resolves ANY public id.
 *
 * These jsdom tests exercise the layer directly (usePublicCameras /
 * usePublicCamera, the same module the pages import):
 *   1. the home walk concatenates every page and exposes the server total
 *      (never a first-page count);
 *   2. a legacy single-page payload (no nextOffset) is still a complete list;
 *   3. a failure on a later page surfaces the error state and keeps the seed;
 *   4. a record deep link on the FIRST page resolves with a single fetch;
 *   5. a record deep link on a LATER page resolves with an early-exit walk;
 *   6. an absent id exhausts the walk, reports not-found and seeds the cache;
 *   7. a fetch failure surfaces the error state, never a fake "not found";
 *   8. reload after a failed list load recovers;
 *   9. home list and record detail share the module cache (zero extra fetches
 *      when navigating after the directory loaded).
 *
 * Fixtures are fictitious (made-up camera titles, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let usePublicCameras;
let usePublicCamera;
let __resetPublicCamerasCache;

before(async () => {
  rtl = await setupDom();
  const camerasMod = await loadDomModule("app/lib/use-public-cameras.mjs");
  usePublicCameras = camerasMod.usePublicCameras;
  usePublicCamera = camerasMod.usePublicCamera;
  __resetPublicCamerasCache = camerasMod.__resetPublicCamerasCache;
});

afterEach(() => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
});

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const makeCameras = (ids) => ids.map((id) => ({
  id,
  title: `Camera ${id}`,
  kind: "Dome",
  status: "active",
  latitude: 41.9,
  longitude: 12.49,
  source: "Community report",
  updated: "2026-01-01T00:00:00.000Z",
  description: "Fictitious record used only in tests.",
}));

// Two pages of 10 records, ids 20..11 then 10..1 (id DESC, the API order).
// Offset is in RECORDS: page 1 starts at 0, page 2 at 10 (nextOffset).
const pageOne = makeCameras(Array.from({ length: 10 }, (_, i) => 20 - i));
const pageTwo = makeCameras(Array.from({ length: 10 }, (_, i) => 10 - i));

const twoPageList = [
  { offset: 0, records: pageOne, total: 20, nextOffset: 10 },
  { offset: 10, records: pageTwo, total: 20, nextOffset: null },
];

/** Paginated GET /api/cameras mock; records every camera fetch in `calls`.
 * Handles BOTH surfaces the layer uses (QA#5 F1): the list walk
 * (/api/cameras?offset=) AND the dedicated record endpoint
 * (/api/cameras/<id>, answered from the same page fixture set). */
function pageMock(pages, calls = []) {
  installFetchMock((input) => {
    if (typeof input === "string" && input.startsWith("/api/cameras?")) {
      calls.push(input);
      const offset = Number(new URL(input, "https://osdb.test").searchParams.get("offset") ?? 0);
      const page = pages.find((candidate) => candidate.offset === offset) ?? pages[pages.length - 1];
      return jsonResponse({ records: page.records, total: page.total, nextOffset: page.nextOffset });
    }
    if (typeof input === "string" && /^\/api\/cameras\/\d+$/.test(input)) {
      calls.push(input);
      const id = Number(input.split("/").pop());
      const record = [...pageOne, ...pageTwo].find((camera) => camera.id === id);
      return record
        ? jsonResponse({ record })
        : jsonResponse({ error: "Camera not found." }, { status: 404 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  return calls;
}

// ---------------------------------------------------------------------------
// probe components (plain React.createElement, no JSX in the harness)
// ---------------------------------------------------------------------------

function ListProbe({ seed = [] }) {
  const { records, total, loading, error, empty, reload } = usePublicCameras({ seed });
  return React.createElement("div", null,
    React.createElement("span", { "data-testid": "count" }, String(records.length)),
    React.createElement("span", { "data-testid": "total" }, total === null ? "null" : String(total)),
    React.createElement("span", { "data-testid": "loading" }, String(loading)),
    React.createElement("span", { "data-testid": "error" }, String(error)),
    React.createElement("span", { "data-testid": "empty" }, String(empty)),
    React.createElement("button", { type: "button", onClick: reload }, "reload"),
  );
}

function RecordProbe({ id }) {
  const { record, loading, error, notFound, reload } = usePublicCamera(id);
  return React.createElement("div", null,
    React.createElement("span", { "data-testid": "rid" }, record ? String(record.id) : "none"),
    React.createElement("span", { "data-testid": "rloading" }, String(loading)),
    React.createElement("span", { "data-testid": "rerror" }, String(error)),
    React.createElement("span", { "data-testid": "rnotfound" }, String(notFound)),
    React.createElement("button", { type: "button", onClick: reload }, "reload"),
  );
}

const seedCameras = makeCameras([1, 2]);

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

test("layer: the home walk concatenates every page and exposes the server total", async () => {
  const { screen } = rtl;
  const calls = pageMock(twoPageList);

  rtl.render(React.createElement(ListProbe, { seed: seedCameras }));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("loading").textContent, "false"));
  assert.equal(screen.getByTestId("count").textContent, "20");
  assert.equal(screen.getByTestId("total").textContent, "20");
  // The walk followed nextOffset: exactly one fetch per page, ordered. The
  // count=false param opts the walk out of the per-page COUNT scan (D1
  // rows-read optimization, 2026-08-12).
  assert.deepEqual(calls, [
    "/api/cameras?limit=2000&offset=0&count=false",
    "/api/cameras?limit=2000&offset=10&count=false",
  ]);
});

test("layer: a walk over a dataset larger than the old MAX_PAGE_OFFSET collects every record (total 12284, t_e86c91c4)", async () => {
  // Regression for kanban t_e86c91c4: the /directory walk died with
  // records=[] (empty state) once the dataset grew past 10000 records —
  // the walk followed nextOffset past MAX_PAGE_OFFSET (10000) and the API
  // answered 400, failing the whole walk. Two guards now fix it: the API
  // (db boundary) pages past 10000, and the walk stops at the server's own
  // `total` — it never requests an offset beyond the dataset, and it must
  // collect ALL 12284 records (25 pages: 24×500 + 284).
  const bigTotal = 12_284;
  const pages = [];
  for (let offset = 0; offset < bigTotal; offset += 500) {
    const size = Math.min(500, bigTotal - offset);
    const ids = Array.from({ length: size }, (_, index) => bigTotal - offset - index);
    pages.push({
      offset,
      records: makeCameras(ids),
      total: bigTotal,
      nextOffset: offset + size < bigTotal ? offset + size : null,
    });
  }
  assert.equal(pages.length, 25, "fixture sanity: 12284 records = 24 full pages + 284");

  const { screen } = rtl;
  const calls = pageMock(pages);

  rtl.render(React.createElement(ListProbe, { seed: seedCameras }));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("loading").textContent, "false"));
  assert.equal(screen.getByTestId("count").textContent, String(bigTotal), "the walk collected every public record");
  assert.equal(screen.getByTestId("total").textContent, String(bigTotal), "the server total is never a first-page count");
  assert.equal(screen.getByTestId("error").textContent, "false", "an offset past 10000 must not fail the walk");
  assert.equal(calls.length, 25, "exactly one fetch per page, no runaway walk");
  const lastOffset = Number(new URL(calls[calls.length - 1], "https://osdb.test").searchParams.get("offset"));
  assert.equal(lastOffset, 12_000, "the last requested offset is inside the dataset (12000 < 12284)");
  assert.ok(
    calls.every((call) => Number(new URL(call, "https://osdb.test").searchParams.get("offset")) <= 12_000),
    "no fetch may ever request an offset beyond the last page",
  );
});

test("layer: a 429 mid-walk is retried after Retry-After and the walk completes (kanban t_e11080eb)", async () => {
  // Regression for kanban t_e11080eb: /directory showed "0 public records
  // found" while the map saw the points. Root cause: the walk pages through
  // the WHOLE public set (31,926 records at the time), at limit=500 that is
  // 64 serial requests — more than the shared anonymous read bucket (60/min
  // on the container, callerKey "unknown" without a Cloudflare edge), so a
  // page 429'd mid-walk and the FIRST 429 threw, failing the whole walk into
  // the empty state. Fix: bigger pages (limit=2000 → 16 requests) AND a
  // bounded 429 retry (Retry-After, max 2 attempts) so a transient burst
  // recovers instead of blanking the directory.
  const { screen } = rtl;
  const calls = [];
  let rateLimited = true;
  installFetchMock((input) => {
    if (typeof input === "string" && input.startsWith("/api/cameras?")) {
      calls.push(input);
      const offset = Number(new URL(input, "https://osdb.test").searchParams.get("offset") ?? 0);
      if (rateLimited) {
        // First page answers 429 with Retry-After, like the shared bucket
        // would under concurrent traffic; the retry then succeeds.
        rateLimited = false;
        return jsonResponse({ error: "rate limited" }, { status: 429, headers: { "retry-after": "1" } });
      }
      const page = twoPageList.find((candidate) => candidate.offset === offset) ?? twoPageList[twoPageList.length - 1];
      return jsonResponse({ records: page.records, total: page.total, nextOffset: page.nextOffset });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  rtl.render(React.createElement(ListProbe));
  // The retry sleeps Retry-After (1s) with real timers — wait with a
  // generous timeout like the debounce tests (default 1000ms would fire
  // while the walk is still sleeping).
  const RETRY_WAIT = { timeout: 5000 };
  await rtl.waitFor(() => assert.equal(screen.getByTestId("loading").textContent, "false"), RETRY_WAIT);
  assert.equal(screen.getByTestId("error").textContent, "false", "the 429 must be retried, never surface the error state");
  assert.equal(screen.getByTestId("count").textContent, "20", "the walk completes after the retry");
  // offset=0 was fetched twice (the 429 + the successful retry), then the
  // walk continued to the second page.
  assert.equal(calls.filter((call) => call.includes("offset=0")).length, 2, "the rate-limited page is retried once");
  assert.ok(calls.some((call) => call.includes("offset=10")), "the walk continues past the retried page");
});

test("layer: a persistent 429 exhausts the retry budget and surfaces the error state (kanban t_e11080eb)", async () => {
  // Bounded retry: a genuinely exhausted shared bucket must surface the
  // truthful error state quickly (callers render the load-error UI with a
  // retry action), never freeze the directory for the whole Retry-After
  // window nor silently show an empty list.
  const { screen } = rtl;
  const calls = [];
  installFetchMock((input) => {
    if (typeof input === "string" && input.startsWith("/api/cameras?")) {
      calls.push(input);
      return jsonResponse({ error: "rate limited" }, { status: 429, headers: { "retry-after": "1" } });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  rtl.render(React.createElement(ListProbe));
  // Three attempts = two 1s Retry-After sleeps before the error state
  // settles; wait with a generous timeout (default 1000ms would fire while
  // the walk is still sleeping between retries).
  const RETRY_WAIT = { timeout: 10000 };
  await rtl.waitFor(() => assert.equal(screen.getByTestId("error").textContent, "true"), RETRY_WAIT);
  assert.equal(screen.getByTestId("count").textContent, "0", "records stay empty on failure");
  // Initial attempt + WALK_RATE_LIMIT_RETRIES retries = 3 total fetches,
  // then the walk gives up (no unbounded loop on a hostile server).
  assert.equal(calls.length, 3, "exactly one initial attempt + 2 retries, then stop");
});

test("layer: a legacy single-page payload (no nextOffset) is the complete list", async () => {
  const { screen } = rtl;
  const calls = pageMock([{ records: pageOne }]);

  rtl.render(React.createElement(ListProbe, { seed: seedCameras }));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("loading").textContent, "false"));
  assert.equal(screen.getByTestId("count").textContent, "10");
  // Legacy shape has no total: fall back to the number of records received.
  assert.equal(screen.getByTestId("total").textContent, "10");
  assert.equal(calls.length, 1);
});

test("layer: a failure on a later page surfaces the error state (no synthetic seed)", async () => {
  const { screen } = rtl;
  const calls = [];
  installFetchMock((input) => {
    if (typeof input === "string" && input.startsWith("/api/cameras?")) {
      calls.push(input);
      const offset = Number(new URL(input, "https://osdb.test").searchParams.get("offset") ?? 0);
      if (offset === 0) return jsonResponse({ records: pageOne, total: 20, nextOffset: 10 });
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  rtl.render(React.createElement(ListProbe));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("error").textContent, "true"));
  // Honest failure state (seed removed 2026-08-08): records stay empty and
  // the caller surfaces its own error UI — never synthetic filler.
  assert.equal(screen.getByTestId("count").textContent, "0");
  assert.equal(screen.getByTestId("total").textContent, "null");
  assert.equal(calls.length, 2);
});

test("layer: record deep link resolves with a SINGLE fetch to the dedicated endpoint (QA#5 F1)", async () => {
  const { screen } = rtl;
  const calls = pageMock(twoPageList);

  rtl.render(React.createElement(RecordProbe, { id: 15 }));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("rloading").textContent, "false"));
  assert.equal(screen.getByTestId("rid").textContent, "15");
  assert.equal(screen.getByTestId("rnotfound").textContent, "false");
  // F1: the record page resolves deep links through GET /api/cameras/[id] —
  // ONE round trip, never a client-side walk (which cost ceil((maxId −
  // id)/500) + 1 serialised fetches and burned the READ_LIMITER bucket).
  assert.deepEqual(calls, ["/api/cameras/15"]);
});

test("layer: a deep link to a LATER page id also resolves with one fetch (no walk, QA#5 F1)", async () => {
  const { screen } = rtl;
  const calls = pageMock(twoPageList);

  rtl.render(React.createElement(RecordProbe, { id: 5 }));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("rloading").textContent, "false"));
  assert.equal(screen.getByTestId("rid").textContent, "5");
  assert.equal(screen.getByTestId("rnotfound").textContent, "false");
  // Before F1 the id on page 2 (id DESC) cost a 2-page early-exit walk;
  // the dedicated endpoint answers it in one fetch.
  assert.deepEqual(calls, ["/api/cameras/5"]);
});

test("layer: an absent id answers 404 from the endpoint → not-found, without seeding the list cache (QA#5 F1)", async () => {
  const { screen } = rtl;
  const calls = pageMock(twoPageList);

  const view = rtl.render(React.createElement(RecordProbe, { id: 99 }));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("rloading").textContent, "false"));
  assert.equal(screen.getByTestId("rid").textContent, "none");
  assert.equal(screen.getByTestId("rnotfound").textContent, "true");
  assert.equal(screen.getByTestId("rerror").textContent, "false");
  // One fetch to the dedicated endpoint; the 404 is the fail-closed public
  // answer, the same the old exhaustive walk would have reached after N
  // pages — at 1/N of the cost.
  assert.deepEqual(calls, ["/api/cameras/99"]);

  // F1 note: the single 404 does NOT seed the full-list module cache (the
  // old exhausted walk did). The home list keeps its own walk on first
  // visit; a record page visited BEFORE the directory simply costs the
  // directory its normal walk later, never an extra hidden walk.
  view.unmount();
  const listCalls = [];
  installFetchMock((input) => {
    if (typeof input === "string" && input.startsWith("/api/cameras?")) {
      listCalls.push(input);
      const offset = Number(new URL(input, "https://osdb.test").searchParams.get("offset") ?? 0);
      const page = twoPageList.find((candidate) => candidate.offset === offset) ?? twoPageList[twoPageList.length - 1];
      return jsonResponse({ records: page.records, total: page.total, nextOffset: page.nextOffset });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  rtl.render(React.createElement(ListProbe, { seed: seedCameras }));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("loading").textContent, "false"));
  assert.equal(screen.getByTestId("count").textContent, "20");
  assert.equal(listCalls.length, 2, "the home list walk runs normally after a not-found deep link");
});

test("layer: a record fetch failure surfaces the error state, never a fake not-found", async () => {
  const { screen } = rtl;
  installFetchMock(() => Promise.reject(new TypeError("Failed to fetch")));

  rtl.render(React.createElement(RecordProbe, { id: 7 }));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("rerror").textContent, "true"));
  assert.equal(screen.getByTestId("rnotfound").textContent, "false");
  assert.equal(screen.getByTestId("rid").textContent, "none");
});

test("layer: reload after a failed list load recovers and renders the full list", async () => {
  const { screen } = rtl;
  let cameraCalls = 0;
  installFetchMock((input) => {
    if (typeof input === "string" && input.startsWith("/api/cameras?")) {
      cameraCalls += 1;
      if (cameraCalls === 1) return Promise.reject(new TypeError("Failed to fetch"));
      const offset = Number(new URL(input, "https://osdb.test").searchParams.get("offset") ?? 0);
      return jsonResponse(offset === 0
        ? { records: pageOne, total: 20, nextOffset: 10 }
        : { records: pageTwo, total: 20, nextOffset: null });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  rtl.render(React.createElement(ListProbe, { seed: seedCameras }));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("error").textContent, "true"));

  const user = rtl.userEvent.setup();
  await user.click(screen.getByRole("button", { name: "reload" }));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("loading").textContent, "false"));
  assert.equal(screen.getByTestId("error").textContent, "false");
  assert.equal(screen.getByTestId("count").textContent, "20");
  assert.equal(screen.getByTestId("total").textContent, "20");
});

test("layer: home list then record detail share the module cache (zero extra fetches)", async () => {
  const { screen } = rtl;
  const calls = pageMock(twoPageList);

  const view = rtl.render(React.createElement(ListProbe, { seed: seedCameras }));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("loading").textContent, "false"));
  assert.equal(calls.length, 2);

  // Navigate home -> record detail: the cache already holds every record.
  view.unmount();
  rtl.render(React.createElement(RecordProbe, { id: 5 }));
  await rtl.waitFor(() => assert.equal(screen.getByTestId("rloading").textContent, "false"));
  assert.equal(screen.getByTestId("rid").textContent, "5");
  assert.equal(calls.length, 2);
});
