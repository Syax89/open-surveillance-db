// Mock of db/cameras as seen by the transpiled route handlers.
// Named exports mirror the real module so the handlers bind unchanged.

import { makeMock } from "../mock-state.mjs";

export const freshnessWindows = ["7d", "30d", "90d", "all"];
export const PUBLIC_CAMERAS_PAGE_DEFAULT_LIMIT = 500;
export const PUBLIC_CAMERAS_PAGE_MAX_LIMIT = 500;

export const {
  listPublicCameras,
  listPublicCamerasPage,
  findNearbyPublicCameras,
  searchPublicCamerasNear,
  createPendingCamera,
  getPublicCameraById,
} = makeMock({
  listPublicCameras: "listPublicCameras",
  listPublicCamerasPage: "listPublicCamerasPage",
  findNearbyPublicCameras: "findNearbyPublicCameras",
  searchPublicCamerasNear: "searchPublicCamerasNear",
  createPendingCamera: "createPendingCamera",
  getPublicCameraById: "getPublicCameraById",
});
