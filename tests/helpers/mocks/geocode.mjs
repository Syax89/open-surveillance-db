// Mock of db/geocode as seen by the transpiled route handlers.
// Named exports mirror the real module so the handlers bind unchanged.
// The real module lives in db/geocode.ts and talks to Nominatim; the route
// harness must never make network calls, so tests stub resolvePlace through
// the shared mock state (resolve a place, resolve null, or throw).

import { makeMock } from "../mock-state.mjs";

export const {
  geocoderBaseUrl,
  resolvePlace,
} = makeMock({
  geocoderBaseUrl: "geocoderBaseUrl",
  resolvePlace: "resolvePlace",
});
