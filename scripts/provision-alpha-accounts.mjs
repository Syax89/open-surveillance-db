// Provision real moderator/admin accounts before opening the DB to the
// public (public-alpha prerequisite, ADR 0009 / ADR 0014).
//
// Migration 0017 removes the local-prototype demo identities ("Demo *"
// reviewers + @osdb.test demo users) from every fresh database. This script
// is the documented replacement path: it reads real accounts from the
// PROVISION_ACCOUNTS environment variable and inserts them idempotently into
// `users` (+ a linked `reviewers` profile when a granular role is given), so
// a fresh alpha/prod DB starts with real provisioned identities instead of
// demo seeds.
//
// Usage:
//   PROVISION_ACCOUNTS='[
//     {"email":"ada@example.org","displayName":"Ada","role":"admin","reviewerRole":"administrator"},
//     {"email":"linus@example.org","displayName":"Linus","role":"moderator","reviewerRole":"record_reviewer"}
//   ]' node scripts/provision-alpha-accounts.mjs [--remote]
//
//   --local   (default) apply against the local D1 database (.wrangler state)
//   --remote  apply against the remote D1 database (Cloudflare)
//   --persist-to <dir>  apply against an isolated local state directory
//             (same flag as the smoke test — used for CI/verification runs
//             that must not touch a developer's real .wrangler/state)
//
// The script is idempotent: re-running it updates display_name/role/active
// instead of duplicating rows, so it is safe to run in CI or at every deploy
// (coordinate with the deploy workflow task). It NEVER reads or writes
// secrets: accounts are role identities only — real authentication (password
// / OIDC) is out of scope here, exactly like the demo identities they
// replace (see docs/decisions/0014-auth-roles-appeals.md).

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerBin = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const dbName = "opensurveillancedb";

const USER_ROLES = new Set(["contributor", "moderator", "admin"]);
// Granular DATA_TRUST reviewer roles (mirror of db/moderation.ts reviewerRoles).
const REVIEWER_ROLES = new Set([
  "intake_reviewer",
  "record_reviewer",
  "senior_moderator",
  "privacy_safety_lead",
  "administrator",
]);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function sqlEscape(value) {
  return String(value).replaceAll("'", "''");
}

const raw = process.env.PROVISION_ACCOUNTS;
if (!raw || !raw.trim()) {
  console.log(
    "PROVISION_ACCOUNTS not set — nothing to provision. Set it to a JSON array of\n" +
      '{"email","displayName","role","reviewerRole?"} objects, e.g.:\n' +
      "  PROVISION_ACCOUNTS='[{\"email\":\"ada@example.org\",\"displayName\":\"Ada\"," +
      '"role":"admin","reviewerRole":"administrator"}]\' ' +
      "node scripts/provision-alpha-accounts.mjs",
  );
  process.exit(0);
}

let accounts;
try {
  accounts = JSON.parse(raw);
} catch (err) {
  fail(`PROVISION_ACCOUNTS is not valid JSON: ${err.message}`);
}
if (!Array.isArray(accounts) || accounts.length === 0) {
  fail("PROVISION_ACCOUNTS must be a non-empty JSON array");
}

const mode = process.argv.includes("--remote") ? "--remote" : "--local";

// Optional isolated local state directory (CI-safe, mirrors the smoke test).
const persistFlagIndex = process.argv.indexOf("--persist-to");
const persistTo = persistFlagIndex >= 0 ? process.argv[persistFlagIndex + 1] : undefined;

// Validate every account up front — fail closed, no partial provisioning.
const now = new Date().toISOString();
const statements = [];
for (const account of accounts) {
  const { email, displayName, role, reviewerRole } = account ?? {};
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(`invalid email: ${JSON.stringify(email)}`);
  }
  if (typeof displayName !== "string" || displayName.trim() === "") {
    fail(`invalid displayName for ${email}`);
  }
  if (!USER_ROLES.has(role)) {
    fail(`invalid role "${role}" for ${email} — must be one of ${[...USER_ROLES].join(", ")}`);
  }
  if (reviewerRole !== undefined && !REVIEWER_ROLES.has(reviewerRole)) {
    fail(`invalid reviewerRole "${reviewerRole}" for ${email} — must be one of ${[...REVIEWER_ROLES].join(", ")}`);
  }

  const emailEsc = sqlEscape(email);
  const nameEsc = sqlEscape(displayName.trim());
  const roleEsc = sqlEscape(role);

  // users row: upsert on the unique email — re-running updates, never dupes.
  statements.push(`
INSERT INTO users (email, display_name, role, active, mfa_enabled, created_at, updated_at)
VALUES ('${emailEsc}', '${nameEsc}', '${roleEsc}', 1, 0, '${now}', '${now}')
ON CONFLICT (email) DO UPDATE SET
  display_name = excluded.display_name,
  role = excluded.role,
  active = 1,
  updated_at = excluded.updated_at;
`);

  // Linked granular reviewer profile (only for moderator/admin tiers and only
  // when a DATA_TRUST role is requested). display_name is unique; upsert so
  // re-running a provisioning for the same person never creates a duplicate
  // profile, and link it to the user row by email.
  if (reviewerRole) {
    const revRoleEsc = sqlEscape(reviewerRole);
    statements.push(`
INSERT INTO reviewers (display_name, role, active, mfa_enabled, created_at, updated_at, user_id)
VALUES (
  '${nameEsc}', '${revRoleEsc}', 1, 0, '${now}', '${now}',
  (SELECT id FROM users WHERE email = '${emailEsc}')
)
ON CONFLICT (display_name) DO UPDATE SET
  role = excluded.role,
  active = 1,
  updated_at = excluded.updated_at,
  user_id = excluded.user_id;
`);
  }
}

const sql = statements.join("\n");
const tmpDir = mkdtempSync(path.join(os.tmpdir(), "osdb-provision-"));
const sqlFile = path.join(tmpDir, "provision.sql");
writeFileSync(sqlFile, sql);

console.log(`Provisioning ${accounts.length} account(s) against ${mode} D1 …`);
try {
  const args = [wranglerBin, "d1", "execute", dbName, mode, "--file", sqlFile];
  if (mode === "--local" && persistTo) {
    args.push("--persist-to", persistTo);
  }
  execFileSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
  });
} catch (err) {
  rmSync(tmpDir, { recursive: true, force: true });
  fail(`wrangler d1 execute failed: ${err.stderr || err.message}`);
}
rmSync(tmpDir, { recursive: true, force: true });

for (const a of accounts) {
  const linked = a.reviewerRole ? ` + reviewers/${a.reviewerRole}` : "";
  console.log(`  ✓ ${a.displayName} <${a.email}> — ${a.role}${linked}`);
}
console.log("Provisioning complete. Demo identities are NOT re-seeded (migration 0017 removed them).");
