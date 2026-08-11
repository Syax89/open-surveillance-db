// Address search combobox on the report form (issue #432): the debounced
// place search (/api/geocode proxy) must render suggestions, select a place
// through the same coordinate path as a map click, and degrade honestly on
// empty/error/rate-limited replies without breaking the form.

import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let ReportForm;
let en;

before(async () => {
  rtl = await setupDom();
  ReportForm = (await loadDomModule("app/components/home/ReportForm.mjs")).ReportForm;
  en = (await loadDomModule("app/lib/i18n/report.mjs")).en;
});

afterEach(() => rtl?.cleanup());

function reportFormProps(overrides = {}) {
  return {
    coordinates: null,
    manualLatitude: "",
    setManualLatitude: () => {},
    manualLongitude: "",
    setManualLongitude: () => {},
    nearbyCandidates: [],
    nearbyLoading: false,
    nearbyError: null,
    duplicateConfirmationRequired: false,
    duplicateConfirmed: false,
    setDuplicateConfirmed: () => {},
    selectManualCoordinates: () => {},
    submitReport: (event) => event.preventDefault(),
    kind: "Fixed dome",
    setKind: () => {},
    direction: null,
    setDirection: () => {},
    directionKnown: false,
    setDirectionKnown: () => {},
    address: "",
    setAddress: () => {},
    reverseGeocoding: false,
    geolocationAvailable: true,
    geolocating: false,
    geolocationNotice: "",
    requestMyPosition: () => {},
    showHeading: false,
    layout: "tool",
    ...overrides,
  };
}

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

test("report form renders the address search next to the geolocation button", async () => {
  const view = await renderWithLocale(
    React.createElement(ReportForm, reportFormProps()),
  );
  const { container } = view;

  const search = container.querySelector("#report-address-search");
  assert.ok(search, "address search input must render");
  assert.equal(search.getAttribute("role"), "combobox");
  assert.equal(search.getAttribute("aria-autocomplete"), "list");

  const row = search.closest(".report-locate-row");
  assert.ok(row, "address search must sit in the locate row");
  const geolocate = row.querySelector(".report-geolocate-button");
  assert.ok(geolocate, "geolocation button must sit on the same row, to the right");
});

test("address search debounces, suggests and selects a place into coordinates", async () => {
  const selected = [];
  const originalFetch = globalThis.fetch;
  let geocodeCalls = 0;
  const geocodeUrls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("/api/geocode?")) {
      geocodeCalls += 1;
      geocodeUrls.push(url);
      return new Response(
        JSON.stringify({
          results: [
            {
              display_name: "Piazza del Duomo, Milan, Italy",
              lat: 45.4642,
              lng: 9.19,
              type: "pedestrian",
              boundingbox: ["45.4", "45.5", "9.1", "9.2"],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ keys: [] }), { status: 200 });
  };

  try {
    const view = await renderWithLocale(
      React.createElement(
        ReportForm,
        reportFormProps({
          onSelectCoordinates: (lat, lng) => selected.push({ lat, lng }),
        }),
      ),
    );
    const { container } = view;
    const search = container.querySelector("#report-address-search");

    typeInto(search, "piazza del");
    assert.equal(geocodeCalls, 0, "no geocode fetch before the debounce");

    await advance(400);
    assert.equal(geocodeCalls, 1, "geocode fetch fires after the debounce");
    assert.equal(geocodeUrls.length, 1, "exactly one geocode request");
    const url = new URL(geocodeUrls[0], "https://osdb.test/");
    assert.equal(url.pathname, "/api/geocode", "same-origin geocode proxy only");
    assert.equal(url.searchParams.get("limit"), "5", "suggestion cap must be 5");
    assert.equal(url.searchParams.get("lang"), "en", "request must carry the current locale");
    assert.equal(url.searchParams.get("q"), "piazza del", "the trimmed query is sent");

    const option = await view.findByText("Piazza del Duomo, Milan, Italy");
    assert.ok(option, "suggestion must render in the dropdown");
    rtl.fireEvent.click(option);
    await advance(20);

    assert.equal(selected.length, 1, "selecting a place must set coordinates");
    assert.equal(selected[0].lat, 45.4642);
    assert.equal(selected[0].lng, 9.19);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("selecting a suggestion cancels a pending debounce so a queued query cannot reopen the dropdown (regression)", async () => {
  const originalFetch = globalThis.fetch;
  let geocodeCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("/api/geocode?")) {
      geocodeCalls += 1;
      return new Response(
        JSON.stringify({
          results: [
            {
              display_name: "Piazza del Duomo, Milan, Italy",
              lat: 45.4642,
              lng: 9.19,
              type: "pedestrian",
              boundingbox: ["45.4", "45.5", "9.1", "9.2"],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ keys: [] }), { status: 200 });
  };

  try {
    const view = await renderWithLocale(
      React.createElement(ReportForm, reportFormProps()),
    );
    const { container } = view;
    const search = container.querySelector("#report-address-search");

    // First query resolves and renders its suggestion.
    typeInto(search, "piazza");
    await advance(400);
    const option = await view.findByText("Piazza del Duomo, Milan, Italy");
    assert.ok(option, "the first query renders its suggestion");

    // A second keystroke queues a new debounce while the old results are
    // still visible, then the user clicks the visible suggestion (pointer
    // choice). The click must cancel the pending debounce: the queued query
    // must never fire and reopen the dropdown over the choice.
    rtl.act(() => typeInto(search, "piazza del duomo"));
    rtl.fireEvent.click(option);
    await advance(400);

    assert.equal(search.value, "Piazza del Duomo, Milan, Italy", "the pointer choice fills the input");
    assert.equal(geocodeCalls, 1, "the queued query was cancelled — no second geocode request");
    assert.equal(
      container.querySelector("#report-address-search-listbox"),
      null,
      "the dropdown must stay closed after selection (no reopen by the queued query)",
    );
    assert.equal(search.getAttribute("aria-expanded"), "false");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("address search announces an honest empty state", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("/api/geocode?")) {
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ keys: [] }), { status: 200 });
  };

  try {
    const view = await renderWithLocale(
      React.createElement(ReportForm, reportFormProps()),
    );
    const { container } = view;
    const search = container.querySelector("#report-address-search");
    typeInto(search, "zzzz not a place");

    await advance(400);
    const status = await view.findByText(
      en.addressSearchNoResults("zzzz not a place"),
    );
    assert.ok(status, "empty state must be announced via role=status");
    assert.equal(status.getAttribute("role"), "status");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
