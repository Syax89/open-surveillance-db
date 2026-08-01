// Mock of db/appeals as seen by the transpiled route handlers.
//
// The appeals routes import the runtime allowlists (appealStatuses,
// appealDecisions) as pure values — they must mirror the real module exactly
// (db/appeals.ts) so the parser validates against the same set. Every
// function that touches the database goes through makeMock and must be
// stubbed per test (see tests/helpers/mock-state.mjs): unstubbed calls throw,
// so no test can accidentally pass against default behaviour.

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
