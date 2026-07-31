// Runtime harness for the database layer (db/cameras.ts, db/moderation.ts).
//
// The api-harness in tests/helpers/api-harness.mjs transpiles *route*
// handlers and stubs every db module. This harness goes one level deeper:
// it transpiles the real database modules against an injectable
// `cloudflare:workers` env mock, so the actual SQL (status transitions,
// event writes, public queries, seeding) runs against a real in-memory
// SQLite database through the D1 adapter in tests/helpers/d1-sqlite.mjs.
//
// Every load builds a fresh temp tree, so module instances never share
// state across tests.

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const DB_MODULES = [
  { source: "db/cameras.ts", output: "db/cameras.mjs" },
  { source: "db/moderation.ts", output: "db/moderation.mjs" },
];

// Relative-import rewriter: adds a .mjs extension to every relative
// specifier that does not already carry one. Handles both same-directory
// ("./x") and cross-directory ("../app/lib/x") imports so the transpiled
// modules resolve inside the temp tree.
function addMjsExtension(code) {
  return code.replace(
    /(from\s*["'])(\.[^"']+)(["'])/g,
    (match, prefix, specifier, suffix) =>
      specifier.endsWith(".mjs") ? match : `${prefix}${specifier}.mjs${suffix}`,
  );
}

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

    const rewritten = addMjsExtension(
      compiled.replace(/from\s*["']cloudflare:workers["']/g, `from "${envUrl}"`),
    );

    await writeFile(path.join(tree, output), rewritten);
  }

  // Mirror app/lib/*.ts (pure helpers) so cross-directory imports from the
  // db modules (e.g. db/cameras.ts -> ../app/lib/duplicate-detection)
  // resolve inside the temp tree.
  const libDir = path.join(root, "app", "lib");
  const libOutputDir = path.join(tree, "app", "lib");
  await mkdir(libOutputDir, { recursive: true });
  for (const entry of await readdir(libDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const libCompiled = ts.transpileModule(await readFile(path.join(libDir, entry.name), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      fileName: path.join(libDir, entry.name),
    }).outputText;
    await writeFile(
      path.join(libOutputDir, entry.name.replace(/\.ts$/, ".mjs")),
      addMjsExtension(libCompiled),
    );
  }
  return tree;
}

export async function loadDbRuntime() {
  if (!builtTreePromise) builtTreePromise = buildTree();
  const tree = await builtTreePromise;
  const envModule = await import(pathToFileURL(path.join(tree, "cloudflare-workers.mjs")).href);
  const cameras = await import(pathToFileURL(path.join(tree, "db/cameras.mjs")).href);
  const moderation = await import(pathToFileURL(path.join(tree, "db/moderation.mjs")).href);
  return { env: envModule.env, cameras, moderation };
}

export async function cleanupDbRuntime() {
  if (!builtTreePromise) return;
  const tree = await builtTreePromise;
  await rm(tree, { recursive: true, force: true });
  builtTreePromise = null;
}
