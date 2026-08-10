// Mock of db/api-keys as seen by the transpiled route handlers (EPIC
// api-keys, T7 — mint endpoint; T8/T9 list/revoke will consume the same
// surface).
//
// Pure constants and the D5 env-knob helper run for real so the route's
// whitelist checks and the cap default are exercised at route level; every
// function that touches the database or crypto goes through makeMock and
// must be stubbed per test (see tests/helpers/mock-state.mjs). The apiKeys
// table re-export is intentionally absent: routes never touch the drizzle
// object (all api-keys SQL is raw via getD1).

import { makeMock } from "../mock-state.mjs";

export const API_KEY_SCOPES = ["submit", "confirm", "edit", "action"];

export const API_KEY_PREFIX = "osdb_";
export const API_KEY_PREFIX_LENGTH = 10;

export const API_KEYS_MAX_PER_CONTRIBUTOR_DEFAULT = 5;

export function apiKeysMaxPerContributor(env) {
  const value = Number(env?.API_KEYS_MAX_PER_CONTRIBUTOR);
  return Number.isFinite(value) && value > 0 ? value : API_KEYS_MAX_PER_CONTRIBUTOR_DEFAULT;
}

export const {
  mintRawKey,
  derivePrefix,
  countApiKeysForContributor,
  countActiveKeys,
  createApiKey,
  findApiKeyByHash,
  listApiKeysForContributor,
  revokeApiKey,
  touchApiKeyLastUsed,
} = makeMock({
  mintRawKey: "mintRawKey",
  derivePrefix: "derivePrefix",
  countApiKeysForContributor: "countApiKeysForContributor",
  countActiveKeys: "countActiveKeys",
  createApiKey: "createApiKey",
  findApiKeyByHash: "findApiKeyByHash",
  listApiKeysForContributor: "listApiKeysForContributor",
  revokeApiKey: "revokeApiKey",
  touchApiKeyLastUsed: "touchApiKeyLastUsed",
});
