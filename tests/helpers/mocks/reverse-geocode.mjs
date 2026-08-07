// Mock of db/reverse-geocode as seen by the transpiled route handlers.
// Named exports mirror the real module so the handlers bind unchanged.
// The real module lives in db/reverse-geocode.ts and talks to Nominatim
// with a persistent D1 cache; the route harness must never make network
// calls, so tests stub reverseGeocode through the shared mock state
// (resolve an address, resolve null, or throw).

import { makeMock } from "../mock-state.mjs";

export const {
  cacheKey,
  reverseGeocode,
} = makeMock({
  cacheKey: "cacheKey",
  reverseGeocode: "reverseGeocode",
});
