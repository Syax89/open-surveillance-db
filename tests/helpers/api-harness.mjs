// Runtime harness for the API route handlers.
//
// The routes are TypeScript modules that import database helpers from
// `db/*`, which in turn import the Cloudflare `cloudflare:workers` binding —
// impossible to run in plain Node. To exercise the real handler logic
// (validation, serialisation, HTTP status codes) we:
//
//   1. transpile each route .ts to ESM JS with the repo's own typescript dep,
//   2. rewrite the relative `db/*` import specifiers to point at the mocks in
//      tests/helpers/mocks/ (mirroring the original relative tree layout),
//   3. import the resulting modules and call the exported handlers with real
//      `Request` objects.
//
// Every test gets a fresh temp tree so module instances never share state.

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const ROUTES = [
  { source: "app/api/cameras/route.ts", output: "app/api/cameras/route.mjs" },
  { source: "app/api/cameras/nearby/route.ts", output: "app/api/cameras/nearby/route.mjs" },
  { source: "app/api/cameras/search/route.ts", output: "app/api/cameras/search/route.mjs" },
  { source: "app/api/cameras/revisions/route.ts", output: "app/api/cameras/revisions/route.mjs" },
  { source: "app/api/moderation/route.ts", output: "app/api/moderation/route.mjs" },
  { source: "app/api/moderation/photos/[id]/route.ts", output: "app/api/moderation/photos/[id]/route.mjs" },
  { source: "app/api/corrections/route.ts", output: "app/api/corrections/route.mjs" },
  { source: "app/api/tiles/[z]/[x]/[y]/route.ts", output: "app/api/tiles/[z]/[x]/[y]/route.mjs" },
  { source: "app/api/auth/register/route.ts", output: "app/api/auth/register/route.mjs" },
  { source: "app/api/auth/login/route.ts", output: "app/api/auth/login/route.mjs" },
  { source: "app/api/auth/logout/route.ts", output: "app/api/auth/logout/route.mjs" },
  { source: "app/api/auth/me/route.ts", output: "app/api/auth/me/route.mjs" },
  { source: "app/api/auth/me/submissions/route.ts", output: "app/api/auth/me/submissions/route.mjs" },
  { source: "app/api/auth/account/route.ts", output: "app/api/auth/account/route.mjs" },
  { source: "app/api/photos/route.ts", output: "app/api/photos/route.mjs" },
  { source: "app/api/photos/[id]/route.ts", output: "app/api/photos/[id]/route.mjs" },
];

// Real db/* modules compiled into the temp tree so runtime tests can
// exercise the actual public-query and moderation boundaries against an
// in-memory D1 (see tests/helpers/d1-sqlite.mjs). They land in a separate
// db-real/ directory so they never collide with the db/* mocks the route
// handlers import. db/index.ts (drizzle) and db/schema.ts are deliberately
// excluded: the raw-D1 modules never import them at runtime. The modules
// import the same cloudflare:workers mock as the routes, so tests inject
// env.DB (a D1 adapter instance) and run the real SQL.
const REAL_DB_MODULES = [
  { source: "db/cameras.ts", output: "db-real/cameras.mjs" },
  { source: "db/corrections.ts", output: "db-real/corrections.mjs" },
  { source: "db/moderation.ts", output: "db-real/moderation.mjs" },
  { source: "db/photos.ts", output: "db-real/photos.mjs" },
];
// db/moderation.ts imports ./freshness (pure, no CF binding) once the
// freshness feature is present. CI checks out the PR head, not the merge
// with main, so the source file may not exist on the branch even when it is
// on main. Compile it only when present — db/moderation.ts imports it only
// in that case, so the two stay consistent in every state.
if (existsSync(path.join(root, "db/freshness.ts"))) {
  REAL_DB_MODULES.push({ source: "db/freshness.ts", output: "db-real/freshness.mjs" });
}

let builtTreePromise = null;

async function buildTree() {
  const tree = await mkdtemp(path.join(os.tmpdir(), "osdb-routes-"));

  // Mirror the mocked db modules at the same relative depth the routes
  // expect (tmp/db/cameras.mjs etc.). The mock modules import the shared
  // state via a relative path that no longer holds after the copy, so the
  // specifier is rewritten to the absolute path of the real file — tests and
  // mocks then share a single module instance.
  const mocksDir = path.join(root, "tests", "helpers", "mocks");
  const mockStateUrl = pathToFileURL(path.join(root, "tests", "helpers", "mock-state.mjs")).href;
  await mkdir(path.join(tree, "db"), { recursive: true });
  for (const mockName of ["cameras", "corrections", "geocode", "moderation", "auth", "photos"]) {
    const source = await readFile(path.join(mocksDir, `${mockName}.mjs`), "utf8");
    await writeFile(
      path.join(tree, "db", `${mockName}.mjs`),
      source.replaceAll('from "../mock-state.mjs"', `from "${mockStateUrl}"`),
    );
  }

  // The `cloudflare:workers` runtime surface: plain Node cannot resolve the
  // scheme, so the transpiled routes are pointed at a static mock module.
  const workersMockUrl = pathToFileURL(path.join(tree, "cloudflare-workers.mjs")).href;
  await writeFile(
    path.join(tree, "cloudflare-workers.mjs"),
    await readFile(path.join(mocksDir, "cloudflare-workers.mjs"), "utf8"),
  );

  // Mirror app/lib/*.ts (pure helpers, no Workers bindings) so relative
  // `lib/*` imports resolve inside the temp tree.
  const libDir = path.join(root, "app", "lib");
  const libOutputDir = path.join(tree, "app", "lib");
  await mkdir(libOutputDir, { recursive: true });
  for (const entry of await readdir(libDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const libCompiled = rewriteSpecifiers(
      ts.transpileModule(await readFile(path.join(libDir, entry.name), "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
        },
        fileName: path.join(libDir, entry.name),
      }).outputText,
      "",
    );
    await writeFile(path.join(libOutputDir, entry.name.replace(/\.ts$/, ".mjs")), libCompiled);
  }

  for (const { source, output } of ROUTES) {
    const sourcePath = path.join(root, source);
    const outputPath = path.join(tree, output);

    const compiled = ts.transpileModule(await readFile(sourcePath, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      fileName: sourcePath,
    }).outputText;

    const rewritten = rewriteSpecifiers(compiled, workersMockUrl);
    // Sanity check: every relative db/lib import must now carry an explicit .mjs.
    const unresolvedImports = [...rewritten.matchAll(/(?:from|import)\s*["'](\.[^"']*\/db\/[^"']+|\.[^"']*\/lib\/[^"']+)["']/g)]
      .map((match) => match[1])
      .filter((specifier) => !specifier.endsWith(".mjs"));
    if (unresolvedImports.length > 0) {
      throw new Error(
        `route ${source} still has unresolved relative imports: ${unresolvedImports.join(", ")}`,
      );
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, rewritten);
  }

  // Compile the real db/* modules into db-real/. Unlike the routes, their
  // relative imports are plain "./cameras" or cross-dir "../app/lib/*" (no
  // /db/ segment), so the generic rewriteSpecifiers pattern does not apply:
  // any relative import without an explicit .mjs extension gets one.
  await mkdir(path.join(tree, "db-real"), { recursive: true });
  for (const { source, output } of REAL_DB_MODULES) {
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
      .replace(/from\s*["']cloudflare:workers["']/g, `from "${workersMockUrl}"`)
      .replace(/(from\s*["'])(\.\.?\/[^"']+)(["'])/g, (match, prefix, specifier, suffix) =>
        specifier.endsWith(".mjs") ? match : `${prefix}${specifier}.mjs${suffix}`,
      );

    await writeFile(path.join(tree, output), rewritten);
  }
  return tree;
}

// Rewrite the transpiled ESM so it resolves inside the temp tree:
//   - every relative import (./x, ../x, ../../x, ...) gets an explicit .mjs
//     extension unless it already carries one (the tree mirrors sources as
//     .mjs at every depth: db/*, app/lib/*, and lib-internal sibling imports
//     like `./public-status` in app/lib/records.ts),
//   - the bare `cloudflare:workers` specifier is pointed at the mock module.
function rewriteSpecifiers(code, workersMockUrl) {
  let rewritten = code.replace(
    /(from\s*["'])(\.\.?\/[^"']+)(["'])/g,
    (match, prefix, specifier, suffix) =>
      specifier.endsWith(".mjs") ? match : `${prefix}${specifier}.mjs${suffix}`,
  );
  if (workersMockUrl) {
    rewritten = rewritten.replace(
      /from\s*["']cloudflare:workers["']/g,
      `from "${workersMockUrl}"`,
    );
  }
  return rewritten;
}

export function buildRouteTree() {
  if (!builtTreePromise) builtTreePromise = buildTree();
  return builtTreePromise;
}

// relativeOutput: e.g. "app/api/cameras/route.mjs"
export async function loadRoute(relativeOutput) {
  const tree = await buildRouteTree();
  return import(pathToFileURL(path.join(tree, relativeOutput)).href);
}

// Load any other module compiled into the same temp tree — e.g. the real
// app/lib/rate-limit.mjs implementation or the cloudflare-workers mock whose
// `env` object the routes read live. The cached tree is shared, so the module
// instance is the same one the route handlers imported.
export async function loadTreeModule(relativeOutput) {
  const tree = await buildRouteTree();
  return import(pathToFileURL(path.join(tree, relativeOutput)).href);
}

// Alias used by the merged H1/duplicate-detection suites: the tree already
// transpiles every pure lib module, so tests can exercise them directly.
export const loadLib = loadTreeModule;

// Name-based convenience for the abuse-control suites: loads a transpiled
// app/lib module (e.g. "rate-limit") from the shared tree.
export const loadLibModule = (name) => loadTreeModule(path.join("app", "lib", `${name}.mjs`));


export async function cleanupRouteTree() {
  if (!builtTreePromise) return;
  const tree = await builtTreePromise;
  await rm(tree, { recursive: true, force: true });
  builtTreePromise = null;
}

// Build a real Request for the handlers. `body` may be a raw string
// (for malformed JSON tests) or any JSON-serialisable value.
export function apiRequest(pathAndQuery, { method = "GET", body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    if (typeof body === "string") {
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      init.headers["content-type"] = "application/json";
    }
  }
  return new Request(`https://osdb.test${pathAndQuery}`, init);
}

export async function responseBody(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
