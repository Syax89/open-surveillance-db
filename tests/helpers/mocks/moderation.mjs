// Mock of db/moderation as seen by the transpiled route handlers.
// moderationReasonCodes is a runtime value the route parser imports, so the
// mock must mirror the real allowlist exactly.

import { makeMock } from "../mock-state.mjs";

export const moderationReasonCodes = [
  "verified-public-infrastructure",
  "insufficient-evidence",
  "duplicate",
  "private-or-sensitive-location",
  "inaccurate-or-outdated",
  "privacy-or-safety-concern",
  "requires-senior-review",
  "other",
];

export const {
  listPendingModerationItems,
  moderateCamera,
  moderateCorrection,
  listPublicCameraRevisions,
} = makeMock({
  listPendingModerationItems: "listPendingModerationItems",
  moderateCamera: "moderateCamera",
  moderateCorrection: "moderateCorrection",
  listPublicCameraRevisions: "listPublicCameraRevisions",
});
