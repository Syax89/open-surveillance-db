// Mock of db/cameras as seen by the transpiled route handlers.
// Named exports mirror the real module so the handlers bind unchanged.

import { makeMock } from "../mock-state.mjs";

export const {
  listPublicCameras,
  findNearbyPublicCameras,
  createPendingCamera,
} = makeMock({
  listPublicCameras: "listPublicCameras",
  findNearbyPublicCameras: "findNearbyPublicCameras",
  createPendingCamera: "createPendingCamera",
});
