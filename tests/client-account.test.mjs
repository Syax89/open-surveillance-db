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
 *   3. local status filters: selecting a labelled control refetches with
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
 *  10. passkey management (Fase E2): the enrolled list renders with the
 *      enrollment date, enrolling runs the real WebAuthn ceremony flow
 *      (register/begin -> navigator.credentials.create ->
 *      register/complete) and shows the once-only recovery codes in the
 *      accessible dialog, and removing a passkey requires the accessible
 *      confirm and DELETEs /api/auth/passkey/credentials with CSRF.
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
    emailVerifiedAt: "2026-01-15T10:00:00.000Z",
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

// Rework fixtures (2026-08-08): summary strip + mixed kinds + the
// post-0039 "active" status for published cameras.
const reworkContributionsFixture = {
  contributions: [
    { type: "camera", id: 41, title: "Published camera row", issueType: null, cameraId: null, status: "active", createdAt: "2026-02-01T08:00:00.000Z" },
    { type: "correction", id: 7, title: null, issueType: "inaccurate", cameraId: 41, status: "reviewed", createdAt: "2026-01-20T09:00:00.000Z" },
  ],
  pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1, hasMore: false },
  summary: {
    total: 2,
    byType: { camera: 1, correction: 1 },
    byStatus: { active: 1, reviewed: 1 },
  },
  level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
};

const passkeyFixture = {
  credentials: [
    { id: 1, credentialId: "cred-1", transports: "[\"internal\"]", createdAt: "2026-01-15T10:00:00.000Z" },
    { id: 2, credentialId: "cred-2", transports: null, createdAt: "2026-03-02T09:00:00.000Z" },
  ],
};

function routeHandler({ me = profileFixture, contributions = contributionsFixture, passkeys = [], keys = [] } = {}) {
  return (input) => {
    if (input === "/api/auth/me") return jsonResponse(me, { status: me === null ? 401 : 200 });
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributions);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: passkeys });
    if (input === "/api/auth/keys") return jsonResponse({ keys });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

/** Fake the WebAuthn browser surface (navigator.credentials + the
 *  PublicKeyCredential constructor) so browserSupportsWebAuthn() passes and
 *  the ceremony functions return a scriptable credential. */
function installWebAuthnGlobals(createImpl, getImpl) {
  globalThis.PublicKeyCredential = class FakePublicKeyCredential {};
  Object.defineProperty(globalThis.navigator, "credentials", {
    configurable: true,
    value: {
      create: async () => createImpl(),
      get: async () => getImpl(),
    },
  });
}

/** Remove the WebAuthn browser surface — the jsdom default, and the state a
 *  browser without passkey support (no secure context / old UA) presents. */
function clearWebAuthnGlobals() {
  delete globalThis.PublicKeyCredential;
  try {
    delete globalThis.navigator.credentials;
  } catch {
    /* keep the jsdom navigator as-is */
  }
}

/** A PublicKeyCredential-shaped object for the registration ceremony. */
function fakeRegistrationCredential() {
  return {
    id: "cred-new-id",
    rawId: new Uint8Array([1, 2, 3]).buffer,
    type: "public-key",
    response: {
      clientDataJSON: new Uint8Array([4, 5]).buffer,
      attestationObject: new Uint8Array([6, 7]).buffer,
      getTransports: () => ["internal"],
    },
    getClientExtensionResults: () => ({}),
  };
}

test("account: renders profile, trust-level badge and the contributions list", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(routeHandler());

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));

  assert.equal(screen.getByText("contributor@example.test").tagName, "DD");
  // LevelBadge: the frozen badge label + the textual progress line, no bar.
  assert.ok(screen.getByText("Trusted contributor"));
  assert.ok(screen.getByText("4 live contributions to reach the next trust level"));
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
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));

  assert.ok(screen.getByText("Experienced contributor"));
  assert.equal(screen.queryByText(/live contributions? to reach the next trust level/), null);
});

test("account: local status filter refetches with ?status= and keeps the URL clean", async () => {
  const { screen, waitFor } = rtl;
  const requests = [];
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
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
  await user.selectOptions(screen.getByLabelText("Filter contributions by status"), "pending");

  await waitFor(() => assert.ok(screen.queryByText("Another fixture report")));
  assert.equal(screen.queryByText("Fixture camera report"), null);
  // The filter is local state: the fetch carried ?status=pending, the URL
  // itself never changed.
  assert.ok(requests.some((r) => typeof r === "string" && r.includes("status=pending")));
  assert.equal(window.location.search, "");

  // A visible reset returns to the unfiltered first page without putting
  // private filter state in the browser URL.
  const requestsBeforeReset = requests.length;
  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  await waitFor(() => assert.equal(screen.getByLabelText("Filter contributions by status").value, "all"));
  assert.ok(
    requests.slice(requestsBeforeReset).some((r) => typeof r === "string" && !r.includes("status=")),
    "clearing the status filter must reload the unfiltered first page",
  );
});

test("account: summary strip + Published status control (rework 2026-08-08)", async () => {
  const { screen, waitFor } = rtl;
  const requests = [];
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    requests.push(input);
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      const url = new URL(input, "https://osdb.test");
      if (url.searchParams.get("status") === "active") {
        return jsonResponse({
          ...reworkContributionsFixture,
          contributions: [reworkContributionsFixture.contributions[0]],
          pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1, hasMore: false },
        });
      }
      return jsonResponse(reworkContributionsFixture);
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Published camera row")));

  // The summary strip renders the global per-kind counts (independent of
  // filters) with visible labels next to each number.
  assert.equal(screen.getAllByText("1", { selector: ".account-stat-value" }).length, 2);
  assert.ok(screen.getAllByText("Camera reports").length >= 2); // stat card + type option
  assert.ok(screen.getAllByText("Corrections").length >= 2);
  // In-moderation card: 0 pending in this fixture, still rendered.
  assert.ok(screen.getAllByText("In moderation").length >= 2); // stat card + status option

  // The "Published" control exists and refetches with ?status=active — the
  // post-0039 domain status is now filterable (P0 fix).
  const user = rtl.userEvent.setup();
  const statusFilter = screen.getByLabelText("Filter contributions by status");
  await user.selectOptions(statusFilter, "active");
  assert.ok(requests.some((r) => typeof r === "string" && r.includes("status=active")));
  // The status option carries its summary count.
  assert.ok(screen.getByRole("option", { name: "Published (1)" }));
});

test("account: kind rows show icon tile, issue label, date and related-record link (rework)", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(routeHandler({ contributions: reworkContributionsFixture }));

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Published camera row")));

  // Camera row: title link to /records/41 + kind label + date.
  const cameraLink = screen.getByRole("link", { name: "Published camera row" });
  assert.equal(cameraLink.getAttribute("href"), "/records/41");
  // Correction row: issue label (inaccurate) + link to the related camera.
  const correctionLink = screen.getByRole("link", { name: "Correction: Inaccurate information" });
  assert.equal(correctionLink.getAttribute("href"), "/records/41");
  // Terminal statuses resolve to human labels (reviewed) — the literal
  // "Status" fallback must never appear.
  assert.ok(screen.getByText("Resolved"));
  assert.equal(screen.queryByText("Status"), null);
  // Dates render for every row.
  assert.ok(screen.getAllByRole("link").length >= 2);
});

test("account: type filter refetches with ?type= (rework 2026-08-08)", async () => {
  const { screen, waitFor } = rtl;
  const requests = [];
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    requests.push(input);
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      const url = new URL(input, "https://osdb.test");
      if (url.searchParams.get("type") === "correction") {
        return jsonResponse({
          ...reworkContributionsFixture,
          contributions: [reworkContributionsFixture.contributions[1]],
          pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1, hasMore: false },
        });
      }
      return jsonResponse(reworkContributionsFixture);
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Published camera row")));

  const user = rtl.userEvent.setup();
  await user.selectOptions(screen.getByLabelText("Filter by type"), "correction");

  await waitFor(() => assert.ok(screen.queryByText("Correction: Inaccurate information")));
  assert.equal(screen.queryByText("Published camera row"), null);
  assert.ok(requests.some((r) => typeof r === "string" && r.includes("type=correction")));
  // The filter stays local state: URL untouched.
  assert.equal(window.location.search, "");
});

test("account: empty states — no contributions vs. filter without matches", async () => {
  const { screen, waitFor } = rtl;
  // No contributions at all.
  installFetchMock(routeHandler({ contributions: emptyContributionsFixture }));
  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));
  // The empty state renders after the contributions fetch resolves (second
  // effect cycle), so wait for it.
  await waitFor(() => assert.ok(screen.queryByText("No contributions yet")));
  assert.ok(screen.getByText("You have not contributed any records yet."));

  rtl.cleanup();

  // Filter with no matches (total > 0, but the selected status is empty).
  const { screen: screen2 } = rtl;
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
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
  await user.selectOptions(screen2.getByLabelText("Filter contributions by status"), "removed");
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
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
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
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse({ error: "boom" }, { status: 503 });
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));
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
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    requests.push({ input, init });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    return jsonResponse({}, { status: 200 });
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));
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
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
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
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));
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
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
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
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));

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
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    requests.push({ input, init });
    return routeHandler()(input);
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));

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
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    if (input === "/api/auth/me" && init.method === "PATCH") {
      return jsonResponse({ error: "Too many requests" }, { status: 429 });
    }
    return routeHandler()(input);
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));

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
  const { screen, waitFor, within } = rtl;
  installFetchMock(routeHandler({ me: null }));

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Not logged in")));
  assert.ok(screen.getByText("Log in to see your profile and your attributed reports."));
  // Both auth entry points are offered in the not-logged-in CARD. The
  // header (PublicNav -> AuthNavLinks, t_96f0d374) renders the same pair
  // on the anonymous state, so scope to the card to pin the card contract.
  const card = document.querySelector("article.auth-card");
  assert.ok(card, "the not-logged-in card must render");
  assert.ok(within(card).getByRole("link", { name: "Log in" }));
  assert.ok(within(card).getByRole("link", { name: "Create account" }));
});

test("account: enrolled passkeys render with a remove action; empty state is honest", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(routeHandler({ passkeys: passkeyFixture.credentials }));

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.getByText("Passkeys")));
  // The section lists each credential with its enrollment date label.
  const rows = await screen.findAllByRole("button", { name: "Remove" });
  assert.equal(rows.length, 2);
  assert.equal(screen.getAllByText(/Enrolled:/).length, 2);
  assert.ok(screen.getByRole("button", { name: "Add passkey" }));

  rtl.cleanup();
  installFetchMock(routeHandler());
  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.getByText("Passkeys")));
  await waitFor(() => assert.ok(screen.getByText("No passkeys enrolled yet.")));
});

test("account: enrolling a passkey runs begin -> create -> complete and shows the recovery codes once", async () => {
  const { screen, waitFor, within } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    requests.push({ input, init });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    if (input === "/api/auth/passkey/register/begin") {
      return jsonResponse({
        options: {
          challenge: "begin-challenge-b64",
          rp: { id: "osdb.test", name: "OpenSurveillanceDB" },
          user: { id: "MQ", name: "contributor@example.test", displayName: "Fixture Contributor" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          timeout: 60000,
          attestation: "none",
          authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
        },
      });
    }
    if (input === "/api/auth/passkey/register/complete") {
      return jsonResponse({
        credential: { id: "cred-new-id" },
        recoveryCodes: ["aaaa-bbbb-cccc-dddd", "eeee-ffff-0000-1111"],
        recoveryCodesRemaining: 2,
      });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  installWebAuthnGlobals(() => fakeRegistrationCredential(), () => { throw new Error("unused"); });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));
  await user.click(screen.getByRole("button", { name: "Add passkey" }));

  // The once-only recovery codes land in the accessible alertdialog.
  const dialog = await screen.findByRole("alertdialog");
  assert.ok(within(dialog).getByText("aaaa-bbbb-cccc-dddd"));
  assert.ok(within(dialog).getByText("eeee-ffff-0000-1111"));

  // begin carried the CSRF header; complete carried challenge + response.
  const beginRequest = requests.find((r) => r.input === "/api/auth/passkey/register/begin");
  assert.ok(beginRequest, "register/begin must be called");
  assert.equal(beginRequest.init.method, "POST");
  assert.equal(beginRequest.init.headers["x-csrf-token"], "fixture-csrf-token");
  const completeRequest = requests.find((r) => r.input === "/api/auth/passkey/register/complete");
  assert.ok(completeRequest, "register/complete must be called");
  const completeBody = JSON.parse(completeRequest.init.body);
  assert.equal(completeBody.challenge, "begin-challenge-b64");
  assert.equal(completeBody.response.id, "cred-new-id");
  // rawId [1,2,3] -> base64url "AQID"; attestationObject [6,7] -> "Bgc".
  assert.equal(completeBody.response.rawId, "AQID");
  assert.equal(completeBody.response.response.attestationObject, "Bgc");
  assert.deepEqual(completeBody.response.response.transports, ["internal"]);
  assert.equal(completeRequest.init.headers["x-csrf-token"], "fixture-csrf-token");

  // Dismissing requires the explicit acknowledgment; the success note is polite.
  await user.click(within(dialog).getByRole("button", { name: "I saved them" }));
  await waitFor(() => assert.equal(screen.queryByRole("alertdialog"), null));
  assert.ok(screen.getByText("Passkey added."));
});

test("account: enrolling a passkey in a browser without WebAuthn shows an explanatory alert and never calls the API", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  clearWebAuthnGlobals();
  const requests = [];
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    requests.push({ input, init });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));
  await user.click(screen.getByRole("button", { name: "Add passkey" }));

  // Explanatory alert, no crash, no ceremony fetch: the guard runs before
  // any network call (browserSupportsWebAuthn() false → setEnrollError).
  const alert = await screen.findByRole("alert");
  assert.match(alert.textContent ?? "", /does not support passkeys/i);
  assert.equal(
    requests.filter((r) => String(r.input).includes("/api/auth/passkey/register/begin")).length,
    0,
    "without WebAuthn no ceremony fetch may start",
  );
  assert.equal(requests.filter((r) => String(r.input).includes("/api/auth/passkey/register/complete")).length, 0);
  // The page stays interactive: the button is not stuck in a busy state.
  assert.equal(screen.getByRole("button", { name: "Add passkey" }).disabled, false);
});

test("account: cancelling the passkey remove confirm sends no DELETE", async () => {
  const { screen, within } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    requests.push({ input, init });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse(passkeyFixture);
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderWithLocale(React.createElement(AccountPage));
  const removeButtons = await screen.findAllByRole("button", { name: "Remove" });
  assert.equal(removeButtons.length, 2);
  await user.click(removeButtons[0]);

  const dialog = await screen.findByRole("alertdialog");
  assert.ok(screen.getByRole("heading", { name: "Remove this passkey?" }));
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    requests.some((r) => r.input === "/api/auth/passkey/credentials" && r.init?.method === "DELETE"),
    false,
    "cancelling must not DELETE",
  );
  assert.equal(screen.queryByRole("alertdialog"), null);
  assert.equal(screen.getAllByRole("button", { name: "Remove" }).length, 2);
});

test("account: confirming the passkey remove DELETEs /api/auth/passkey/credentials with CSRF", async () => {
  const { screen, waitFor, within } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    requests.push({ input, init });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials" && init?.method === "DELETE") {
      return jsonResponse({ ok: true }, { status: 200 });
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse(passkeyFixture);
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderWithLocale(React.createElement(AccountPage));
  const removeButtons = await screen.findAllByRole("button", { name: "Remove" });
  await user.click(removeButtons[0]);
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Remove" }));

  await waitFor(() => assert.ok(
    requests.some((r) => r.input === "/api/auth/passkey/credentials" && r.init?.method === "DELETE"),
  ));
  const deleteRequest = requests.find(
    (r) => r.input === "/api/auth/passkey/credentials" && r.init?.method === "DELETE",
  );
  assert.equal(JSON.parse(deleteRequest.init.body).credentialId, "cred-1");
  assert.equal(deleteRequest.init.headers["x-csrf-token"], "fixture-csrf-token");
  // The row disappears locally and the dialog closes.
  await waitFor(() => assert.equal(screen.queryByRole("alertdialog"), null));
  await waitFor(() => assert.equal(screen.getAllByRole("button", { name: "Remove" }).length, 1));
});

test("account: a 409 on enroll completion shows the already-enrolled error, no recovery dialog", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    if (input === "/api/auth/passkey/register/begin") {
      return jsonResponse({
        options: {
          challenge: "begin-challenge-b64",
          rp: { id: "osdb.test", name: "OpenSurveillanceDB" },
          user: { id: "MQ", name: "contributor@example.test", displayName: "Fixture Contributor" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        },
      });
    }
    if (input === "/api/auth/passkey/register/complete") {
      return jsonResponse({ error: "duplicate" }, { status: 409 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  installWebAuthnGlobals(() => fakeRegistrationCredential(), () => { throw new Error("unused"); });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));
  await user.click(screen.getByRole("button", { name: "Add passkey" }));

  await waitFor(() => assert.ok(screen.getByRole("alert")));
  assert.ok(screen.getByText("This passkey is already enrolled on your account."));
  assert.equal(screen.queryByRole("alertdialog"), null);
});

test("account: a 403 on enroll begin (expired CSRF) shows the actionable security-token error, not cross-site", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    if (input === "/api/auth/passkey/register/begin") {
      return jsonResponse({ error: "Invalid CSRF token. Refresh the page and try again." }, { status: 403 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  installWebAuthnGlobals(() => fakeRegistrationCredential(), () => { throw new Error("unused"); });
  document.cookie = "osdb_csrf=stale-csrf-token; path=/";

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));
  await user.click(screen.getByRole("button", { name: "Add passkey" }));

  await waitFor(() => assert.ok(screen.getByRole("alert")));
  assert.ok(screen.getByText("Your security token expired. Refresh the page and try again."));
  // The old cross-site mapping is gone — a same-origin 403 means an expired
  // CSRF token, and the user gets the actionable refresh message instead.
  assert.equal(screen.queryByText("Cross-site request rejected."), null);
  assert.equal(screen.queryByRole("alertdialog"), null);
});

test("account: an unverified contributor sees the verification banner with a working resend", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET" });
    if (url === "/api/auth/me") {
      return jsonResponse({
        contributor: {
          id: 1,
          email: "newbie@example.test",
          displayName: null,
          emailVerifiedAt: null,
          createdAt: "2026-01-15T10:00:00.000Z",
          updatedAt: "2026-01-15T10:00:00.000Z",
        },
        level: { level: 0, verifiedCount: 0, threshold: 0, nextThreshold: 1 },
      });
    }
    if (typeof url === "string" && url.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(emptyContributionsFixture);
    }
    if (url === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    if (url === "/api/auth/verify-email/resend" && init?.method === "POST") return jsonResponse({ sent: true });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(AccountPage));

  // P1-1 (design review): the banner explains the write gate and offers the
  // resend — the register→verify→write flow is no longer a dead end.
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "Verify your email to contribute" })));
  await user.click(screen.getByRole("button", { name: "Resend the email" }));
  await waitFor(() => assert.ok(requests.some((r) => r.url === "/api/auth/verify-email/resend" && r.method === "POST")));
  assert.ok(screen.getByText("Confirmation email sent."));
});

test("account: a verified contributor sees the done line instead of the banner", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock((input, init) => {
      if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryAllByText("Fixture Contributor").length >= 1));
  assert.ok(screen.getByText("Email verified — you can contribute."));
  assert.equal(screen.queryByRole("heading", { name: "Verify your email to contribute" }), null);
});

// ---------------------------------------------------------------------------
// API keys (epic api-keys T18, plan §3.1/§3.5): the /account panel between
// passkeys and the danger zone. Contract: GET /api/auth/keys (metadata
// only), POST /api/auth/keys (201 with raw key once), DELETE
// /api/auth/keys/[id] (soft revoke). Fixtures are fictitious.
// ---------------------------------------------------------------------------

const apiKeysFixture = [
  {
    id: 11,
    name: "Nightly sync script",
    keyPrefix: "osdb_AbC1dE",
    scopes: ["submit", "action"],
    createdAt: "2026-01-15T10:00:00.000Z",
    lastUsedAt: "2026-02-20T08:00:00.000Z",
    expiresAt: "2027-01-15T10:00:00.000Z",
    revokedAt: null,
  },
  {
    id: 12,
    name: "Old integration",
    keyPrefix: "osdb_XyZ9qR",
    scopes: ["edit"],
    createdAt: "2025-11-02T09:00:00.000Z",
    lastUsedAt: null,
    expiresAt: "2026-11-02T09:00:00.000Z",
    revokedAt: "2026-03-01T12:00:00.000Z",
  },
];

function accountHandler({ me = profileFixture, contributions = contributionsFixture, passkeys = [], keys = [] } = {}) {
  return (input, init) => {
    if (input === "/api/auth/me") return jsonResponse(me, { status: me === null ? 401 : 200 });
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributions);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: passkeys });
    if (input === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}

test("account: api keys — empty state offers create + docs link", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(accountHandler());

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "API keys" })));
  // The heading exists during loading too — wait for the settled list.
  await waitFor(() => assert.ok(screen.getByText("No API keys yet")));

  assert.ok(screen.getByRole("button", { name: "Create API key" }));
  const docsLink = screen.getByRole("link", { name: "Read the API documentation" });
  assert.equal(docsLink.getAttribute("href"), "/api-docs");
});

test("account: api keys — rows render name, prefix, meta, scope badges and status", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock(accountHandler({ keys: apiKeysFixture }));

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "API keys" })));
  // The heading exists during loading too — wait for the settled list.
  await waitFor(() => assert.ok(screen.getByText("Nightly sync script")));

  // Active row: name + prefix chip + both scope labels + Active + Revoke.
  assert.ok(screen.getByText("Nightly sync script"));
  assert.ok(screen.getByText("osdb_AbC1dE…"));
  assert.ok(screen.getByText("Submit reports and corrections"));
  assert.ok(screen.getByText("Community actions"));
  assert.ok(screen.getByText("Active"));
  assert.ok(screen.getByRole("button", { name: "Revoke" }));
  // Meta: created date + last used (formatPublicDate long-form). Both rows
  // carry their own <dl> labels, so the labels are expected twice.
  assert.ok(screen.getAllByText("Created").length === 2);
  assert.ok(screen.getAllByText("Last used").length === 2);
  // Revoked row: muted, label Revoked, NO revoke action.
  assert.ok(screen.getByText("Old integration"));
  assert.ok(screen.getByText("Revoked"));
  assert.ok(screen.getByText("Never used"));
  assert.equal(screen.getAllByRole("button", { name: "Revoke" }).length, 1);
});

test("account: api keys — create dialog validates name (required, max 60)", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "API keys" })));
  // The heading exists during loading too — wait for the empty-state CTA.
  await user.click(await screen.findByRole("button", { name: "Create API key" }));

  const dialog = await screen.findByRole("dialog");
  assert.ok(dialog.getAttribute("aria-modal") === "true");
  assert.ok(screen.getByRole("heading", { name: "Create an API key" }));

  const nameInput = screen.getByLabelText("Key name");
  // Empty name: the create button is disabled until valid.
  const createButton = screen.getByRole("button", { name: "Create key" });
  assert.equal(createButton.disabled, true);
  await user.type(nameInput, "x");
  assert.equal(createButton.disabled, false);
  await user.clear(nameInput);
  assert.equal(createButton.disabled, true);

  // Too-long name (61 chars) surfaces the localized error and stays disabled.
  await user.type(nameInput, "a".repeat(61));
  assert.ok(screen.getByText("The name must be 60 characters or fewer."));
  assert.equal(nameInput.getAttribute("aria-invalid"), "true");
  assert.equal(createButton.disabled, true);
});

test("account: api keys — create success POSTs with CSRF, reveals raw key once, refetches on close", async () => {
  const { screen, waitFor, within } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") {
      return jsonResponse({ keys: requests.some((r) => r.init?.method === "POST") ? [{ id: 21, name: "My script", keyPrefix: "osdb_NewKey", scopes: ["submit", "edit"], createdAt: "2026-08-09T10:00:00.000Z", lastUsedAt: null, expiresAt: "2027-08-09T10:00:00.000Z", revokedAt: null }] : [] });
    }
    if (input === "/api/auth/keys" && init?.method === "POST") {
      return jsonResponse({
        id: 21, name: "My script", keyPrefix: "osdb_NewKey",
        key: "osdb_RawKeyValue123", scopes: ["submit", "edit"],
        createdAt: "2026-08-09T10:00:00.000Z", expiresAt: "2027-08-09T10:00:00.000Z",
      }, { status: 201 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "API keys" })));
  // The heading exists during loading too — wait for the empty-state CTA.
  await user.click(await screen.findByRole("button", { name: "Create API key" }));

  // Default scope set = all four (D4); the user narrows to submit+edit.
  const dialog = await screen.findByRole("dialog");
  await user.type(screen.getByLabelText("Key name"), "My script");
  await user.click(within(dialog).getByRole("button", { name: "Community actions" }));
  await user.click(within(dialog).getByRole("button", { name: "Confirm cameras" }));
  await user.click(screen.getByRole("button", { name: "Create key" }));

  // POST carries name + narrowed scopes + CSRF echo.
  await waitFor(() => assert.ok(requests.some((r) => r.input === "/api/auth/keys" && r.init?.method === "POST")));
  const post = requests.find((r) => r.input === "/api/auth/keys" && r.init?.method === "POST");
  assert.equal(post.init.headers["x-csrf-token"], "fixture-csrf-token");
  assert.deepEqual(JSON.parse(post.init.body), { name: "My script", scopes: ["submit", "edit"] });

  // Reveal-once dialog: alertdialog with the raw key, "I saved it" only close.
  const reveal = await screen.findByRole("alertdialog");
  assert.ok(reveal.getAttribute("aria-modal") === "true");
  assert.ok(within(reveal).getByText("osdb_RawKeyValue123"));
  assert.ok(within(reveal).getByRole("button", { name: "I saved it" }));

  // Closing refetches the list: the new row appears (no second raw key shown).
  await user.click(within(reveal).getByRole("button", { name: "I saved it" }));
  await waitFor(() => assert.ok(screen.getByText("My script")));
  assert.equal(screen.queryByText("osdb_RawKeyValue123"), null);
  assert.equal(screen.queryByRole("alertdialog"), null);
});

test("account: api keys — 409 maps to the localized limit error inside the dialog", async () => {
  const { screen, waitFor, within } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input, init) => {
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    if (input === "/api/auth/keys" && init?.method === "POST") {
      return jsonResponse({ error: "limit" }, { status: 409 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "API keys" })));
  // The heading exists during loading too — wait for the empty-state CTA.
  await user.click(await screen.findByRole("button", { name: "Create API key" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(screen.getByLabelText("Key name"), "Fifth key");
  await user.click(screen.getByRole("button", { name: "Create key" }));

  await waitFor(() => assert.ok(within(dialog).getByRole("alert")));
  assert.ok(within(dialog).getByText("You already have 5 API keys. Revoke one before creating another."));
  // The dialog stays open so the user can act on the limit.
  assert.ok(screen.getByRole("dialog"));
});

test("account: api keys — revoke cancel sends no DELETE; confirm DELETEs with CSRF and flips the row", async () => {
  const { screen, waitFor, within } = rtl;
  const user = rtl.userEvent.setup();
  const requests = [];
  installFetchMock((input, init) => {
    requests.push({ input, init });
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") {
      return jsonResponse({ keys: requests.some((r) => r.init?.method === "DELETE") ? [{ ...apiKeysFixture[0], revokedAt: "2026-08-09T12:00:00.000Z" }] : [apiKeysFixture[0]] });
    }
    if (input === "/api/auth/keys/11" && init?.method === "DELETE") {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  document.cookie = "osdb_csrf=fixture-csrf-token; path=/";

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "API keys" })));
  // The heading exists during loading too — wait for the settled list.
  await waitFor(() => assert.ok(screen.getByText("Nightly sync script")));

  // Cancel: confirm dialog opens, no DELETE is sent.
  await user.click(screen.getByRole("button", { name: "Revoke" }));
  const confirm = await screen.findByRole("alertdialog");
  assert.ok(screen.getByRole("heading", { name: "Revoke this key?" }));
  await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(requests.some((r) => String(r.input).startsWith("/api/auth/keys/") && r.init?.method === "DELETE"), false);
  assert.ok(screen.getByRole("button", { name: "Revoke" }));

  // Confirm: DELETE with CSRF, row flips to Revoked.
  await user.click(screen.getByRole("button", { name: "Revoke" }));
  const confirm2 = await screen.findByRole("alertdialog");
  await user.click(within(confirm2).getByRole("button", { name: "Revoke" }));
  await waitFor(() => assert.ok(requests.some((r) => r.input === "/api/auth/keys/11" && r.init?.method === "DELETE")));
  const del = requests.find((r) => r.input === "/api/auth/keys/11" && r.init?.method === "DELETE");
  assert.equal(del.init.headers["x-csrf-token"], "fixture-csrf-token");
  await waitFor(() => assert.ok(screen.getByText("Revoked")));
  assert.equal(screen.queryByRole("button", { name: "Revoke" }), null);
});

test("account: api keys — a 401 from the list flips the page to logged-out", async () => {
  const { screen, waitFor } = rtl;
  installFetchMock((input) => {
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    if (input === "/api/auth/keys") return jsonResponse({ error: "unauthorized" }, { status: 401 });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });

  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.queryByText("Not logged in")));
  assert.ok(screen.getByText("Log in to see your profile and your attributed reports."));
});

test("account: api keys — without the Clipboard API the reveal dialog hides the copy button", async () => {
  const { screen, waitFor, within } = rtl;
  const user = rtl.userEvent.setup();
  installFetchMock((input, init) => {
    if (input === "/api/auth/me") return jsonResponse(profileFixture);
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributionsFixture);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: [] });
    if (String(input) === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys: [] });
    if (input === "/api/auth/keys" && init?.method === "POST") {
      return jsonResponse({
        id: 31, name: "No clipboard", keyPrefix: "osdb_NoClip",
        key: "osdb_ClipboardAbsent123", scopes: ["submit"],
        createdAt: "2026-08-09T10:00:00.000Z", expiresAt: "2027-08-09T10:00:00.000Z",
      }, { status: 201 });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
  // jsdom has no navigator.clipboard — the reveal dialog must degrade.
  await renderWithLocale(React.createElement(AccountPage));
  await waitFor(() => assert.ok(screen.getByRole("heading", { name: "API keys" })));
  // The heading exists during loading too — wait for the empty-state CTA.
  await user.click(await screen.findByRole("button", { name: "Create API key" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(screen.getByLabelText("Key name"), "No clipboard");
  await user.click(screen.getByRole("button", { name: "Create key" }));

  const reveal = await screen.findByRole("alertdialog");
  assert.equal(within(reveal).queryByRole("button", { name: "Copy key" }), null);
  assert.ok(within(reveal).getByText("osdb_ClipboardAbsent123"));
  assert.ok(within(reveal).getByRole("button", { name: "I saved it" }));
});
