// Mock of db/cameras as seen by the transpiled route handlers.
// Named exports mirror the real module so the handlers bind unchanged.

import { makeMock } from "../mock-state.mjs";

export const freshnessWindows = ["7d", "30d", "90d", "all"];
export const PUBLIC_CAMERAS_PAGE_DEFAULT_LIMIT = 500;
export const PUBLIC_CAMERAS_PAGE_MAX_LIMIT = 500;
export const SEARCH_PAGE_DEFAULT_LIMIT = 25;
export const SEARCH_PAGE_MAX_LIMIT = 100;
export const NEARBY_PAGE_DEFAULT_LIMIT = 50;
export const NEARBY_PAGE_MAX_LIMIT = 100;

export const {
  listPublicCameras,
  listPublicCamerasPage,
  findNearbyPublicCameras,
  findNearbyPublicCamerasPage,
  searchPublicCamerasNear,
  searchPublicCamerasNearPage,
  createPendingCamera,
  getPublicCameraById,
  getPublicCameraFacets,
  listPublicCamerasInBbox,
} = makeMock({
  listPublicCameras: "listPublicCameras",
  listPublicCamerasPage: "listPublicCamerasPage",
  findNearbyPublicCameras: "findNearbyPublicCameras",
  findNearbyPublicCamerasPage: "findNearbyPublicCamerasPage",
  searchPublicCamerasNear: "searchPublicCamerasNear",
  searchPublicCamerasNearPage: "searchPublicCamerasNearPage",
  createPendingCamera: "createPendingCamera",
  getPublicCameraById: "getPublicCameraById",
  getPublicCameraFacets: "getPublicCameraFacets",
  listPublicCamerasInBbox: "listPublicCamerasInBbox",
});
