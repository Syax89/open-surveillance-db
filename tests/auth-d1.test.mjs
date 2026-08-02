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

test("createVerificationToken stores only the SHA-256 hash, 24h TTL, with the purpose", async () => {
  const { auth } = runtime;
  const contributor = await makeContributor(auth);
  const { rawToken, expiresAt } = await auth.createVerificationToken(contributor.id, "verify", NOW);

  assert.equal(typeof rawToken, "string");
  assert.ok(rawToken.length >= 32, "raw token is high-entropy");
  assert.equal(expiresAt, "2026-08-02T00:00:00.000Z", "TTL is exactly 24h");

  const rows = await runtime.env.DB.prepare("SELECT * FROM email_verification_tokens").all();
  assert.equal(rows.results.length, 1);
  const [row] = rows.results;
  assert.equal(row.token_hash, await auth.sha256Hex(rawToken), "only the hash is stored");
  assert.notEqual(row.token_hash, rawToken);
  assert.equal(row.purpose, "verify");
  assert.equal(row.used_at, null);
  assert.equal(row.expires_at, expiresAt);
  assert.equal(row.contributor_id, contributor.id);
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
  // A raw insert that omits purpose must land as 'verify' (migration 0028
  // default), keeping every pre-0028 writer valid.
  await runtime.env.DB.prepare(
    "INSERT INTO email_verification_tokens (contributor_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).bind(contributor.id, "legacy-hash", NOW, "2026-08-02T00:00:00.000Z").run();
  const [row] = (await runtime.env.DB.prepare("SELECT purpose FROM email_verification_tokens WHERE token_hash = 'legacy-hash'").all()).results;
  assert.equal(row.purpose, "verify");
});
