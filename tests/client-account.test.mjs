/**
 * Client-side interaction tests for /account — QA t_61b90f6a.
 *
 * Covers, in jsdom with @testing-library/react + user-event:
 *   1. the submissions list renders with a link to /records/[id] and the
 *      localized status label;
 *   2. the empty state ("no attributed reports yet") when submissions is [];
 *   3. erasure: deleting the account requires confirmation (window.confirm);
 *      cancelling sends no DELETE, confirming sends DELETE /api/auth/account
 *      with the CSRF token echoed back;
 *   4. a 401 from /api/auth/me renders the "Not logged in" state.
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
  AccountPage = await loadDomPage("app/account/page.mjs");
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
};

const submissionsFixture = {
  submissions: [
    { id: 41, title: "Fixture camera report", status: "verified", createdAt: "2026-02-01T08:00:00.000Z" },
    { id: 42, title: "Another fixture report", status: "pending", createdAt: "2026-02-02T09:30:00.000Z" },
  ],
};

function routeHandler({ me = profileFixture, submissions = submissionsFixture } = {}) {
  return (input) => {
    if (input === "/api/auth/me") return jsonResponse(me, { status: me === null ? 401 : 200 });
    if (input === "/api/auth/me/submissions") return jsonResponse(submissions);
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

test("account: renders profile and submissions list with links and status labels", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(routeHandler());

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));

  assert.equal(screen.getByText("contributor@example.test").tagName, "DD");
  const reportLink = screen.getByRole("link", { name: "Fixture camera report" });
  assert.equal(reportLink.getAttribute("href"), "/records/41");
  const secondLink = screen.getByRole("link", { name: "Another fixture report" });
  assert.equal(secondLink.getAttribute("href"), "/records/42");
  // Localized status labels (English bundle): verified + pending
  assert.ok(screen.getByText("Verified"));
  assert.ok(screen.getByText("In moderation"));
  // No stale data: erasure UI is present but the confirm flow is untriggered.
  assert.ok(screen.getByRole("button", { name: "Delete account" }));
});

test("account: empty submissions shows the empty state", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(routeHandler({ submissions: { submissions: [] } }));

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));
  assert.equal(
    screen.getByText("You have not submitted any attributed reports yet.").tagName,
    "P",
  );
});

test("account: cancelling the delete confirm sends no DELETE", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (input === "/api/auth/me/submissions") return jsonResponse(submissionsFixture);
    return jsonResponse({}, { status: 200 });
  });
  window.confirm = () => false;

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));
  await user.click(screen.getByRole("button", { name: "Delete account" }));

  // Wait a tick so a (wrongly) issued DELETE would have been recorded.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(requests.some((request) => request.input === "/api/auth/account"), false);
});

test("account: confirming erasure DELETEs /api/auth/account with CSRF and shows the deleted state", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (input === "/api/auth/me/submissions") return jsonResponse(submissionsFixture);
    if (input === "/api/auth/account" && init.method === "DELETE") {
      return jsonResponse({}, { status: 200 });
    }
    return jsonResponse({}, { status: 200 });
  });
  window.confirm = () => true;
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Fixture Contributor")));
  await user.click(screen.getByRole("button", { name: "Delete account" }));

  await waitFor(() => assert.ok(requests.some((request) => request.input === "/api/auth/account")));
  const deleteRequest = requests.find((request) => request.input === "/api/auth/account");
  assert.equal(deleteRequest.init.method, "DELETE");
  assert.equal(deleteRequest.init.headers["x-csrf-token"], "fixture-csrf-token");
  await waitFor(() => assert.ok(screen.queryByText("Account deleted")));
  assert.ok(screen.getByText(
    "Your account has been erased and you are logged out. Your reports remain published without attribution.",
  ));
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
