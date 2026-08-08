// Database-boundary tests for contributor auth (STATUS gap #1, ADR 0013).
//
// These run the REAL db/auth.ts (transpiled into the harness tree) against
// the REAL migration SQL replayed on an in-memory D1 adapter, so hashing,
// session storage, expiry, revocation, and attribution are exercised at
// runtime — not stubbed. Route-level behaviour (cookies, CSRF, status codes)
// is covered by tests/api-auth.test.mjs with db/auth mocked.

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

const NOW = "2026-08-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

test("hashPassword produces a self-describing PBKDF2 string and verifies", async () => {
  const { auth } = runtime;
  const hash = await auth.hashPassword("correct horse battery staple");
  assert.match(
    hash,
    new RegExp(`^pbkdf2\\$${auth.PBKDF2_ITERATIONS}\\$[A-Za-z0-9_-]+\\$[A-Za-z0-9_-]+$`),
    "the hash embeds the current iteration count (ADR 0013)",
  );
  assert.equal(await auth.verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await auth.verifyPassword("wrong password", hash), false);
  // Each hash carries a fresh salt.
  const secondHash = await auth.hashPassword("correct horse battery staple");
  assert.notEqual(hash, secondHash);
});

test("verifyPassword rejects malformed stored hashes", async () => {
  const { auth } = runtime;
  for (const bad of ["", "plaintext", "pbkdf2$210000$salt$hash$extra", "argon2$1$a$b", "pbkdf2$abc$salt$hash"]) {
    assert.equal(await auth.verifyPassword("anything", bad), false, bad);
  }
});

// ---------------------------------------------------------------------------
// Iteration-count embedding (ADR 0013) — bump safety
// ---------------------------------------------------------------------------

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Build a `pbkdf2$<iterations>$<saltB64>$<hashB64>` hash at an explicit count. */
async function pbkdf2HashAt(password, iterations) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    256,
  );
  return `pbkdf2$${iterations}$${base64UrlEncode(salt)}$${base64UrlEncode(new Uint8Array(derived))}`;
}

test("verifyPassword honours the stored iteration count — a constant bump never locks out existing hashes", async () => {
  const { auth } = runtime;
  const password = "correct horse battery staple";

  // Simulate the OWASP bump scenario (AUTH_OPTIONS §8): a hash stored at a
  // count different from the current code constant. It must verify using its
  // OWN embedded count — the pre-fix code derived at PBKDF2_ITERATIONS and
  // would have returned false here, invalidating every existing password.
  const otherCount = auth.PBKDF2_ITERATIONS + 42_000;
  const olderHash = await pbkdf2HashAt(password, otherCount);
  assert.match(olderHash, new RegExp(`^pbkdf2\\$${otherCount}\\$`), "fixture embeds the older count");
  assert.equal(await auth.verifyPassword(password, olderHash), true, "old-count hash verifies");
  assert.equal(await auth.verifyPassword("wrong password", olderHash), false);

  // A hash at the current constant still verifies, and the two hashes differ
  // (different salts) while both accepting the same password.
  const currentHash = await auth.hashPassword(password);
  assert.equal(await auth.verifyPassword(password, currentHash), true);
  assert.notEqual(olderHash, currentHash);
});

test("verifyPassword falls back to the constant for legacy 3-part hashes", async () => {
  const { auth } = runtime;
  const password = "correct horse battery staple";
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: auth.PBKDF2_ITERATIONS },
    keyMaterial,
    256,
  );
  const legacy = `pbkdf2$${base64UrlEncode(salt)}$${base64UrlEncode(new Uint8Array(derived))}`;
  assert.equal(await auth.verifyPassword(password, legacy), true, "legacy hash verifies at the constant");
  assert.equal(await auth.verifyPassword("wrong password", legacy), false);
});

// ---------------------------------------------------------------------------
// QA#3 F1 — timing-oracle neutralisation (unknown-email dummy derivation)
// ---------------------------------------------------------------------------

test("verifyPasswordDummy derives a real PBKDF2 at the current count and always answers false", async () => {
  const { auth } = runtime;
  const started = Date.now();
  const result = await auth.verifyPasswordDummy("any-password-string");
  const elapsed = Date.now() - started;
  assert.equal(result, false, "the dummy verify always answers false (callers discard it)");
  assert.ok(elapsed >= 10, `the dummy derivation must actually pay the PBKDF2 cost (took ${elapsed}ms)`);
});

test("authenticateContributor on an unknown email pays the dummy derivation (no timing oracle)", async () => {
  const { auth } = runtime;
  // Warm-up: the first PBKDF2 in a fresh isolate can include JIT cost.
  await auth.verifyPasswordDummy("warmup");
  const unknownStart = Date.now();
  const unknown = await auth.authenticateContributor("nobody@example.org", "WrongPass-12345!");
  const unknownElapsed = Date.now() - unknownStart;
  assert.equal(unknown, null, "unknown email still answers the generic null");

  // The registered-email path with a wrong password must take comparable time:
  await auth.createContributor({ email: "timing@example.org", displayName: "Timing", password: "supersecret123" });
  const realStart = Date.now();
  const wrong = await auth.authenticateContributor("timing@example.org", "WrongPass-12345!");
  const realElapsed = Date.now() - realStart;
  assert.equal(wrong, null, "wrong password still answers the generic null");
  // Ratio guard: the unknown path is at least 1/3 of the real verify cost —
  // a pre-fix fast return (~0ms) would fail this by an order of magnitude.
  assert.ok(
    unknownElapsed >= realElapsed / 3,
    `unknown-email path must pay ~the same PBKDF2 cost (unknown=${unknownElapsed}ms, real=${realElapsed}ms)`,
  );
});

// ---------------------------------------------------------------------------
// QA#3 F4 — registrations_ip_log caller-key derivation (keyed HMAC)
// ---------------------------------------------------------------------------

test("registrationIpHash with a configured key is a keyed HMAC, not an invertible SHA-256", async () => {
  const { auth } = runtime;
  const key = "server-secret-please-rotate";
  const ip = "203.0.113.7";
  const derived = await auth.registrationIpHash(ip, key);
  // Fixed output shape: 128 bits = 32 hex chars, independent of branch.
  assert.match(derived, /^[0-9a-f]{32}$/, "keyed output is 32 hex chars (128 bits)");
  // Deterministic: same input+key → same stored key (the cap COUNT needs it).
  assert.equal(await auth.registrationIpHash(ip, key), derived);
  // NOT the plain SHA-256 of the IP (which a precomputed IPv4 table would
  // invert): the HMAC output must differ from the raw digest.
  const plain = await auth.sha256Hex(ip);
  assert.notEqual(derived, plain, "the keyed value is not the invertible SHA-256");
  assert.notEqual(derived, plain.slice(0, 32), "nor a truncation of it");
  // Different key → different stored value for the same IP.
  assert.notEqual(await auth.registrationIpHash(ip, "another-key"), derived);
});

test("registrationIpHash without a key falls back to truncated SHA-256 (never the raw IP)", async () => {
  const { auth } = runtime;
  const ip = "198.51.100.9";
  const derived = await auth.registrationIpHash(ip, undefined);
  assert.match(derived, /^[0-9a-f]{32}$/, "fallback is also 32 hex chars (128 bits)");
  const plain = await auth.sha256Hex(ip);
  assert.equal(derived, plain.slice(0, 32), "the no-key fallback is the documented truncated digest");
  assert.notEqual(derived, ip, "never the raw address");
});

// ---------------------------------------------------------------------------
// Contributors
// ---------------------------------------------------------------------------

test("createContributor stores the normalised profile and never returns the hash", async () => {
  const { auth } = runtime;
  const profile = await auth.createContributor({
    email: "Ada@Example.ORG",
    displayName: "Ada",
    password: "supersecret123",
  });
  assert.equal(profile.email, "Ada@Example.ORG", "normalisation is the route's job; the db stores what it is given");
  assert.equal(profile.displayName, "Ada");
  assert.equal(profile.passwordHash, undefined, "the public profile must not leak the hash");
  assert.ok(profile.id >= 1);
});

test("the unique email index rejects duplicate registrations at the db layer", async () => {
  const { auth } = runtime;
  await auth.createContributor({ email: "ada@example.org", displayName: "Ada", password: "supersecret123" });
  await assert.rejects(
    auth.createContributor({ email: "ada@example.org", displayName: "Ada Two", password: "supersecret123" }),
    /UNIQUE constraint failed/i,
  );
});

test("findContributorByEmail returns the hash row; getContributorById never does", async () => {
  const { auth } = runtime;
  const profile = await auth.createContributor({ email: "ada@example.org", displayName: "Ada", password: "supersecret123" });

  const full = await auth.findContributorByEmail("ada@example.org");
  assert.ok(full);
  assert.match(full.passwordHash, /^pbkdf2\$/);
  assert.equal(await auth.findContributorByEmail("missing@example.org"), null);

  const publicProfile = await auth.getContributorById(profile.id);
  assert.equal(publicProfile.passwordHash, undefined);
  assert.equal(await auth.getContributorById(9999), null);
});

test("authenticateContributor verifies against the stored hash", async () => {
  const { auth } = runtime;
  await auth.createContributor({ email: "ada@example.org", displayName: "Ada", password: "supersecret123" });

  const profile = await auth.authenticateContributor("ada@example.org", "supersecret123");
  assert.equal(profile.email, "ada@example.org");
  assert.equal(profile.passwordHash, undefined);

  assert.equal(await auth.authenticateContributor("ada@example.org", "wrong-password"), null);
  assert.equal(await auth.authenticateContributor("missing@example.org", "supersecret123"), null);
});

// ---------------------------------------------------------------------------
// Write gate verification state (multi-method auth Fase E1)
// ---------------------------------------------------------------------------

test("getContributorVerification reports an unverified account (email_verified_at NULL)", async () => {
  const { auth } = runtime;
  const profile = await auth.createContributor({ email: "linus@osdb.test", displayName: "Linus", password: "supersecret123" });

  const state = await auth.getContributorVerification(profile.id);
  assert.ok(state, "the account exists");
  assert.equal(state.id, profile.id);
  // Fase B sets email_verified_at; until then the account cannot write.
  assert.equal(state.emailVerifiedAt, null);
  assert.equal(state.authProvider, "password", "the legacy default keeps every existing row valid");
});

test("getContributorVerification reports a verified account once email_verified_at is set", async () => {
  const { auth } = runtime;
  const profile = await auth.createContributor({ email: "ada@example.org", displayName: "Ada", password: "supersecret123" });
  // Fase B/C/D set the column at the verification boundary; here we simulate
  // the post-verification state directly on the real schema.
  await runtime.env.DB
    .prepare("UPDATE contributors SET email_verified_at = ?, auth_provider = ? WHERE id = ?")
    .bind("2026-08-01T09:30:00.000Z", "github", profile.id)
    .run();

  const state = await auth.getContributorVerification(profile.id);
  assert.equal(state.emailVerifiedAt, "2026-08-01T09:30:00.000Z");
  assert.equal(state.authProvider, "github");
});

test("getContributorVerification returns null for an erased account (write gate 401 path)", async () => {
  const { auth } = runtime;
  assert.equal(await auth.getContributorVerification(9999), null);
});

test("the write gate reads the same email_verified_at column the schema exposes", async () => {
  const { auth } = runtime;
  const profile = await auth.createContributor({ email: "gate@osdb.test", displayName: "Gate", password: "supersecret123" });

  const before = await auth.getContributorVerification(profile.id);
  assert.equal(before.emailVerifiedAt, null);

  await runtime.env.DB
    .prepare("UPDATE contributors SET email_verified_at = ? WHERE id = ?")
    .bind("2026-08-02T00:00:00.000Z", profile.id)
    .run();

  const after = await auth.getContributorVerification(profile.id);
  assert.equal(after.emailVerifiedAt, "2026-08-02T00:00:00.000Z");
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

test("createSession stores only the token hash and honours the TTL", async () => {
  const { auth } = runtime;
  const profile = await auth.createContributor({ email: "ada@example.org", displayName: "Ada", password: "supersecret123" });
  const { rawToken, csrfToken, session } = await auth.createSession(profile.id, { ttlDays: 7, now: NOW });

  assert.ok(rawToken.length >= 40, "raw token must be unpredictable");
  assert.ok(csrfToken.length >= 40);
  assert.equal(session.expiresAt, "2026-08-08T00:00:00.000Z");
  assert.notEqual(session.tokenHash, rawToken, "the db must never hold the raw token");
});

test("findSessionByToken resolves live sessions and rejects dead ones", async () => {
  const { auth } = runtime;
  const profile = await auth.createContributor({ email: "ada@example.org", displayName: "Ada", password: "supersecret123" });
  const { rawToken } = await auth.createSession(profile.id, { ttlDays: 7, now: NOW });

  const live = await auth.findSessionByToken(rawToken, "2026-08-02T00:00:00.000Z");
  assert.ok(live);
  assert.equal(live.contributor.id, profile.id);
  assert.equal(live.contributor.passwordHash, undefined);
  assert.ok(live.csrfToken.length >= 40);

  assert.equal(await auth.findSessionByToken("bogus-token", "2026-08-02T00:00:00.000Z"), null);
  assert.equal(await auth.findSessionByToken(rawToken, "2026-08-09T00:00:00.000Z"), null, "expired sessions must not resolve");
});

test("revokeSession kills a session permanently", async () => {
  const { auth } = runtime;
  const profile = await auth.createContributor({ email: "ada@example.org", displayName: "Ada", password: "supersecret123" });
  const { rawToken } = await auth.createSession(profile.id, { ttlDays: 7, now: NOW });

  assert.equal(await auth.revokeSession(rawToken, "2026-08-02T00:00:00.000Z"), true);
  assert.equal(await auth.revokeSession(rawToken, "2026-08-02T00:00:00.000Z"), false, "second revoke must report no change");
  assert.equal(await auth.findSessionByToken(rawToken, "2026-08-02T00:00:00.000Z"), null);
});

// ---------------------------------------------------------------------------
// Attribution and the contributor's own submissions
// ---------------------------------------------------------------------------

test("a session-identified submission is attributed and listed; anonymous ones are not", async () => {
  const { auth, cameras } = runtime;
  const profile = await auth.createContributor({ email: "ada@example.org", displayName: "Ada", password: "supersecret123" });
  const { rawToken } = await auth.createSession(profile.id, { ttlDays: 7, now: NOW });
  const { contributor } = await auth.findSessionByToken(rawToken, NOW);

  const attributed = await cameras.createPendingCamera({
    title: "Station camera",
    kind: "Dome",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "",
    latitude: 44.83,
    longitude: 11.62,
    contributorId: contributor.id,
  });
  assert.equal(attributed.contributorId, contributor.id);

  const anonymous = await cameras.createPendingCamera({
    title: "Anonymous report",
    kind: "Bullet",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "",
    latitude: 44.84,
    longitude: 11.63,
  });
  assert.equal(anonymous.contributorId, null);

  const submissions = await auth.listContributorSubmissions(contributor.id);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].id, attributed.id);
  assert.equal(submissions[0].title, "Station camera");
  assert.equal(submissions[0].status, "pending");
});

test("sessions are independent: revoking one never touches another", async () => {
  const { auth } = runtime;
  const profile = await auth.createContributor({ email: "ada@example.org", displayName: "Ada", password: "supersecret123" });
  const first = await auth.createSession(profile.id, { ttlDays: 7, now: NOW });
  const second = await auth.createSession(profile.id, { ttlDays: 7, now: NOW });

  await auth.revokeSession(first.rawToken, NOW);
  assert.equal(await auth.findSessionByToken(first.rawToken, NOW), null);
  assert.ok(await auth.findSessionByToken(second.rawToken, NOW));
});

// ---------------------------------------------------------------------------
// Account erasure (RETENTION_SCHEDULE R7)
// ---------------------------------------------------------------------------

test("eraseContributor de-attributes the reports, revokes all sessions, and hard-deletes the account", async () => {
  const { auth, cameras } = runtime;
  const profile = await auth.createContributor({ email: "eraseme@example.org", displayName: "Eraseme", password: "supersecret123" });
  const first = await auth.createSession(profile.id, { ttlDays: 7, now: NOW });
  const second = await auth.createSession(profile.id, { ttlDays: 7, now: NOW });

  // A second contributor whose auth artifacts must survive the erasure
  // untouched (isolation, P2-2).
  const keeper = await auth.createContributor({ email: "keeper@example.org", displayName: "Keeper", password: "supersecret123" });

  // Seed every auth-artifact table that references contributors with
  // ON DELETE CASCADE — the erasure must clean these explicitly because the
  // harness does not enforce FKs (same rule as sessions).
  const seedAuthArtifacts = (contributorId, suffix) => {
    const createdAt = NOW;
    const expiresAt = "2026-08-02T00:00:00.000Z";
    const db = runtime.env.DB;
    db.prepare(
      "INSERT INTO passkeys (contributor_id, credential_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, 0, NULL, ?)",
    ).bind(contributorId, `cred-${suffix}`, `pub-${suffix}`, createdAt).run();
    db.prepare(
      "INSERT INTO recovery_codes (contributor_id, code_hash, created_at) VALUES (?, ?, ?)",
    ).bind(contributorId, `recovery-hash-${suffix}`, createdAt).run();
    db.prepare(
      "INSERT INTO email_verification_tokens (contributor_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(contributorId, `verify-hash-${suffix}`, createdAt, expiresAt).run();
    db.prepare(
      "INSERT INTO email_send_log (contributor_id, kind, sent_at) VALUES (?, 'verify', ?)",
    ).bind(contributorId, createdAt).run();
    db.prepare(
      "INSERT INTO webauthn_challenges (challenge_hash, kind, contributor_id, user_handle, created_at, expires_at) VALUES (?, 'login', ?, NULL, ?, ?)",
    ).bind(`challenge-hash-${suffix}`, contributorId, createdAt, expiresAt).run();
    db.prepare(
      "INSERT INTO oidc_merge_requests (token_hash, provider, external_sub, contributor_id, email_verified, created_at, expires_at) VALUES (?, 'github', ?, ?, 0, ?, ?)",
    ).bind(`merge-hash-${suffix}`, `sub-${suffix}`, contributorId, createdAt, expiresAt).run();
  };
  seedAuthArtifacts(profile.id, "erased");
  seedAuthArtifacts(keeper.id, "keeper");
  // A WebAuthn challenge with no contributor link (pre-auth) is a no-op for
  // the erasure and must survive.
  runtime.env.DB.prepare(
    "INSERT INTO webauthn_challenges (challenge_hash, kind, contributor_id, user_handle, created_at, expires_at) VALUES ('challenge-hash-anonymous', 'login', NULL, NULL, ?, ?)",
  ).bind(NOW, "2026-08-02T00:00:00.000Z").run();

  const artifactTables = ["passkeys", "recovery_codes", "email_verification_tokens", "email_send_log", "webauthn_challenges", "oidc_merge_requests"];

  // This suite owns the erasure contract, so it models the no-FK
  // environment the explicit DELETEs exist for (P2-2, t_adfc121b): with
  // `PRAGMA foreign_keys = OFF` the ON DELETE CASCADE never fires, and the
  // app-layer deletes in eraseContributor are the ONLY thing that cleans the
  // auth-artifact tables. Without them this test turns red.
  runtime.env.DB.exec("PRAGMA foreign_keys = OFF");

  const attributed = await cameras.createPendingCamera({
    title: "Attributed camera",
    kind: "Dome",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "",
    latitude: 44.83,
    longitude: 11.62,
    contributorId: profile.id,
  });
  // A second report, same contributor.
  await cameras.createPendingCamera({
    title: "Another attributed camera",
    kind: "Bullet",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "",
    latitude: 44.84,
    longitude: 11.63,
    contributorId: profile.id,
  });
  // An anonymous report must be untouched.
  const anonymous = await cameras.createPendingCamera({
    title: "Anonymous camera",
    kind: "Bullet",
    manufacturer: null,
    observedOn: null,
    address: "",
    notes: "",
    latitude: 44.85,
    longitude: 11.64,
  });
  assert.equal(anonymous.contributorId, null);

  const result = await auth.eraseContributor(profile.id);
  assert.equal(result.deleted, true);
  assert.equal(result.deattributedReports, 2, "both attributed reports are counted");

  // Account and sessions are gone.
  assert.equal(await auth.getContributorById(profile.id), null);
  assert.equal(await auth.findSessionByToken(first.rawToken, NOW), null);
  assert.equal(await auth.findSessionByToken(second.rawToken, NOW), null);

  // Reports survive with contributor_id NULL; the anonymous one was never touched.
  const deattributed = await runtime.env.DB.prepare(
    "SELECT contributor_id AS contributorId FROM cameras WHERE id = ?",
  ).bind(attributed.id).first();
  assert.equal(deattributed.contributorId, null);
  const other = await runtime.env.DB.prepare(
    "SELECT contributor_id AS contributorId FROM cameras WHERE id = ?",
  ).bind(anonymous.id).first();
  assert.equal(other.contributorId, null);
  const all = await runtime.env.DB.prepare("SELECT COUNT(*) AS n FROM cameras").first();
  assert.equal(Number(all.n), 3, "no report row is deleted by erasure");

  // Every auth artifact of the erased contributor is hard-deleted
  // (P2-2: explicit DELETEs, the harness does not enforce FKs).
  for (const table of artifactTables) {
    const gone = await runtime.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM ${table} WHERE contributor_id = ?`,
    ).bind(profile.id).first();
    assert.equal(Number(gone.n), 0, `${table}: no row survives the erasure`);
  }
  // Sessions too, already covered above — re-checked via the count path.
  const sessionsGone = await runtime.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM sessions WHERE contributor_id = ?",
  ).bind(profile.id).first();
  assert.equal(Number(sessionsGone.n), 0, "sessions: no row survives the erasure");

  // Isolation: the keeper's artifacts are untouched, and the pre-auth
  // challenge with a NULL contributor survives as a no-op.
  for (const table of artifactTables) {
    const kept = await runtime.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM ${table} WHERE contributor_id = ?`,
    ).bind(keeper.id).first();
    assert.equal(Number(kept.n), 1, `${table}: the other contributor's row survives`);
  }
  const anonymousChallenge = await runtime.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM webauthn_challenges WHERE contributor_id IS NULL",
  ).first();
  assert.equal(Number(anonymousChallenge.n), 1, "pre-auth challenge is a no-op for erasure");
});

test("eraseContributor on an unknown id reports deleted: false and de-attributes nothing", async () => {
  const { auth } = runtime;
  const result = await auth.eraseContributor(9999);
  assert.equal(result.deleted, false);
  assert.equal(result.deattributedReports, 0);
});

test("eraseContributor is safe to call twice — the second call finds nothing", async () => {
  const { auth } = runtime;
  const profile = await auth.createContributor({ email: "twice@example.org", displayName: "Twice", password: "supersecret123" });
  const first = await auth.eraseContributor(profile.id);
  assert.equal(first.deleted, true);
  const second = await auth.eraseContributor(profile.id);
  assert.equal(second.deleted, false);
  assert.equal(second.deattributedReports, 0);
});

// ---------------------------------------------------------------------------
// Per-email login lockout (P2 security, ADR 0016)
// ---------------------------------------------------------------------------

// Small, deterministic policy: 3 failures inside a 60s window lock the email
// for 60s, doubling per consecutive lockout up to 120s.
const LOCKOUT_POLICY = {
  maxAttempts: 3,
  windowSeconds: 60,
  durationSeconds: 60,
  maxDurationSeconds: 120,
};

test("loginLockoutKey is a stable hash of the normalised email — never the address", async () => {
  const { auth } = runtime;
  const key = await auth.loginLockoutKey("  Ada@Example.ORG ");
  assert.equal(key, await auth.loginLockoutKey("ada@example.org"), "the key normalises the email");
  assert.match(key, /^[0-9a-f]{64}$/, "the key is a SHA-256 hex digest");
  assert.ok(!key.includes("ada"), "the raw email must not appear in the key");
  assert.notEqual(key, await auth.loginLockoutKey("ada@other.example"));
});

test("recordFailedLogin trips the lockout at the threshold; getLoginLockout reports Retry-After", async () => {
  const { auth } = runtime;
  const emailKey = await auth.loginLockoutKey("ada@example.org");

  assert.deepEqual(await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, NOW), {
    locked: false,
    retryAfterSeconds: 0,
  });
  assert.deepEqual(await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, NOW), {
    locked: false,
    retryAfterSeconds: 0,
  });
  const tripped = await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, NOW);
  assert.deepEqual(tripped, { locked: true, retryAfterSeconds: 60 }, "the 3rd failure locks for 60s");

  const locked = await auth.getLoginLockout(emailKey, LOCKOUT_POLICY, NOW);
  assert.deepEqual(locked, { locked: true, retryAfterSeconds: 60 });
  const later = await auth.getLoginLockout(emailKey, LOCKOUT_POLICY, "2026-08-01T00:00:30.000Z");
  assert.equal(later.locked, true);
  assert.ok(later.retryAfterSeconds <= 31, "Retry-After shrinks as the lock runs down");
});

test("a successful login clears the counter", async () => {
  const { auth } = runtime;
  const emailKey = await auth.loginLockoutKey("ada@example.org");
  await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, NOW);
  await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, NOW);

  await auth.clearLoginAttempts(emailKey);
  assert.deepEqual(await auth.getLoginLockout(emailKey, LOCKOUT_POLICY, NOW), {
    locked: false,
    retryAfterSeconds: 0,
  });

  // The counter restarts from zero: two more failures do NOT lock.
  await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, NOW);
  const state = await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, NOW);
  assert.deepEqual(state, { locked: false, retryAfterSeconds: 0 });
});

test("the lockout expires after the duration", async () => {
  const { auth } = runtime;
  const emailKey = await auth.loginLockoutKey("ada@example.org");
  for (let index = 0; index < 3; index += 1) {
    await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, NOW);
  }
  assert.equal((await auth.getLoginLockout(emailKey, LOCKOUT_POLICY, NOW)).locked, true);

  const afterExpiry = new Date(Date.parse(NOW) + 60_000).toISOString();
  assert.deepEqual(await auth.getLoginLockout(emailKey, LOCKOUT_POLICY, afterExpiry), {
    locked: false,
    retryAfterSeconds: 0,
  });
});

test("attempts from different callers count against the same email", async () => {
  const { auth } = runtime;
  const emailKey = await auth.loginLockoutKey("ada@example.org");
  // The counter is keyed by the email hash only — there is no IP component,
  // so every caller hitting the same account shares one counter.
  await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, NOW);
  await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, NOW);
  const tripped = await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, NOW);
  assert.equal(tripped.locked, true, "the 3rd attempt from a different caller trips the shared counter");

  // A different email keeps an independent counter.
  const otherKey = await auth.loginLockoutKey("bob@example.org");
  assert.deepEqual(await auth.getLoginLockout(otherKey, LOCKOUT_POLICY, NOW), {
    locked: false,
    retryAfterSeconds: 0,
  });
});

test("a stale counting window starts a fresh counter", async () => {
  const { auth } = runtime;
  const emailKey = await auth.loginLockoutKey("ada@example.org");
  await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, "2026-08-01T00:00:00.000Z");
  await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, "2026-08-01T00:00:10.000Z");
  // 70s later the 60s window has rolled over: the counter restarts at 1.
  const state = await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, "2026-08-01T00:01:10.000Z");
  assert.deepEqual(state, { locked: false, retryAfterSeconds: 0 });
  assert.deepEqual(await auth.getLoginLockout(emailKey, LOCKOUT_POLICY, "2026-08-01T00:01:10.000Z"), {
    locked: false,
    retryAfterSeconds: 0,
  });
});

test("consecutive lockouts back off exponentially up to the cap", async () => {
  const { auth } = runtime;
  const emailKey = await auth.loginLockoutKey("ada@example.org");

  // First lockout: 3 failures → locked for the base 60s.
  for (let index = 0; index < 3; index += 1) {
    await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, "2026-08-01T00:00:00.000Z");
  }
  assert.equal((await auth.getLoginLockout(emailKey, LOCKOUT_POLICY, "2026-08-01T00:00:00.000Z")).locked, true);

  // Lock expires at 00:01:00; the attacker resumes inside the post-lock
  // window (00:01:05): the counter is still at the threshold, so ONE more
  // failure re-locks immediately — for double the duration (120s).
  const second = await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, "2026-08-01T00:01:05.000Z");
  assert.equal(second.locked, true);
  assert.equal(second.retryAfterSeconds, 120);

  // Third consecutive lockout: 240s would be next, but the cap (120s) holds.
  const third = await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, "2026-08-01T00:03:10.000Z");
  assert.equal(third.locked, true);
  assert.equal(third.retryAfterSeconds, 120);
});

test("the lockout table stores only the email hash — never PII", async () => {
  const { auth } = runtime;
  const emailKey = await auth.loginLockoutKey("ada@example.org");
  await auth.recordFailedLogin(emailKey, LOCKOUT_POLICY, NOW);

  const rows = await runtime.env.DB.prepare("SELECT * FROM login_attempts").all();
  assert.equal(rows.results.length, 1);
  const [attempt] = rows.results;
  assert.equal(attempt.email_key, emailKey);
  assert.ok(!JSON.stringify(attempt).includes("ada@example.org"), "no raw email in the row");
  assert.ok(!JSON.stringify(attempt).includes("@"), "no email-shaped value at all");
});

// ---------------------------------------------------------------------------
// Email verification + password reset tokens (multi-method auth Fase B)
// ---------------------------------------------------------------------------

async function makeContributor(auth, email = "verify@example.org") {
  return auth.createContributor({ email, displayName: "Verifier", password: "supersecret123" });
}

test("createVerificationToken stores only the SHA-256 hash, per-purpose TTL (verify 24h / reset 3h), with the purpose", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth);
  const { rawToken, expiresAt } = await auth.createVerificationToken(contributor.id, "verify", NOW);

  assert.equal(typeof rawToken, "string");
  assert.ok(rawToken.length >= 32, "raw token is high-entropy");
  assert.equal(expiresAt, "2026-08-02T00:00:00.000Z", "verify TTL is exactly 24h");

  const resetToken = await auth.createVerificationToken(contributor.id, "reset", NOW);
  assert.equal(resetToken.expiresAt, "2026-08-01T03:00:00.000Z", "reset TTL is exactly 3h");

  const rows = await runtime.env.DB.prepare("SELECT * FROM email_verification_tokens ORDER BY id").all();
  assert.equal(rows.results.length, 2);
  const [row, resetRow] = rows.results;
  assert.equal(row.token_hash, await auth.sha256Hex(rawToken), "only the hash is stored");
  assert.notEqual(row.token_hash, rawToken);
  assert.equal(row.purpose, "verify");
  assert.equal(row.used_at, null);
  assert.equal(row.expires_at, expiresAt);
  assert.equal(row.contributor_id, contributor.id);
  // The reset row carries the shorter 3h window and its own purpose.
  assert.equal(resetRow.purpose, "reset");
  assert.equal(resetRow.expires_at, "2026-08-01T03:00:00.000Z");
});

test("createVerificationToken honours an explicit ttlMs override (tests forcing expiry)", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth);
  const { expiresAt } = await auth.createVerificationToken(contributor.id, "verify", NOW, 5 * 60 * 1000);
  assert.equal(expiresAt, "2026-08-01T00:05:00.000Z", "explicit ttlMs wins over the purpose default");
});

test("consumeVerificationToken burns a live token once, then answers used", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth);
  const { rawToken } = await auth.createVerificationToken(contributor.id, "verify", NOW);

  assert.deepEqual(await auth.consumeVerificationToken(rawToken, "verify", NOW), {
    kind: "verified",
    contributorId: contributor.id,
  });
  const [row] = (await runtime.env.DB.prepare("SELECT used_at AS usedAt FROM email_verification_tokens").all()).results;
  assert.equal(row.usedAt, NOW, "the row is burned with the consume timestamp");
  assert.deepEqual(await auth.consumeVerificationToken(rawToken, "verify", NOW), { kind: "used" });
});

test("a token is single-use even under a race: two consumers, one winner", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth);
  const { rawToken } = await auth.createVerificationToken(contributor.id, "verify", NOW);

  const results = await Promise.all([
    auth.consumeVerificationToken(rawToken, "verify", NOW),
    auth.consumeVerificationToken(rawToken, "verify", NOW),
  ]);
  const winners = results.filter((result) => result.kind === "verified").length;
  assert.equal(winners, 1, "exactly one concurrent consumer wins");
  assert.equal(results.filter((result) => result.kind === "used").length, 1);
});

test("consumeVerificationToken rejects the wrong purpose and expired tokens", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth);
  const { rawToken } = await auth.createVerificationToken(contributor.id, "verify", NOW);

  assert.deepEqual(await auth.consumeVerificationToken(rawToken, "reset", NOW), { kind: "invalid" },
    "a verify token cannot reset a password");
  const afterTtl = new Date(Date.parse(NOW) + 25 * 60 * 60 * 1000).toISOString();
  assert.deepEqual(await auth.consumeVerificationToken(rawToken, "verify", afterTtl), { kind: "expired" });
  // Unknown hashes answer invalid — never "used", so probing cannot enumerate.
  assert.deepEqual(await auth.consumeVerificationToken("nonexistent-token", "verify", NOW), { kind: "invalid" });
});

test("reset tokens expire after 3h — a reset link dies at the 3h mark, verify lives on", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth);
  const { rawToken: resetToken } = await auth.createVerificationToken(contributor.id, "reset", NOW);
  const { rawToken: verifyToken } = await auth.createVerificationToken(contributor.id, "verify", NOW);

  // Inside the 3h window both are live.
  const justBefore = new Date(Date.parse(NOW) + 3 * 60 * 60 * 1000 - 1000).toISOString();
  assert.deepEqual(await auth.consumeVerificationToken(resetToken, "reset", justBefore), {
    kind: "verified",
    contributorId: contributor.id,
  }, "reset token is still live one second before the 3h mark");
  const again = await auth.createVerificationToken(contributor.id, "reset", NOW);
  assert.deepEqual(await auth.consumeVerificationToken(again.rawToken, "reset", justBefore), {
    kind: "verified",
    contributorId: contributor.id,
  });
  // A reset link consumed at/past the 3h mark answers expired, while the
  // 24h verify token is still valid at the same instant.
  const atTtl = new Date(Date.parse(NOW) + 3 * 60 * 60 * 1000).toISOString();
  const freshReset = await auth.createVerificationToken(contributor.id, "reset", NOW);
  assert.deepEqual(await auth.consumeVerificationToken(freshReset.rawToken, "reset", atTtl), { kind: "expired" },
    "reset token dies exactly at the 3h TTL");
  assert.deepEqual(await auth.consumeVerificationToken(verifyToken, "verify", atTtl), {
    kind: "verified",
    contributorId: contributor.id,
  }, "verify token (24h) survives the reset 3h mark");
});

test("creating a new token revokes older UNUSED tokens of the same purpose only", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth);
  const first = await auth.createVerificationToken(contributor.id, "verify", NOW);
  const reset = await auth.createVerificationToken(contributor.id, "reset", NOW);
  const second = await auth.createVerificationToken(contributor.id, "verify", NOW);

  // The first verify token is revoked by the re-send; the reset token (other
  // purpose) survives; the newest verify token stays live.
  assert.deepEqual(await auth.consumeVerificationToken(first.rawToken, "verify", NOW), { kind: "used" });
  assert.deepEqual(await auth.consumeVerificationToken(second.rawToken, "verify", NOW), {
    kind: "verified",
    contributorId: contributor.id,
  });
  assert.deepEqual(await auth.consumeVerificationToken(reset.rawToken, "reset", NOW), {
    kind: "verified",
    contributorId: contributor.id,
  });
});

test("countVerificationTokensSentSince counts only the window and the purpose", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth);
  await auth.createVerificationToken(contributor.id, "verify", "2026-08-01T00:00:00.000Z"); // inside window
  await auth.createVerificationToken(contributor.id, "verify", "2026-08-01T00:30:00.000Z"); // inside window
  await auth.createVerificationToken(contributor.id, "verify", "2026-07-31T23:00:00.000Z"); // outside window
  await auth.createVerificationToken(contributor.id, "reset", "2026-08-01T00:00:00.000Z"); // other purpose

  const since = "2026-08-01T00:00:00.000Z";
  assert.equal(await auth.countVerificationTokensSentSince(contributor.id, "verify", since), 2);
  assert.equal(await auth.countVerificationTokensSentSince(contributor.id, "reset", since), 1);
  assert.equal(await auth.countVerificationTokensSentSince(999, "verify", since), 0);
});

test("markContributorEmailVerified is idempotent — the first timestamp wins", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth);
  assert.equal(contributor.emailVerifiedAt, null, "fresh accounts are unverified");

  const verified = await auth.markContributorEmailVerified(contributor.id, "2026-08-01T00:05:00.000Z");
  assert.equal(verified.emailVerifiedAt, "2026-08-01T00:05:00.000Z");
  const reVerified = await auth.markContributorEmailVerified(contributor.id, "2026-08-01T00:10:00.000Z");
  assert.equal(reVerified.emailVerifiedAt, "2026-08-01T00:05:00.000Z", "COALESCE keeps the original timestamp");
  assert.equal(await auth.markContributorEmailVerified(999), null, "unknown account -> null");
});

test("resetContributorPassword rotates the hash; the old password stops working", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth, "reset-me@example.org");
  const before = await auth.findContributorByEmail("reset-me@example.org");
  assert.equal(await auth.verifyPassword("supersecret123", before.passwordHash), true);

  await auth.resetContributorPassword(contributor.id, "rotated-password-1", NOW);
  const after = await auth.findContributorByEmail("reset-me@example.org");
  assert.notEqual(after.passwordHash, before.passwordHash);
  assert.equal(await auth.verifyPassword("supersecret123", after.passwordHash), false);
  assert.equal(await auth.verifyPassword("rotated-password-1", after.passwordHash), true);
});

test("revokeAllContributorSessions kills every live session of a contributor", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth);
  const first = await auth.createSession(contributor.id, { ttlDays: 30, now: NOW });
  const second = await auth.createSession(contributor.id, { ttlDays: 30, now: NOW });

  assert.equal(await auth.revokeAllContributorSessions(contributor.id, NOW), 2);
  assert.equal(await auth.findSessionByToken(first.rawToken, NOW), null);
  assert.equal(await auth.findSessionByToken(second.rawToken, NOW), null);
  // Idempotent: nothing left to revoke.
  assert.equal(await auth.revokeAllContributorSessions(contributor.id, NOW), 0);
});

test("the purpose column defaults to 'verify' for legacy-shaped inserts", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth);
  // A raw insert that omits purpose must land as 'verify' (migration 0031
  // default), keeping every pre-0031 writer valid.
  await runtime.env.DB.prepare(
    "INSERT INTO email_verification_tokens (contributor_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).bind(contributor.id, "legacy-hash", NOW, "2026-08-02T00:00:00.000Z").run();
  const [row] = (await runtime.env.DB.prepare("SELECT purpose FROM email_verification_tokens WHERE token_hash = 'legacy-hash'").all()).results;
  assert.equal(row.purpose, "verify");
});
