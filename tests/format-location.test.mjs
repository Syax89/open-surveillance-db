// Location formatting (CEO 2026-08-07): the DB stores BOTH the address
// and the precise coordinates, and every public surface must show both —
// never "address OR coordinates". The address is an approximate
// human-readable label (reverse geocoding); the coordinates are the
// authoritative position. Both are always displayed.
import assert from "node:assert/strict";
import test from "node:test";
import { formatCoordinates, formatLocation } from "../app/lib/format-location.ts";

test("formatCoordinates always renders the precise position (4 decimals)", () => {
  assert.equal(formatCoordinates(41.902816, 12.496374), "41.9028, 12.4964");
  assert.equal(formatCoordinates(0, 0), "0.0000, 0.0000");
});

test("formatLocation shows address AND coordinates when an address exists", () => {
  assert.equal(
    formatLocation("Via Roma 12, Ferrara", 41.902816, 12.496374),
    "Via Roma 12, Ferrara — 41.9028, 12.4964",
  );
});

test("formatLocation falls back to coordinates alone when no address is stored", () => {
  assert.equal(formatLocation(null, 41.902816, 12.496374), "41.9028, 12.4964");
  assert.equal(formatLocation(undefined, 41.902816, 12.496374), "41.9028, 12.4964");
  assert.equal(formatLocation("", 41.902816, 12.496374), "41.9028, 12.4964");
});
