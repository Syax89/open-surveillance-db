// Hero directory search + address autocomplete (issue #439): the home
// hero's search field is full-width and progressively enhanced with the
// shared PlaceAutocomplete primitive. The directory-search contract stays
// untouched: the rendered markup is a normal GET form to /directory with a
// name="q" input (usable without JS); typing only ever talks to the
// same-origin /api/geocode proxy (250 ms debounce, limit=5, current
// locale); selecting a suggestion fills `q` with the place display_name
// and closes the popup — the user submits the normal form themselves (no
// map deep links, no new API route). Empty / upstream-error / 429 states
// announce honestly via role=status and never disable the plain search.
//
// Fixtures are fictitious (no personal data).

import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, React, getNavState,
  installFetchMock, jsonResponse,
} from "./helpers/dom-harness.mjs";

let rtl;
let HeroDirectorySearch;
let en;

before(async () => {
  rtl = await setupDom();
  HeroDirectorySearch = (await loadDomModule("app/components/home/HeroDirectorySearch.mjs")).HeroDirectorySearch;
  en = (await loadDomModule("app/lib/i18n/home.mjs")).en;
});

afterEach(() => {
  rtl?.cleanup();
  installFetchMock(null);
});

function typeInto(search, value) {
  rtl.act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(search, value);
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// Flush a pending debounce/fetch/timer inside act() so the state updates
// they trigger never escape React's act scope (no act-warning spam).
function advance(ms) {
  return rtl.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

const FIXTURE_RESULTS = [
  {
    display_name: "Piazza del Duomo, Milan, Italy",
    lat: 45.4642,
    lng: 9.19,
    type: "pedestrian",
    boundingbox: ["45.4", "45.5", "9.1", "9.2"],
  },
  {
    display_name: "Via Garibaldi, Turin, Italy",
    lat: 45.0675,
    lng: 7.6825,
    type: "pedestrian",
    boundingbox: ["45.0", "45.1", "7.6", "7.7"],
  },
];

function geocodeHandler({ results = FIXTURE_RESULTS, status = 200, retryAfter = null } = {}) {
  return async (input) => {
    const url = String(input);
    if (url.startsWith("/api/geocode?")) {
      if (status === 429) {
        return jsonResponse({ error: "rate limited" }, { status: 429, headers: { "retry-after": String(retryAfter ?? 30) } });
      }
      return jsonResponse({ results }, { status });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
}

async function renderHero() {
  return renderWithLocale(React.createElement(HeroDirectorySearch));
}

// ---------------------------------------------------------------------------
// 1. SSR/no-JS contract: plain GET form, no client fetch during render
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 2. Debounce: no request before 250 ms; then only /api/geocode with
//    limit=5 and the current locale
// ---------------------------------------------------------------------------

test("typing makes no geocode request before the 250 ms debounce and sends only /api/geocode with limit=5 and the locale", async () => {
  const calls = [];
  installFetchMock(async (input) => {
    const url = String(input);
    if (url.startsWith("/api/geocode?")) {
      calls.push(url);
      return jsonResponse({ results: FIXTURE_RESULTS }, { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  const view = await renderHero();
  const search = view.container.querySelector("#hero-search");
  assert.ok(search, "hero search input renders");

  typeInto(search, "piazza");
  typeInto(search, "piazza del duomo");
  assert.equal(calls.length, 0, "no request before the debounce window (later keystroke cancels the earlier one)");

  await advance(400);
  assert.equal(calls.length, 1, "exactly one geocode request after the debounce");
  const url = new URL(String(calls[0]), "https://osdb.test/");
  assert.equal(url.pathname, "/api/geocode", "only the same-origin geocode proxy is contacted");
  assert.equal(url.searchParams.get("q"), "piazza del duomo", "the last trimmed query wins");
  assert.equal(url.searchParams.get("limit"), "5", "suggestion cap is 5");
  assert.equal(url.searchParams.get("lang"), "en", "the current locale is sent");

  const option = await view.findByText("Piazza del Duomo, Milan, Italy");
  assert.ok(option, "suggestion rendered");
});

// ---------------------------------------------------------------------------
// 3. ARIA listbox + keyboard + pointer selection serialized into q
// ---------------------------------------------------------------------------

test("the dropdown is an ARIA listbox; ArrowDown/Enter/Escape and click selection fill q with the display name", async () => {
  installFetchMock(geocodeHandler());
  const view = await renderHero();
  const { container } = view;
  const search = container.querySelector("#hero-search");
  const form = search.closest("form");
  assert.equal(form.getAttribute("action"), "/directory", "the form keeps its GET target");
  assert.equal(form.getAttribute("role"), "search");
  assert.equal(search.getAttribute("role"), "combobox");
  assert.equal(search.getAttribute("aria-autocomplete"), "list");
  assert.equal(search.getAttribute("name"), "q", "the enriched input IS the form's q field");

  typeInto(search, "piazza del");
  await advance(400);

  const listbox = container.querySelector("#hero-search-listbox");
  assert.ok(listbox, "results are an ARIA listbox");
  assert.equal(listbox.getAttribute("role"), "listbox");
  assert.equal(search.getAttribute("aria-expanded"), "true");
  assert.equal(search.getAttribute("aria-controls"), "hero-search-listbox");
  const options = [...listbox.querySelectorAll("[role=option]")];
  assert.equal(options.length, 2, "both fixture suggestions render");
  assert.equal(search.getAttribute("aria-activedescendant"), null, "no highlight before keyboard use");

  // ArrowDown highlights the first option (aria-activedescendant follows).
  rtl.fireEvent.keyDown(search, { key: "ArrowDown" });
  assert.equal(search.getAttribute("aria-activedescendant"), "hero-search-option-0");
  assert.equal(options[0].getAttribute("aria-selected"), "true");

  // ArrowDown again moves to the second option.
  rtl.fireEvent.keyDown(search, { key: "ArrowDown" });
  assert.equal(search.getAttribute("aria-activedescendant"), "hero-search-option-1");

  // ArrowUp wraps back to the first.
  rtl.fireEvent.keyDown(search, { key: "ArrowUp" });
  assert.equal(search.getAttribute("aria-activedescendant"), "hero-search-option-0");

  // Enter selects the highlighted option and closes the popup.
  rtl.fireEvent.keyDown(search, { key: "Enter" });
  assert.equal(search.value, "Piazza del Duomo, Milan, Italy", "q is filled with the display name");
  assert.equal(container.querySelector("#hero-search-listbox"), null, "dropdown closes after selection");
  assert.equal(search.getAttribute("aria-expanded"), "false");
  assert.equal(new FormData(form).get("q"), "Piazza del Duomo, Milan, Italy", "the serialized form carries the display name in q");

  // The selection must not navigate or submit on its own: the user submits
  // the unchanged GET form themselves.
  assert.deepEqual((await getNavState()).pushed, [], "no router navigation on selection");

  // Reopen and close with Escape.
  typeInto(search, "via garibaldi");
  await advance(400);
  assert.ok(container.querySelector("#hero-search-listbox"), "dropdown reopens for the new query");
  rtl.fireEvent.keyDown(search, { key: "Escape" });
  assert.equal(container.querySelector("#hero-search-listbox"), null, "Escape closes the dropdown");
  assert.equal(search.value, "via garibaldi", "Escape must not clear the typed text");
});

test("click selection fills q and closes the popup", async () => {
  installFetchMock(geocodeHandler());
  const view = await renderHero();
  const { container } = view;
  const search = container.querySelector("#hero-search");
  const form = search.closest("form");

  typeInto(search, "via garibaldi");
  await advance(400);
  const option = await view.findByText("Via Garibaldi, Turin, Italy");
  rtl.fireEvent.click(option);
  await advance(20);

  assert.equal(search.value, "Via Garibaldi, Turin, Italy");
  assert.equal(container.querySelector("#hero-search-listbox"), null, "popup closes on selection");
  assert.equal(new FormData(form).get("q"), "Via Garibaldi, Turin, Italy");
});

test("plain Enter with no highlighted suggestion does nothing — no selection, no preventDefault, the GET form submit proceeds (regression)", async () => {
  installFetchMock(geocodeHandler());
  const view = await renderHero();
  const { container } = view;
  const search = container.querySelector("#hero-search");
  const form = search.closest("form");

  typeInto(search, "piazza del");
  await advance(400);
  assert.ok(container.querySelector("#hero-search-listbox"), "suggestions are visible");
  assert.equal(search.getAttribute("aria-activedescendant"), null, "no suggestion is highlighted");

  // Enter with activeIndex=-1 and selectFirstOnEnter=false (the hero): the
  // primitive must do NOTHING — no result selection and no preventDefault —
  // so the browser's default action (normal GET /directory submission)
  // continues.
  const notCanceled = rtl.fireEvent.keyDown(search, { key: "Enter" });
  assert.equal(notCanceled, true, "Enter must not preventDefault (the form submit proceeds)");
  assert.equal(search.value, "piazza del", "no suggestion was selected into q");
  assert.ok(container.querySelector("#hero-search-listbox"), "the dropdown stays open for further interaction");
  assert.equal(new FormData(form).get("q"), "piazza del", "q still carries the typed text");

  // The form still submits as a normal GET request when Enter is defaulted.
  let submitted = null;
  form.addEventListener("submit", () => {
    submitted = new FormData(form).get("q");
  });
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  assert.equal(submitted, "piazza del", "the untouched GET form carries q on submit");
});

// ---------------------------------------------------------------------------
// 4. Honest states: empty, upstream error, 429 cooldown — never breaking
//    the plain directory search
// ---------------------------------------------------------------------------

test("an empty geocode reply announces role=status without inventing suggestions", async () => {
  installFetchMock(geocodeHandler({ results: [] }));
  const view = await renderHero();
  const { container } = view;
  const search = container.querySelector("#hero-search");

  typeInto(search, "zzzz not a place");
  await advance(400);
  const status = await view.findByText(en.searchNoResults("zzzz not a place"));
  assert.ok(status, "honest empty state announced");
  assert.equal(status.getAttribute("role"), "status");
  assert.equal(container.querySelector("#hero-search-listbox"), null, "no listbox for an empty reply");
  const form = search.closest("form");
  assert.equal(form.getAttribute("action"), "/directory", "the directory form is untouched");
  assert.equal(search.disabled, false, "the input stays enabled");
});

test("an upstream geocode error announces the unavailable state and keeps the directory search working", async () => {
  installFetchMock(geocodeHandler({ status: 503 }));
  const view = await renderHero();
  const { container } = view;
  const search = container.querySelector("#hero-search");
  const form = search.closest("form");

  // The 503 reply is a deliberate error path: the primitive logs the
  // failure (console.error) before announcing the honest unavailable state.
  // Spy locally so the expected error does not pollute the test output.
  const errorArgs = [];
  const originalError = console.error;
  console.error = (...args) => errorArgs.push(args);
  try {
    typeInto(search, "piazza del");
    await advance(400);
    const status = await view.findByText(en.searchUnavailable);
    assert.ok(status, "unavailable state announced");
    assert.equal(status.getAttribute("role"), "status");
    assert.ok(
      errorArgs.some((args) => args[0] === "place autocomplete failed"),
      "the geocode failure is logged via console.error",
    );

    // Progressive enhancement: the failure never removes or disables the
    // normal directory search — the input and the GET form survive intact.
    assert.equal(search.disabled, false, "input stays enabled after a geocode error");
    assert.equal(form.getAttribute("action"), "/directory", "form target unchanged");
    const submit = form.querySelector("button[type=submit]");
    assert.ok(submit, "submit button still present");
    assert.equal(submit.disabled, false, "submit stays enabled");
  } finally {
    console.error = originalError;
  }
});

test("a 429 reply enters the cooldown and announces the rate-limit status without further requests", async () => {
  const calls = [];
  installFetchMock((input) => {
    const url = String(input);
    if (url.startsWith("/api/geocode?")) {
      calls.push(url);
      return jsonResponse({ error: "rate limited" }, { status: 429, headers: { "retry-after": "30" } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  const view = await renderHero();
  const { container } = view;
  const search = container.querySelector("#hero-search");

  typeInto(search, "piazza del");
  await advance(400);
  const first = await view.findByText(en.searchRateLimited(30));
  assert.equal(first.getAttribute("role"), "status");
  assert.equal(calls.length, 1, "the 429 reply caused exactly one request");

  // While the cooldown is active, further typing announces the remaining
  // wait WITHOUT hitting the proxy again.
  typeInto(search, "piazza del duomo");
  await advance(400);
  const cooldown = container.querySelector(".geocode-status[role=status]");
  assert.ok(cooldown, "cooldown status visible");
  assert.match(cooldown.textContent, /^Too many searches\. Try again in \d+ seconds\.$/, "honest rate-limit copy");
  assert.equal(calls.length, 1, "no request during the cooldown");
  assert.equal(search.disabled, false, "the directory search input stays usable");
});
