// Search-as-you-type suggestions (2026-11) on the home hero, the /mappa
// place search and the /directory field — client contract.
//
// Privacy (tests/search-privacy.test.mjs, docs/OSM_INTEGRATION.md): while
// typing, the ONLY request is our own GET /api/cameras/suggest (debounced,
// min 2 characters, aborted on new input, cached). The place geocoder
// (/api/geocode → Nominatim) is never called while typing on any surface:
// only Enter (map) or the explicit "Search the place" item.
//
// Fixtures are fictitious (example records, illustrative coordinates).

import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, React,
  installFetchMock, jsonResponse, camerasApiResponse, setNavState,
} from "./helpers/dom-harness.mjs";

let rtl;
let HeroDirectorySearch;
let GeocodeSearch;
let FiltersBar;
let DirectoryTool;
let __resetPublicCamerasCache;

const SUGGESTIONS = [
  { id: 41, title: "Example camera Roma Nord", kind: "Fixed dome", address: "Via Esempio 1, Roma" },
  { id: 42, title: "Example camera Roma Sud", kind: "Bullet", address: null },
];

const PLACES = {
  results: [
    { display_name: "Example Town, Example Region", lat: 44.5, lng: 11.3, type: "administrative", boundingbox: ["44.4", "44.6", "11.2", "11.4"] },
  ],
};

/** Records every request; /api/cameras/suggest answers SUGGESTIONS unless `suggest` overrides. */
function installRecordingFetch({ suggest } = {}) {
  const requests = [];
  installFetchMock((input, init) => {
    const url = String(input);
    const entry = { url, signal: init?.signal ?? null };
    requests.push(entry);
    if (url.startsWith("/api/cameras/suggest")) {
      return suggest ? suggest(entry) : jsonResponse({ suggestions: SUGGESTIONS });
    }
    if (url.startsWith("/api/geocode")) return jsonResponse(PLACES);
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
  return {
    requests,
    suggest: () => requests.filter((r) => r.url.startsWith("/api/cameras/suggest")),
    geocode: () => requests.filter((r) => r.url.startsWith("/api/geocode")),
  };
}

const wait = (ms) => rtl.act(() => new Promise((resolve) => setTimeout(resolve, ms)));

before(async () => {
  rtl = await setupDom();
  HeroDirectorySearch = (await loadDomModule("app/components/home/HeroDirectorySearch.mjs")).HeroDirectorySearch;
  GeocodeSearch = (await loadDomModule("app/components/home/GeocodeSearch.mjs")).GeocodeSearch;
  FiltersBar = (await loadDomModule("app/components/FiltersBar.mjs")).FiltersBar;
  DirectoryTool = (await loadDomModule("app/components/tools/DirectoryTool.mjs")).DirectoryTool;
  __resetPublicCamerasCache = (await loadDomModule("app/lib/use-public-cameras.mjs")).__resetPublicCamerasCache;
});

afterEach(() => {
  rtl?.cleanup();
  installFetchMock(null);
  __resetPublicCamerasCache?.();
  setNavState({ pushed: [], replaced: [], replaceCalls: [], search: "", pathname: "/" });
});

async function mountHero() {
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(HeroDirectorySearch));
  const input = rtl.screen.getByRole("combobox", { name: "Search the directory" });
  return { user, input };
}

// ---------------------------------------------------------------------------
// Debounce, minimum length, abort, cache (shared hook, via the hero)
// ---------------------------------------------------------------------------

test("debounce: no request before the pause, exactly one after it, sent to our own endpoint", async () => {
  const fetches = installRecordingFetch();
  const { user, input } = await mountHero();
  await user.type(input, "Roma");
  assert.equal(fetches.requests.length, 0, "nothing is sent while the visitor is still typing");
  await wait(400);
  assert.equal(fetches.suggest().length, 1, "one suggestion request after the pause");
  assert.equal(fetches.requests.length, 1, "and no other request at all");
  const sent = new URL(fetches.suggest()[0].url, "https://osdb.test");
  assert.equal(sent.pathname, "/api/cameras/suggest");
  assert.equal(sent.searchParams.get("q"), "Roma");
  assert.equal(sent.searchParams.get("limit"), "5");
  assert.equal(fetches.geocode().length, 0, "the place geocoder is never called while typing");
});

test("minimum 2 characters: a single character sends nothing", async () => {
  const fetches = installRecordingFetch();
  const { user, input } = await mountHero();
  await user.type(input, "R");
  await wait(400);
  assert.equal(fetches.requests.length, 0);
  await user.type(input, " ");
  await wait(400);
  assert.equal(fetches.requests.length, 0, "whitespace does not count towards the minimum");
});

test("a new keystroke aborts the in-flight request; only the latest answer is shown", async () => {
  let release;
  const fetches = installRecordingFetch({
    suggest: (entry) => (entry.url.includes("q=Ro&") ? new Promise((resolve) => { release = () => resolve(jsonResponse({ suggestions: [{ id: 1, title: "Stale", kind: "Bullet", address: null }] })); }) : jsonResponse({ suggestions: SUGGESTIONS })),
  });
  const { user, input } = await mountHero();
  await user.type(input, "Ro");
  await wait(400);
  assert.equal(fetches.suggest().length, 1, "the first pause sends one request (still in flight)");
  await user.type(input, "ma");
  assert.equal(fetches.suggest()[0].signal?.aborted, true, "new input aborts the in-flight request");
  await wait(400);
  assert.equal(fetches.suggest().length, 2);
  release();
  await wait(20);
  const listbox = rtl.screen.getByRole("listbox", { name: "Suggestions" });
  const texts = rtl.within(listbox).getAllByRole("option").map((o) => o.textContent);
  assert.ok(texts.some((t) => t.includes("Example camera Roma Nord")));
  assert.ok(!texts.some((t) => t.includes("Stale")), "the aborted reply never reaches the list");
});

test("recent queries are cached client-side: retyping a query sends no new request", async () => {
  const fetches = installRecordingFetch();
  const { user, input } = await mountHero();
  await user.type(input, "Roma");
  await wait(400);
  assert.equal(fetches.suggest().length, 1);
  await user.type(input, "{Backspace}");
  await wait(400);
  assert.equal(fetches.suggest().length, 2, "a new query is asked once");
  await user.type(input, "a");
  await wait(400);
  assert.equal(fetches.suggest().length, 2, "\"Roma\" again comes from the cache");
  assert.ok(rtl.screen.getByRole("option", { name: /Example camera Roma Nord/ }));
});

// ---------------------------------------------------------------------------
// Home hero
// ---------------------------------------------------------------------------

test("hero: ARIA combobox, keyboard navigation, live count; choosing a record opens /records/<id>", async () => {
  installRecordingFetch();
  const { user, input } = await mountHero();
  assert.equal(input.getAttribute("aria-expanded"), "false");
  assert.equal(input.getAttribute("aria-autocomplete"), "list");
  await user.type(input, "Roma");
  await wait(400);
  const listbox = rtl.screen.getByRole("listbox", { name: "Suggestions" });
  assert.equal(input.getAttribute("aria-expanded"), "true");
  assert.equal(input.getAttribute("aria-controls"), listbox.id);
  const options = rtl.within(listbox).getAllByRole("option");
  assert.equal(options.length, 3, "two records + the place item");
  assert.match(options[0].textContent, /Example camera Roma Nord/);
  assert.match(options[0].textContent, /Via Esempio 1, Roma/);
  assert.match(options[2].textContent, /Search the place “Roma” \(OpenStreetMap\)/, "the place search is the last item");
  const live = document.querySelector('.hero-search [role="status"]');
  assert.equal(live.textContent, "3 suggestions available");

  await user.keyboard("{ArrowDown}");
  assert.equal(input.getAttribute("aria-activedescendant"), options[0].id);
  assert.equal(options[0].getAttribute("aria-selected"), "true");
  await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
  assert.equal(input.getAttribute("aria-activedescendant"), options[0].id, "ArrowDown wraps to the first option");
  await user.keyboard("{ArrowUp}");
  assert.equal(input.getAttribute("aria-activedescendant"), options[2].id, "ArrowUp wraps to the last option");
  await user.keyboard("{ArrowUp}{ArrowUp}{Enter}");
  assert.deepEqual(window.__locationAssigns, ["/records/41"]);
});

test("hero: Escape closes the list; Enter with nothing highlighted keeps the GET /directory submit", async () => {
  const fetches = installRecordingFetch();
  const { user, input } = await mountHero();
  await user.type(input, "Roma");
  await wait(400);
  assert.equal(input.getAttribute("aria-expanded"), "true");
  await user.keyboard("{Escape}");
  assert.equal(input.getAttribute("aria-expanded"), "false");
  assert.equal(rtl.screen.queryByRole("listbox"), null);
  const event = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false, "plain Enter submits the form to /directory?q=");
  assert.equal(input.closest("form").getAttribute("action"), "/directory");
  assert.equal(input.getAttribute("name"), "q");
  assert.equal(fetches.geocode().length, 0);
});

test("hero: coordinates and #123 are suggested instantly with no request at all", async () => {
  const fetches = installRecordingFetch();
  const { user, input } = await mountHero();
  await user.type(input, "41.9068, 12.4808");
  await wait(400);
  assert.equal(fetches.requests.length, 0, "coordinates never leave the browser");
  const coords = rtl.screen.getByRole("option", { name: "Show coordinates 41.90680, 12.48080 on the map" });
  await user.click(coords);
  assert.deepEqual(window.__locationAssigns, ["/mappa?lat=41.906800&lng=12.480800&zoom=17"]);

  await user.clear(input);
  await user.type(input, "#12");
  await wait(400);
  assert.equal(fetches.requests.length, 0, "#123 never leaves the browser");
  const options = rtl.screen.getAllByRole("option");
  assert.equal(options.length, 1);
  assert.equal(options[0].textContent, "Open record #12");
  await user.keyboard("{ArrowDown}{Enter}");
  assert.deepEqual(window.__locationAssigns.at(-1), "/records/12");
});

test("hero: the place geocoder runs only when \"Search the place\" is chosen; a place opens the map there", async () => {
  const fetches = installRecordingFetch();
  const { user, input } = await mountHero();
  await user.type(input, "Example Town");
  await wait(400);
  assert.equal(fetches.geocode().length, 0, "typing never reaches the geocoder");
  await user.click(rtl.screen.getByRole("option", { name: /Search the place “Example Town”/ }));
  const listbox = await rtl.waitFor(() => rtl.screen.getByRole("listbox", { name: "Place suggestions" }));
  assert.equal(fetches.geocode().length, 1, "exactly one geocode request, on the explicit choice");
  assert.ok(document.querySelector(".hero-search .geocode-attribution"), "OSM attribution with place results");
  await user.click(rtl.within(listbox).getByRole("option", { name: /Example Town, Example Region/ }));
  assert.deepEqual(window.__locationAssigns, ["/mappa?lat=44.500000&lng=11.300000&zoom=15"]);
});

test("hero: a failing suggestion request degrades silently (local + place items stay)", async () => {
  installRecordingFetch({ suggest: () => jsonResponse({ error: "nope" }, { status: 503 }) });
  const { user, input } = await mountHero();
  await user.type(input, "Roma");
  await wait(400);
  const options = rtl.screen.getAllByRole("option");
  assert.equal(options.length, 1);
  assert.match(options[0].textContent, /Search the place/);
});

// ---------------------------------------------------------------------------
// /mappa place search
// ---------------------------------------------------------------------------

test("map: typing suggests records (no geocode); choosing one uses the onRecordSelect focus path", async () => {
  const fetches = installRecordingFetch();
  const opened = [];
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(GeocodeSearch, { onPlaceSelect: () => assert.fail("not a place"), onRecordSelect: (id) => opened.push(id) }));
  const input = rtl.screen.getByRole("combobox", { name: /Find a place/ });
  await user.type(input, "Roma");
  await wait(400);
  assert.equal(fetches.geocode().length, 0, "no /api/geocode while typing on the map");
  assert.equal(fetches.suggest().length, 1);
  const listbox = rtl.screen.getByRole("listbox", { name: "Suggestions" });
  const options = rtl.within(listbox).getAllByRole("option");
  assert.match(options.at(-1).textContent, /Search the place “Roma” \(OpenStreetMap\)/);
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  assert.deepEqual(opened, [42]);
  assert.equal(fetches.geocode().length, 0);
});

test("map: Enter with nothing highlighted keeps today's explicit place search (one geocode request)", async () => {
  const fetches = installRecordingFetch();
  const places = [];
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(GeocodeSearch, { onPlaceSelect: (p) => places.push(p), onRecordSelect: () => assert.fail("not a record") }));
  const input = rtl.screen.getByRole("combobox", { name: /Find a place/ });
  await user.type(input, "Example Town");
  await wait(400);
  await user.keyboard("{Enter}");
  await rtl.waitFor(() => rtl.screen.getByRole("listbox", { name: "Place suggestions" }));
  assert.equal(fetches.geocode().length, 1);
  assert.equal(fetches.suggest().length, 1, "no further suggestion request after the submit");
  await user.keyboard("{Enter}");
  assert.equal(places.length, 1, "Enter picks the first place, as before");
});

test("map: the coordinates suggestion centres the map with no request", async () => {
  const fetches = installRecordingFetch();
  const places = [];
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(GeocodeSearch, { onPlaceSelect: (p) => places.push(p), onRecordSelect: () => {} }));
  await user.type(rtl.screen.getByRole("combobox", { name: /Find a place/ }), "44.8381, 11.6198");
  await wait(400);
  await user.click(rtl.screen.getByRole("option", { name: "Go to coordinates 44.83810, 11.61980" }));
  assert.equal(places.length, 1);
  assert.equal(places[0].type, "coordinates");
  assert.equal(places[0].lat, 44.8381);
  assert.equal(fetches.requests.length, 0);
});

// ---------------------------------------------------------------------------
// /directory field (FiltersBar + DirectoryTool)
// ---------------------------------------------------------------------------

function filtersBarProps(overrides = {}) {
  return {
    variant: "bare", cameraKinds: [], search: "", setSearch: () => {},
    kindFilter: "all", setKindFilter: () => {}, freshnessFilter: "all", setFreshnessFilter: () => {},
    sortOrder: "alphabetical", setSortOrder: () => {}, resultCount: 0, onReset: () => {},
    ...overrides,
  };
}

function ControlledFiltersBar(props) {
  const [search, setSearch] = React.useState("");
  return React.createElement(FiltersBar, filtersBarProps({ ...props, search, setSearch: (v) => { props.onSearch?.(v); setSearch(v); } }));
}

test("directory: the field keeps filtering as you type and adds record suggestions; the place item runs the existing place search", async () => {
  const fetches = installRecordingFetch();
  const typed = [];
  const chosen = [];
  let submits = 0;
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(ControlledFiltersBar, { onSearch: (v) => typed.push(v), onSuggestionSelect: (id) => chosen.push(id), onSearchSubmit: () => { submits += 1; } }));
  const input = rtl.screen.getByRole("combobox", { name: "Search the public directory" });
  assert.equal(input.id, "record-search", "the historical id is kept");
  assert.ok((input.getAttribute("aria-describedby") ?? "").includes("record-search-help"));
  await user.type(input, "Roma");
  assert.deepEqual(typed, ["R", "Ro", "Rom", "Roma"], "the list filter still follows every keystroke");
  await wait(400);
  assert.equal(fetches.suggest().length, 1);
  // Scoped to the listbox: the filter selects carry native <option>s too.
  const options = rtl.within(rtl.screen.getByRole("listbox", { name: "Suggestions" })).getAllByRole("option");
  assert.match(options.at(-1).textContent, /Search near the place “Roma” \(OpenStreetMap\)/);
  await user.click(options.at(-1));
  assert.equal(submits, 1, "the place item runs the same place search as Enter");
  assert.equal(fetches.geocode().length, 0, "the client never calls /api/geocode");

  await user.type(input, "{ArrowDown}");
  await user.keyboard("{Enter}");
  assert.deepEqual(chosen, [41]);
});

test("directory: without onSuggestionSelect (home/map variants) the field stays a plain search box", async () => {
  installRecordingFetch();
  await renderWithLocale(React.createElement(FiltersBar, filtersBarProps()));
  assert.equal(document.getElementById("record-search").getAttribute("role"), null, "no combobox role on the plain field");
  assert.equal(rtl.screen.queryByRole("listbox"), null);
  assert.ok(rtl.screen.getByRole("searchbox", { name: "Search the public directory" }));
});

test("directory tool: choosing a suggested record opens /records/<id>", async () => {
  const records = [
    { id: 41, title: "Example camera Roma Nord", kind: "Fixed dome", status: "active", latitude: 41.9, longitude: 12.49, source: "Community report", updated: "2026-07-01", description: "Illustrative fixture record.", address: "Via Esempio 1, Roma" },
  ];
  const placeRequests = [];
  installFetchMock((input) => {
    const url = String(input);
    if (url.startsWith("/api/cameras/suggest")) return jsonResponse({ suggestions: SUGGESTIONS.slice(0, 1) });
    if (url.startsWith("/api/geocode") || url.startsWith("/api/cameras/search")) placeRequests.push(url);
    return camerasApiResponse(input, records);
  });
  setNavState({ pathname: "/directory" });
  const user = rtl.userEvent.setup();
  await renderWithLocale(React.createElement(DirectoryTool));
  const input = rtl.screen.getByRole("combobox", { name: "Search the public directory" });
  await user.type(input, "Roma");
  await wait(450);
  await user.click(rtl.screen.getByRole("option", { name: /Example camera Roma Nord/ }));
  assert.deepEqual(window.__locationAssigns, ["/records/41"]);
  assert.deepEqual(placeRequests, [], "no place search while typing or choosing a record");
});
