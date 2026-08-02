// Database-boundary tests for external OIDC login (Fase D, t_87f24b2d).
//
// These run the REAL db/oidc.ts against the REAL migration SQL (0030 +
// everything before it) replayed on an in-memory D1 adapter, so the
// single-use state rows, the placeholder-email account creation, the
// atomic manual merge and the expiry sweep are exercised at runtime — not
// stubbed. Route-level behaviour (redirects, cookies, status codes) is
// covered by tests/oidc-flow.test.mjs with db/oidc mocked.
//
// Fase D constraints asserted here:
//   - the provider email is NEVER persisted (only sub + verified flag);
//   - state/merge tokens are single-use and short-lived;
//   - an OIDC-only account cannot authenticate with a password.

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

const NOW = "2026-08-02T08:00:00.000Z";

// ---------------------------------------------------------------------------
// OIDC state (PKCE half)
// ---------------------------------------------------------------------------

test("createOidcState stores only the hash; consume is single-use and provider-bound", async () => {
  const { oidc, env } = runtime;

  const { rawState, codeVerifier } = await oidc.createOidcState({
    provider: "github",
    redirectTo: "/account",
    now: NOW,
  });
  assert.ok(rawState.length >= 32);
  assert.ok(codeVerifier.length >= 32);

  // The raw state is never stored: only its SHA-256.
  const row = await env.DB.prepare("SELECT state_hash, code_verifier FROM oidc_states").first();
  assert.notEqual(row.state_hash, rawState);
  assert.equal(row.code_verifier, codeVerifier, "the verifier must survive for the callback");

  // First consume: ok.
  const consumed = await oidc.consumeOidcState(rawState, "github", NOW);
  assert.deepEqual(consumed, { codeVerifier, redirectTo: "/account" });

  // Replay: the conditional UPDATE makes the row single-use.
  assert.equal(await oidc.consumeOidcState(rawState, "github", NOW), null);

  // Provider mismatch: even before consumption the row belongs to 'github'.
  const second = await oidc.createOidcState({ provider: "google", redirectTo: "/account", now: NOW });
  assert.equal(await oidc.consumeOidcState(second.rawState, "github", NOW), null);
  assert.ok(await oidc.consumeOidcState(second.rawState, "google", NOW));
});

test("consumeOidcState refuses expired state rows", async () => {
  const { oidc } = runtime;
  const { rawState } = await oidc.createOidcState({
    provider: "github",
    redirectTo: "/account",
    // 11 minutes in the past: the 10-minute TTL has already lapsed.
    now: "2026-08-02T07:49:00.000Z",
  });
  assert.equal(await oidc.consumeOidcState(rawState, "github", NOW), null);
});

// ---------------------------------------------------------------------------
// Account creation (no provider email persisted)
// ---------------------------------------------------------------------------

test("createOidcContributor stores a placeholder email, never the provider address", async () => {
  const { oidc } = runtime;

  const verified = await oidc.createOidcContributor({
    provider: "github",
    externalSub: "98765",
    emailVerified: true,
    displayName: "GitHub User",
    now: NOW,
  });

  assert.equal(verified.authProvider, "github");
  assert.equal(verified.externalSub, "98765");
  assert.match(verified.email, /^oidc\.github\.98765@invalid$/);
  assert.notEqual(verified.email, "github-user@example.org");
  assert.equal(verified.emailVerifiedAt, NOW, "verified flag stamps email_verified_at");

  // Unverified identity: no stamp.
  const unverified = await oidc.createOidcContributor({
    provider: "google",
    externalSub: "google-sub-1",
    emailVerified: false,
    displayName: null,
    now: NOW,
  });
  assert.equal(unverified.emailVerifiedAt, null);
  assert.match(unverified.email, /^oidc\.google\.google-sub-1@invalid$/);
});

test("an OIDC-only account cannot authenticate with a password", async () => {
  const { oidc, auth } = runtime;
  await oidc.createOidcContributor({
    provider: "github",
    externalSub: "98765",
    emailVerified: true,
    displayName: "GitHub User",
    now: NOW,
  });
  const contributor = await auth.findContributorByEmail("oidc.github.98765@invalid");
  // The stored hash is unguessable random; any password fails.
  assert.equal(await auth.verifyPassword("anything-at-all", contributor.passwordHash), false);
});

test("findContributorByExternalIdentity resolves the fast path", async () => {
  const { oidc } = runtime;
  await oidc.createOidcContributor({
    provider: "github",
    externalSub: "98765",
    emailVerified: true,
    displayName: "GitHub User",
    now: NOW,
  });
  const found = await oidc.findContributorByExternalIdentity("github", "98765");
  assert.ok(found);
  assert.equal(found.displayName, "GitHub User");
  assert.equal(await oidc.findContributorByExternalIdentity("google", "98765"), null);
  assert.equal(await oidc.findContributorByExternalIdentity("github", "other-sub"), null);
});

// ---------------------------------------------------------------------------
// Manual merge (email conflict)
// ---------------------------------------------------------------------------

test("merge request is single-use and links the identity onto the proven account", async () => {
  const { oidc, auth } = runtime;

  const existing = await auth.createContributor({
    email: "existing@example.org",
    displayName: "Existing",
    password: "supersecret123",
  });

  const { rawToken } = await oidc.createOidcMergeRequest({
    provider: "github",
    externalSub: "98765",
    contributorId: existing.id,
    emailVerified: true,
    now: NOW,
  });

  const pending = await oidc.getOidcMergeRequest(rawToken, NOW);
  assert.ok(pending);
  assert.equal(pending.contributorId, existing.id);
  assert.equal(pending.provider, "github");
  assert.equal(pending.externalSub, "98765");
  assert.equal(pending.emailVerified, 1, "the provider's verified flag is captured");

  // Wrong provider cannot consume the merge.
  assert.equal(await oidc.linkExternalIdentity(rawToken, "google", "98765", NOW), null);
  assert.ok(await oidc.getOidcMergeRequest(rawToken, NOW), "still pending after the mismatch");

  const linked = await oidc.linkExternalIdentity(rawToken, "github", "98765", NOW);
  assert.ok(linked);
  assert.equal(linked.id, existing.id);
  assert.equal(linked.authProvider, "github");
  assert.equal(linked.externalSub, "98765");
  // The provider asserted verification and the account was unverified → the
  // link stamps email_verified_at.
  assert.equal(linked.emailVerifiedAt, NOW);

  // Single-use: the token is gone.
  assert.equal(await oidc.getOidcMergeRequest(rawToken, NOW), null);
  assert.equal(await oidc.linkExternalIdentity(rawToken, "github", "98765", NOW), null);

  // Fast path now resolves.
  const found = await oidc.findContributorByExternalIdentity("github", "98765");
  assert.equal(found.email, "existing@example.org");
});

test("merge does not overwrite an already-verified email stamp", async () => {
  const { oidc, auth } = runtime;
  const existing = await auth.createContributor({
    email: "verified@example.org",
    displayName: "Verified",
    password: "supersecret123",
  });
  // Simulate the account having completed email verification earlier.
  await runtime.env.DB.prepare(
    "UPDATE contributors SET email_verified_at = ? WHERE id = ?",
  )
    .bind("2026-07-01T00:00:00.000Z", existing.id)
    .run();

  const { rawToken } = await oidc.createOidcMergeRequest({
    provider: "google",
    externalSub: "g-sub",
    contributorId: existing.id,
    emailVerified: true,
    now: NOW,
  });
  const linked = await oidc.linkExternalIdentity(rawToken, "google", "g-sub", NOW);
  assert.equal(linked.emailVerifiedAt, "2026-07-01T00:00:00.000Z");
});

test("merge request expires and is refused after its TTL", async () => {
  const { oidc, auth } = runtime;
  const existing = await auth.createContributor({
    email: "existing@example.org",
    displayName: "Existing",
    password: "supersecret123",
  });
  const { rawToken } = await oidc.createOidcMergeRequest({
    provider: "github",
    externalSub: "98765",
    contributorId: existing.id,
    emailVerified: false,
    // 16 minutes before NOW: the 15-minute merge TTL has lapsed.
    now: "2026-08-02T07:44:00.000Z",
  });
  assert.equal(await oidc.getOidcMergeRequest(rawToken, NOW), null);
  assert.equal(await oidc.linkExternalIdentity(rawToken, "github", "98765", NOW), null);
});

// ---------------------------------------------------------------------------
// Expiry sweep
// ---------------------------------------------------------------------------

test("sweepOidcExpired removes lapsed state and merge rows only", async () => {
  const { oidc, auth } = runtime;

  await oidc.createOidcState({ provider: "github", redirectTo: "/account", now: "2026-08-02T07:40:00.000Z" });
  const fresh = await oidc.createOidcState({ provider: "github", redirectTo: "/account", now: NOW });

  const existing = await auth.createContributor({
    email: "existing@example.org",
    displayName: "Existing",
    password: "supersecret123",
  });
  await oidc.createOidcMergeRequest({
    provider: "github",
    externalSub: "98765",
    contributorId: existing.id,
    emailVerified: false,
    now: "2026-08-02T07:40:00.000Z",
  });

  const result = await oidc.sweepOidcExpired(NOW);
  assert.deepEqual(result, { states: 1, mergeRequests: 1 });

  // The fresh state row survives.
  assert.ok(await oidc.consumeOidcState(fresh.rawState, "github", NOW));
});
