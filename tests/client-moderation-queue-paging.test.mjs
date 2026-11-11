/**
 * Bounded moderation queues in the dashboard (jsdom + testing-library).
 *
 * GET /api/moderation returns one keyset page per queue plus `queueTotals`
 * and `queueNextCursors`. Each queue section must show "N of M", offer a
 * labelled "Load more" control that requests ONLY that queue's next cursor
 * (`<queue>_after_created_at` + `<queue>_after_id`), append the next slice in
 * order, and keep keyboard focus on the control on the last page.
 *
 * Fixtures are fictitious.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, installFetchMock, jsonResponse, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let ModerationDashboard;

before(async () => {
  rtl = await setupDom();
  ModerationDashboard = (await loadDomModule("app/components/ModerationDashboard.mjs")).ModerationDashboard;
});

afterEach(() => rtl?.cleanup());

const pendingCameras = (start, count) =>
  Array.from({ length: count }, (_, index) => ({
    id: start + index,
    title: `Pending fixture ${start + index}`,
    kind: "Fixed dome",
    status: "pending",
    latitude: 41.9,
    longitude: 12.5,
    source: "Community report",
    createdAt: `2026-03-01T00:${String(start + index).padStart(2, "0")}:00.000Z`,
  }));

const base = {
  cameraReports: [], publishedCameras: [], publishedNextCursor: null, reviewCameras: [], staleCameras: [],
  correctionRequests: [], cameraEditRequests: [], recentEvents: [],
  reviewers: [{ id: 2, displayName: "Fixture Reviewer", role: "moderator" }], queueItems: [],
  queueTotals: { pending: 25, published: 0, review: 0, stale: 0, corrections: 0, edits: 0 },
  queueNextCursors: { pending: null, review: null, stale: null, corrections: null, edits: null },
};
const firstPage = () => ({
  ...base,
  cameraReports: pendingCameras(1, 20),
  queueNextCursors: { ...base.queueNextCursors, pending: { createdAt: "2026-03-01T00:20:00.000Z", id: 20 } },
});
const secondPage = () => ({ ...base, cameraReports: pendingCameras(21, 5) });

const pendingNav = (screen) => screen.getByRole("navigation", { name: "Pending camera reports" });
const loadMoreButton = (screen) => rtl.within(pendingNav(screen)).getByRole("button");
const pendingTitles = (screen) =>
  rtl.within(screen.getByRole("list", { name: "Pending camera reports" }))
    .getAllByRole("heading", { level: 3 }).map((node) => node.textContent);

test("moderation queues: a bounded queue shows N of M and a labelled load-more control", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(() => jsonResponse(firstPage()));
  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Pending fixture 1")));

  assert.ok(screen.getByText("20 of 25 pending"), "the section note shows the page against the whole-queue total");
  assert.ok(screen.getByText("25 items awaiting a local decision"), "the summary counts the whole queues, not the page");
  const nav = pendingNav(screen);
  assert.ok(rtl.within(nav).getByText("Showing 20 of 25"));
  assert.equal(loadMoreButton(screen).textContent, "Load more");
  assert.equal(loadMoreButton(screen).getAttribute("aria-disabled"), "false");
  // Queues without a further page render no control at all.
  assert.equal(screen.queryByRole("navigation", { name: "Records needing review" }), null);
});

test("moderation queues: load more requests only that queue's cursor and appends the next slice in order", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input) => {
    const url = String(input);
    requests.push(url);
    return jsonResponse(url.includes("pending_after_id=20") ? secondPage() : firstPage());
  });
  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Pending fixture 1")));

  await user.click(loadMoreButton(screen));
  await waitFor(() => assert.ok(screen.queryByText("Pending fixture 25")));

  assert.deepEqual(requests, [
    "/api/moderation",
    "/api/moderation?pending_after_created_at=2026-03-01T00%3A20%3A00.000Z&pending_after_id=20",
  ]);
  assert.deepEqual(
    pendingTitles(screen),
    Array.from({ length: 25 }, (_, index) => `Pending fixture ${index + 1}`),
    "the next slice is appended after the first page, in FIFO order",
  );
  assert.ok(screen.getByText("25 of 25 pending"));
  assert.ok(rtl.within(pendingNav(screen)).getByText("Showing 25 of 25"));
  // Last page: the control stays (focus is not dropped) but is aria-disabled and inert.
  assert.equal(loadMoreButton(screen).getAttribute("aria-disabled"), "true");
  assert.equal(document.activeElement, loadMoreButton(screen), "keyboard focus stays on the control");
  await user.click(loadMoreButton(screen));
  assert.equal(requests.length, 2, "an exhausted queue issues no further request");
});

test("moderation queues: a failed load more keeps the rows and announces an alert", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input) =>
    String(input).includes("pending_after_id")
      ? jsonResponse({ error: "Moderation queue unavailable" }, { status: 503 })
      : jsonResponse(firstPage()));
  await renderWithLocale(React.createElement(ModerationDashboard));
  await waitFor(() => assert.ok(screen.queryByText("Pending fixture 1")));

  await user.click(loadMoreButton(screen));
  await waitFor(() => assert.ok(rtl.within(pendingNav(screen)).getByRole("alert")));
  assert.equal(rtl.within(pendingNav(screen)).getByRole("alert").textContent, "More items could not be loaded. Try again.");
  assert.equal(pendingTitles(screen).length, 20, "the shown page is kept");
  assert.equal(loadMoreButton(screen).getAttribute("aria-disabled"), "false", "the control stays usable for a retry");
});
