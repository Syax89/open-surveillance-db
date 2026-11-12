// Search privacy helpers (2026-11): what can be answered in the browser is
// never sent anywhere, and what reaches OpenStreetMap carries only the site
// origin. Pure-function contracts, no network.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { cleanupRouteTree, loadLib } from "./helpers/api-harness.mjs";

const { parseLocalPlaceQuery, rankByViewport } = await loadLib("app/lib/local-place-query.mjs");
const { originOnlyReferer } = await loadLib("app/lib/upstream-referer.mjs");
after(async () => cleanupRouteTree());

test("coordinates are recognised locally in the usual formats", () => {
  const rome = { kind: "coordinates", latitude: 41.9068, longitude: 12.4808 };
  for (const input of ["41.9068, 12.4808", "41.9068 12.4808", "41.9068;12.4808", " 41.9068 ,  12.4808 ", "geo:41.9068,12.4808", "41,9068, 12,4808", "41,9068; 12,4808", "41.9068 N 12.4808 E"]) {
    assert.deepEqual(parseLocalPlaceQuery(input), rome, input);
  }
  assert.deepEqual(parseLocalPlaceQuery("-33.8688, 151.2093"), { kind: "coordinates", latitude: -33.8688, longitude: 151.2093 });
  assert.deepEqual(parseLocalPlaceQuery("33.8688 S 151.2093 E"), { kind: "coordinates", latitude: -33.8688, longitude: 151.2093 });
  assert.deepEqual(parseLocalPlaceQuery("40.4168 N 3.7038 W"), { kind: "coordinates", latitude: 40.4168, longitude: -3.7038 });
  assert.deepEqual(parseLocalPlaceQuery("40.4168 N 3.7038 O"), { kind: "coordinates", latitude: 40.4168, longitude: -3.7038 }, "O = ovest");
});

test("record numbers need an explicit #; plain numbers, addresses and out-of-range pairs go to the geocoder", () => {
  assert.deepEqual(parseLocalPlaceQuery("#6302"), { kind: "record", id: 6302 });
  assert.deepEqual(parseLocalPlaceQuery("# 12"), { kind: "record", id: 12 });
  for (const input of ["", "   ", "6302", "00184", "Via Roma 12", "12 3", "Roma", "95.1, 12.4", "41.9, 190.2", "#0", "#abc"]) {
    assert.equal(parseLocalPlaceQuery(input), null, JSON.stringify(input));
  }
});

test("results inside the current view are listed first, the geocoder order is kept otherwise (browser-only)", () => {
  const view = { south: 41.8, north: 42.0, west: 12.3, east: 12.6 };
  const results = [{ id: "far-1", lat: 45, lng: 9 }, { id: "near", lat: 41.9, lng: 12.5 }, { id: "far-2", lat: 40, lng: 14 }];
  assert.deepEqual(rankByViewport(results, view).map((r) => r.id), ["near", "far-1", "far-2"]);
  assert.deepEqual(rankByViewport(results, null).map((r) => r.id), ["far-1", "near", "far-2"]);
});

test("only the site origin is passed upstream as Referer", () => {
  assert.equal(originOnlyReferer("https://osdb.test/mappa?lat=41.90&lng=12.48&zoom=17"), "https://osdb.test/");
  assert.equal(originOnlyReferer("https://osdb.test/records/123/edit#x"), "https://osdb.test/");
  assert.equal(originOnlyReferer("http://localhost:4000/segnala"), "http://localhost:4000/");
  assert.equal(originOnlyReferer(null), null);
  assert.equal(originOnlyReferer("not a url"), null);
  assert.equal(originOnlyReferer("javascript:alert(1)"), null);
});

// ---------------------------------------------------------------------------
// Search-as-you-type (2026-11): suggestions while typing come ONLY from our
// own data. The DOM-level proofs (no /api/geocode request while typing on
// the hero, the map and the directory) live in search-suggestions.test.mjs;
// these are the pure and source-level guarantees behind them.
// ---------------------------------------------------------------------------

const { wantsRecordSuggestions } = await loadLib("app/lib/use-record-suggestions.mjs");
const { normalizeSuggestQuery, SUGGEST_MIN_QUERY_LENGTH, SUGGEST_DEBOUNCE_MS } = await loadLib("app/lib/search.mjs");
const source = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");
/** Code only: block comments and full-line // comments removed (docs may name the geocoder). */
const code = async (relative) => (await source(relative)).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("record suggestions are asked only for real text: coordinates, #123 and short input never leave the browser", () => {
  assert.equal(SUGGEST_MIN_QUERY_LENGTH, 2);
  assert.equal(SUGGEST_DEBOUNCE_MS, 300);
  for (const input of ["", " ", "a", " b ", "41.9068, 12.4808", "geo:41.9,12.4", "#6302", "# 12"]) {
    assert.equal(wantsRecordSuggestions(input), false, JSON.stringify(input));
  }
  for (const input of ["ab", "Via Roma", "6302", "Piazza del Duomo"]) {
    assert.equal(wantsRecordSuggestions(input), true, JSON.stringify(input));
  }
  assert.equal(normalizeSuggestQuery("  via   roma \t"), "via roma");
});

test("the as-you-type hook only talks to our own /api/cameras/suggest, never the geocoder", async () => {
  const hook = await code("app/lib/use-record-suggestions.ts");
  const fetches = [...hook.matchAll(/fetch\(\s*`([^`]+)`/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ["/api/cameras/suggest?${params.toString()}"]);
  assert.doesNotMatch(hook, /\/api\/geocode|nominatim|openstreetmap/i);
});

test("typing in the shared combobox never runs the place geocoder (only an explicit search does)", async () => {
  const combobox = await code("app/components/home/PlaceAutocomplete.tsx");
  const start = combobox.indexOf("const handleChange = useCallback(");
  const end = combobox.indexOf("const selectSuggestion = useCallback(");
  assert.ok(start > 0 && end > start, "handleChange found");
  const handleChange = combobox.slice(start, end);
  assert.doesNotMatch(handleChange, /runGeocode|searchPlace|submitSearch|fetch\(/, "the change handler never searches places");
  assert.match(handleChange, /updateRecords\(next\)/, "it only refreshes our own record suggestions");
  // The geocoder fetch lives in runGeocode alone, reached only through the
  // explicit searchPlace (Enter / button / the "Search the place" item).
  assert.equal([...combobox.matchAll(/fetch\(`\/api\/geocode/g)].length, 1);
  assert.equal([...combobox.matchAll(/runGeocode\(/g)].length, 1, "runGeocode is called from one place only (searchPlace)");
  const searchPlace = combobox.slice(combobox.indexOf("const searchPlace = useCallback("), combobox.indexOf("const submitSearch = useCallback("));
  assert.match(searchPlace, /runGeocode\(query\)/);
  // The hero, the map and the directory all opt in to suggestions.
  assert.match(await source("app/components/home/HeroDirectorySearch.tsx"), /recordSuggestions/);
  assert.match(await source("app/components/home/GeocodeSearch.tsx"), /recordSuggestions/);
  assert.match(await source("app/components/FiltersBar.tsx"), /recordSuggestions/);
});

test("the suggestion endpoint never forwards the text to a third party and never logs it", async () => {
  const route = await code("app/api/cameras/suggest/route.ts");
  assert.doesNotMatch(route, /geocode|resolvePlace|fetch\(/, "suggestions are answered from our own database only");
  const logs = [...route.matchAll(/console\.(?:error|warn|log|info)\(([^;]*)\);/g)];
  assert.ok(logs.length > 0);
  for (const call of logs) {
    assert.doesNotMatch(call[1], /query|params|request\.url/, `a log line must not carry the query: ${call[0]}`);
  }
});
