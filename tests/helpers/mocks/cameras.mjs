// Mock of db/cameras as seen by the transpiled route handlers.
// Named exports mirror the real module so the handlers bind unchanged.

import { makeMock } from "../mock-state.mjs";

export const freshnessWindows = ["7d", "30d", "90d", "all"];
export const PUBLIC_CAMERA_SORT_OPTIONS = ["useful", "recent", "confirmations"];
export const PUBLIC_CAMERAS_PAGE_DEFAULT_LIMIT = 500;
export const PUBLIC_CAMERAS_PAGE_MAX_LIMIT = 2000;
// Bbox JSON list bounds (kanban t_bb310428): mirror of db/cameras.ts — the
// map viewport contract is bounded at the db boundary.
export const PUBLIC_CAMERAS_BBOX_DEFAULT_LIMIT = 1000;
export const PUBLIC_CAMERAS_BBOX_MAX_LIMIT = 10_000;
export const SEARCH_PAGE_DEFAULT_LIMIT = 25;
export const SEARCH_PAGE_MAX_LIMIT = 100;
export const NEARBY_PAGE_DEFAULT_LIMIT = 50;
export const NEARBY_PAGE_MAX_LIMIT = 100;
// Mirror of the canonical dome kind (db/cameras.ts DOME_KIND, kanban
// t_1b08fe12): the route imports it to normalise direction -> NULL for domes.
export const DOME_KIND = "Fixed dome";

export const {
  listPublicCameras,
  listPublicCamerasPage,
  findNearbyPublicCameras,
  findNearbyPublicCamerasPage,
  searchPublicCamerasNear,
  searchPublicCamerasNearPage,
  createPendingCamera,
  createCamera,
  getPublicCameraById,
  getCommunityRecordById,
  getPublicCameraFacets,
  listPublicCamerasInBbox,
  listPublicCamerasInBboxPage,
  getD1,
} = makeMock({
  listPublicCameras: "listPublicCameras",
  listPublicCamerasPage: "listPublicCamerasPage",
  findNearbyPublicCameras: "findNearbyPublicCameras",
  findNearbyPublicCamerasPage: "findNearbyPublicCamerasPage",
  searchPublicCamerasNear: "searchPublicCamerasNear",
  searchPublicCamerasNearPage: "searchPublicCamerasNearPage",
  createPendingCamera: "createPendingCamera",
  createCamera: "createCamera",
  getPublicCameraById: "getPublicCameraById",
  getCommunityRecordById: "getCommunityRecordById",
  getPublicCameraFacets: "getPublicCameraFacets",
  listPublicCamerasInBbox: "listPublicCamerasInBbox",
  listPublicCamerasInBboxPage: "listPublicCamerasInBboxPage",
  getD1: "getD1",
});
