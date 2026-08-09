// Database-boundary tests for db/users.ts (QA review P1-3: module coverage
// 82.05%, functions 71.43% — the id lookups, the role mutation paths, and
// the reviewer-linkage null path were not exercised at the db layer).
//
// These run the REAL db/users.ts against the REAL migration SQL on an
// in-memory D1 adapter (same harness as tests/auth-d1.test.mjs). Route-level
// authz behaviour is covered by the moderation/appeals suites; this suite
// pins the SQL truths of the identity store:
//
//   - getUserByEmail / getUserById (found + missing)
//   - listUsers ordering (role, then display_name)
//   - setUserActive / setUserRole (update + missing id -> null)
//   - getReviewerByUserId (linked + unlinked user -> null)
//   - roleAtLeast ranking edges
//
// No personal data: all fixtures are fictional.

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
} from "./helpers/db-runtime-harness.mjs";

let runtime;
let db;
let users;

async function freshDb() {
  runtime = await loadDbRuntime();
  db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  users = runtime.users;
}

after(async () => cleanupDbRuntime());

const NOW = "2026-08-01T00:00:00.000Z";

async function insertUser(overrides = {}) {
  const row = {
    email: `users-${crypto.randomUUID()}@example.org`,
    displayName: "Test User",
    role: "contributor",
    active: 1,
    mfaEnabled: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  return (await db
    .prepare(
      "INSERT INTO users (email, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(row.email, row.displayName, row.role, row.active, row.mfaEnabled, row.createdAt, row.updatedAt)
    .first()).id;
}

async function insertReviewer(userId, overrides = {}) {
  const row = {
    displayName: "Test Reviewer",
    role: "record_reviewer",
    active: 1,
    mfaEnabled: 0,
    createdAt: NOW,
    updatedAt: NOW,
    userId,
    ...overrides,
  };
  return (await db
    .prepare(
      "INSERT INTO reviewers (display_name, role, active, mfa_enabled, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    )
    .bind(row.displayName, row.role, row.active, row.mfaEnabled, row.createdAt, row.updatedAt, row.userId)
    .first()).id;
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

test("getUserByEmail resolves a seeded user and returns null for a missing email", async () => {
  await freshDb();
  const id = await insertUser({ email: "contributor@example.org", displayName: "Contributor" });

  const found = await users.getUserByEmail("contributor@example.org");
  assert.ok(found);
  assert.equal(found.id, id);
  assert.equal(found.displayName, "Contributor");
  assert.equal(found.role, "contributor");
  assert.equal(found.active, 1);

  assert.equal(await users.getUserByEmail("missing@example.org"), null);
});

test("getUserById resolves a seeded user and returns null for a missing id", async () => {
  await freshDb();
  const id = await insertUser({ displayName: "By-Id User" });

  const found = await users.getUserById(id);
  assert.ok(found);
  assert.equal(found.displayName, "By-Id User");

  assert.equal(await users.getUserById(99999), null);
});

// ---------------------------------------------------------------------------
// listUsers
// ---------------------------------------------------------------------------

test("listUsers orders by role rank, then display_name", async () => {
  await freshDb();
  await insertUser({ displayName: "Zeta Contributor", role: "contributor" });
  await insertUser({ displayName: "Alpha Moderator", role: "moderator" });
  await insertUser({ displayName: "Beta Admin", role: "admin" });
  await insertUser({ displayName: "Gamma Moderator", role: "moderator" });

  const list = await users.listUsers();
  assert.equal(list.length, 4);
  // role is stored as text: 'admin' < 'contributor' < 'moderator'
  // lexicographically — the ORDER BY role, display_name is the contract.
  assert.deepEqual(
    list.map((user) => `${user.role}:${user.displayName}`),
    ["admin:Beta Admin", "contributor:Zeta Contributor", "moderator:Alpha Moderator", "moderator:Gamma Moderator"],
  );
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

test("setUserActive flips the flag and returns the refreshed row", async () => {
  await freshDb();
  const id = await insertUser({ displayName: "Toggle User" });

  const deactivated = await users.setUserActive(id, false);
  assert.equal(deactivated.active, 0);
  assert.ok(deactivated.updatedAt >= NOW);

  const reactivated = await users.setUserActive(id, true);
  assert.equal(reactivated.active, 1);
});

test("setUserActive returns null for a missing id", async () => {
  await freshDb();
  assert.equal(await users.setUserActive(99999, false), null);
});

test("setUserRole updates the coarse role and returns the refreshed row", async () => {
  await freshDb();
  const id = await insertUser({ displayName: "Role User", role: "contributor" });

  const promoted = await users.setUserRole(id, "moderator");
  assert.equal(promoted.role, "moderator");
  assert.ok(promoted.updatedAt >= NOW);

  const demoted = await users.setUserRole(id, "contributor");
  assert.equal(demoted.role, "contributor");
});

test("setUserRole returns null for a missing id", async () => {
  await freshDb();
  assert.equal(await users.setUserRole(99999, "admin"), null);
});

// ---------------------------------------------------------------------------
// Reviewer linkage
// ---------------------------------------------------------------------------

test("getReviewerByUserId returns the linked reviewer profile", async () => {
  await freshDb();
  const userId = await insertUser({ displayName: "Linked Moderator", role: "moderator" });
  const reviewerId = await insertReviewer(userId, { displayName: "Linked Reviewer", role: "senior_moderator" });

  const linked = await users.getReviewerByUserId(userId);
  assert.ok(linked);
  assert.equal(linked.id, reviewerId);
  assert.equal(linked.displayName, "Linked Reviewer");
  assert.equal(linked.role, "senior_moderator");
  assert.equal(linked.active, 1);
});

test("getReviewerByUserId returns null for a user without a reviewer profile", async () => {
  await freshDb();
  const userId = await insertUser({ displayName: "Plain Contributor", role: "contributor" });
  assert.equal(await users.getReviewerByUserId(userId), null);
});

test("getReviewerByUserId returns null for a missing user id", async () => {
  await freshDb();
  assert.equal(await users.getReviewerByUserId(99999), null);
});

// ---------------------------------------------------------------------------
// roleAtLeast ranking
// ---------------------------------------------------------------------------

test("roleAtLeast ranks contributor < moderator < admin", () => {
  assert.equal(users.roleAtLeast("contributor", "contributor"), true);
  assert.equal(users.roleAtLeast("moderator", "contributor"), true);
  assert.equal(users.roleAtLeast("admin", "contributor"), true);
  assert.equal(users.roleAtLeast("admin", "moderator"), true);
  assert.equal(users.roleAtLeast("contributor", "moderator"), false);
  assert.equal(users.roleAtLeast("moderator", "admin"), false);
  assert.equal(users.roleAtLeast("contributor", "admin"), false);
});
