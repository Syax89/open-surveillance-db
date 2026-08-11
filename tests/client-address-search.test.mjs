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
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(search, value);
  search.dispatchEvent(new Event("input", { bubbles: true }));
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

    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(geocodeCalls, 1, "geocode fetch fires after the debounce");

    const option = await view.findByText("Piazza del Duomo, Milan, Italy");
    assert.ok(option, "suggestion must render in the dropdown");
    option.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(selected.length, 1, "selecting a place must set coordinates");
    assert.equal(selected[0].lat, 45.4642);
    assert.equal(selected[0].lng, 9.19);
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

    await new Promise((resolve) => setTimeout(resolve, 400));
    const status = await view.findByText(
      en.addressSearchNoResults("zzzz not a place"),
    );
    assert.ok(status, "empty state must be announced via role=status");
    assert.equal(status.getAttribute("role"), "status");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
