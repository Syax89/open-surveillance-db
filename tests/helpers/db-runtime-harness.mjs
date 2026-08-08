// The runtime harness for the database layer (db/cameras.ts, db/moderation.ts).
//
// The api-harness in tests/helpers/api-harness.mjs transpiles *route*
// handlers and stubs every db module. This harness goes one level deeper:
// it transpiles the real database modules against an injectable
// `cloudflare:workers` env mock, so the actual SQL (status transitions,
// event writes, public queries) runs against a real in-memory SQLite
// database through the D1 adapter in tests/helpers/d1-sqlite.mjs.
//
// H3: the schema is no longer created at runtime (getD1() is a pure binding
// passthrough). applyDrizzleMigrations() replays the real Drizzle migration
// files (drizzle/0000-*.sql ... 0017-*.sql) on the in-memory database, so
// tests exercise exactly what `wrangler d1 migrations apply` produces on a
// fresh local DB — including migration 0017, which removes the demo
// identities seeded by 0008/0010. Suites that need the demo reviewers/users
// (auth-flow-e2e, appeals) seed them explicitly with seedDemoIdentities()
// after applying the migrations, mirroring the pre-alpha provisioning step.
//
// Every load builds a fresh temp tree, so module instances never share
// state across tests.

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { coverageTreeCleanupEnabled, coverageTreeRoot } from "./coverage-tree.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRIZZLE_DIR = path.join(root, "drizzle");

const DB_MODULES = [
  { source: "db/cameras.ts", output: "db/cameras.mjs" },
  { source: "db/moderation.ts", output: "db/moderation.mjs" },
  // db/corrections.ts (private correction/removal intake) imports getD1 from
  // ./cameras, so it runs against the same binding and public boundary.
  { source: "db/corrections.ts", output: "db/corrections.mjs" },
  // db/moderation.ts imports ./freshness (pure, no CF binding); transpile it
  // into the temp tree so the rewritten import resolves.
  { source: "db/freshness.ts", output: "db/freshness.mjs" },
  // db/cameras.ts imports ../app/lib/duplicate-detection (pure, no CF binding);
  // transpile it into the temp tree so the rewritten import resolves.
  { source: "app/lib/duplicate-detection.ts", output: "app/lib/duplicate-detection.mjs" },
  // db/cameras.ts and db/freshness.ts import ../app/lib/public-status (pure,
  // shared public-status whitelist); mirror it into the temp tree as well.
  { source: "app/lib/public-status.ts", output: "app/lib/public-status.mjs" },
  // db/confirmations.ts imports ../app/lib/trust-levels (pure deriveLevel,
  // ADR 0018 §3) for the action weight snapshot (ADR 0021 §3.4); mirror it.
  { source: "app/lib/trust-levels.ts", output: "app/lib/trust-levels.mjs" },
  // db/community-settings.ts (ADR 0021 §5.1, t_4a7469bb FASE 1): tunable
  // community configuration — code defaults + the read path merging DB rows
  // over them; imports getD1 from ./cameras. Mirror it for the pivot tests.
  { source: "db/community-settings.ts", output: "db/community-settings.mjs" },
  // db/community-actions.ts (ADR 0021 FASE 2, kanban t_a9f23581): action
  // surface write path + threshold evaluation. Imports getD1 from ./cameras,
  // verifiedContributionCount + ACTION_WEIGHT_BY_LEVEL from ./confirmations,
  // deriveLevel from app/lib/trust-levels, and getCommunitySettingsCached
  // from ./community-settings — all already in this tree.
  { source: "db/community-actions.ts", output: "db/community-actions.mjs" },
  // db/appeals.ts imports ../app/lib/rate-limit (pure, no CF binding) for the
  // per-appellant appeal threshold knobs; mirror it into the temp tree too.
  { source: "app/lib/rate-limit.ts", output: "app/lib/rate-limit.mjs" },
  // db/auth.ts (contributor accounts and sessions, ADR 0013) imports getD1
  // from ./cameras; it runs against the same binding and in-memory D1.
  { source: "db/auth.ts", output: "db/auth.mjs" },
  // db/mailer.ts (transactional mailer, AUTH MULTI-METODO Fase A2) imports
  // getD1 from ./cameras and the pure templates from app/lib/email-templates;
  // the 3/h re-send rate limit runs real SQL against the same in-memory D1.
  { source: "db/mailer.ts", output: "db/mailer.mjs" },
  { source: "app/lib/email-templates.ts", output: "app/lib/email-templates.mjs" },
  // app/lib/email-templates.ts imports the locale registry from
  // ./i18n/types (kanban t_6424f961); mirror it so the import resolves.
  { source: "app/lib/i18n/types.ts", output: "app/lib/i18n/types.mjs" },
  // Auth roles + appeals (ADR 0014): db/users (identity accounts, coarse
  // role) and db/appeals (appeal workflow) run against the same env.DB.
  // db/appeals imports ./moderation + ./users; db/users imports ./cameras.
  { source: "db/users.ts", output: "db/users.mjs" },
  { source: "db/appeals.ts", output: "db/appeals.mjs" },
  // db/retention.ts (scheduled retention sweep, ADR 0004/0008) imports
  // getD1 from ./cameras — already in this tree — and exercises destructive
  // R1-R18 work against the same binding. ADR 0021 § 2.2: the cron never
  // transitions record status (no runFreshnessSweep reuse anymore).
  { source: "db/retention.ts", output: "db/retention.mjs" },
  // db/confirmations.ts (community verifications, ADR 0018) imports getD1
  // from ./cameras and the shared public whitelist; db/cameras.ts imports
  // confirmationCountsFor from it, so the pair runs against the same binding.
  { source: "db/confirmations.ts", output: "db/confirmations.mjs" },
  // db/import-sources.ts (import pipeline FASE C, t_4dbce318): the public
  // read side of import_batches. db/cameras.ts imports getImportBatchById
  // from it for the record-detail provenance, so it must be in the tree.
  { source: "db/import-sources.ts", output: "db/import-sources.mjs" },
  // db/camera-edits.ts (community editing, ADR 0018 §4) imports getD1 from
  // ./cameras and recordModerationEvent from ./moderation — both already in
  // this tree — so the real two-track logic runs against the same binding.
  { source: "db/camera-edits.ts", output: "db/camera-edits.mjs" },
  // db/passkeys.ts (WebAuthn ceremonies + recovery codes, multi-method auth
  // Fase C, t_36989e06) imports getD1 from ./cameras and the crypto helpers
  // randomBase64Url/sha256Hex from ./auth — both already in this tree — so
  // the real challenge/passkey/recovery-code SQL runs against the same
  // in-memory D1 (passkey-d1.test.mjs).
  { source: "db/passkeys.ts", output: "db/passkeys.mjs" },
  // db/oidc.ts (external OIDC login, Fase D — migration 0030) imports getD1
  // from ./cameras and the token primitives from ./auth, both already in
  // this tree, so the real PKCE/merge SQL runs against the same binding.
  { source: "db/oidc.ts", output: "db/oidc.mjs" },
];

let builtTreePromise = null;

async function buildTree() {
  const tree = await mkdtemp(path.join(coverageTreeRoot(), "osdb-db-runtime-"));

  // Injectable env mock: tests set env.DB to a D1SqliteDatabase instance.
  const envUrl = pathToFileURL(path.join(tree, "cloudflare-workers.mjs")).href;
  await writeFile(
    path.join(tree, "cloudflare-workers.mjs"),
    '// Injectable cloudflare:workers env mock for DB-layer integration tests.\nexport const env = {};\n',
  );

  await mkdir(path.join(tree, "db"), { recursive: true });
  await mkdir(path.join(tree, "app", "lib"), { recursive: true });
  for (const { source, output } of DB_MODULES) {
    const sourcePath = path.join(root, source);
    const compiled = ts.transpileModule(await readFile(sourcePath, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      fileName: sourcePath,
    }).outputText;

    const rewritten = compiled
      .replace(/from\s*["']cloudflare:workers["']/g, `from "${envUrl}"`)
      // Rewrite both ./ and ../ relative imports to their .mjs counterparts;
      // db/cameras.ts imports ../app/lib/duplicate-detection, which the
      // transpiled tree mirrors under app/lib/duplicate-detection.mjs.
      .replace(/(from\s*["'])(\.\.?\/[^"']+)(["'])/g, (match, prefix, specifier, suffix) =>
        specifier.endsWith(".mjs") ? match : `${prefix}${specifier}.mjs${suffix}`,
      );

    // Modules can live in nested dirs (db/, app/lib/); mirror the layout.
    await mkdir(path.dirname(path.join(tree, output)), { recursive: true });
    await writeFile(path.join(tree, output), rewritten);
  }
  return tree;
}

export async function loadDbRuntime() {
  if (!builtTreePromise) builtTreePromise = buildTree();
  const tree = await builtTreePromise;
  const envModule = await import(pathToFileURL(path.join(tree, "cloudflare-workers.mjs")).href);
  const cameras = await import(pathToFileURL(path.join(tree, "db/cameras.mjs")).href);
  const corrections = await import(pathToFileURL(path.join(tree, "db/corrections.mjs")).href);
  const moderation = await import(pathToFileURL(path.join(tree, "db/moderation.mjs")).href);
  const auth = await import(pathToFileURL(path.join(tree, "db/auth.mjs")).href);
  const users = await import(pathToFileURL(path.join(tree, "db/users.mjs")).href);
  const appeals = await import(pathToFileURL(path.join(tree, "db/appeals.mjs")).href);
  const retention = await import(pathToFileURL(path.join(tree, "db/retention.mjs")).href);
  const confirmations = await import(pathToFileURL(path.join(tree, "db/confirmations.mjs")).href);
  const cameraEdits = await import(pathToFileURL(path.join(tree, "db/camera-edits.mjs")).href);
  const passkeys = await import(pathToFileURL(path.join(tree, "db/passkeys.mjs")).href);
  const mailer = await import(pathToFileURL(path.join(tree, "db/mailer.mjs")).href);
  const emailTemplates = await import(pathToFileURL(path.join(tree, "app/lib/email-templates.mjs")).href);
  const oidc = await import(pathToFileURL(path.join(tree, "db/oidc.mjs")).href);
  const communitySettings = await import(pathToFileURL(path.join(tree, "db/community-settings.mjs")).href);
  const communityActions = await import(pathToFileURL(path.join(tree, "db/community-actions.mjs")).href);
  const importSources = await import(pathToFileURL(path.join(tree, "db/import-sources.mjs")).href);
  return { env: envModule.env, cameras, corrections, moderation, auth, users, appeals, retention, confirmations, cameraEdits, passkeys, mailer, emailTemplates, oidc, communitySettings, communityActions, importSources };
}

// Replays the real Drizzle migration files (drizzle/0000-*.sql ... 0017-*.sql)
// on a D1SqliteDatabase, mirroring `wrangler d1 migrations apply` on a fresh
// local DB: full application schema, zero demo rows (0017 removes the seed).
export async function applyDrizzleMigrations(db) {
  const files = (await readdir(DRIZZLE_DIR))
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  for (const file of files) {
    db.exec(await readFile(path.join(DRIZZLE_DIR, file), "utf8"));
  }
}

// Seeds the demo identities that migrations 0008/0010 used to insert and
// migration 0017 now removes. Suites that exercise moderation/appeals/auth
// against the real schema (auth-flow-e2e, appeals) call this after
// applyDrizzleMigrations() to reproduce the pre-alpha demo fixture, exactly
// like a deploy provisioning real accounts before opening the DB.
//
// NOTE: ids are inserted explicitly so the suites' hardcoded reviewer/user
// ids (1-5 reviewers, 1-6 users) keep matching, exactly as the original
// migration seed produced them.
export async function seedDemoIdentities(db) {
  db.exec(`
    INSERT INTO users (id, email, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES
      (1, 'intake@osdb.test', 'Demo Intake Reviewer', 'moderator', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'),
      (2, 'record@osdb.test', 'Demo Record Reviewer', 'moderator', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'),
      (3, 'senior@osdb.test', 'Demo Senior Moderator', 'moderator', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'),
      (4, 'privacy@osdb.test', 'Demo Privacy Lead', 'moderator', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'),
      (5, 'admin@osdb.test', 'Demo Administrator', 'admin', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'),
      (6, 'contributor@osdb.test', 'Demo Contributor', 'contributor', 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
  `);
  db.exec(`
    INSERT INTO reviewers (id, display_name, role, active, mfa_enabled, created_at, updated_at) VALUES
      (1, 'Demo Intake Reviewer', 'intake_reviewer', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z'),
      (2, 'Demo Record Reviewer', 'record_reviewer', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z'),
      (3, 'Demo Senior Moderator', 'senior_moderator', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z'),
      (4, 'Demo Privacy Lead', 'privacy_safety_lead', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z'),
      (5, 'Demo Administrator', 'administrator', 1, 0, '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z');
  `);
  db.exec(`
    UPDATE reviewers SET user_id = (SELECT id FROM users WHERE email = 'intake@osdb.test') WHERE display_name = 'Demo Intake Reviewer';
    UPDATE reviewers SET user_id = (SELECT id FROM users WHERE email = 'record@osdb.test') WHERE display_name = 'Demo Record Reviewer';
    UPDATE reviewers SET user_id = (SELECT id FROM users WHERE email = 'senior@osdb.test') WHERE display_name = 'Demo Senior Moderator';
    UPDATE reviewers SET user_id = (SELECT id FROM users WHERE email = 'privacy@osdb.test') WHERE display_name = 'Demo Privacy Lead';
    UPDATE reviewers SET user_id = (SELECT id FROM users WHERE email = 'admin@osdb.test') WHERE display_name = 'Demo Administrator';
  `);
}

export async function cleanupDbRuntime() {
  if (!builtTreePromise) return;
  const tree = await builtTreePromise;
  if (coverageTreeCleanupEnabled()) {
    await rm(tree, { recursive: true, force: true });
  }
  builtTreePromise = null;
}
