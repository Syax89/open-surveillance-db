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

function installGeocode(results = []) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("/api/geocode?")) {
      calls.push(url);
      return new Response(JSON.stringify({ results }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ keys: [] }), { status: 200 });
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

const DUOMO = { display_name: "Piazza del Duomo, Milan, Italy", lat: 45.4642, lng: 9.19, type: "pedestrian", boundingbox: ["45.4", "45.5", "9.1", "9.2"] };

test("address search sends nothing while typing; the Search button sends one request and a pick selects the coordinates", async () => {
  const selected = [];
  const geocode = installGeocode([DUOMO]);
  try {
    const view = await renderWithLocale(React.createElement(ReportForm, reportFormProps({ onSelectCoordinates: (lat, lng) => selected.push({ lat, lng }) })));
    const search = view.container.querySelector("#report-address-search");

    typeInto(search, "piazza del");
    await advance(400);
    assert.equal(geocode.calls.length, 0, "privacy: no request while typing");

    rtl.fireEvent.click(view.getByRole("button", { name: en.addressSearchButton }));
    await advance(20);
    assert.equal(geocode.calls.length, 1, "exactly one request per explicit search");
    const url = new URL(geocode.calls[0], "https://osdb.test/");
    assert.equal(url.pathname, "/api/geocode", "same-origin geocode proxy only");
    assert.equal(url.searchParams.get("limit"), "5");
    assert.equal(url.searchParams.get("lang"), "en");
    assert.equal(url.searchParams.get("q"), "piazza del");

    rtl.fireEvent.click(await view.findByText("Piazza del Duomo, Milan, Italy"));
    await advance(20);
    assert.deepEqual(selected, [{ lat: 45.4642, lng: 9.19 }], "the place goes through the map-click coordinate path");
    assert.equal(search.value, "Piazza del Duomo, Milan, Italy");
    assert.equal(search.getAttribute("aria-expanded"), "false");
  } finally {
    geocode.restore();
  }
});

test("pasted coordinates select the point locally, with no request (Italian decimal comma too)", async () => {
  const selected = [];
  const geocode = installGeocode([]);
  try {
    const view = await renderWithLocale(React.createElement(ReportForm, reportFormProps({ onSelectCoordinates: (lat, lng) => selected.push({ lat, lng }) })));
    const search = view.container.querySelector("#report-address-search");
    typeInto(search, "45,4642; 9,1900");
    rtl.fireEvent.keyDown(search, { key: "Enter" });
    await advance(20);
    assert.deepEqual(selected, [{ lat: 45.4642, lng: 9.19 }]);
    assert.equal(geocode.calls.length, 0, "coordinates never leave the browser");
  } finally {
    geocode.restore();
  }
});

test("address search announces an honest empty state", async () => {
  const geocode = installGeocode([]);
  try {
    const view = await renderWithLocale(React.createElement(ReportForm, reportFormProps()));
    const search = view.container.querySelector("#report-address-search");
    typeInto(search, "zzzz not a place");
    rtl.fireEvent.keyDown(search, { key: "Enter" });
    await advance(20);
    const status = await view.findByText(en.addressSearchNoResults("zzzz not a place"));
    assert.equal(status.getAttribute("role"), "status");
  } finally {
    geocode.restore();
  }
});
