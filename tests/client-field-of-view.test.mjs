/**
 * Client-side interaction tests for the camera field-of-view direction
 * feature (kanban t_f8b775ec, design Vera):
 *
 *   MAP (SurveillanceMap, leaflet stub):
 *   1. a directional camera with a stored direction draws a cone polygon
 *      (className fov-cone + status) ONLY above FOV_MIN_ZOOM (16);
 *   2. a dome camera draws a 360° circle (fov-cone fov-circle) above the
 *      threshold; a directional camera without direction draws nothing;
 *   3. the decorative overlay pane is aria-hidden (the popup is the
 *      accessible equivalent);
 *   4. the marker popup renders the direction as text ("Field of view:
 *      NE 45°") when a bearing exists, and omits the row otherwise;
 *
 *   REPORT FORM (/segnala):
 *   5. the direction fieldset appears only for directional kinds — hidden
 *      for domes — and "I don't know" (default) sends direction: null;
 *   6. specifying a bearing sends it as an integer 0-359;
 *   7. switching to a dome clears the selected bearing;
 *
 *   EDIT FORM (/records/[id]/edit):
 *   8. a record with a stored direction pre-fills the slider;
 *   9. the fieldset is hidden for dome records and the PATCH carries
 *      direction: null when "non so" is checked.
 *
 * Fixtures are fictitious (illustrative coordinates in Rome, example.test).
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, loadDomPage, installFetchMock, jsonResponse,
  renderWithLocale, wrapWithLocale, resetLeafletMarkers, leafletMaps,
  leafletPaths, leafletMarkers, setNavState, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let SurveillanceMap;
let SegnalaTool;
let RecordEditPage;

before(async () => {
  rtl = await setupDom();
  SurveillanceMap = (await loadDomModule("app/components/SurveillanceMap.mjs")).SurveillanceMap;
  SegnalaTool = (await loadDomModule("app/components/tools/SegnalaTool.mjs")).SegnalaTool;
  RecordEditPage = await loadDomPage("app/records/[id]/edit/page.mjs");
});

afterEach(() => {
  rtl?.cleanup();
  resetLeafletMarkers();
});

// ---------------------------------------------------------------------------
// MAP — cones/circles, zoom gate, a11y, popup text
// ---------------------------------------------------------------------------

const directionalCamera = {
  id: 1, title: "Bullet camera", kind: "Bullet", status: "active",
  latitude: 41.9004, longitude: 12.4936, direction: 45,
};
const domeCamera = {
  id: 2, title: "Dome camera", kind: "Fixed dome", status: "demo",
  latitude: 41.9047, longitude: 12.5031,
};
const noDirectionCamera = {
  id: 3, title: "Unknown camera", kind: "Bullet", status: "active",
  latitude: 41.902, longitude: 12.499, direction: null,
};

async function renderMapWithCameras(cameras = []) {
  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: 1, onSelect: () => {}, onPick: () => {},
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  view.rerender(await wrapWithLocale(React.createElement(SurveillanceMap, {
    cameras, selectedId: 1, onSelect: () => {}, onPick: () => {},
  })));
  await new Promise((resolve) => setTimeout(resolve, 10));
  return view;
}

/** Simulate the user zooming to `zoom` (fires the moveend/zoomend handler). */
async function zoomMapTo(zoom) {
  const maps = await leafletMaps();
  assert.ok(maps.length >= 1);
  maps[0].zoom = zoom;
  maps[0].handlers["moveend zoomend"]?.[0]?.();
  await new Promise((resolve) => setTimeout(resolve, 30));
}

test("map: no FOV geometry below the zoom threshold (16)", async () => {
  await renderMapWithCameras([directionalCamera, domeCamera]);
  await zoomMapTo(13); // below FOV_MIN_ZOOM
  const paths = await leafletPaths();
  assert.equal(paths.length, 0, "cones/circles must not be drawn at street-unreadable zooms");
});

test("map: directional camera draws a cone polygon above zoom 16, colored by status", async () => {
  await renderMapWithCameras([directionalCamera]);
  await zoomMapTo(17);
  const paths = await leafletPaths();
  assert.equal(paths.length, 1, "exactly one path for one directional camera");
  const cone = paths[0];
  assert.equal(typeof cone.latlngs, "object", "the cone is an L.polygon with computed latlngs");
  assert.ok(Array.isArray(cone.latlngs) && cone.latlngs.length >= 4, "the wedge ring has the vertex + arc points");
  assert.deepEqual(cone.latlngs[0], [41.9004, 12.4936], "the vertex sits on the marker");
  assert.match(cone.opts.className, /fov-cone/, "the cone carries the fov-cone class");
  assert.match(cone.opts.className, /active/, "the cone is colored by the camera status");
  assert.equal(cone.opts.interactive, false, "the decorative path never captures pointer events");
});

test("map: dome camera draws a circle, directional-without-direction draws nothing", async () => {
  await renderMapWithCameras([domeCamera, noDirectionCamera]);
  await zoomMapTo(17);
  const paths = await leafletPaths();
  assert.equal(paths.length, 1, "only the dome draws geometry (no direction = nothing)");
  const circle = paths[0];
  assert.deepEqual(circle.latlng, [41.9047, 12.5031], "the circle is centered on the dome marker");
  assert.match(circle.opts.className, /fov-cone/, "the circle shares the fov-cone class");
  assert.match(circle.opts.className, /fov-circle/, "the circle is marked as a dome (360° vision)");
  assert.equal(circle.opts.radius, 35, "the dome circle uses the same ~35 m radius as the wedge");
});

test("map: zooming back below the threshold removes the geometry", async () => {
  await renderMapWithCameras([directionalCamera, domeCamera]);
  await zoomMapTo(17);
  assert.equal((await leafletPaths()).length, 2);
  await zoomMapTo(14);
  assert.equal((await leafletPaths()).length, 0, "below the threshold the layer is cleared");
});

test("map: the FOV layer never creates markers (marker count stays per-camera)", async () => {
  await renderMapWithCameras([directionalCamera, domeCamera]);
  await zoomMapTo(17);
  assert.equal((await leafletPaths()).length, 2);
  assert.equal((await leafletMarkers()).length, 2, "cones/circles live in their own layer, markers stay 1:1 with cameras");
});

test("map: the overlay pane is aria-hidden (decorative geometry, textual popup)", async () => {
  await renderMapWithCameras([directionalCamera]);
  await zoomMapTo(17);
  const maps = await leafletMaps();
  assert.equal(maps[0].paneAttrs["aria-hidden"], "true", "the decorative overlay pane must be hidden from assistive tech");
});

test("map: marker popup renders the direction as text (NE 45°) when present", async () => {
  // The real popup builder (lib/map-popup, the one MapPanel wires) carries
  // the localized label + direction; the map passes it through as the
  // popupHtmlFor prop — the a11y contract for the decorative cone.
  const popupHtmlFor = (await loadDomModule("app/lib/map-popup.mjs")).popupHtmlFor;
  const labels = {
    recordId: "Record ID", location: "Location", popupDetail: "Open record",
    reportIssue: "Report an issue", unknown: "Unknown", fovDirection: "Field of view",
  };
  const statuses = { verified: "Verified", demo: "Demo" };
  const view = await renderWithLocale(React.createElement(SurveillanceMap, {
    cameras: [], selectedId: 1, onSelect: () => {}, onPick: () => {},
  }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  view.rerender(await wrapWithLocale(React.createElement(SurveillanceMap, {
    cameras: [directionalCamera, domeCamera, noDirectionCamera], selectedId: 1,
    onSelect: () => {}, onPick: () => {},
    popupHtmlFor: (camera) => popupHtmlFor(camera, statuses, labels, "/correggi"),
  })));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const markers = await leafletMarkers();
  assert.equal(markers.length, 3);
  const byTitle = Object.fromEntries(markers.map((marker) => [marker.opts.title, marker.popupHtml]));
  assert.match(byTitle["Bullet camera"], /Field of view/, "the popup labels the field-of-view row");
  assert.match(byTitle["Bullet camera"], /NE 45°/, "the popup carries the compass+degrees text");
  assert.ok(!byTitle["Dome camera"].includes("Field of view"), "domes (direction NULL) omit the row");
  assert.ok(!byTitle["Unknown camera"].includes("Field of view"), "unknown direction omits the row");
});

// ---------------------------------------------------------------------------
// REPORT FORM (/segnala) — direction field visibility + payload
// ---------------------------------------------------------------------------

function installSegnalaMock(onPost) {
  installFetchMock((input, init) => {
    if (String(input) === "/api/auth/me") {
      return jsonResponse({
        contributor: {
          id: 1, email: "contributor@example.test", displayName: "Fixture Contributor",
          emailVerifiedAt: "2026-01-15T10:00:00.000Z", createdAt: "2026-01-15T10:00:00.000Z", updatedAt: "2026-01-15T10:00:00.000Z",
        },
        level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
      });
    }
    if (typeof input === "string" && input.startsWith("/api/cameras/nearby?")) {
      return jsonResponse({ records: [] });
    }
    if (String(input) === "/api/cameras" && init?.method === "POST") {
      return onPost ? onPost(input, init) : jsonResponse({});
    }
    return jsonResponse({ records: [], total: 0, nextOffset: null });
  });
}

async function fillReportBase(user, screen, { kind = "Bullet" } = {}) {
  await screen.findByLabelText("Latitude");
  await user.type(screen.getByLabelText("Latitude"), "45.46420");
  await user.type(screen.getByLabelText("Longitude"), "9.19000");
  await user.click(screen.getByRole("button", { name: /Use these coordinates/ }));
  await user.type(screen.getByLabelText("Record title"), "Fixture directional camera");
  await user.selectOptions(screen.getByLabelText("Camera type"), kind);
}

/** The privacy consent checkbox (the only non-direction checkbox on submit). */
const CONSENT_NAME = /I confirm this observation was made from public space/;

/** Set a range slider to a value (user-event cannot clear/type ranges). */
function setSlider(rtlInstance, slider, value) {
  rtlInstance.fireEvent.change(slider, { target: { value: String(value) } });
}

test("report form: the direction fieldset is hidden for domes and visible for directional kinds", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  installSegnalaMock();
  await renderWithLocale(React.createElement(SegnalaTool));

  await screen.findByLabelText("Latitude");
  // Dome kind: no direction field.
  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");
  assert.equal(screen.queryByText("Field of view direction"), null, "domes must not offer a direction field");
  // Directional kind: the fieldset appears.
  await user.selectOptions(screen.getByLabelText("Camera type"), "Bullet");
  assert.ok(screen.getByText("Field of view direction"), "directional kinds offer the direction field");
  assert.ok(screen.getByLabelText("I don't know the direction"), "the 'non so' option is present");
  // "I don't know" is checked by default → the slider stays hidden.
  assert.equal(screen.queryByLabelText("Direction"), null, "slider hidden while 'non so' is checked");
});

test("report form: 'I don't know' (default) submits direction: null", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  let posted = null;
  installSegnalaMock((input, init) => { posted = JSON.parse(String(init.body)); return jsonResponse({}); });
  await renderWithLocale(React.createElement(SegnalaTool));

  await fillReportBase(user, screen, { kind: "Bullet" });
  await user.click(screen.getByRole("checkbox", { name: CONSENT_NAME })); // consent
  await user.click(screen.getByRole("button", { name: /Publish report/ }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(posted, "the report must POST");
  assert.equal(posted.direction, null, "no direction specified → NULL (non so)");
});

test("report form: specifying a bearing submits it as an integer 0-359 with arrow preview", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  let posted = null;
  installSegnalaMock((input, init) => { posted = JSON.parse(String(init.body)); return jsonResponse({}); });
  await renderWithLocale(React.createElement(SegnalaTool));

  await fillReportBase(user, screen, { kind: "Bullet" });
  // Uncheck "I don't know": the slider + arrow preview appear.
  await user.click(screen.getByLabelText("I don't know the direction"));
  const slider = screen.getByLabelText("Direction");
  assert.ok(slider, "the compass slider appears once the bearing is known");
  assert.equal(slider.min, "0");
  assert.equal(slider.max, "359");
  // Arrow preview points north at default 0, then rotates with the slider.
  assert.equal(screen.getByText("N 0°").textContent, "N 0°");
  setSlider(rtl, slider, 45);
  assert.ok(screen.getByText("NE 45°"), "the readout shows the compass name + degrees");

  await user.click(screen.getByRole("checkbox", { name: CONSENT_NAME })); // consent
  await user.click(screen.getByRole("button", { name: /Publish report/ }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(posted);
  assert.equal(posted.direction, 45, "the bearing must be submitted as an integer");
});

test("report form: switching from a directional kind to a dome clears the bearing", async () => {
  const { screen } = rtl;
  const user = rtl.userEvent.setup();
  let posted = null;
  installSegnalaMock((input, init) => { posted = JSON.parse(String(init.body)); return jsonResponse({}); });
  await renderWithLocale(React.createElement(SegnalaTool));

  await fillReportBase(user, screen, { kind: "Bullet" });
  await user.click(screen.getByLabelText("I don't know the direction"));
  const slider = screen.getByLabelText("Direction");
  setSlider(rtl, slider, 90);
  // Switch to dome: the field disappears and the bearing is dropped.
  await user.selectOptions(screen.getByLabelText("Camera type"), "Fixed dome");
  assert.equal(screen.queryByText("Field of view direction"), null, "field hidden for dome");
  await user.click(screen.getByRole("checkbox", { name: CONSENT_NAME })); // consent
  await user.click(screen.getByRole("button", { name: /Publish report/ }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(posted);
  assert.equal(posted.direction, null, "a dome report never carries a bearing");
  assert.equal(posted.kind, "Fixed dome", "the kind is stored canonically (language-neutral)");
});

// ---------------------------------------------------------------------------
// EDIT FORM (/records/[id]/edit) — prefill + visibility + payload
// ---------------------------------------------------------------------------

function ownerRecord(overrides = {}) {
  return {
    id: 41,
    title: "Fixture Camera Report",
    kind: "Bullet",
    manufacturer: "FixtureCorp",
    observedOn: "2026-02-01",
    address: "Illustrative street, Rome",
    notes: "Fixture observation notes.",
    description: "Fixture description.",
    status: "pending",
    updated: "2026-02-10T08:00:00.000Z",
    direction: 45,
    ...overrides,
  };
}

function installEditMock(record, onPatch) {
  installFetchMock((input, init) => {
    if (input === "/api/cameras/41/edit") return jsonResponse({ record, editRequest: null });
    if (input === "/api/cameras/41" && init?.method === "PATCH") {
      if (onPatch) onPatch(JSON.parse(String(init.body)));
      return jsonResponse({ record, changed: true });
    }
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  });
}

async function renderEdit() {
  await setNavState({ params: { id: "41" } });
  return renderWithLocale(React.createElement(RecordEditPage));
}

test("edit form: a record with a stored bearing pre-fills the slider and readout", async () => {
  const { screen, waitFor } = rtl;
  installEditMock(ownerRecord());
  await renderEdit();
  await waitFor(() => assert.ok(screen.queryByDisplayValue("Fixture Camera Report")));

  assert.ok(screen.getByText("Field of view direction"), "directional records offer the direction field");
  const slider = screen.getByLabelText("Direction");
  assert.equal(slider.value, "45", "the slider pre-fills the stored bearing");
  assert.ok(screen.getByText("NE 45°"), "the readout shows the stored bearing");
});

test("edit form: dome records hide the direction field and PATCH null", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  let payload = null;
  installEditMock(ownerRecord({ kind: "Fixed dome", direction: null }), (body) => { payload = body; });
  await renderEdit();
  await waitFor(() => assert.ok(screen.queryByDisplayValue("Fixture Camera Report")));

  assert.equal(screen.queryByText("Field of view direction"), null, "dome records never offer a direction field");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => assert.ok(payload));
  assert.equal(payload.direction, null, "the PATCH carries direction: null for a dome");
  assert.equal(payload.kind, "Fixed dome");
});

test("edit form: 'I don't know' clears a stored bearing in the PATCH", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  let payload = null;
  installEditMock(ownerRecord(), (body) => { payload = body; });
  await renderEdit();
  await waitFor(() => assert.ok(screen.queryByDisplayValue("Fixture Camera Report")));

  // The record has 45; checking "I don't know" clears it → null.
  await user.click(screen.getByLabelText("I don't know the direction"));
  assert.equal(screen.queryByLabelText("Direction"), null, "the slider disappears when 'non so' is checked");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => assert.ok(payload));
  assert.equal(payload.direction, null, "clearing the bearing sends null (the edit path clears with null)");
});

test("edit form: changing the stored bearing submits the new value", async () => {
  const { screen, waitFor } = rtl;
  const user = rtl.userEvent.setup();
  let payload = null;
  installEditMock(ownerRecord(), (body) => { payload = body; });
  await renderEdit();
  await waitFor(() => assert.ok(screen.queryByDisplayValue("Fixture Camera Report")));

  const slider = screen.getByLabelText("Direction");
  setSlider(rtl, slider, 270);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => assert.ok(payload));
  assert.equal(payload.direction, 270, "the new bearing is submitted as an integer");
});
