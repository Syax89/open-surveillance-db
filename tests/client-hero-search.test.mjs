// Hero directory search (issue #439; privacy pass 2026-11).
//
// A plain GET form to /directory with a name="q" input. It used to geocode
// every pause in typing; it now sends NOTHING while typing and never talks
// to a geocoder at all — the directory searches around a place on Enter.
//
// Fixtures are fictitious (no personal data).

import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, React,
  installFetchMock, jsonResponse,
} from "./helpers/dom-harness.mjs";

let rtl;
let HeroDirectorySearch;

before(async () => {
  rtl = await setupDom();
  HeroDirectorySearch = (await loadDomModule("app/components/home/HeroDirectorySearch.mjs")).HeroDirectorySearch;
});

afterEach(() => {
  rtl?.cleanup();
  installFetchMock(null);
});

test("the hero search renders as a plain GET /directory form with name=q and no client fetch", async () => {
  const { renderToString } = await import("react-dom/server");
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("the hero search must not fetch during SSR");
  };
  try {
    const LocaleProvider = (await loadDomModule("app/components/LocaleProvider.mjs")).LocaleProvider;
    const html = renderToString(
      React.createElement(LocaleProvider, null, React.createElement(HeroDirectorySearch)),
    );
    assert.ok(html.length > 0, "server markup produced");
    assert.match(
      html,
      /<form(?=[^>]*class="hero-search")(?=[^>]*action="\/directory")(?=[^>]*role="search")[^>]*>/,
      "the SSR markup must keep the GET directory form",
    );
    assert.match(html, /id="hero-search"/, "the input id is preserved");
    assert.match(html, /name="q"/, "the input keeps the q field name");
    assert.ok(!fetchCalled, "no client fetch during SSR (autocomplete runs in effects only)");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("typing sends no request at all and the field is a plain search box (no combobox, no suggestions)", async () => {
  const requests = [];
  installFetchMock((url) => { requests.push(String(url)); return jsonResponse({ results: [] }); });
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(HeroDirectorySearch));
  const input = rtl.screen.getByRole("searchbox", { name: "Search the directory" });
  await user.type(input, "Piazza del Duomo");
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.deepEqual(requests, [], "nothing leaves the browser while typing");
  assert.equal(rtl.screen.queryByRole("combobox"), null, "no autocomplete widget");
  assert.equal(rtl.screen.queryByRole("listbox"), null, "no suggestion list");
  assert.equal(input.value, "Piazza del Duomo");
});

test("Enter submits the normal GET form to /directory with q (nothing intercepts it)", async () => {
  await renderWithLocale(React.createElement(HeroDirectorySearch));
  const input = rtl.screen.getByRole("searchbox", { name: "Search the directory" });
  const form = input.closest("form");
  assert.equal(form.getAttribute("action"), "/directory");
  assert.equal(input.getAttribute("name"), "q");
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false, "plain Enter keeps submitting the directory form");
});
