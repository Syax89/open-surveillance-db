/**
 * One shard of the api-keys suite (split from tests/client-account-api-keys.test.mjs):
 * one case per file so each jsdom render runs in its own node --test process.
 * This shard: create success POSTs with CSRF, reveals the raw key once,
 * refetches on close.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomPage, installFetchMock, jsonResponse, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";
import { profileFixture, contributionsFixture } from "./helpers/api-key-fixtures.mjs";

let rtl;
let AccountPage;

before(async () => {
  rtl = await setupDom();
  AccountPage = await loadDomPage("app/account/AccountPageBody.mjs");
});

afterEach(() => {
  rtl?.cleanup();
  document.cookie = "osdb_csrf=; Max-Age=0; path=/";
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
