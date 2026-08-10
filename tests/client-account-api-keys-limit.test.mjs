/**
 * One shard of the api-keys suite (split from tests/client-account-api-keys.test.mjs):
 * one case per file so each jsdom render runs in its own node --test process.
 * This shard: a 409 maps to the localized limit error inside the dialog.
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
