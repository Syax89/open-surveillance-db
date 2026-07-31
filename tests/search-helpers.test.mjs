// Unit tests for the pure search helpers in app/lib/search.ts.
// The helpers are compiled into the same harness tree the routes use
// (see tests/helpers/api-harness.mjs loadLib), so these tests exercise the
// exact implementation the API route imports.

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { cleanupRouteTree, loadLib } from "./helpers/api-harness.mjs";

const search = await loadLib("app/lib/search.mjs");
after(async () => cleanupRouteTree());

// ---------------------------------------------------------------------------
// parseCoordinateQuery
// ---------------------------------------------------------------------------

test("parseCoordinateQuery accepts comma, semicolon, and whitespace separators", () => {
  const expected = { latitude: 41.9004, longitude: 12.4936 };
  for (const query of ["41.9004, 12.4936", "41.9004;12.4936", "41.9004 12.4936", "  41.9004 , 12.4936  "]) {
    assert.deepEqual(search.parseCoordinateQuery(query), expected, query);
  }
});

test("parseCoordinateQuery accepts comma decimal separators in either number", () => {
  assert.deepEqual(search.parseCoordinateQuery("41,9004; 12,4936"), { latitude: 41.9004, longitude: 12.4936 });
  assert.deepEqual(search.parseCoordinateQuery("45.46420 9,19000"), { latitude: 45.4642, longitude: 9.19 });
});

test("parseCoordinateQuery accepts the coordinate range boundaries", () => {
  assert.deepEqual(search.parseCoordinateQuery("-90, -180"), { latitude: -90, longitude: -180 });
  assert.deepEqual(search.parseCoordinateQuery("90, 180"), { latitude: 90, longitude: 180 });
});

test("parseCoordinateQuery rejects out-of-range and malformed pairs", () => {
  for (const query of ["91, 12", "0, 181", "-90.1, 0", "0, -180.1", "abc", "1,2,3", "41,9004, 12,4936", "", "45.46420N 9.19000E"]) {
    assert.equal(search.parseCoordinateQuery(query), null, query);
  }
});

// ---------------------------------------------------------------------------
// distanceInMeters
// ---------------------------------------------------------------------------

test("distanceInMeters matches the metre scale of a degree of latitude", () => {
  const zeroToNorth = search.distanceInMeters({ latitude: 0, longitude: 0 }, { latitude: 0.01, longitude: 0 });
  assert.ok(zeroToNorth > 1100 && zeroToNorth < 1130, `0.01 deg latitude should be ~1112 m, got ${zeroToNorth}`);
  const zeroToEast = search.distanceInMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.01 });
  assert.ok(zeroToEast > 1100 && zeroToEast < 1130, `0.01 deg longitude at the equator should be ~1112 m, got ${zeroToEast}`);
  assert.equal(search.distanceInMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }), 0);
});

// ---------------------------------------------------------------------------
// radiusForBoundingBox
// ---------------------------------------------------------------------------

test("radiusForBoundingBox clamps tiny and huge places to the documented range", () => {
  const tiny = { south: 41.9, north: 41.9001, west: 12.49, east: 12.4901 };
  assert.equal(search.radiusForBoundingBox(tiny), 1000, "a street-sized box must not shrink below 1 km");
  const huge = { south: -60, north: 70, west: -160, east: 160 };
  assert.equal(search.radiusForBoundingBox(huge), 25000, "a continent-sized box must not grow beyond 25 km");
});

test("radiusForBoundingBox scales with a mid-sized place", () => {
  const box = { south: 41.89, north: 41.92, west: 12.47, east: 12.53 };
  const radius = search.radiusForBoundingBox(box);
  assert.ok(radius > 1000 && radius < 25000, `expected a mid-range radius, got ${radius}`);
  assert.equal(radius, search.distanceInMeters(
    { latitude: box.south, longitude: box.west },
    { latitude: box.north, longitude: box.east },
  ) / 2, "the radius must be half the bounding-box diagonal");
});

// ---------------------------------------------------------------------------
// formatDistance
// ---------------------------------------------------------------------------

test("formatDistance renders metres and rounded kilometres", () => {
  assert.equal(search.formatDistance(750), "750 m");
  assert.equal(search.formatDistance(1000), "1 km");
  assert.equal(search.formatDistance(2000), "2 km");
  assert.equal(search.formatDistance(1500), "1.5 km");
  assert.equal(search.formatDistance(25000), "25 km");
});

// ---------------------------------------------------------------------------
// textMatches
// ---------------------------------------------------------------------------

const record = {
  title: "Station camera",
  kind: "Fixed dome",
  manufacturer: "Acme",
  address: "Via Roma 12, Milan",
  source: "Community report",
  description: "Visible on the lamppost.",
  latitude: 45.4642,
  longitude: 9.19,
};

test("textMatches searches the same public fields the directory exposes", () => {
  assert.ok(search.textMatches(record, "station"));
  assert.ok(search.textMatches(record, "VIA ROMA"));
  assert.ok(search.textMatches(record, "Acme"));
  assert.ok(search.textMatches(record, "lamppost"));
  assert.ok(search.textMatches(record, "45.4642"), "a shortened coordinate must match its 4-decimal rendering");
  assert.ok(!search.textMatches(record, "private-note-text"));
  assert.ok(!search.textMatches(record, ""));
});

test("textMatches tolerates missing optional metadata", () => {
  const minimal = { title: "X", kind: "Y", source: "S", description: "D", latitude: 1, longitude: 2 };
  assert.ok(search.textMatches(minimal, "x"));
  assert.ok(!search.textMatches(minimal, "nothing"));
});
