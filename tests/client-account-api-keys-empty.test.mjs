/**
 * One shard of the api-keys suite (split from tests/client-account-api-keys.test.mjs):
 * one case per file so each jsdom render runs in its own node --test process.
 * This shard: the empty state offers create + docs link.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomPage, installFetchMock, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";
import { accountHandler } from "./helpers/api-key-fixtures.mjs";

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
