/**
 * URL-state contract suite (F-QA t_7b716c97, item 1 — prereq F4).
 *
 * F4 ("stato filtri in URL") moves the directory/map filters into the URL:
 *   /directory?type=dome&freshness=30d&lat=..&lng=..&z=..  (+ query/search)
 *
 * This suite defines the CONTRACT the F4 implementation must satisfy. It is
 * executable in two layers:
 *
 *   1. A reference implementation (the "oracle") in this file implements
 *      parse/stringify exactly as the plan requires — round-trip, encoding,
 *      invalid-value fallback (never 500 / never throw) — and the oracle
 *      tests pin those invariants. The oracle IS the spec, written as code
 *      so F4 can copy the semantics and delete the local copy.
 *
 *   2. The dom-harness next/navigation stub (extended in this task) is
 *      driven like a browser: deep-link initial state, router.push/replace,
 *      back/forward. These tests prove the harness supports the exact
 *      scenarios F4's tests will need (deep link, back/forward restore).
 *
 *   3. F4 GATE: when app/components/useCameraFilters.mjs exists (F4 landed),
 *      its exported URL helpers are checked against the oracle invariants.
 *      Until then the gate is SKIPPED loudly — CI stays green for F0-F3
 *      while the contract stays visible in the test output. The F4 PR must
 *      NOT delete this file: it is the acceptance gate for t_522638a5.
 *
 * Fixture hygiene: only fabricated filter values and fictional record ids.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { loadDomModule, setUrlState, getUrlState, goBack, goForward } from "./helpers/dom-harness.mjs";

// ---------------------------------------------------------------------------
// Reference implementation — the URL-state contract as executable spec.
//
// The F4 helpers must behave like this (same semantics, any module path the
// F4 PR chooses — the gate below only activates once useCameraFilters.mjs
// exists and exposes parseFilterParams/stringifyFilterParams).
// ---------------------------------------------------------------------------

// The filter keys the URL owns. The oracle implements each one explicitly
// below (a key list would let a typo silently drop a key from the contract).
const FRESHNESS_VALUES = new Set(["all", "7d", "30d", "90d", "365d"]);
const TYPE_FALLBACK = "all";
const FRESHNESS_FALLBACK = "all";

/** Parse a URLSearchParams into a filter state; invalid values fall back. */
function parseFilterParams(searchParams) {
  const state = { type: TYPE_FALLBACK, freshness: FRESHNESS_FALLBACK, query: "" };
  const type = searchParams.get("type");
  if (typeof type === "string" && type.length > 0 && type.length <= 40) {
    // Free-form type filter: any non-empty short string is accepted (the
    // directory renders "no results" truthfully when nothing matches).
    state.type = type;
  }
  const freshness = searchParams.get("freshness");
  if (freshness !== null && FRESHNESS_VALUES.has(freshness)) {
    state.freshness = freshness;
  }
  const query = searchParams.get("query");
  if (typeof query === "string") {
    // Query is truncated to the input max, never echoed beyond it.
    state.query = query.slice(0, 120);
  }
  return state;
}

/** Stringify a filter state into a search string (omits fallback values). */
function stringifyFilterParams(state, { includeDefaults = false } = {}) {
  const parts = [];
  if (state.type !== undefined && (includeDefaults || state.type !== TYPE_FALLBACK)) {
    parts.push(`type=${encodeURIComponent(state.type)}`);
  }
  if (state.freshness !== undefined && (includeDefaults || state.freshness !== FRESHNESS_FALLBACK)) {
    parts.push(`freshness=${state.freshness}`);
  }
  if (state.query) parts.push(`query=${encodeURIComponent(state.query)}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

// ---------------------------------------------------------------------------
// 1. Oracle invariants (the spec, self-checked so it stays executable)
// ---------------------------------------------------------------------------

test("URL contract: parse/stringify round-trip preserves the filter state", () => {
  const source = new URLSearchParams("type=Fixed+dome&freshness=30d&query=via+roma");
  const state = parseFilterParams(source);
  const serialized = stringifyFilterParams(state);
  const reparsed = parseFilterParams(new URLSearchParams(serialized.replace(/^\?/, "")));
  assert.deepEqual(reparsed, state, "round-trip must be lossless");
});

test("URL contract: encoding — UTF-8 and reserved characters survive", () => {
  const state = parseFilterParams(new URLSearchParams("type=Telecamera+%C3%A0+angolo+stretto&query=via+Roma%2C+1"));
  assert.equal(state.type, "Telecamera à angolo stretto");
  assert.equal(state.query, "via Roma, 1");
  const serialized = stringifyFilterParams(state);
  assert.ok(serialized.includes(encodeURIComponent("Telecamera à angolo stretto")), "type must be URI-encoded");
  // Re-parse the serialized form: identical state.
  assert.deepEqual(parseFilterParams(new URLSearchParams(serialized.replace(/^\?/, ""))), state);
});

test("URL contract: invalid values fall back to safe defaults — never throw, never 500", () => {
  const garbage = [
    "freshness=999years&type=",
    "freshness=banana&type=%00%01%02",
    "type=" + "x".repeat(500),
    "lat=not-a-number&lng=1e999",
    "type=a&type=b&freshness=all&freshness=7d",
    "",
    "?",
  ];
  for (const raw of garbage) {
    const search = raw.replace(/^\?/, "");
    const state = parseFilterParams(new URLSearchParams(search));
    // Every invalid/missing value resolves to the documented fallback.
    assert.equal(state.freshness, FRESHNESS_FALLBACK, `freshness fallback for ${JSON.stringify(raw)}`);
    assert.equal(typeof state.type, "string", `type must be a string for ${JSON.stringify(raw)}`);
    assert.ok(state.type.length <= 40, `type must be truncated for ${JSON.stringify(raw)}`);
    assert.equal(typeof state.query, "string");
    // Stringify of any parse result must never throw either.
    assert.doesNotThrow(() => stringifyFilterParams(state), `stringify must not throw for ${JSON.stringify(raw)}`);
  }
});

test("URL contract: defaults are omitted from the URL, explicit values kept", () => {
  assert.equal(stringifyFilterParams({ type: "all", freshness: "all", query: "" }), "");
  const serialized = stringifyFilterParams({ type: "dome", freshness: "all", query: "" });
  assert.equal(serialized, "?type=dome");
});

// ---------------------------------------------------------------------------
// 2. Harness scenarios — deep link, navigation, back/forward
// ---------------------------------------------------------------------------

test("harness: a deep link seeds the initial URL state (pathname + search)", async () => {
  const state = await setUrlState("/directory?type=dome&freshness=30d");
  assert.equal(state.url.pathname, "/directory");
  assert.equal(state.url.search, "?type=dome&freshness=30d");
  // useSearchParams/usePathname must reflect the deep link for components.
  const navigation = await loadDomModule("node_modules/next/navigation.mjs");
  assert.equal(navigation.usePathname(), "/directory");
  assert.equal(navigation.useSearchParams().get("type"), "dome");
  assert.equal(navigation.useSearchParams().get("freshness"), "30d");
});

test("harness: invalid deep-link values are readable but the contract fallback applies", async () => {
  await setUrlState("/directory?freshness=banana&type=dome");
  const navigation = await loadDomModule("node_modules/next/navigation.mjs");
  const state = parseFilterParams(navigation.useSearchParams());
  assert.equal(state.type, "dome");
  assert.equal(state.freshness, "all", "invalid freshness must fall back to 'all'");
});

test("harness: router.push updates the URL and records navigation", async () => {
  await setUrlState("/directory");
  const navigation = await loadDomModule("node_modules/next/navigation.mjs");
  const router = navigation.useRouter();
  router.push("/directory?type=dome");
  const url = await getUrlState();
  assert.equal(url.pathname, "/directory");
  assert.equal(url.search, "?type=dome");
  assert.deepEqual(navigation.__getNavState().pushed, ["/directory?type=dome"]);
});

test("harness: back/forward restores the filter state (history walk)", async () => {
  await setUrlState("/directory");
  const navigation = await loadDomModule("node_modules/next/navigation.mjs");
  const router = navigation.useRouter();
  router.push("/directory?type=dome");
  router.push("/directory?type=dome&freshness=7d");
  assert.equal((await getUrlState()).search, "?type=dome&freshness=7d");
  await goBack();
  assert.equal((await getUrlState()).search, "?type=dome", "back must restore the previous filter state");
  await goBack();
  assert.equal((await getUrlState()).search, "", "back to the initial state");
  await goForward();
  assert.equal((await getUrlState()).search, "?type=dome", "forward must re-apply the filters");
});

test("harness: replace updates the current history entry without growing it", async () => {
  await setUrlState("/directory");
  const navigation = await loadDomModule("node_modules/next/navigation.mjs");
  const router = navigation.useRouter();
  router.push("/directory?type=dome");
  router.replace("/directory?type=bullet");
  const navState = navigation.__getNavState();
  assert.deepEqual(navState.replaced, ["/directory?type=bullet"]);
  assert.equal(navState.history.length, 2, "replace must not add a history entry");
  assert.equal(navState.history[navState.historyIndex].search, "?type=bullet");
});

// ---------------------------------------------------------------------------
// 3. F4 gate — activates when the real implementation lands
// ---------------------------------------------------------------------------

test("F4 GATE: useCameraFilters satisfies the URL contract (skipped until F4 lands)", async (t) => {
  let mod;
  try {
    mod = await loadDomModule("app/components/useCameraFilters.mjs");
  } catch {
    mod = null;
  }
  if (!mod) {
    t.skip("F4 non ancora atterrato (t_522638a5): il contratto URL si attiva con la PR di F4. La suite resta verde per F0-F3.");
    return;
  }
  const { parseFilterParams: parse, stringifyFilterParams: stringify } = mod;
  assert.equal(typeof parse, "function", "useCameraFilters must export parseFilterParams");
  assert.equal(typeof stringify, "function", "useCameraFilters must export stringifyFilterParams");
  // The real implementation must satisfy the same invariants as the oracle.
  const state = parse(new URLSearchParams("type=Fixed+dome&freshness=30d&query=via+roma"));
  assert.deepEqual(parse(new URLSearchParams(stringify(state).replace(/^\?/, ""))), state, "round-trip lossless");
  const invalid = parse(new URLSearchParams("freshness=banana&type=" + "x".repeat(500)));
  assert.equal(invalid.freshness, "all", "invalid freshness falls back");
  assert.ok(invalid.type.length <= 40, "type is bounded");
  assert.doesNotThrow(() => stringify(invalid));
});
