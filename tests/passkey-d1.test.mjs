// Database-boundary tests for multi-method auth Fase C (t_36989e06):
// WebAuthn ceremony challenges, passkeys and one-time recovery codes.
//
// These run the REAL db/passkeys.ts (transpiled into the harness tree)
// against the REAL migration SQL (drizzle/0027 + 0028) replayed on an
// in-memory D1 adapter, so challenge hashing, single-use consume, TTL
// expiry sweep, COSE-key storage, signature-counter persistence and
// recovery-code issue/consume/count are exercised at runtime — not stubbed.
// Route-level behaviour (status codes, cookies, CSRF) is covered by
// tests/api-passkey.test.mjs with db/passkeys mocked.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
} from "./helpers/db-runtime-harness.mjs";

let runtime;

const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

beforeEach(async () => {
  if (!runtime) runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
});

after(async () => cleanupDbRuntime());

/** Create a real contributor row (the passkey/recovery tables FK to it). */
async function createContributor(email = "passkey@osdb.test") {
  const profile = await runtime.auth.createContributor({
    email,
    displayName: "Passkey Tester",
    password: "supersecret123",
  });
  return profile;
}

// ---------------------------------------------------------------------------
// WebAuthn ceremony challenges
// ---------------------------------------------------------------------------

test("createWebAuthnChallenge stores only the SHA-256 of the challenge with a 10-minute expiry", async () => {
  const { passkeys } = runtime;
  const contributor = await createContributor();
  const row = await passkeys.createWebAuthnChallenge({
    challenge: "raw-challenge-abc",
    kind: "register",
    contributorId: contributor.id,
    userHandle: "aGFuZGxl",
    now: "2026-08-01T00:00:00.000Z",
  });
  // A db leak cannot replay the ceremony: the raw challenge never lands.
  assert.equal(row.challengeHash, sha256Hex("raw-challenge-abc"));
  assert.notEqual(row.challengeHash, "raw-challenge-abc");
  assert.equal(row.kind, "register");
  assert.equal(row.contributorId, contributor.id);
  assert.equal(row.userHandle, "aGFuZGxl");
  assert.equal(row.createdAt, "2026-08-01T00:00:00.000Z");
  assert.equal(row.expiresAt, "2026-08-01T00:10:00.000Z");
  assert.equal(row.usedAt, null);
});

test("consumeWebAuthnChallenge is single-use and matches on the hash", async () => {
  const { passkeys } = runtime;
  const row = await passkeys.createWebAuthnChallenge({ challenge: "c1", kind: "login" });
  const consumed = await passkeys.consumeWebAuthnChallenge("c1", "2026-08-01T00:05:00.000Z");
  assert.ok(consumed);
  assert.equal(consumed.id, row.id);
  assert.equal(consumed.usedAt, "2026-08-01T00:05:00.000Z");
  // Replay of the same ceremony fails.
  assert.equal(await passkeys.consumeWebAuthnChallenge("c1", "2026-08-01T00:06:00.000Z"), null);
  // A different raw challenge does not collide with the stored hash.
  assert.equal(await passkeys.consumeWebAuthnChallenge("c2", "2026-08-01T00:05:00.000Z"), null);
});

test("consumeWebAuthnChallenge refuses expired challenges", async () => {
  const { passkeys } = runtime;
  await passkeys.createWebAuthnChallenge({
    challenge: "c1",
    kind: "login",
    now: "2026-08-01T00:00:00.000Z",
    ttlMs: 60_000,
  });
  assert.equal(
    await passkeys.consumeWebAuthnChallenge("c1", "2026-08-01T00:02:00.000Z"),
    null,
    "after the TTL the challenge is dead",
  );
  // Within the TTL (and still unused after the failed attempt) it consumes.
  assert.ok(await passkeys.consumeWebAuthnChallenge("c1", "2026-08-01T00:00:30.000Z"));
});

test("sweepExpiredWebAuthnChallenges removes only expired rows", async () => {
  const { passkeys } = runtime;
  await passkeys.createWebAuthnChallenge({
    challenge: "old",
    kind: "login",
    now: "2026-08-01T00:00:00.000Z",
    ttlMs: 60_000,
  });
  await passkeys.createWebAuthnChallenge({
    challenge: "fresh",
    kind: "login",
    now: "2026-08-01T00:05:00.000Z",
    ttlMs: 60_000,
  });
  const removed = await passkeys.sweepExpiredWebAuthnChallenges("2026-08-01T00:02:00.000Z");
  assert.equal(removed, 1);
  assert.ok(
    await passkeys.consumeWebAuthnChallenge("fresh", "2026-08-01T00:05:30.000Z"),
    "the fresh row survives the sweep",
  );
});

// ---------------------------------------------------------------------------
// Passkeys
// ---------------------------------------------------------------------------

test("createPasskey stores the COSE key; listPasskeys never returns it", async () => {
  const { passkeys } = runtime;
  const contributor = await createContributor();
  const stored = await passkeys.createPasskey({
    contributorId: contributor.id,
    credentialId: "cred-1",
    publicKey: "cose-public-key-bytes",
    counter: 0,
    transports: ["internal", "usb"],
    now: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(stored.credentialId, "cred-1");
  assert.equal(stored.publicKey, "cose-public-key-bytes");
  assert.equal(stored.transports, '["internal","usb"]');

  const list = await passkeys.listPasskeys(contributor.id);
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), ["createdAt", "credentialId", "id", "transports"]);
});

test("createPasskey rejects a duplicate credential_id (re-enrollment of the same key)", async () => {
  const { passkeys } = runtime;
  const contributor = await createContributor();
  await passkeys.createPasskey({
    contributorId: contributor.id,
    credentialId: "dup",
    publicKey: "k1",
    counter: 0,
  });
  const again = await passkeys.createPasskey({
    contributorId: contributor.id,
    credentialId: "dup",
    publicKey: "k2",
    counter: 0,
  });
  assert.equal(again, null);
  const list = await passkeys.listPasskeys(contributor.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].credentialId, "dup");
});

test("findPasskeyByCredentialId returns the full row including the COSE key", async () => {
  const { passkeys } = runtime;
  const contributor = await createContributor();
  await passkeys.createPasskey({
    contributorId: contributor.id,
    credentialId: "cred-x",
    publicKey: "cose-x",
    counter: 3,
  });
  const found = await passkeys.findPasskeyByCredentialId("cred-x");
  assert.ok(found);
  assert.equal(found.publicKey, "cose-x");
  assert.equal(found.counter, 3);
  assert.equal(await passkeys.findPasskeyByCredentialId("nope"), null);
});

test("updatePasskeyCounter persists the new signature counter", async () => {
  const { passkeys } = runtime;
  const contributor = await createContributor();
  const stored = await passkeys.createPasskey({
    contributorId: contributor.id,
    credentialId: "cred-c",
    publicKey: "cose",
    counter: 0,
  });
  await passkeys.updatePasskeyCounter(stored.id, 7);
  const found = await passkeys.findPasskeyByCredentialId("cred-c");
  assert.equal(found.counter, 7);
});

test("deletePasskey removes only the contributor's own credential", async () => {
  const { passkeys } = runtime;
  const first = await createContributor("a@osdb.test");
  const second = await createContributor("b@osdb.test");
  await passkeys.createPasskey({
    contributorId: first.id,
    credentialId: "cred-a",
    publicKey: "k",
    counter: 0,
  });
  await passkeys.createPasskey({
    contributorId: second.id,
    credentialId: "cred-b",
    publicKey: "k",
    counter: 0,
  });
  assert.equal(
    await passkeys.deletePasskey(first.id, "cred-b"),
    false,
    "cannot delete another contributor's passkey",
  );
  assert.equal(await passkeys.deletePasskey(first.id, "cred-a"), true);
  assert.equal((await passkeys.listPasskeys(first.id)).length, 0);
});

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

test("issueRecoveryCodes returns 10 distinct plaintext codes; only their hashes are stored", async () => {
  const { passkeys } = runtime;
  const contributor = await createContributor();
  const codes = await passkeys.issueRecoveryCodes(contributor.id, undefined, "2026-08-01T00:00:00.000Z");
  assert.equal(codes.length, 10);
  for (const code of codes) {
    assert.match(code, /^[A-Za-z0-9_-]{4}(?:-[A-Za-z0-9_-]{4}){3}$/, code);
  }
  assert.equal(new Set(codes).size, 10);

  // The rows hold only SHA-256 hex values — never the plaintext.
  const rows = await runtime.env.DB.prepare("SELECT code_hash FROM recovery_codes").all();
  assert.equal(rows.results.length, 10);
  for (const row of rows.results) {
    assert.equal(codes.includes(row.code_hash), false, "plaintext must never be stored");
    assert.equal(codes.some((code) => sha256Hex(code) === row.code_hash), true);
  }
  assert.equal(await passkeys.countUnusedRecoveryCodes(contributor.id), 10);
});

test("consumeRecoveryCode is single-use; wrong and reused codes fail the same way", async () => {
  const { passkeys } = runtime;
  const contributor = await createContributor();
  const [code] = await passkeys.issueRecoveryCodes(contributor.id);
  assert.equal(await passkeys.consumeRecoveryCode(contributor.id, code), true);
  assert.equal(await passkeys.consumeRecoveryCode(contributor.id, code), false, "second use rejected");
  assert.equal(await passkeys.consumeRecoveryCode(contributor.id, "xxxx-xxxx-xxxx-xxxx"), false);
  assert.equal(await passkeys.countUnusedRecoveryCodes(contributor.id), 9);
});

test("re-issuing recovery codes revokes every previous unused code", async () => {
  const { passkeys } = runtime;
  const contributor = await createContributor();
  const firstBatch = await passkeys.issueRecoveryCodes(contributor.id);
  const secondBatch = await passkeys.issueRecoveryCodes(contributor.id);
  assert.equal(await passkeys.countUnusedRecoveryCodes(contributor.id), 10);
  for (const code of firstBatch) {
    assert.equal(
      await passkeys.consumeRecoveryCode(contributor.id, code),
      false,
      "an old-batch code must die with the re-issue",
    );
  }
  assert.equal(await passkeys.consumeRecoveryCode(contributor.id, secondBatch[0]), true);
});
