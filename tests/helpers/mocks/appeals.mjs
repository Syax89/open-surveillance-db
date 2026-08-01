// Mock of db/appeals as seen by the transpiled route handlers.
// appealStatuses is a runtime value the appeals route re-exports, so the
// mock must mirror the real allowlist exactly (see db/appeals.ts).
// The async file/list/decide operations are stubs the tests control via
// mock-state: unstubbed calls throw, so no test can accidentally pass
// against default behaviour.

import { makeMock } from "../mock-state.mjs";

export const appealStatuses = ["pending", "upheld", "dismissed", "escalated"];

export const appealDecisions = ["uphold", "dismiss", "escalate"];

export const {
  fileAppeal,
  listAppeals,
  decideAppeal,
} = makeMock({
  fileAppeal: "fileAppeal",
  listAppeals: "listAppeals",
  decideAppeal: "decideAppeal",
});
