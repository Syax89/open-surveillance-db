/**
 * One shard of the api-keys suite (split from tests/client-account-api-keys.test.mjs):
 * one case per file so each jsdom render runs in its own node --test process.
 * This shard: without the Clipboard API the reveal dialog hides the copy
 * button. Unlike the other shards it renders ApiKeyRevealDialog DIRECTLY
 * (open=true) instead of driving the full create flow — the create→reveal
 * path is covered by the create shard, and driving it here explodes the
 * jsdom+React RSS past the CI quota. jsdom has no navigator.clipboard, so
 * canCopy=false and the Copy button is not rendered (the degradation
 * contract).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let ApiKeyRevealDialog;

before(async () => {
  rtl = await setupDom();
  const mod = await loadDomModule("app/components/ApiKeyRevealDialog.mjs");
  ApiKeyRevealDialog = mod.ApiKeyRevealDialog;
});

afterEach(() => {
  rtl?.cleanup();
});

test("account: api keys — without the Clipboard API the reveal dialog hides the copy button", async () => {
  const { container } = await renderWithLocale(React.createElement(ApiKeyRevealDialog, { open: true, keyValue: "osdb_ClipboardAbsent123", onClose: () => {} }));
  const reveal = container.querySelector('[role="alertdialog"]');
  assert.ok(reveal, "the reveal surface must be an alertdialog");
  const { within } = rtl;
  assert.equal(within(reveal).queryByRole("button", { name: "Copy key" }), null);
  assert.ok(within(reveal).getByText("osdb_ClipboardAbsent123"));
  assert.ok(within(reveal).getByRole("button", { name: "I saved it" }));
});
