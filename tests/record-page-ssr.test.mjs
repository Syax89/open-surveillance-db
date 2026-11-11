/**
 * /records/[id] server-seeded render (LCP fix, 2026-11).
 *
 * The record page used to ship only "Loading the public record…" in its
 * server HTML; the h1/facts painted after hydration + a client fetch. The
 * server shell now resolves the record through the same read as
 * GET /api/cameras/[id] (getCommunityRecordById) and seeds RecordPageBody.
 *
 *   1. SSR with a public seed: the first HTML holds the title in the h1,
 *      the facts list and the community status — not the loading shell;
 *   2. SSR with a hidden (withdrawn) seed: the direct-link banner renders,
 *      no map action, no location fact (ADR 0021 §6.3 unchanged);
 *   3. SSR with a not-found seed: the same "could not find" state the
 *      client path settles on (status semantics unchanged: still a 200
 *      page, malformed ids still notFound() in page.tsx);
 *   4. SSR without a seed (server read failed): the original loading shell
 *      — the client path takes over exactly as before;
 *   5. resolveInitialRecord: found → plain-JSON record, missing or
 *      non-record-page status → { record: null }, a thrown DB error →
 *      undefined (fallback, never a 500);
 *   6. client mount with a seed: no GET /api/cameras/[id] on mount and the
 *      loading state never shows; the timeline still loads client-side.
 *
 * Fixtures are fictitious.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import { renderToString } from "react-dom/server";
import {
  setupDom, loadDomPage, loadDomModule, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, setNavState, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let RecordPage;
let resolveInitialRecord;
let __resetPublicCamerasCache;

before(async () => {
  rtl = await setupDom();
  RecordPage = await loadDomPage("app/records/[id]/RecordPageBody.mjs");
  ({ resolveInitialRecord } = await loadDomModule("app/lib/record-initial.mjs"));
  ({ __resetPublicCamerasCache } = await loadDomModule("app/lib/use-public-cameras.mjs"));
});

afterEach(() => {
  rtl?.cleanup();
  __resetPublicCamerasCache();
});

const publicRecord = {
  id: 7,
  title: "Fixture Seeded Camera",
  kind: "Fixed dome",
  status: "active",
  latitude: 41.9004,
  longitude: 12.4936,
  source: "Community report",
  updated: "2026-03-01T00:00:00.000Z",
  createdAt: "2026-02-01T00:00:00.000Z",
  description: "Fictitious public record used only in tests.",
  address: "Illustrative location, Rome",
  lastVerifiedAt: null,
  importBatch: null,
  confirmationCount: 0,
  usefulCount: 0,
  confirmCount: 0,
  goneCount: 0,
  problemCount: 0,
  privacyCount: 0,
};

const hiddenRecord = {
  ...publicRecord,
  status: "hidden",
  latitude: null,
  longitude: null,
  address: null,
  description: null,
};

async function ssr(props) {
  await setNavState({ params: { id: "7" } });
  return renderToString(await wrapWithLocale(React.createElement(RecordPage, props)));
}

/** The record-detail section's markup up to the timeline (main content). */
function detailHead(html) {
  const start = html.indexOf('class="record-detail"');
  assert.ok(start >= 0, "record-detail section present");
  const timeline = html.indexOf('id="record-timeline"', start);
  return html.slice(start, timeline >= 0 ? timeline : undefined);
}

test("SSR with a public seed renders the h1, facts and community status (no loading shell)", async () => {
  const html = await ssr({ id: 7, initial: { record: publicRecord } });
  const head = detailHead(html);
  assert.match(head, /<h1>Fixture Seeded Camera<\/h1>/);
  assert.doesNotMatch(head, /Loading the public record/, "main content is not the loading state");
  assert.match(head, /class="record-detail-facts"/);
  assert.match(head, /<dd>7<\/dd>/, "record id fact");
  assert.match(head, /Community report/);
  assert.match(head, /Never confirmed/, "community status badge");
  assert.match(head, /href="\/mappa\?focus=7"/, "map action for a public record");
});

test("SSR with a hidden seed renders the withdrawn banner, no map action or location", async () => {
  const html = await ssr({ id: 7, initial: { record: hiddenRecord } });
  const head = detailHead(html);
  assert.match(head, /record-banner record-banner-hidden/);
  assert.match(head, /Record hidden/);
  assert.match(head, /<h1>Fixture Seeded Camera<\/h1>/);
  assert.doesNotMatch(html, /mappa\?focus=/);
  assert.doesNotMatch(head, /Illustrative location/);
});

test("SSR with a not-found seed renders the same not-found state as the client path", async () => {
  const html = await ssr({ id: 7, initial: { record: null } });
  assert.match(html, /<h1>We could not find that public record\.<\/h1>/);
  assert.match(html, /href="\/directory"/);
  assert.doesNotMatch(html, /Loading the public record/);
});

test("SSR without a seed (server read failed) keeps the client loading shell", async () => {
  const html = await ssr({ id: 7 });
  assert.match(html, /Loading the public record/);
  assert.doesNotMatch(html, /<h1>/);
  // Legacy call shape (no props) is unchanged too.
  const legacy = await ssr(undefined);
  assert.match(legacy, /Loading the public record/);
});

test("resolveInitialRecord: public read path, status gate and error fallback", async () => {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    const found = await resolveInitialRecord(7, async (id) => ({ ...publicRecord, id }));
    assert.deepEqual(found, { record: publicRecord });
    const withdrawn = await resolveInitialRecord(7, async () => hiddenRecord);
    assert.equal(withdrawn.record.status, "hidden");
    assert.deepEqual(await resolveInitialRecord(7, async () => null), { record: null });
    // Defence in depth: a non-record-page status never seeds the page.
    for (const status of ["pending", "rejected", "needs_review", "stale", "verified"]) {
      assert.deepEqual(await resolveInitialRecord(7, async () => ({ ...publicRecord, status })), { record: null }, status);
    }
    // D1 unavailable / transient error → no seed (client path), no throw.
    assert.equal(await resolveInitialRecord(7, async () => { throw new Error("Database binding unavailable"); }), undefined);
    assert.equal(errors.length, 1, "the fallback is logged once");
    // Plain JSON only (the API's Response.json shape).
    const plain = await resolveInitialRecord(7, async () => ({ ...publicRecord, extra: undefined, when: new Date("2026-01-01T00:00:00.000Z") }));
    assert.equal("extra" in plain.record, false);
    assert.equal(plain.record.when, "2026-01-01T00:00:00.000Z");
  } finally {
    console.error = originalError;
  }
});

test("client mount with a seed does not refetch the record and never shows the loading state", async () => {
  const { screen } = rtl;
  const calls = [];
  installFetchMock((input) => {
    calls.push(input);
    if (input === "/api/cameras/7") return jsonResponse({ record: publicRecord });
    if (input === "/api/cameras/7/events") return jsonResponse({ events: [{ id: 1, eventType: "published", detail: null, createdAt: "2026-03-01T00:00:00.000Z" }] });
    if (input === "/api/cameras/7/actions") return jsonResponse({ action: null });
    if (input === "/api/auth/me") return jsonResponse({ error: "anonymous" }, { status: 401 });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await setNavState({ params: { id: "7" } });
  await renderWithLocale(React.createElement(RecordPage, { id: 7, initial: { record: publicRecord } }));
  // Settled on the first client render: the h1 is there synchronously.
  assert.equal(screen.getByRole("heading", { level: 1 }).textContent, "Fixture Seeded Camera");
  assert.equal(document.querySelector(".record-detail > .loading-note"), null);
  // The timeline still loads client-side.
  await screen.findByText("Published");
  assert.equal(calls.filter((url) => url === "/api/cameras/7").length, 0, "no record refetch on mount");
  assert.equal(document.querySelector(".record-detail > .loading-note"), null);
});
