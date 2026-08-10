/**
 * One shard of the api-keys suite (split from tests/client-account-api-keys.test.mjs):
 * one case per file so each jsdom render runs in its own node --test process.
 * This shard: the create dialog validates the name (required, max 60).
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
