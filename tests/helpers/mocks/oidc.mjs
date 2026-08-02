// Mock of db/oidc as seen by the transpiled route handlers (Fase D,
// t_87f24b2d). Every function touches the database, so all of them go
// through makeMock and are stubbed per test (see
// tests/helpers/mock-state.mjs). The TTL constants are mirrored so tests
// that assert expiry semantics read the same values the routes do.
//
// The real SQL boundary is covered separately by tests/oidc-d1.test.mjs
// against an in-memory D1 (db-runtime-harness), where db/oidc.ts runs for
// real against the applied migrations.

import { makeMock } from "../mock-state.mjs";

export const OIDC_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OIDC_MERGE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export const {
  createOidcState,
  consumeOidcState,
  findContributorByExternalIdentity,
  createOidcContributor,
  createOidcMergeRequest,
  getOidcMergeRequest,
  linkExternalIdentity,
  sweepOidcExpired,
} = makeMock({
  createOidcState: "createOidcState",
  consumeOidcState: "consumeOidcState",
  findContributorByExternalIdentity: "findContributorByExternalIdentity",
  createOidcContributor: "createOidcContributor",
  createOidcMergeRequest: "createOidcMergeRequest",
  getOidcMergeRequest: "getOidcMergeRequest",
  linkExternalIdentity: "linkExternalIdentity",
  sweepOidcExpired: "sweepOidcExpired",
});
