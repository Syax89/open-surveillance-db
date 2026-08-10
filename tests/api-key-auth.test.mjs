// Tests for the pure Bearer API-key auth bridge (EPIC api-keys, T10,
// plan §1.4, decisions D1-D13).
//
// Two layers:
//
//   1. parseBearerToken — pure string parsing, exercised in plain Node with
//      real Request objects (no db): only the exact single-scheme
//      `Bearer <token>` form is accepted; Basic/multi-scheme/malformed/
//      empty all return null (uniform-401 collapse, no oracle).
//
//   2. resolveApiKeyContributor — the REAL chain against the REAL migration
//      SQL (drizzle/0045_api_keys.sql via applyDrizzleMigrations) on an
//      in-memory D1 adapter (same harness as db-api-keys-crud.test.mjs):
//      hash (D3) → findApiKeyByHash (JOIN contributors + liveness, D6/D9)
//      → { apiKey, contributor } → throttled touchApiKeyLastUsed (D7).
//      Asserted: valid key resolves with correct attribution, all failure
//      modes (absent header, non-Bearer scheme, unknown hash, revoked,
//      expired) collapse to the same null, and the last_used_at touch is
//      throttled ≥5 min on repeated success.
//
// No personal data: all fixtures are fictional/random.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, beforeEach, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
} from "./helpers/db-runtime-harness.mjs";

let runtime;

beforeEach(async () => {
  if (!runtime) runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
});

after(async () => cleanupDbRuntime());

const T0 = "2026-08-01T00:00:00.000Z";
const MINUTE_MS = 60 * 1000;
const minutesAfter = (minutes) => new Date(Date.parse(T0) + minutes * MINUTE_MS).toISOString();

/** Create a real contributor row (api_keys contributor_id FKs to it). */
async function createContributor(email = "keys@osdb.test") {
  const profile = await runtime.auth.createContributor({
    email,
    displayName: "API Key Tester",
    password: "supersecret123",
  });
  return profile;
}

/** Mint a real key for the contributor and return raw + row. */
async function createKey(contributorId, options = {}) {
  return runtime.apiKeys.createApiKey({ contributorId, name: "ci", now: T0, ...options });
}

/** A write request carrying `Authorization: Bearer <raw>`. */
function bearerRequest(rawKey) {
  return new Request("https://osdb.test/api/cameras", {
    method: "POST",
    headers: { authorization: `Bearer ${rawKey}` },
  });
}

// ---------------------------------------------------------------------------
// parseBearerToken — pure parsing contract (only `Bearer <token>`)
// ---------------------------------------------------------------------------

test("parseBearerToken accepts exactly `Bearer <token>` and returns the token verbatim", () => {
  const { parseBearerToken } = runtime.apiKeyAuth;
  const token = "tok-abcdefghijklmnopqrstuvwxyz012345";
  assert.equal(
    parseBearerToken(new Request("https://osdb.test/", { headers: { authorization: `Bearer ${token}` } })),
    token,
    "token is returned verbatim (never trimmed or normalised)",
  );
});

test("parseBearerToken treats the auth-scheme as case-insensitive (RFC 7235)", () => {
  const { parseBearerToken } = runtime.apiKeyAuth;
  const token = "tok-abcdefghijklmnopqrstuvwxyz012345";
  for (const scheme of ["Bearer", "bearer", "BEARER", "BeArEr"]) {
    assert.equal(
      parseBearerToken(new Request("https://osdb.test/", { headers: { authorization: `${scheme} ${token}` } })),
      token,
      `${scheme} resolves`,
    );
  }
});

test("parseBearerToken tolerates leading/trailing whitespace around the value", () => {
  const { parseBearerToken } = runtime.apiKeyAuth;
  const token = "tok-abcdefghijklmnopqrstuvwxyz012345";
  assert.equal(
    parseBearerToken(new Request("https://osdb.test/", { headers: { authorization: `  Bearer\t${token}  ` } })),
    token,
  );
});

test("parseBearerToken returns null for every non-single-Bearer form (uniform collapse)", () => {
  const { parseBearerToken } = runtime.apiKeyAuth;
  const cases = [
    ["absent header", new Request("https://osdb.test/")],
    ["Basic scheme", new Request("https://osdb.test/", { headers: { authorization: "Basic dXNlcjpwYXNz" } })],
    ["Digest scheme", new Request("https://osdb.test/", { headers: { authorization: 'Digest username="u"' } })],
    ["bare Bearer, no token", new Request("https://osdb.test/", { headers: { authorization: "Bearer" } })],
    ["Bearer with empty token", new Request("https://osdb.test/", { headers: { authorization: "Bearer " } })],
    ["two tokens", new Request("https://osdb.test/", { headers: { authorization: "Bearer abc def" } })],
    ["Bearer-looking prefix of another scheme", new Request("https://osdb.test/", { headers: { authorization: "XBearer abc" } })],
    ["comma-joined schemes", new Request("https://osdb.test/", { headers: { authorization: "Bearer abc, Basic dXNlcjpwYXNz" } })],
    ["empty header value", new Request("https://osdb.test/", { headers: { authorization: "" } })],
  ];
  for (const [label, request] of cases) {
    assert.equal(parseBearerToken(request), null, label);
  }
});

// ---------------------------------------------------------------------------
// resolveApiKeyContributor — real chain: hash → lookup → liveness → touch
// ---------------------------------------------------------------------------

test("valid Bearer key resolves to its owning contributor and touches last_used_at", async () => {
  const { apiKeyAuth, apiKeys } = runtime;
  const contributor = await createContributor("alice@osdb.test");
  const { rawKey } = await createKey(contributor.id);

  const result = await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), minutesAfter(1));

  assert.notEqual(result, null, "a live key resolves");
  assert.equal(result.apiKey.contributorId, contributor.id);
  assert.equal(result.apiKey.lastUsedAt, null, "resolve result reflects the row BEFORE the touch");
  assert.equal(result.contributor.id, contributor.id);
  assert.equal(result.contributor.email, "alice@osdb.test");
  assert.equal(result.contributor.displayName, "API Key Tester");
  assert.equal(typeof result.contributor.authProvider, "string");

  // D7: the success path wrote last_used_at (throttled writer) for the key.
  const [row] = await apiKeys.listApiKeysForContributor(contributor.id);
  assert.equal(row.lastUsedAt, minutesAfter(1), "throttled touch wrote last_used_at on success");
});

test("attribution: a key always resolves to its OWN contributor, never another", async () => {
  const { apiKeyAuth, apiKeys } = runtime;
  const alice = await createContributor("alice@osdb.test");
  const bob = await createContributor("bob@osdb.test");
  const { rawKey, key } = await createKey(alice.id);

  const result = await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), T0);

  assert.notEqual(result, null);
  assert.equal(result.apiKey.id, key.id);
  assert.equal(result.contributor.id, alice.id);
  assert.notEqual(result.contributor.id, bob.id);
  // The contributor row returned comes from the JOIN, so its profile fields
  // are the real stored ones (never the presenter's).
  assert.equal(result.contributor.email, "alice@osdb.test");
});

test("hash lookup (D3): mutating even one character of the raw key yields null", async () => {
  const { apiKeyAuth } = runtime;
  const contributor = await createContributor();
  const { rawKey } = await createKey(contributor.id);

  const mutated = rawKey.slice(0, -1) + (rawKey.endsWith("A") ? "B" : "A");
  const result = await apiKeyAuth.resolveApiKeyContributor(bearerRequest(mutated), T0);
  assert.equal(result, null, "the full-key SHA-256 (D3) must match exactly");
});

test("all failure modes collapse to the same null (uniform 401, no oracle)", async () => {
  const { apiKeyAuth, apiKeys } = runtime;
  const contributor = await createContributor();
  const { rawKey, key } = await createKey(contributor.id, { expiresAt: "2026-08-02T00:00:00.000Z" });

  // Sanity: the live key resolves in this same database.
  assert.notEqual(await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), "2026-08-01T12:00:00.000Z"), null);

  // Revoke the key, then every presented form must be null:
  await apiKeys.revokeApiKey(key.id, contributor.id, minutesAfter(1));

  const cases = [
    ["absent header", new Request("https://osdb.test/api/cameras", { method: "POST" })],
    ["Basic scheme", new Request("https://osdb.test/api/cameras", { method: "POST", headers: { authorization: "Basic dXNlcjpwYXNz" } })],
    ["garbage token", bearerRequest("tok-garbagexyz")],
    ["revoked key", bearerRequest(rawKey)],
  ];
  for (const [label, request] of cases) {
    assert.equal(await apiKeyAuth.resolveApiKeyContributor(request, "2026-08-01T12:00:00.000Z"), null, label);
  }
});

test("expired key is dead (D6): resolves before expiry, null after", async () => {
  const { apiKeyAuth } = runtime;
  const contributor = await createContributor();
  const { rawKey } = await createKey(contributor.id, { expiresAt: "2026-08-02T00:00:00.000Z" });

  assert.notEqual(
    await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), "2026-08-01T23:59:59.000Z"),
    null,
    "live inside the TTL window",
  );
  assert.equal(
    await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), "2026-08-02T00:00:00.000Z"),
    null,
    "dead exactly at expiry (<=, D6)",
  );
  assert.equal(
    await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), "2026-08-03T00:00:00.000Z"),
    null,
    "dead after expiry",
  );
});

test("an offset ISO expiry that is temporally expired but lexicographically misleading is dead at the bridge (D6, epoch check)", async () => {
  const { apiKeyAuth } = runtime;
  const contributor = await createContributor();
  const { rawKey } = await createKey(contributor.id, {
    // 2026-08-02T00:00:00+02:00 IS 2026-08-01T22:00:00Z. At 23:00Z the key is
    // temporally expired, but the raw string sorts AFTER
    // "2026-08-01T23:00:00.000Z" (position 9: '2' > '1'), so a lexicographic
    // liveness comparison would keep it alive for another hour. The bridge
    // must judge by the instant, not the string.
    expiresAt: "2026-08-02T00:00:00+02:00",
  });

  assert.notEqual(
    await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), "2026-08-01T21:59:00.000Z"),
    null,
    "live one minute before the true instant",
  );
  assert.equal(
    await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), "2026-08-01T23:00:00.000Z"),
    null,
    "dead one hour after the true instant despite the deceiving offset string",
  );
});

test("revoked key is dead (D9): resolves before revoke, null after", async () => {
  const { apiKeyAuth, apiKeys } = runtime;
  const contributor = await createContributor();
  const { rawKey, key } = await createKey(contributor.id);

  assert.notEqual(await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), minutesAfter(1)), null);
  assert.equal(await apiKeys.revokeApiKey(key.id, contributor.id, minutesAfter(2)), true, "soft revoke succeeds");
  assert.equal(await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), minutesAfter(3)), null, "revoked key is dead");
});

test("touch is throttled ≥5 min (D7): one write, then skipped, then written again", async () => {
  const { apiKeyAuth, apiKeys } = runtime;
  const contributor = await createContributor();
  const { rawKey } = await createKey(contributor.id);

  // First success (never used before): the write goes through.
  assert.notEqual(await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), minutesAfter(1)), null);
  let [row] = await apiKeys.listApiKeysForContributor(contributor.id);
  assert.equal(row.lastUsedAt, minutesAfter(1), "first use writes last_used_at");

  // Second success 1 minute later: inside the 5-min window → throttled,
  // the stored timestamp must NOT move.
  assert.notEqual(await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), minutesAfter(2)), null);
  [row] = await apiKeys.listApiKeysForContributor(contributor.id);
  assert.equal(row.lastUsedAt, minutesAfter(1), "second use within 5 min is throttled (D7)");

  // Third success 5 minutes after the write: >= threshold → writes again.
  assert.notEqual(await apiKeyAuth.resolveApiKeyContributor(bearerRequest(rawKey), minutesAfter(6)), null);
  [row] = await apiKeys.listApiKeysForContributor(contributor.id);
  assert.equal(row.lastUsedAt, minutesAfter(6), "use ≥5 min after the last write updates last_used_at");
});

test("resolveApiKeyContributor never writes or resolves for a non-Bearer Authorization", async () => {
  const { apiKeyAuth, apiKeys } = runtime;
  const contributor = await createContributor();
  const { rawKey } = await createKey(contributor.id);

  const request = new Request("https://osdb.test/api/cameras", {
    method: "POST",
    headers: { authorization: `Basic ${rawKey}` },
  });
  assert.equal(await apiKeyAuth.resolveApiKeyContributor(request, minutesAfter(1)), null);
  const [row] = await apiKeys.listApiKeysForContributor(contributor.id);
  assert.equal(row.lastUsedAt, null, "no touch for a rejected scheme");
});

// ---------------------------------------------------------------------------
// Pure-module guarantees
// ---------------------------------------------------------------------------

const MODULE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "app",
  "lib",
  "api-key-auth.ts",
);

test("api-key-auth.ts is pure: no cloudflare:workers import, no node:crypto", async () => {
  const source = await readFile(MODULE_PATH, "utf8");
  // Comments stripped first: the module's own doc text mentions
  // `cloudflare:workers` to explain what it does NOT import, so a raw-string
  // check would false-positive. Only the code (imports, expressions) is
  // inspected.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(code.includes("cloudflare:workers"), false, "no cloudflare:workers import");
  assert.equal(code.includes("node:crypto"), false, "no node:crypto import");
  assert.equal(/from\s*["']db\//.test(code), false, "no direct db import — only the ../../db/* harness-rewritten ones");
});
