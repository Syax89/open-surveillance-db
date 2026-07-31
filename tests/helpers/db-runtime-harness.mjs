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
// files (drizzle/0000-*.sql ... 0006-*.sql) on the in-memory database, so
// tests exercise exactly what `wrangler d1 migrations apply` produces on a
// fresh local DB — with zero demo rows.
//
// Every load builds a fresh temp tree, so module instances never share
// state across tests.

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRIZZLE_DIR = path.join(root, "drizzle");

const DB_MODULES = [
  { source: "db/cameras.ts", output: "db/cameras.mjs" },
  { source: "db/moderation.ts", output: "db/moderation.mjs" },
  // db/corrections.ts (private correction/removal intake) imports getD1 from
  // ./cameras, so it runs against the same binding and public boundary.
  { source: "db/corrections.ts", output: "db/corrections.mjs" },
  // db/photos.ts (photo evidence) imports getD1 from ./cameras and type-only
  // from ./moderation; db/moderation.ts imports listPendingPhotos from it.
  { source: "db/photos.ts", output: "db/photos.mjs" },
  // db/moderation.ts imports ./freshness (pure, no CF binding); transpile it
  // into the temp tree so the rewritten import resolves.
  { source: "db/freshness.ts", output: "db/freshness.mjs" },
  // db/cameras.ts imports ../app/lib/duplicate-detection (pure, no CF binding);
  // transpile it into the temp tree so the rewritten import resolves.
  { source: "app/lib/duplicate-detection.ts", output: "app/lib/duplicate-detection.mjs" },
  // db/cameras.ts and db/freshness.ts import ../app/lib/public-status (pure,
  // shared public-status whitelist); mirror it into the temp tree as well.
  { source: "app/lib/public-status.ts", output: "app/lib/public-status.mjs" },
  // db/auth.ts (contributor accounts and sessions, ADR 0013) imports getD1
  // from ./cameras; it runs against the same binding and in-memory D1.
  { source: "db/auth.ts", output: "db/auth.mjs" },
];

let builtTreePromise = null;

async function buildTree() {
  const tree = await mkdtemp(path.join(os.tmpdir(), "osdb-db-runtime-"));

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
  const photos = await import(pathToFileURL(path.join(tree, "db/photos.mjs")).href);
  return { env: envModule.env, cameras, corrections, moderation, auth, photos };
}

// Replays the real Drizzle migration files (drizzle/0000-*.sql ... 0006-*.sql)
// on a D1SqliteDatabase, mirroring `wrangler d1 migrations apply` on a fresh
// local DB: 3 tables + 3 indexes + 19 cameras columns (16 base + 3 freshness), zero demo rows.
export async function applyDrizzleMigrations(db) {
  const files = (await readdir(DRIZZLE_DIR))
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();
  for (const file of files) {
    db.exec(await readFile(path.join(DRIZZLE_DIR, file), "utf8"));
  }
}

export async function cleanupDbRuntime() {
  if (!builtTreePromise) return;
  const tree = await builtTreePromise;
  await rm(tree, { recursive: true, force: true });
  builtTreePromise = null;
}
