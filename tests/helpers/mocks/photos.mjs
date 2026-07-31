// Mock of db/photos as seen by the transpiled route handlers.
// Named exports mirror the real module so the handlers bind unchanged.

import { makeMock } from "../mock-state.mjs";

export const {
  createPendingPhoto,
  listPendingPhotos,
  getPhotoById,
  getPublicPhoto,
  listApprovedPhotosForCamera,
  linkPhotosToCamera,
  moderatePhoto,
  readPhotoBytes,
  readPublicPhotoBytes,
} = makeMock({
  createPendingPhoto: "createPendingPhoto",
  listPendingPhotos: "listPendingPhotos",
  getPhotoById: "getPhotoById",
  getPublicPhoto: "getPublicPhoto",
  listApprovedPhotosForCamera: "listApprovedPhotosForCamera",
  linkPhotosToCamera: "linkPhotosToCamera",
  moderatePhoto: "moderatePhoto",
  readPhotoBytes: "readPhotoBytes",
  readPublicPhotoBytes: "readPublicPhotoBytes",
});
