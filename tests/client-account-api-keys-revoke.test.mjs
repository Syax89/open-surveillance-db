/**
 * One shard of the api-keys suite (split from tests/client-account-api-keys.test.mjs):
 * one case per file so each jsdom render runs in its own node --test process.
 * This shard: revoke cancel sends no DELETE; confirm DELETEs with CSRF and
 * flips the row.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomPage, installFetchMock, jsonResponse, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";
import { profileFixture, contributionsFixture, apiKeysFixture } from "./helpers/api-key-fixtures.mjs";

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
