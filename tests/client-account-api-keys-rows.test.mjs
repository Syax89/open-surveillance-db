/**
 * One shard of the api-keys suite (split from tests/client-account-api-keys.test.mjs):
 * one case per file so each jsdom render runs in its own node --test process.
 * This shard: rows render name, prefix, meta, scope badges and status.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomPage, installFetchMock, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";
import { accountHandler, apiKeysFixture } from "./helpers/api-key-fixtures.mjs";

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
