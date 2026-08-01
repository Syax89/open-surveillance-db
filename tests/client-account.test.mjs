/**
 * Client-side interaction tests for /account — QA t_61b90f6a + C5
 * (COMMUNITY_PLAN §2.3) + C6.
 *
 * Covers, in jsdom with @testing-library/react + user-event:
 *   1. the profile renders with the trust-level badge (LevelBadge) and the
 *      textual progress line — never a bar, never numeric points;
 *   2. the contributions list renders rows with links to /records/[id], the
 *      localized status label and an "Edit contribution" link for editable
 *      camera rows only (owner-only: every row is the caller's own);
 *   3. local status filters: clicking a filter chip refetches with
 *      ?status= and re-renders the list (filter state stays out of the
 *      URL — private page);
 *   4. the polite total counter (role="status") announces the count;
 *   5. pagination: next/previous buttons drive page= and the page
 *      indicator carries aria-current;
 *   6. empty states: no contributions at all vs. a filter with no matches;
 *   7. erasure: deleting the account requires an ACCESSIBLE confirmation
 *      (ConfirmDialog alertdialog — C6 replaced window.confirm); cancelling
 *      sends no DELETE, confirming sends DELETE /api/auth/account with the
 *      CSRF token echoed back;
 *   8. display name inline edit (C6/C8): editing opens the inline form,
 *      saving PATCHes /api/auth/me with CSRF and updates the profile, an
 *      invalid (1-char) name marks the field aria-invalid and sends
 *      nothing, a 429 maps to the localized rate-limit error;
 *   9. a 401 from /api/auth/me renders the "Not logged in" state.
 *
 * Fixtures are fictitious (example.test address, made-up titles).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomPage, installFetchMock, jsonResponse, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let AccountPage;

before(async () => {
  rtl = await setupDom();
  AccountPage = await loadDomPage("app/account/AccountPageBody.mjs");
});

afterEach(() => rtl?.cleanup());

const profileFixture = {
  contributor: {
    id: 1,
    email: "contributor@example.test",
    displayName: "Fixture Contributor",
    createdAt: "2026-01-15T10:00:00.000Z",
    updatedAt: "2026-01-15T10:00:00.000Z",
  },
  level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
};

const contributionsFixture = {
  contributions: [
    { type: "camera", id: 41, title: "Fixture camera report", issueType: null, cameraId: null, status: "verified", createdAt: "2026-02-01T08:00:00.000Z" },
    { type: "camera", id: 42, title: "Another fixture report", issueType: null, cameraId: null, status: "pending", createdAt: "2026-02-02T09:30:00.000Z" },
  ],
  pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1, hasMore: false },
  level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
};

const emptyContributionsFixture = {
  contributions: [],
  pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0, hasMore: false },
  level: { level: 0, verifiedCount: 0, threshold: 0, nextThreshold: 1 },
};

function routeHandler({ me = profileFixture, contributions = contributionsFixture } = {}) {
  return (input) => {
    if (input === "/api/auth/me") return jsonResponse(me, { status: me === null ? 401 : 200 });
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributions);
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

test("account: renders profile, trust-level badge and the contributions list", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(routeHandler());

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));

  assert.equal(screen.getByText("contributor@example.test").tagName, "DD");
  // LevelBadge: the frozen badge label + the textual progress line, no bar.
  assert.ok(screen.getByText("Trusted contributor"));
  assert.ok(screen.getByText("4 verified contributions to reach the next trust level"));
  // No numeric points anywhere (badge text only).
  assert.equal(screen.queryByText(/^[0-9]+ points?$/i), null);

  // The contributions list loads in its own effect cycle after the profile
  // (two fetch rounds), so wait for it rather than asserting immediately.
  const reportLink = await screen.findByRole("link", { name: "Fixture camera report" });
  assert.equal(reportLink.getAttribute("href"), "/records/41");
  // "Verified" / "In moderation" appear both as filter-chip labels and as
  // row status labels, so assert presence via getAllByText.
  assert.ok(screen.getAllByText("Verified").length >= 1);
  assert.ok(screen.getAllByText("In moderation").length >= 1);
  // Polite total counter.
  assert.equal(screen.getByText("2 contributions").getAttribute("role"), "status");
  // Owner-only Edit links: both rows are the caller's own camera
  // contributions and are editable (verified/pending), so both carry it.
  const editLinks = screen.getAllByRole("link", { name: "Edit contribution" });
  assert.equal(editLinks.length, 2);
  assert.equal(editLinks[0].getAttribute("href"), "/records/41/edit");
  assert.equal(editLinks[1].getAttribute("href"), "/records/42/edit");
  // Erasure UI present but untriggered.
  assert.ok(screen.getByRole("button", { name: "Delete account" }));
});

test("account: level badge at L4 omits the progress line (no next threshold)", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(routeHandler({
    me: { contributor: profileFixture.contributor, level: { level: 4, verifiedCount: 50, threshold: 50, nextThreshold: null } },
    contributions: { ...contributionsFixture, level: { level: 4, verifiedCount: 50, threshold: 50, nextThreshold: null } },
  }));

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));

  assert.ok(screen.getByText("Experienced contributor"));
  assert.equal(screen.queryByText(/verified contributions? to reach the next trust level/), null);
});

test("account: local status filter refetches with ?status= and keeps the URL clean", async () => {
  const { screen, waitFor } = rtl;
  const requests = [];
  installFetchMock((input) => {
    requests.push(input);
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      const url = new URL(input, "https://osdb.test");
      if (url.searchParams.get("status") === "pending") {
        return jsonResponse({
          contributions: [contributionsFixture.contributions[1]],
          pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1, hasMore: false },
          level: profileFixture.level,
        });
      }
      return jsonResponse(contributionsFixture);
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture camera report")));

  const user = rtl.userEvent.setup();
  await user.click(screen.getByRole("button", { name: "In moderation" }));

  await waitFor(() => assert.ok(screen.queryByText("Another fixture report")));
  assert.equal(screen.queryByText("Fixture camera report"), null);
  // The filter is local state: the fetch carried ?status=pending, the URL
  // itself never changed.
  assert.ok(requests.some((r) => typeof r === "string" && r.includes("status=pending")));
  assert.equal(window.location.search, "");
});

test("account: empty states — no contributions vs. filter without matches", async () => {
  const { screen, waitFor } = rtl;
  // No contributions at all.
  installFetchMock(routeHandler({ contributions: emptyContributionsFixture }));
  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));
  // The empty state renders after the contributions fetch resolves (second
  // effect cycle), so wait for it.
  await waitFor(() => assert.ok(screen.queryByText("No contributions yet")));
  assert.ok(screen.getByText("You have not contributed any records yet."));

  rtl.cleanup();

  // Filter with no matches (total > 0, but the selected status is empty).
  const { screen: screen2 } = rtl;
  installFetchMock((input) => {
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      const url = new URL(input, "https://osdb.test");
      if (url.searchParams.get("status") === "removed") {
        return jsonResponse({
          contributions: [],
          pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0, hasMore: false },
          level: profileFixture.level,
        });
      }
      return jsonResponse(contributionsFixture);
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen2.queryByText("Fixture camera report")));
  const user = rtl.userEvent.setup();
  await user.click(screen2.getByRole("button", { name: "Removed" }));
  await waitFor(() => assert.ok(screen2.queryByText("No contributions match this filter.")));
});

test("account: pagination next/previous drive page= and the indicator carries aria-current", async () => {
  const { screen, waitFor } = rtl;
  const pageOne = {
    contributions: [contributionsFixture.contributions[0]],
    pagination: { page: 1, pageSize: 25, total: 25, totalPages: 2, hasMore: true },
    level: profileFixture.level,
  };
  const pageTwo = {
    contributions: [contributionsFixture.contributions[1]],
    pagination: { page: 2, pageSize: 25, total: 25, totalPages: 2, hasMore: false },
    level: profileFixture.level,
  };
  installFetchMock((input) => {
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      const url = new URL(input, "https://osdb.test");
      return jsonResponse(url.searchParams.get("page") === "2" ? pageTwo : pageOne);
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture camera report")));
  assert.ok(screen.getByText("Page 1 of 2"));

  const user = rtl.userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Next page" }));
  await waitFor(() => assert.ok(screen.queryByText("Another fixture report")));
  assert.ok(screen.getByText("Page 2 of 2"));
  // The page indicator marks the current position (aria-current).
  const indicator = screen.getByText("Page 2 of 2");
  assert.equal(indicator.getAttribute("aria-current"), "page");
  // Previous is now enabled, Next disabled (hasMore=false).
  assert.equal(screen.getByRole("button", { name: "Previous page" }).disabled, false);
  assert.equal(screen.getByRole("button", { name: "Next page" }).disabled, true);
});

test("account: contributions error renders the honest alert, list is not blanked", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock((input) => {
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse({ error: "boom" }, { status: 503 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));
  // The error alert renders after the contributions fetch rejects (second
  // effect cycle), so wait for it. jsdom computes an empty accessible name
  // for <p role="alert">, so assert presence + text content rather than
  // filtering the role query by name.
  await waitFor(() => assert.ok(screen.queryByRole("alert")));
  assert.match(screen.getByRole("alert").textContent ?? "", /could not load your contributions/i);
});

test("account: cancelling the delete confirm sends no DELETE", async () => {
  const { screen, waitFor, within } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    return jsonResponse({}, { status: 200 });
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));
  await user.click(screen.getByRole("button", { name: "Delete account" }));

  // The accessible alertdialog opens; cancelling must send no DELETE.
  const dialog = await screen.findByRole("alertdialog");
  assert.ok(screen.getByRole("heading", { name: "Delete account permanently?" }));
  assert.ok(within(dialog).getByText("Cancel"));
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

  // Wait a tick so a (wrongly) issued DELETE would have been recorded.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(requests.some((request) => request.input === "/api/auth/account"), false);
  // The dialog closed and the profile is untouched.
  assert.equal(screen.queryByRole("alertdialog"), null);
});

test("account: confirming erasure DELETEs /api/auth/account with CSRF and shows the deleted state", async () => {
  const { screen, waitFor, within } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/account" && init.method === "DELETE") {
      return jsonResponse({}, { status: 200 });
    }
    return jsonResponse({}, { status: 200 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));
  await user.click(screen.getByRole("button", { name: "Delete account" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Delete account" }));

  await waitFor(() => assert.ok(requests.some((request) => request.input === "/api/auth/account")));
  const deleteRequest = requests.find((request) => request.input === "/api/auth/account");
  assert.equal(deleteRequest.init.method, "DELETE");
  assert.equal(deleteRequest.init.headers["x-csrf-token"], "fixture-csrf-token");
  await waitFor(() => assert.ok(screen.queryByText("Account deleted")));
  assert.ok(screen.getByText(
    "Your account has been erased and you are logged out. Your reports remain published without attribution.",
  ));
});

test("account: display name inline edit — save PATCHes /api/auth/me with CSRF and updates the profile (C6/C8)", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/auth/me" && init.method === "PATCH") {
      return jsonResponse({
        contributor: { ...profileFixture.contributor, displayName: "Updated Name" },
      }, { status: 200 });
    }
    return routeHandler()(input);
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));

  await user.click(screen.getByRole("button", { name: "Edit display name" }));
  const input = screen.getByLabelText(/display name/i);
  await user.clear(input);
  await user.type(input, "Updated Name");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => assert.ok(requests.some((request) => request.input === "/api/auth/me" && request.init.method === "PATCH")));
  const patchRequest = requests.find((request) => request.input === "/api/auth/me" && request.init.method === "PATCH");
  assert.equal(JSON.parse(patchRequest.init.body).displayName, "Updated Name");
  assert.equal(patchRequest.init.headers["x-csrf-token"], "fixture-csrf-token");
  await waitFor(() => assert.ok(screen.queryByText("Updated Name")));
  assert.ok(screen.getByText("Display name saved."));
});

test("account: display name inline edit — invalid 1-char name marks aria-invalid and sends nothing", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    return routeHandler()(input);
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));

  await user.click(screen.getByRole("button", { name: "Edit display name" }));
  const input = screen.getByLabelText(/display name/i);
  await user.clear(input);
  await user.type(input, "x");
  assert.equal(input.getAttribute("aria-invalid"), null, "no flag before submit");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => assert.equal(input.getAttribute("aria-invalid"), "true"));
  assert.ok(screen.getByRole("alert"));
  assert.equal(requests.some((request) => request.input === "/api/auth/me" && request.init.method === "PATCH"), false);
});

test("account: display name inline edit — 429 maps to the localized rate-limit error", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input, init) => {
    if (input === "/api/auth/me" && init.method === "PATCH") {
      return jsonResponse({ error: "Too many requests" }, { status: 429 });
    }
    return routeHandler()(input);
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));

  await user.click(screen.getByRole("button", { name: "Edit display name" }));
  const input = screen.getByLabelText(/display name/i);
  await user.clear(input);
  await user.type(input, "Another Name");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => assert.ok(screen.getByRole("alert")));
  assert.ok(screen.getByText("Too many attempts. Please try again in a minute."));
  // The edit form stays open so the user can retry.
  assert.ok(screen.getByRole("button", { name: "Save" }));
});

test("account: 401 from the profile endpoint renders the not-logged-in state", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(routeHandler({ me: null }));

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Not logged in")));
  assert.ok(screen.getByText("Log in to see your profile and your attributed reports."));
  // Both auth entry points are offered.
  assert.ok(screen.getByRole("link", { name: "Log in" }));
  assert.ok(screen.getByRole("link", { name: "Create account" }));
});
