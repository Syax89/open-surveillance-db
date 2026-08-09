/**
 * Client-side legal microcopy tests — F-legal (kanban t_2bef9ebb).
 *
 * Covers, in jsdom with @testing-library/react:
 *   1. ReportForm renders NO photo-redaction checkbox (photo evidence
 *      upload was removed entirely — CEO 2026-08-08 — so no report can
 *      ever carry a photo and no redaction gate exists);
 *   2. the art. 13 mini-notice is rendered next to the report checkbox
 *      (controller, legal basis 6(1)(f), /privacy link, privacy contact
 *      mailto), and the same microcopy exists next to the correction
 *      checkbox (6(1)(c)+6(1)(f) variant) and on the register page
 *      (6(1)(f) variant);
 *   3. the report flow reverse-geocodes a picked position to prefill the
 *      address and fails open when the lookup errors.
 *
 * Fixtures are fictitious (example.test addresses) — never real personal data.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let ReportForm;
let CorrectionForm;
let RegisterPage;
let useReportFlow;

before(async () => {
  rtl = await setupDom();
  ReportForm = (await loadDomModule("app/components/home/ReportForm.mjs")).ReportForm;
  CorrectionForm = (await loadDomModule("app/components/home/CorrectionForm.mjs")).CorrectionForm;
  useReportFlow = (await loadDomModule("app/lib/useReportFlow.mjs")).useReportFlow;
  // QA#6 F2/F5 (t_9467ee7f): /register is a thin server shell; the
  // interactive body is the named-export client component RegisterPageBody.
  RegisterPage = (await loadDomModule("app/register/RegisterPageBody.mjs")).RegisterPageBody;
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
    nearbyError: "",
    selectManualCoordinates: () => {},
    submitReport: () => {},
    ...overrides,
  };
}

test("report form renders no photo-redaction confirmation checkbox", async () => {
  const view = await renderWithLocale(React.createElement(ReportForm, reportFormProps()));
  const { container } = view;

  const checkboxes = [...container.querySelectorAll(".report-form input[type='checkbox']")];
  // Only the public-report attestation checkbox — photo evidence upload was
  // removed entirely, so no redaction confirmation can ever exist.
  assert.equal(checkboxes.length, 1, "only the report consent checkbox must render");
  const redaction = container.querySelector(".photo-upload input[type='checkbox']");
  assert.equal(redaction, null, "the photo-upload fieldset (and its redaction gate) must not exist");
});

test("report form exposes a one-tap geolocation button only when the browser supports it", async () => {
  let clicks = 0;
  const supported = await renderWithLocale(React.createElement(ReportForm, reportFormProps({
    geolocationAvailable: true,
    requestMyPosition: () => { clicks += 1; },
  })));
  const button = supported.getByRole("button", { name: "Use my position" });
  assert.equal(button.getAttribute("type"), "button", "location must never accidentally submit the report");
  assert.equal(button.classList.contains("report-geolocate-button"), true, "the action has its own 44px styling hook");
  rtl.fireEvent.click(button);
  assert.equal(clicks, 1, "one tap calls the supplied location request once");

  supported.unmount();
  const refused = await renderWithLocale(React.createElement(ReportForm, reportFormProps({
    geolocationAvailable: true,
    geolocationNotice: "Location permission was refused. Choose the point on the map, or type the coordinates below.",
  })));
  const status = refused.getByRole("status");
  assert.equal(status.classList.contains("report-geolocate-notice"), true, "a refusal is visible next to its triggering control, not after the full form");
  assert.match(status.textContent, /Location permission was refused/);

  refused.unmount();
  const unsupported = await renderWithLocale(React.createElement(ReportForm, reportFormProps({
    geolocationAvailable: false,
  })));
  assert.equal(unsupported.queryByRole("button", { name: "Use my position" }), null, "manual/map fallbacks stay uncluttered when geolocation is unavailable");
});

test("report form announces an in-progress location lookup without allowing a duplicate request", async () => {
  const view = await renderWithLocale(React.createElement(ReportForm, reportFormProps({
    geolocationAvailable: true,
    geolocating: true,
  })));
  const button = view.getByRole("button", { name: "Finding your position…" });
  assert.equal(button.disabled, true, "the same request cannot be started twice");
  assert.equal(button.getAttribute("aria-busy"), "true", "assistive technology hears the pending state");
});

test("reverse geocoding prefill: address input is controlled, shows the resolving placeholder while the lookup runs", async () => {
  const view = await renderWithLocale(
    React.createElement(ReportForm, {
      ...reportFormProps(),
      address: "Via Roma 12",
      setAddress: () => {},
      addressTouched: React.createRef(),
      reverseGeocoding: true,
    }),
  );
  const { container } = view;
  const addressInput = container.querySelector("input[name='address']");
  assert.ok(addressInput, "the address input exists");
  assert.equal(addressInput.value, "Via Roma 12", "the address input is controlled by the flow state");
  assert.equal(addressInput.getAttribute("placeholder"), "Resolving address…", "while the reverse lookup runs the placeholder says so");
  assert.equal(addressInput.getAttribute("aria-busy"), "true", "the input is marked busy during the lookup");
  const status = container.querySelector(".report-form [role='status']");
  assert.ok(status, "the reverse lookup is announced through a live region next to the field");
  assert.ok(status.textContent.includes("Resolving address"), "the live region carries the resolving message");
});

test("reverse geocoding prefill: normal placeholder when idle, the flow marks user typing as touched", async () => {
  let captured = null;
  let touched = false;
  const view = await renderWithLocale(
    React.createElement(ReportForm, {
      ...reportFormProps(),
      address: "",
      // In production this is useReportFlow.handleAddressChange, which
      // sets the touched flag AND the value — simulate both here.
      setAddress: (value) => { touched = true; captured = value; },
      reverseGeocoding: false,
    }),
  );
  const { container } = view;
  const addressInput = container.querySelector("input[name='address']");
  assert.equal(addressInput.getAttribute("placeholder"), "Street and city (optional)", "idle placeholder is the standard one");
  assert.equal(addressInput.getAttribute("aria-busy"), null, "not busy when idle");
  assert.equal(container.querySelector(".report-form [role='status']"), null, "no live-region announcement when idle");

  // Simulate a keystroke: the flow marks the field touched so later
  // lookups never overwrite it.
  rtl.fireEvent.input(addressInput, { target: { value: "Via Garibaldi 3" } });
  assert.equal(touched, true, "the flow flags the field as touched on typing");
  assert.equal(captured, "Via Garibaldi 3", "the keystroke value is propagated to the flow state");
});

test("report form carries the art. 13 mini-notice next to the consent checkbox", async () => {
  const view = await renderWithLocale(React.createElement(ReportForm, reportFormProps([])));
  const { container } = view;

  const notice = container.querySelector("#report-art13-note");
  assert.ok(notice, "art. 13 mini-notice must render next to the report checkbox");
  assert.match(notice.textContent, /legitimate interest \(art\. 6\(1\)\(f\) GDPR\)/);
  assert.match(notice.textContent, /privacy@opensurveillancedb.org/);

  const privacyLink = notice.querySelector("a[href='/privacy']");
  assert.ok(privacyLink, "mini-notice must link the full privacy notice");
  const mailto = notice.querySelector("a[href='mailto:privacy@opensurveillancedb.org']");
  assert.ok(mailto, "mini-notice must expose the rights contact as a mailto link");
});

test("correction form carries the art. 13 mini-notice (6(1)(c) + 6(1)(f) variant)", async () => {
  const view = await renderWithLocale(React.createElement(CorrectionForm, { records: [] }));
  const { container } = view;

  const notice = container.querySelector("#correction-art13-note");
  assert.ok(notice, "art. 13 mini-notice must render next to the correction checkbox");
  assert.match(notice.textContent, /legal obligation \(art\. 6\(1\)\(c\) GDPR — arts\. 15-22\)/);
  assert.ok(notice.querySelector("a[href='mailto:privacy@opensurveillancedb.org']"), "correction mini-notice must carry the mailto contact");

  const consent = container.querySelector(".correction-form input[type='checkbox']");
  assert.equal(consent.getAttribute("aria-describedby"), "correction-art13-note", "correction checkbox must reference the mini-notice");
});

test("register page carries the art. 13 mini-notice (6(1)(f) variant)", async () => {
  const view = await renderWithLocale(React.createElement(RegisterPage));
  const { container } = view;

  const notice = container.querySelector("#register-art13-note");
  assert.ok(notice, "art. 13 mini-notice must render on the register page");
  assert.match(notice.textContent, /to provide contributor accounts/);
  assert.ok(notice.querySelector("a[href='/privacy']"), "register mini-notice must link the privacy notice");
  assert.ok(notice.querySelector("a[href='mailto:privacy@opensurveillancedb.org']"), "register mini-notice must carry the mailto contact");
});

test("useReportFlow: selectCoordinates prefills the address via /api/geocode/reverse (cache hit path)", async () => {
  // Host component that surfaces the flow state so the test can drive
  // selectCoordinates and observe the address prefill.
  let flow = null;
  function Harness() {
    flow = useReportFlow({ setNotice: () => {} });
    return React.createElement("p", null, flow.address || "(empty)");
  }
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    if (String(url).startsWith("/api/geocode/reverse")) {
      return new Response(JSON.stringify({ address: "Via Roma 12, Ferrara" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Nearby check (parallel call from selectCoordinates): empty set.
    return new Response(JSON.stringify({ records: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const { container } = await renderWithLocale(React.createElement(Harness));
    assert.ok(container.textContent.includes("(empty)"), "no address before a position is picked");

    await flow.selectCoordinates(44.8378, 11.6183);
    // The prefill is async — allow the microtasks to settle.
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(container.textContent.includes("Via Roma 12, Ferrara"), "the reverse geocoding reply prefills the address");
    assert.ok(fetchCalls.some((u) => u.startsWith("/api/geocode/reverse?lat=44.8378&lng=11.6183")), "the reverse endpoint is called with the picked coordinates");
    assert.ok(fetchCalls.some((u) => u.startsWith("/api/cameras/nearby")), "the nearby check still runs in parallel");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("useReportFlow: a geocoder failure leaves the address empty and never blocks the flow", async () => {
  let flow = null;
  function Harness() {
    flow = useReportFlow({ setNotice: () => {} });
    return React.createElement("p", null, flow.address || "(empty)");
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("/api/geocode/reverse")) {
      return new Response(JSON.stringify({ error: "down" }), { status: 502 });
    }
    return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const { container } = await renderWithLocale(React.createElement(Harness));
    await flow.selectCoordinates(44.8378, 11.6183);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(container.textContent.includes("(empty)"), "a failed lookup leaves the field empty");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("useReportFlow: one-tap location requests high accuracy, rounds before lookup, and reuses the normal coordinate path", async () => {
  let flow = null;
  let callbacks = null;
  const originalFetch = globalThis.fetch;
  const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");
  const fetchCalls = [];
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success, error, options) => { callbacks = { success, error, options }; },
    },
  });
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    if (String(url).startsWith("/api/geocode/reverse")) {
      return new Response(JSON.stringify({ address: "Via Roma 12, Ferrara" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  function Harness() {
    flow = useReportFlow({ setNotice: () => {} });
    return React.createElement("p", null, flow.coordinates ? `${flow.coordinates.latitude},${flow.coordinates.longitude}` : "(empty)");
  }
  try {
    await renderWithLocale(React.createElement(Harness));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(flow.geolocationAvailable, true, "the browser capability is exposed only after hydration");

    flow.requestMyPosition();
    assert.ok(callbacks, "one tap calls the browser geolocation API");
    assert.deepEqual(callbacks.options, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 });
    callbacks.success({ coords: { latitude: 44.83784, longitude: 11.61826 } });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(flow.coordinates, { latitude: 44.8378, longitude: 11.6183 }, "device precision is rounded to the documented ~11m report location");
    assert.ok(fetchCalls.some((url) => url.startsWith("/api/geocode/reverse?lat=44.8378&lng=11.6183")), "reverse geocoding gets the rounded position");
    assert.ok(fetchCalls.some((url) => url.includes("/api/cameras/nearby?latitude=44.8378&longitude=11.6183")), "the existing duplicate check receives the same rounded point");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalGeolocation) Object.defineProperty(navigator, "geolocation", originalGeolocation);
    else delete navigator.geolocation;
  }
});

test("useReportFlow: a refused browser permission leaves the map/manual fallbacks available", async () => {
  let flow = null;
  let callbacks = null;
  const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, "geolocation");
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success, error) => { callbacks = { success, error }; },
    },
  });
  function Harness() {
    flow = useReportFlow({ setNotice: () => {} });
    return React.createElement("p", null, flow.geolocationNotice);
  }
  try {
    await renderWithLocale(React.createElement(Harness));
    await new Promise((resolve) => setTimeout(resolve, 0));
    flow.requestMyPosition();
    callbacks.error({ code: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(flow.geolocating, false, "the form is usable again after a refusal");
    assert.equal(flow.geolocationNotice, "Location permission was refused. Choose the point on the map, or type the coordinates below.");
  } finally {
    if (originalGeolocation) Object.defineProperty(navigator, "geolocation", originalGeolocation);
    else delete navigator.geolocation;
  }
});
