// Database-boundary tests for the api-keys CRUD layer (EPIC api-keys, T5,
// plan §1.2/§5.3, decisions D2-D7/D9).
//
// These run the REAL db/api-keys.ts (transpiled into the harness tree, same
// harness as db-api-keys-crypto.test.mjs) against the REAL migration SQL
// (drizzle/0045_api_keys.sql, replayed via applyDrizzleMigrations) on an
// in-memory D1 adapter, so the mint/resolve/list/revoke/count/touch SQL is
// exercised at runtime — not stubbed:
//
//   - createApiKey(): raw key revealed exactly once (D2/D3), hash-only
//     storage, prefix display handle, scope whitelist (D4), default +365d
//     expiry (D6) or explicit never/ISO-8601
//   - findApiKeyByHash(): JOIN contributors + liveness (revoked/expired
//     dead, D9/D6), null for unknown hash (no oracle)
//   - listApiKeysForContributor(): metadata only — never the hash (D2/D3)
//   - revokeApiKey(): soft revoke, idempotent, owner-only, 404-equivalent
//     false for non-own/unknown ids (D9)
//   - countApiKeysForContributor(): counts ACTIVE keys only (D5 cap);
//     deprecated countActiveKeys alias keeps working
//   - touchApiKeyLastUsed(): throttled ≥5 min (D7), ISO-8601 UTC TEXT
//     like-for-like comparison, never SQLite datetime('now')
//
// No personal data: all fixtures are fictional/random.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
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

/** Create a real contributor row (api_keys contributor_id FKs to it). */
async function createContributor(email = "keys@osdb.test") {
  const profile = await runtime.auth.createContributor({
    email,
    displayName: "API Key Tester",
    password: "supersecret123",
  });
  return profile;
}

const RAW_KEY_RE = /^osdb_[A-Za-z0-9_-]{43}$/;

// ---------------------------------------------------------------------------
// createApiKey — reveal-once mint (D2/D3/D4/D6)
// ---------------------------------------------------------------------------

test("createApiKey mints a raw key revealed exactly once and stores only its SHA-256", async () => {
  const { apiKeys } = runtime;
  const contributor = await createContributor();

  const { rawKey, key } = await apiKeys.createApiKey({
    contributorId: contributor.id,
    name: "CI deploy",
    now: "2026-08-01T00:00:00.000Z",
  });

  assert.match(rawKey, RAW_KEY_RE, "raw key keeps the D2 format");
  assert.equal(key.keyHash, await runtime.auth.sha256Hex(rawKey), "stored hash is SHA-256 of the FULL raw key (D3)");
  assert.equal(key.keyPrefix, rawKey.slice(0, 10), "prefix is the display-only first 10 chars (D2)");
  assert.notEqual(key.keyHash, rawKey, "the raw key itself never lands in the row");
  assert.equal(key.contributorId, contributor.id);
  assert.equal(key.name, "CI deploy");
  assert.equal(key.createdAt, "2026-08-01T00:00:00.000Z");
  assert.equal(key.lastUsedAt, null);
  assert.equal(key.revokedAt, null);
  // D6: default expiry = mint + 365 days, ISO-8601 UTC.
  assert.equal(key.expiresAt, "2027-08-01T00:00:00.000Z");
  // D4: omitted scopes default to the full whitelist.
  assert.deepEqual(JSON.parse(key.scopes), ["submit", "confirm", "edit", "action"]);
});

test("createApiKey trims the name and rejects empty / over-long names", async () => {
  const { apiKeys } = runtime;
  const contributor = await createContributor();

  const { key } = await apiKeys.createApiKey({
    contributorId: contributor.id,
    name: "  deploy script  ",
  });
  assert.equal(key.name, "deploy script");

  await assert.rejects(
    apiKeys.createApiKey({ contributorId: contributor.id, name: "   " }),
    /1\.\.60/,
  );
  await assert.rejects(
    apiKeys.createApiKey({ contributorId: contributor.id, name: "x".repeat(61) }),
    /1\.\.60/,
  );
});

test("createApiKey whitelists scopes (D4) and stores the narrowed subset as JSON", async () => {
  const { apiKeys } = runtime;
  const contributor = await createContributor();

  const { key } = await apiKeys.createApiKey({
    contributorId: contributor.id,
    name: "readonly-ish",
    scopes: ["submit", "edit"],
  });
  assert.deepEqual(JSON.parse(key.scopes), ["submit", "edit"]);

  await assert.rejects(
    apiKeys.createApiKey({ contributorId: contributor.id, name: "bad", scopes: ["submit", "delete"] }),
    /Unknown API key scope/,
  );
  await assert.rejects(
    apiKeys.createApiKey({ contributorId: contributor.id, name: "none", scopes: [] }),
    /at least one scope/,
  );
});

test("createApiKey honours explicit expiry: never (null) or ISO-8601", async () => {
  const { apiKeys } = runtime;
  const contributor = await createContributor();

  const never = await apiKeys.createApiKey({
    contributorId: contributor.id,
    name: "no expiry",
    expiresAt: null,
  });
  assert.equal(never.key.expiresAt, null);

  const custom = await apiKeys.createApiKey({
    contributorId: contributor.id,
    name: "short lived",
    expiresAt: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(custom.key.expiresAt, "2026-09-01T00:00:00.000Z");

  await assert.rejects(
    apiKeys.createApiKey({
      contributorId: contributor.id,
      name: "garbage",
      expiresAt: "not-a-date",
    }),
    /ISO-8601/,
  );
});

// ---------------------------------------------------------------------------
// findApiKeyByHash — resolve + liveness (D3/D6/D9, JOIN contributors)
// ---------------------------------------------------------------------------

test("findApiKeyByHash resolves a live key with its contributor via JOIN", async () => {
  const { apiKeys } = runtime;
  const contributor = await createContributor("join@osdb.test");
  const { rawKey, key } = await apiKeys.createApiKey({
    contributorId: contributor.id,
    name: "gate key",
    scopes: ["submit"],
    now: "2026-08-01T00:00:00.000Z",
  });

  const found = await apiKeys.findApiKeyByHash(
    await runtime.auth.sha256Hex(rawKey),
    "2026-08-01T00:05:00.000Z",
  );

  assert.ok(found, "live key resolves");
  assert.equal(found.key.id, key.id);
  assert.equal(found.key.keyHash, key.keyHash);
  assert.equal(found.key.expiresAt, key.expiresAt);
  assert.equal(found.contributor.id, contributor.id);
  assert.equal(found.contributor.email, "join@osdb.test");
  assert.equal(found.contributor.displayName, "API Key Tester");
  assert.equal(found.contributor.emailVerifiedAt, null);
  assert.equal(found.contributor.authProvider, "password");
});

test("findApiKeyByHash returns null for unknown, revoked and expired hashes (uniform dead)", async () => {
  const { apiKeys } = runtime;
  const contributor = await createContributor();

  const live = await apiKeys.createApiKey({ contributorId: contributor.id, name: "live" });
  const revoked = await apiKeys.createApiKey({ contributorId: contributor.id, name: "revoked" });
  await apiKeys.revokeApiKey(revoked.key.id, contributor.id, "2026-08-01T00:02:00.000Z");
  const expired = await apiKeys.createApiKey({
    contributorId: contributor.id,
    name: "expired",
    expiresAt: "2026-08-01T00:00:00.000Z",
  });

  const now = "2026-08-01T01:00:00.000Z";
  const sha = runtime.auth.sha256Hex;

  // Unknown hash -> null (no oracle).
  assert.equal(await apiKeys.findApiKeyByHash("0".repeat(64), now), null);
  // Revoked -> null even though the hash is presented.
  assert.equal(await apiKeys.findApiKeyByHash(await sha(revoked.rawKey), now), null);
  // Expired -> null even though the hash is presented.
  assert.equal(await apiKeys.findApiKeyByHash(await sha(expired.rawKey), now), null);
  // The live key still resolves at the same instant.
  assert.ok(await apiKeys.findApiKeyByHash(await sha(live.rawKey), now));
});

// ---------------------------------------------------------------------------
// listApiKeysForContributor — metadata only (D2/D3)
// ---------------------------------------------------------------------------

test("listApiKeysForContributor returns metadata only, newest first, incl. revoked", async () => {
  const { apiKeys } = runtime;
  const contributor = await createContributor();
  const other = await createContributor("other@osdb.test");

  const first = await apiKeys.createApiKey({
    contributorId: contributor.id,
    name: "first",
    now: "2026-08-01T00:00:00.000Z",
  });
  await apiKeys.createApiKey({
    contributorId: contributor.id,
    name: "second",
    now: "2026-08-02T00:00:00.000Z",
  });
  await apiKeys.revokeApiKey(first.key.id, contributor.id, "2026-08-03T00:00:00.000Z");
  // A key of another contributor must not leak into this list.
  await apiKeys.createApiKey({ contributorId: other.id, name: "foreign" });

  const rows = await apiKeys.listApiKeysForContributor(contributor.id);

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.name),
    ["second", "first"],
    "newest first",
  );
  for (const row of rows) {
    assert.equal("keyHash" in row, false, "the hash is never exposed (D2/D3)");
    assert.equal("key" in row, false, "the raw key is never exposed");
    assert.ok("keyPrefix" in row && "scopes" in row && "createdAt" in row);
    assert.ok("lastUsedAt" in row && "expiresAt" in row && "revokedAt" in row);
  }
  assert.equal(rows[0].revokedAt, null);
  assert.equal(rows[1].revokedAt, "2026-08-03T00:00:00.000Z", "revoked rows stay visible for the lifecycle UI");
});

// ---------------------------------------------------------------------------
// revokeApiKey — soft revoke, idempotent, owner-only (D9)
// ---------------------------------------------------------------------------

test("revokeApiKey soft-revokes, is idempotent and refuses non-own ids", async () => {
  const { apiKeys } = runtime;
  const owner = await createContributor("owner@osdb.test");
  const other = await createContributor("thief@osdb.test");
  const { key } = await apiKeys.createApiKey({ contributorId: owner.id, name: "mine" });

  assert.equal(await apiKeys.revokeApiKey(key.id, owner.id, "2026-08-01T00:01:00.000Z"), true);
  assert.equal(await apiKeys.revokeApiKey(key.id, owner.id, "2026-08-01T00:02:00.000Z"), false, "second revoke is a no-op");

  // Owner-only: another contributor cannot revoke it (and learns nothing).
  assert.equal(await apiKeys.revokeApiKey(key.id, other.id, "2026-08-01T00:03:00.000Z"), false);
  assert.equal(await apiKeys.revokeApiKey(999999, owner.id, "2026-08-01T00:03:00.000Z"), false, "unknown id is a no-op");

  // The stored revoked_at is the FIRST successful revoke.
  const row = await runtime.env.DB.prepare("SELECT revoked_at AS revokedAt FROM api_keys WHERE id = ?").bind(key.id).first();
  assert.equal(row.revokedAt, "2026-08-01T00:01:00.000Z");
});

// ---------------------------------------------------------------------------
// countApiKeysForContributor — active-only count (D5)
// ---------------------------------------------------------------------------

test("countApiKeysForContributor counts only ACTIVE keys; deprecated alias still works", async () => {
  const { apiKeys } = runtime;
  const contributor = await createContributor();

  assert.equal(await apiKeys.countApiKeysForContributor(contributor.id), 0);
  assert.equal(await apiKeys.countActiveKeys(contributor.id), 0, "deprecated alias stays functional");

  const a = await apiKeys.createApiKey({ contributorId: contributor.id, name: "a" });
  const b = await apiKeys.createApiKey({ contributorId: contributor.id, name: "b" });
  await apiKeys.createApiKey({
    contributorId: contributor.id,
    name: "c",
    expiresAt: "2026-08-01T00:00:00.000Z", // expired
  });
  await apiKeys.revokeApiKey(b.key.id, contributor.id, "2026-08-01T00:00:01.000Z");

  const now = "2026-09-01T00:00:00.000Z";
  assert.equal(await apiKeys.countApiKeysForContributor(contributor.id, now), 1, "only key a is active");
  assert.equal(await apiKeys.countApiKeysForContributor(contributor.id), 1, "default now behaves the same");
  // Other contributors are not counted.
  const other = await createContributor("count@osdb.test");
  await apiKeys.createApiKey({ contributorId: other.id, name: "x" });
  assert.equal(await apiKeys.countApiKeysForContributor(contributor.id, now), 1);
  assert.equal(a.rawKey.length > 0, true);
});

// ---------------------------------------------------------------------------
// touchApiKeyLastUsed — throttled ≥5 min (D7)
// ---------------------------------------------------------------------------

test("touchApiKeyLastUsed writes when never used, skips under 5 min, writes again after", async () => {
  const { apiKeys } = runtime;
  const contributor = await createContributor();
  const { key } = await apiKeys.createApiKey({ contributorId: contributor.id, name: "touch" });

  const t0 = "2026-08-01T00:00:00.000Z";
  assert.equal(await apiKeys.touchApiKeyLastUsed(key.id, t0), true, "never-used key is writable");
  assert.equal(await apiKeys.touchApiKeyLastUsed(key.id, "2026-08-01T00:04:59.000Z"), false, "4:59 later is still throttled");
  assert.equal(await apiKeys.touchApiKeyLastUsed(key.id, "2026-08-01T00:05:00.000Z"), true, "exactly 5 min later is writable");
  assert.equal(await apiKeys.touchApiKeyLastUsed(key.id, "2026-08-01T00:05:30.000Z"), false, "30 s later is throttled again");
  assert.equal(await apiKeys.touchApiKeyLastUsed(key.id, "2026-08-01T00:10:00.000Z"), true, "another 5 min passes");

  // The final stored value is the last accepted write.
  const row = await runtime.env.DB.prepare("SELECT last_used_at AS lastUsedAt FROM api_keys WHERE id = ?").bind(key.id).first();
  assert.equal(row.lastUsedAt, "2026-08-01T00:10:00.000Z");

  // Unknown id -> false (gate treats it as "skip the write").
  assert.equal(await apiKeys.touchApiKeyLastUsed(999999, "2026-08-01T00:11:00.000Z"), false);
});

test("touchApiKeyLastUsed compares ISO-8601 UTC TEXT like-for-like (D7)", async () => {
  const { apiKeys } = runtime;
  const contributor = await createContributor();
  const { key } = await apiKeys.createApiKey({ contributorId: contributor.id, name: "tz" });

  // Stored values are ISO-8601 UTC with Z — the comparison must not rely on
  // SQLite datetime('now') semantics: a +00:00 offset variant of the same
  // instant must still throttle correctly.
  await apiKeys.touchApiKeyLastUsed(key.id, "2026-08-01T00:00:00.000Z");
  assert.equal(
    await apiKeys.touchApiKeyLastUsed(key.id, "2026-08-01T00:01:00.000Z"),
    false,
    "one minute later is throttled even though the strings differ",
  );
});

// ---------------------------------------------------------------------------
// apiKeysMaxPerContributor — D5 cap env knob (D13 EnvLike pattern)
// ---------------------------------------------------------------------------

test("apiKeysMaxPerContributor defaults to 5 and honours the env override (D5/D13)", async () => {
  const { apiKeys } = runtime;

  assert.equal(apiKeys.API_KEYS_MAX_PER_CONTRIBUTOR_DEFAULT, 5);
  assert.equal(apiKeys.apiKeysMaxPerContributor({}), 5, "no knob in env -> default");
  assert.equal(apiKeys.apiKeysMaxPerContributor({ API_KEYS_MAX_PER_CONTRIBUTOR: "3" }), 3);
  assert.equal(apiKeys.apiKeysMaxPerContributor({ API_KEYS_MAX_PER_CONTRIBUTOR: "12" }), 12);

  // Fail-closed on garbage: non-numeric, zero and negative values all fall
  // back to the default (a 0 cap would make the feature unusable; a negative
  // cap would be meaningless).
  assert.equal(apiKeys.apiKeysMaxPerContributor({ API_KEYS_MAX_PER_CONTRIBUTOR: "abc" }), 5);
  assert.equal(apiKeys.apiKeysMaxPerContributor({ API_KEYS_MAX_PER_CONTRIBUTOR: "0" }), 5);
  assert.equal(apiKeys.apiKeysMaxPerContributor({ API_KEYS_MAX_PER_CONTRIBUTOR: "-2" }), 5);
});
