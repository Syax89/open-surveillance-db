/**
 * Client CSRF echo regression — F-csrf (kanban: the "Cross-site request
 * rejected" 403 on browser submits).
 *
 * Defect this suite pins down: the browser writers POSTed to /api/cameras
 * (useReportFlow) and /api/corrections (CorrectionForm) WITHOUT echoing the
 * per-session CSRF token, so the server's session-branch gate
 * (`sameOrigin && csrfVerified`, app/api/cameras/route.ts +
 * app/api/corrections/route.ts) rejected every real browser submit with
 * 403 "Cross-site request rejected". The server was correct; the clients
 * were incomplete.
 *
 * Why this is the test that bites: the API suites build their OWN request
 * objects including `x-csrf-token` (sessionPost()), so they prove the server
 * accepts a header a REAL client never sent. This suite renders the REAL
 * client components, drives the REAL submit handlers, and asserts on the
 * headers the REAL `fetch` init carries — the test never fabricates a
 * request. Its shared reader lives in app/lib/csrf.ts (readCsrfToken).
 *
 * Fixtures are fictitious (example.test addresses, made-up titles) — never
 * real personal data.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let ReportForm;
let CorrectionForm;
let useReportFlow;

before(async () => {
  rtl = await setupDom();
  ReportForm = (await loadDomModule("app/components/home/ReportForm.mjs")).ReportForm;
  CorrectionForm = (await loadDomModule("app/components/home/CorrectionForm.mjs")).CorrectionForm;
  useReportFlow = (await loadDomModule("app/lib/useReportFlow.mjs")).useReportFlow;
});

afterEach(() => rtl?.cleanup());

const KNOWN_TOKEN = "known-csrf-token";

// Record every POST the real client fires (url + the exact fetch init), so
// the assertions inspect the REAL request the component builds.
function capturePosts() {
  const posts = [];
  installFetchMock((input, init) => {
    const url = String(input);
    if (init?.method === "POST") posts.push({ url, init });
    if (url.startsWith("/api/geocode/reverse")) return jsonResponse({ address: "" });
    if (url.startsWith("/api/cameras/nearby")) return jsonResponse({ records: [] });
    if (url === "/api/cameras") return jsonResponse({});
    if (url === "/api/corrections") return jsonResponse({ referenceId: 501 });
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  return posts;
}

/** Read the header the real fetch init carries for a POST to `url`. */
async function postedInit(posts, url) {
  await rtl.waitFor(() => {
    assert.ok(posts.some((p) => p.url === url), `expected a POST to ${url}`);
  });
  return posts.find((p) => p.url === url).init;
}

// The report form needs a position before submitReport will POST; the hook's
// own deep-link path (initialCoordinates) supplies it, exercising the real
// submit handler rather than a stub.
function ReportHarness() {
  const flow = useReportFlow({
    setNotice: () => {},
    initialCoordinates: { latitude: 44.8378, longitude: 11.6183 },
  });
  return React.createElement(ReportForm, { ...flow });
}

async function submitReport() {
  const user = rtl.userEvent.setup();
  const { container } = await renderWithLocale(React.createElement(ReportHarness));
  const form = container.querySelector("form.report-form");
  await user.type(form.querySelector("input[name='title']"), "Fixture public camera");
  await user.selectOptions(form.querySelector("select[name='kind']"), "Fixed dome");
  await user.click(form.querySelector("input[type='checkbox']"));
  await user.click(form.querySelector("button[type='submit']"));
}

async function submitCorrection() {
  const user = rtl.userEvent.setup();
  const { container } = await renderWithLocale(React.createElement(CorrectionForm));
  const form = container.querySelector("form.correction-form");
  await user.selectOptions(form.querySelector("select[name='issueType']"), "inaccurate");
  await user.type(form.querySelector("textarea[name='message']"), "Fixture correction request");
  await user.click(form.querySelector("input[type='checkbox']"));
  await user.click(form.querySelector("button[type='submit']"));
}

test("report submit echoes the CSRF cookie in the x-csrf-token header", async () => {
  document.cookie = `osdb_csrf=${KNOWN_TOKEN}; path=/`;
  const posts = capturePosts();
  await submitReport();

  const init = await postedInit(posts, "/api/cameras");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["x-csrf-token"], KNOWN_TOKEN, "the report POST must echo the per-session CSRF token");
});

test("correction submit echoes the CSRF cookie in the x-csrf-token header", async () => {
  document.cookie = `osdb_csrf=${KNOWN_TOKEN}; path=/`;
  const posts = capturePosts();
  await submitCorrection();

  const init = await postedInit(posts, "/api/corrections");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["x-csrf-token"], KNOWN_TOKEN, "the correction POST must echo the per-session CSRF token");
});

test("report submit sends NO x-csrf-token when the cookie is absent", async () => {
  document.cookie = "osdb_csrf=; Max-Age=0; path=/";
  const posts = capturePosts();
  await submitReport();

  const init = await postedInit(posts, "/api/cameras");
  assert.equal("x-csrf-token" in init.headers, false, "no cookie must mean no header (behaviour unchanged)");
});

test("correction submit sends NO x-csrf-token when the cookie is absent", async () => {
  document.cookie = "osdb_csrf=; Max-Age=0; path=/";
  const posts = capturePosts();
  await submitCorrection();

  const init = await postedInit(posts, "/api/corrections");
  assert.equal("x-csrf-token" in init.headers, false, "no cookie must mean no header (behaviour unchanged)");
});
