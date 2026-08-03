// Freshness runtime harness: runs the REAL database layer (db/cameras.ts,
// db/moderation.ts, db/freshness.ts, db/corrections.ts) against a fresh
// in-memory SQLite database (node:sqlite) with a minimal D1-compatible
// adapter, so the freshness clocks, the public freshness boundary and the
// scheduled-expiry sweep are exercised at runtime instead of being stubbed.
//
// Named freshness-d1.mjs to stay out of the way of the route-level harness
// shipped in the state-transition suite (PR #19).
//
// The real Cloudflare D1 surface used by db/* is:
//   d1.prepare(sql).bind(...args).first<T>() -> T | null
//   d1.prepare(sql).bind(...args).all<T>()   -> { results: T[] }
//   d1.prepare(sql).bind(...args).run()      -> { meta: {...} }
//   d1.batch([preparedStatements])           -> executes in order
//
// node:sqlite is available on Node >= 22.5 (project requires >= 22.13).

import { DatabaseSync } from "node:sqlite";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
import { applyDrizzleMigrations } from "./db-runtime-harness.mjs";
import { coverageTreeRoot } from "./coverage-tree.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function toPlain(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  // node:sqlite rows carry a null prototype; hand back plain objects so
  // deepEqual comparisons against fixtures behave predictably.
  return Object.fromEntries(Object.entries(value));
}

export class FreshnessD1 {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new FreshnessStatement(this.database, sql);
  }

  exec(sql) {
    this.database.exec(sql);
  }

  // Used by getD1()/getModerationD1() for CREATE TABLE/INDEX batches and by
  // the atomic write paths (decision batches). Wraps in BEGIN/COMMIT/ROLLBACK
  // and returns one per-statement result like the real binding: RETURNING
  // statements AND plain SELECT statements execute via all() (rows in
  // `results` — real D1 populates `results` for SELECTs in a batch too),
  // others via run().
  batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) {
        if (/\breturning\b/i.test(statement.sql) || /^\s*(SELECT|WITH|PRAGMA)\b/i.test(statement.sql)) {
          const { results: rows } = statement.all();
          results.push({ success: true, results: rows, meta: { changes: rows.length, lastRowId: 0 } });
        } else {
          const { meta } = statement.run();
          results.push({ success: true, results: [], meta });
        }
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class FreshnessStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.boundArgs = [];
  }

  bind(...args) {
    this.boundArgs = args;
    return this;
  }

  run() {
    const result = this.database.prepare(this.sql).run(...this.boundArgs);
    return { meta: { changes: Number(result.changes), lastRowId: Number(result.lastInsertRowid) } };
  }

  first() {
    const row = this.database.prepare(this.sql).get(...this.boundArgs);
    return row === undefined ? null : toPlain(row);
  }

  all() {
    const rows = this.database.prepare(this.sql).all(...this.boundArgs);
    return { results: rows.map(toPlain) };
  }
}

let modulesPromise = null;

async function buildDbModules() {
  const tree = await mkdtemp(path.join(coverageTreeRoot(), "osdb-freshness-"));
  const workersUrl = pathToFileURL(path.join(tree, "cloudflare-workers.mjs")).href;

  await writeFile(
    path.join(tree, "cloudflare-workers.mjs"),
    '// Mock of the cloudflare:workers runtime surface: env.DB is read lazily\n' +
    '// so each test can point it at a fresh in-memory database.\n' +
    'export const env = {\n' +
    '  get DB() {\n' +
    '    return globalThis.__OSDB_FRESHNESS_D1__;\n' +
    '  },\n' +
    // ADR 0008 demo gate (t_d7a4b99b): db/cameras.ts reads env.ENVIRONMENT at
    // query time to decide whether `demo` records are public. A live getter
    // lets tests flip the deployment environment between tests.
    '  get ENVIRONMENT() {\n' +
    '    return globalThis.__OSDB_FRESHNESS_ENV__;\n' +
    '  },\n' +
    '};\n',
  );

  const dbDir = path.join(root, "db");
  await mkdir(path.join(tree, "db"), { recursive: true });
  const modules = {};
  // db/cameras.ts imports ./confirmations at runtime (the public payload
  // carries confirmationCount), so the real db layer must resolve it.
  for (const file of ["cameras.ts", "corrections.ts", "freshness.ts", "moderation.ts", "photos.ts", "confirmations.ts"]) {
    const compiled = ts.transpileModule(await readFile(path.join(dbDir, file), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      fileName: path.join(dbDir, file),
    }).outputText;

    const rewritten = compiled
      // Rewrite ./ and ../ relative imports to their .mjs counterparts
      // (db/cameras.ts imports ../app/lib/duplicate-detection).
      .replace(/(from\s*["'])(\.\.?\/[^"']+)(["'])/g, (match, prefix, specifier, suffix) =>
        specifier.endsWith(".mjs") ? match : `${prefix}${specifier}.mjs${suffix}`,
      )
      .replace(/from\s*["']cloudflare:workers["']/g, `from "${workersUrl}"`);

    await writeFile(path.join(tree, "db", file.replace(/\.ts$/, ".mjs")), rewritten);
  }

  // db/cameras.ts imports ../app/lib/duplicate-detection (pure, no CF binding);
  // mirror it into the temp tree so the rewritten import resolves.
  const appLibDir = path.join(root, "app", "lib");
  await mkdir(path.join(tree, "app", "lib"), { recursive: true });
  const compiledDuplicateDetection = ts.transpileModule(
    await readFile(path.join(appLibDir, "duplicate-detection.ts"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      fileName: path.join(appLibDir, "duplicate-detection.ts"),
    },
  ).outputText;
  await writeFile(
    path.join(tree, "app", "lib", "duplicate-detection.mjs"),
    compiledDuplicateDetection.replace(/from\s*["']cloudflare:workers["']/g, `from "${workersUrl}"`),
  );

  // db/cameras.ts and db/freshness.ts import ../app/lib/public-status (pure,
  // shared public-status whitelist); mirror it too.
  const compiledPublicStatus = ts.transpileModule(
    await readFile(path.join(appLibDir, "public-status.ts"), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      fileName: path.join(appLibDir, "public-status.ts"),
    },
  ).outputText;
  await writeFile(path.join(tree, "app", "lib", "public-status.mjs"), compiledPublicStatus);

  modules.cameras = await import(pathToFileURL(path.join(tree, "db", "cameras.mjs")).href);
  modules.corrections = await import(pathToFileURL(path.join(tree, "db", "corrections.mjs")).href);
  modules.freshness = await import(pathToFileURL(path.join(tree, "db", "freshness.mjs")).href);
  modules.moderation = await import(pathToFileURL(path.join(tree, "db", "moderation.mjs")).href);
  return modules;
}

function loadDbModules() {
  if (!modulesPromise) modulesPromise = buildDbModules();
  return modulesPromise;
}

/**
 * Fresh runtime per test: a brand-new in-memory SQLite database wrapped in the
 * D1 adapter, wired into env.DB. The schema is delivered by the real Drizzle
 * migrations (applyDrizzleMigrations), exactly like `wrangler d1 migrations
 * apply` on a fresh local DB — no runtime table creation, no demo seeding.
 * Returns the adapter (for raw SQL in tests) and the real db/* module
 * namespaces.
 */
export async function freshRuntime() {
  const database = new DatabaseSync(":memory:");
  const d1 = new FreshnessD1(database);
  await applyDrizzleMigrations(d1);
  globalThis.__OSDB_FRESHNESS_D1__ = d1;
  const modules = await loadDbModules();
  return { database, d1, ...modules };
}
