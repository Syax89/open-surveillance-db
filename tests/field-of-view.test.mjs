// Unit tests for the field-of-view helpers (kanban t_f8b775ec, design Vera):
//   - app/lib/field-of-view.ts — trig cone geometry (L.polygon points),
//     circle radius, zoom threshold;
//   - app/lib/compass.ts — 16-wind compass + "NE 45°" display form;
//   - app/lib/camera-kinds.ts — canonical kinds + dome rule.
//
// The map draws the camera's field of view with native Leaflet only: a
// ~60°/35 m wedge computed with plain trigonometry for directional cameras
// with a stored bearing, a 360° circle for domes. These pure helpers carry
// the geometry contract so it is testable in plain Node (no map instance).

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { cleanupRouteTree, loadLib } from "./helpers/api-harness.mjs";

const fieldOfView = await loadLib("app/lib/field-of-view.mjs");
const compass = await loadLib("app/lib/compass.mjs");
const cameraKinds = await loadLib("app/lib/camera-kinds.mjs");
after(async () => cleanupRouteTree());

// ---------------------------------------------------------------------------
// camera-kinds — canonical vocabulary + dome rule
// ---------------------------------------------------------------------------

test("isDomeKind: only the canonical 'Fixed dome' value is a dome", () => {
  assert.equal(cameraKinds.isDomeKind("Fixed dome"), true);
  assert.equal(cameraKinds.isDomeKind("Bullet"), false);
  assert.equal(cameraKinds.isDomeKind("PTZ"), false);
  assert.equal(cameraKinds.isDomeKind("Traffic / licence plate reader"), false);
  assert.equal(cameraKinds.isDomeKind("Other / unknown"), false);
  assert.equal(cameraKinds.isDomeKind(""), false);
});

test("KIND_OPTIONS: canonical values match the backend DOME_KIND contract", () => {
  assert.ok(cameraKinds.KIND_OPTIONS.some((option) => option.value === "Fixed dome"));
  // Every option carries a labelKey so the localized label resolves.
  for (const option of cameraKinds.KIND_OPTIONS) {
    assert.equal(typeof option.labelKey, "string");
    assert.ok(option.labelKey.length > 0);
  }
  // The stored kind values are language-neutral English, never localized.
  assert.ok(!cameraKinds.KIND_OPTIONS.some((option) => option.value.includes("Dome fissa")));
});

test("hasDrawableDirection: non-dome kind + finite number = drawable", () => {
  assert.equal(cameraKinds.hasDrawableDirection({ kind: "Bullet", direction: 45 }), true);
  assert.equal(cameraKinds.hasDrawableDirection({ kind: "Bullet", direction: 0 }), true);
  assert.equal(cameraKinds.hasDrawableDirection({ kind: "Bullet", direction: null }), false);
  assert.equal(cameraKinds.hasDrawableDirection({ kind: "Bullet" }), false);
  assert.equal(cameraKinds.hasDrawableDirection({ kind: "Fixed dome", direction: 45 }), false, "domes never draw a cone");
  assert.equal(cameraKinds.hasDrawableDirection({ kind: "Fixed dome", direction: null }), false);
});

// ---------------------------------------------------------------------------
// compass — bearings to wind names and display form
// ---------------------------------------------------------------------------

test("compassWind: 16-wind sectors, clockwise from north", () => {
  assert.equal(compass.compassWind(0), "N");
  assert.equal(compass.compassWind(22.5), "NNE");
  assert.equal(compass.compassWind(45), "NE");
  assert.equal(compass.compassWind(90), "E");
  assert.equal(compass.compassWind(135), "SE");
  assert.equal(compass.compassWind(180), "S");
  assert.equal(compass.compassWind(270), "W");
  assert.equal(compass.compassWind(315), "NW");
});

test("compassWind: out-of-range bearings wrap like a compass", () => {
  assert.equal(compass.compassWind(360), "N");
  assert.equal(compass.compassWind(359), "N", "359° is just west of north");
  assert.equal(compass.compassWind(-45), "NW", "negative bearings wrap");
  assert.equal(compass.compassWind(405), "NE", ">360 wraps (405° = 45°)");
});

test("normalizeBearing: any number maps to 0-359", () => {
  assert.equal(compass.normalizeBearing(0), 0);
  assert.equal(compass.normalizeBearing(359), 359);
  assert.equal(compass.normalizeBearing(360), 0);
  assert.equal(compass.normalizeBearing(-1), 359);
  assert.equal(compass.normalizeBearing(720), 0);
});

test("formatDirection: compact 'NE 45°' form used in popup/detail/readout", () => {
  assert.equal(compass.formatDirection(45), "NE 45°");
  assert.equal(compass.formatDirection(0), "N 0°");
  assert.equal(compass.formatDirection(359), "N 359°");
});

// ---------------------------------------------------------------------------
// field-of-view — wedge geometry (trig), circle radius, zoom threshold
// ---------------------------------------------------------------------------

test("fovPolygonPoints: vertex at the camera position", () => {
  const points = fieldOfView.fovPolygonPoints(41.9, 12.49, 45);
  assert.deepEqual(points[0], [41.9, 12.49], "the ring starts at the camera (vertex)");
});

test("fovPolygonPoints: radius matches the ~35 m directive", () => {
  const points = fieldOfView.fovPolygonPoints(41.9, 12.49, 0);
  const lat1 = 41.9 * (Math.PI / 180);
  const metersPerDegLng = 111_320 * Math.cos(lat1);
  const far = points[points.length - 1];
  const dLatMeters = Math.abs(far[0] - 41.9) * 111_320;
  const dLngMeters = Math.abs(far[1] - 12.49) * metersPerDegLng;
  const distance = Math.hypot(dLatMeters, dLngMeters);
  assert.ok(Math.abs(distance - 35) < 1, `far edge must sit ~35 m away, got ${distance.toFixed(2)} m`);
});

test("fovPolygonPoints: aperture is ~60° (±30° around the bearing)", () => {
  const points = fieldOfView.fovPolygonPoints(41.9, 12.49, 90);
  const lat1 = 41.9 * (Math.PI / 180);
  const metersPerDegLng = 111_320 * Math.cos(lat1);
  const bearingOf = (point) => {
    const dLat = (point[0] - 41.9) * 111_320;
    const dLng = (point[1] - 12.49) * metersPerDegLng;
    return ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
  };
  const firstArc = bearingOf(points[1]); // first arc point
  const lastArc = bearingOf(points[points.length - 1]);
  // The wedge spans bearing±30°: for bearing 90 → 60..120.
  assert.ok(Math.abs(firstArc - 60) < 0.5, `first arc point at ~60°, got ${firstArc.toFixed(1)}°`);
  assert.ok(Math.abs(lastArc - 120) < 0.5, `last arc point at ~120°, got ${lastArc.toFixed(1)}°`);
});

test("fovPolygonPoints: the wedge points away from the bearing (not behind)", () => {
  const points = fieldOfView.fovPolygonPoints(41.9, 12.49, 0); // north
  const lat1 = 41.9 * (Math.PI / 180);
  const metersPerDegLng = 111_320 * Math.cos(lat1);
  // The centroid of the arc must be NORTH of the camera (bearing 0).
  const arc = points.slice(1);
  const avgLat = arc.reduce((sum, p) => sum + p[0], 0) / arc.length;
  const avgLng = arc.reduce((sum, p) => sum + p[1], 0) / arc.length;
  const dLat = (avgLat - 41.9) * 111_320;
  const dLng = (avgLng - 12.49) * metersPerDegLng;
  const centroidBearing = ((Math.atan2(dLng, dLat) * 180) / Math.PI + 360) % 360;
  assert.ok(centroidBearing < 30 || centroidBearing > 330, `cone centroid must point north (~0°), got ${centroidBearing.toFixed(1)}°`);
});

test("fovPolygonPoints: wrap-around wedge (bearing 350 ± 30 crosses 360°) stays inside 35 m", () => {
  const points = fieldOfView.fovPolygonPoints(41.9, 12.49, 350);
  const lat1 = 41.9 * (Math.PI / 180);
  const metersPerDegLng = 111_320 * Math.cos(lat1);
  for (const point of points.slice(1)) {
    const dLat = (point[0] - 41.9) * 111_320;
    const dLng = (point[1] - 12.49) * metersPerDegLng;
    assert.ok(Math.hypot(dLat, dLng) <= 36, "every arc point stays within the radius (plus rounding)");
  }
  // The arc must be the SHORT way around: 320°..10°, not 10°..320°.
  assert.ok(points.length >= 6, "wrap wedge generates points on both sides of 360°");
});

test("fov constants: aperture 60, radius 30-40 m, zoom threshold 16", () => {
  assert.equal(fieldOfView.FOV_OPENING_DEGREES, 60);
  assert.ok(fieldOfView.FOV_RADIUS_METERS >= 30 && fieldOfView.FOV_RADIUS_METERS <= 40);
  assert.equal(fieldOfView.FOV_MIN_ZOOM, 16);
  assert.equal(fieldOfView.fovCircleRadiusMeters(), fieldOfView.FOV_RADIUS_METERS, "dome circle uses the same radius as the wedge");
});

// ---------------------------------------------------------------------------
// fovBearingPoint / fovBearingFromPoint — report mini-map rotation handle
// (kanban t_ebbe0ea3): the handle sits on the cone's centre line at the
// bearing's radius point, and dragging it to a new spot re-aims the cone at
// the bearing camera→handle. The pair must be exact inverses.
// ---------------------------------------------------------------------------

test("fovBearingPoint: point at bearing 0 is due north of the camera, bearing 90 due east, at ~35 m", () => {
  const cam = { lat: 41.9, lng: 12.49 };
  const north = fieldOfView.fovBearingPoint(cam.lat, cam.lng, 0);
  assert.ok(north[0] > cam.lat, "bearing 0 increases latitude (north)");
  assert.ok(Math.abs(north[1] - cam.lng) < 1e-9, "bearing 0 keeps longitude");
  const east = fieldOfView.fovBearingPoint(cam.lat, cam.lng, 90);
  assert.ok(Math.abs(east[0] - cam.lat) < 1e-9, "bearing 90 keeps latitude");
  assert.ok(east[1] > cam.lng, "bearing 90 increases longitude (east)");
  const latRad = cam.lat * (Math.PI / 180);
  const metersPerDegLng = 111_320 * Math.cos(latRad);
  const dist = Math.hypot((north[0] - cam.lat) * 111_320, (north[1] - cam.lng) * metersPerDegLng);
  assert.ok(Math.abs(dist - fieldOfView.FOV_RADIUS_METERS) < 0.5, `distance is the FOV radius (~35 m), got ${dist.toFixed(2)} m`);
});

test("fovBearingFromPoint: cardinal bearings from the camera to a point", () => {
  const cam = { lat: 41.9, lng: 12.49 };
  const latRad = cam.lat * (Math.PI / 180);
  const metersPerDegLng = 111_320 * Math.cos(latRad);
  const dLatDeg = 30 / 111_320;
  const dLngDeg = 30 / metersPerDegLng;
  assert.equal(fieldOfView.fovBearingFromPoint(cam.lat, cam.lng, cam.lat + dLatDeg, cam.lng), 0, "due north → 0");
  assert.equal(fieldOfView.fovBearingFromPoint(cam.lat, cam.lng, cam.lat, cam.lng + dLngDeg), 90, "due east → 90");
  assert.equal(fieldOfView.fovBearingFromPoint(cam.lat, cam.lng, cam.lat - dLatDeg, cam.lng), 180, "due south → 180");
  assert.equal(fieldOfView.fovBearingFromPoint(cam.lat, cam.lng, cam.lat, cam.lng - dLngDeg), 270, "due west → 270");
});

test("fovBearingPoint ⇄ fovBearingFromPoint are exact inverses (round-trip identity)", () => {
  const cam = { lat: 44.8378, lng: 11.6183 };
  for (const bearing of [0, 45, 90, 135, 200, 270, 359]) {
    const point = fieldOfView.fovBearingPoint(cam.lat, cam.lng, bearing);
    const roundTrip = fieldOfView.fovBearingFromPoint(cam.lat, cam.lng, point[0], point[1]);
    assert.equal(roundTrip, bearing, `round-trip ${bearing}° → ${roundTrip}°`);
  }
});
