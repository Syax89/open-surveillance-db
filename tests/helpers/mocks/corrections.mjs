// Mock of db/corrections as seen by the transpiled route handlers.

import { makeMock } from "../mock-state.mjs";

// The issue_type whitelist is a pure constant: the mock re-exports the real
// values so route-level tests can assert the A1/A2 contract without a
// database. Keep in sync with db/corrections.ts CORRECTION_ISSUE_TYPES.
export const CORRECTION_ISSUE_TYPES = [
  "inaccurate",
  "missing",
  "removal",
  "abuse",
  "other",
];

export const { createCorrectionRequest } = makeMock({
  createCorrectionRequest: "createCorrectionRequest",
});
