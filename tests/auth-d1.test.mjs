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
  assert.match(hash, /^pbkdf2\$210000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.equal(await auth.verifyPassword("correct horse battery staple", hash), true);
  assert.equal(await auth.verifyPassword("wrong password", hash), false);
  // Each hash carries a fresh salt.
  const secondHash = await auth.hashPassword("correct horse battery staple");
  assert.notEqual(hash, secondHash);
});

test("verifyPassword rejects malformed stored hashes", async () => {
  const { auth } = runtime;
  for (const bad of ["", "plaintext", "pbkdf2$210000$salt", "argon2$1$a$b", "pbkdf2$abc$salt$hash"]) {
    assert.equal(await auth.verifyPassword("anything", bad), false, bad);
  }
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
// Per-email login lockout (P2 security, ADR 0015)
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
