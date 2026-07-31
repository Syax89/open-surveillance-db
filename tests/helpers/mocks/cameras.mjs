// Mock of db/cameras as seen by the transpiled route handlers.
// Named exports mirror the real module so the handlers bind unchanged.

import { makeMock } from "../mock-state.mjs";

export const freshnessWindows = ["7d", "30d", "90d", "all"];

export const {
  listPublicCameras,
  findNearbyPublicCameras,
  searchPublicCamerasNear,
  createPendingCamera,
  getPublicCameraById,
} = makeMock({
  listPublicCameras: "listPublicCameras",
  findNearbyPublicCameras: "findNearbyPublicCameras",
  searchPublicCamerasNear: "searchPublicCamerasNear",
  createPendingCamera: "createPendingCamera",
  getPublicCameraById: "getPublicCameraById",
});
