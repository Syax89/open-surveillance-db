// E2E runtime harness for the authenticated submit→moderate→publish flow.
//
// The api-harness (tests/helpers/api-harness.mjs) transpiles the route
// handlers but rewrites every `db/*` import to the test mocks, so it cannot
// prove the flow end to end. The db-runtime-harness runs the real db modules
// against in-memory SQLite but never through the HTTP layer.
//
// This harness combines both: it builds ONE temp tree containing
//
//   1. the real transpiled db modules (db/cameras, db/corrections,
//      db/moderation, db/freshness) at the same relative depth the routes
//      expect (`db/*.mjs`), so the route handlers execute the actual SQL
//      against an injectable env.DB (D1SqliteDatabase),
//   2. the real transpiled app/lib/*.ts pure helpers,
//   3. the real transpiled route handlers (app/api/*/route.mjs) whose
//      relative `db/*` and `lib/*` imports resolve inside the tree,
//   4. a network-free geocode mock (db/geocode.mjs) so locality search stays
//      deterministic (coordinate queries never touch it),
//   5. the transpiled worker edge gate (worker.mjs) with the vinext build
//      imports stubbed, so the moderation auth gate can be exercised at
//      runtime with real Request objects (401/503/pass-through).
//
// Tests apply the real Drizzle migrations on a fresh D1SqliteDatabase per
// test and assign it to env.DB, exactly like `wrangler d1 migrations apply`
// on a fresh local DB. No demo data, no network, no mocks of the db layer.

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
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
  { source: "app/api/corrections/route.ts", output: "app/api/corrections/route.mjs" },
  // Account erasure (R7): exercised end to end with a real session built via
  // the real db/auth module, so the DELETE handler runs against real SQL.
  { source: "app/api/auth/account/route.ts", output: "app/api/auth/account/route.mjs" },
  // Contributor auth (ADR 0013 + 0015): register/login run the real db/auth
  // SQL against the in-memory D1, so the per-email lockout (429, Retry-After,
  // reset on success, expiry) is exercised end to end.
  { source: "app/api/auth/register/route.ts", output: "app/api/auth/register/route.mjs" },
  { source: "app/api/auth/login/route.ts", output: "app/api/auth/login/route.mjs" },
  // Auth roles + appeals (ADR 0014): contributor files an appeal, moderators
  // list and decide it. The [id] route lives in its own directory.
  { source: "app/api/appeals/route.ts", output: "app/api/appeals/route.mjs" },
  { source: "app/api/appeals/[id]/route.ts", output: "app/api/appeals/[id]/route.mjs" },
];

// Real db modules compiled into the tree (NOT mocks): the route handlers will
// call these and they run the real SQL against env.DB.
const REAL_DB_MODULES = [
  { source: "db/cameras.ts", output: "db/cameras.mjs" },
  { source: "db/corrections.ts", output: "db/corrections.mjs" },
  { source: "db/moderation.ts", output: "db/moderation.mjs" },
  { source: "db/freshness.ts", output: "db/freshness.mjs" },
  // db/auth.ts (ADR 0013) is imported by app/lib/auth-session.ts, which the
  // cameras route now pulls in for optional contributor attribution; it must
  // exist in the tree so the transitive import resolves against the real db.
  { source: "db/auth.ts", output: "db/auth.mjs" },
  // Auth roles + appeals (ADR 0014): db/users and db/appeals are imported by
  // the authz lib and the appeals routes; they run against the same env.DB.
  { source: "db/users.ts", output: "db/users.mjs" },
  { source: "db/appeals.ts", output: "db/appeals.mjs" },
  { source: "db/photos.ts", output: "db/photos.mjs" },
];

let builtTreePromise = null;

const transpile = (sourcePath) =>
  ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
    fileName: sourcePath,
  }).outputText;

// Rewrite the transpiled ESM so it resolves inside the temp tree:
//   - every relative import (./x, ../x, ../../x, ...) gets an explicit .mjs
//     extension unless it already carries one,
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

async function buildTree() {
  const tree = await mkdtemp(path.join(os.tmpdir(), "osdb-e2e-"));

  // 1. Injectable env mock: routes and real db modules share this instance.
  const workersMockUrl = pathToFileURL(path.join(tree, "cloudflare-workers.mjs")).href;
  await writeFile(
    path.join(tree, "cloudflare-workers.mjs"),
    await readFile(path.join(root, "tests/helpers/mocks/cloudflare-workers.mjs"), "utf8"),
  );

  // 2. app/lib/*.ts pure helpers (same set the api-harness compiles).
  const libDir = path.join(root, "app", "lib");
  const libOutputDir = path.join(tree, "app", "lib");
  await mkdir(libOutputDir, { recursive: true });
  for (const entry of await readdir(libDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const compiled = rewriteSpecifiers(transpile(path.join(libDir, entry.name)), "");
    await writeFile(path.join(libOutputDir, entry.name.replace(/\.ts$/, ".mjs")), compiled);
  }

  // 3. Real db modules into db/*.mjs (their ./x and ../app/lib/x imports get
  //    explicit .mjs and resolve inside the tree).
  await mkdir(path.join(tree, "db"), { recursive: true });
  for (const { source, output } of REAL_DB_MODULES) {
    const rewritten = rewriteSpecifiers(transpile(path.join(root, source)), workersMockUrl);
    await writeFile(path.join(tree, output), rewritten);
  }

  // 4. Network-free geocode mock (the search route imports db/geocode; the
  //    real module would call Nominatim). Coordinate queries never invoke it.
  const mockStateUrl = pathToFileURL(path.join(root, "tests/helpers/mock-state.mjs")).href;
  const geocodeMock = await readFile(path.join(root, "tests/helpers/mocks/geocode.mjs"), "utf8");
  await writeFile(
    path.join(tree, "db", "geocode.mjs"),
    geocodeMock.replaceAll('from "../mock-state.mjs"', `from "${mockStateUrl}"`),
  );

  // 5. Routes: real handlers, db/lib imports resolve inside the tree.
  for (const { source, output } of ROUTES) {
    const rewritten = rewriteSpecifiers(transpile(path.join(root, source)), workersMockUrl);
    const unresolvedImports = [
      ...rewritten.matchAll(/(?:from|import)\s*["'](\.[^"']+|\.[^"']+\/[^"']+)[ "']/g),
    ]
      .map((match) => match[1])
      .filter((specifier) => !specifier.endsWith(".mjs") && !specifier.startsWith("file:"));
    if (unresolvedImports.length > 0) {
      throw new Error(
        `route ${source} still has unresolved relative imports: ${unresolvedImports.join(", ")}`,
      );
    }
    await mkdir(path.dirname(path.join(tree, output)), { recursive: true });
    await writeFile(path.join(tree, output), rewritten);
  }

  // 6. Worker edge gate: transpile worker/index.ts, stub the vinext build
  //    imports (image optimization + app-router entry) so the auth gate can
  //    run in Node. The stubbed router records whether it was reached.
  if (existsSync(path.join(root, "worker", "index.ts"))) {
    const imageStubUrl = pathToFileURL(path.join(tree, "vinext-image-stub.mjs")).href;
    await writeFile(
      path.join(tree, "vinext-image-stub.mjs"),
      'export const handleImageOptimization = async () => new Response("img");\n' +
        "export const DEFAULT_DEVICE_SIZES = [];\n" +
        "export const DEFAULT_IMAGE_SIZES = [];\n",
    );
    const routerStubUrl = pathToFileURL(path.join(tree, "vinext-router-stub.mjs")).href;
    await writeFile(
      path.join(tree, "vinext-router-stub.mjs"),
      'export default { fetch: async () => new Response("handler-called") };\n',
    );
    const compiled = transpile(path.join(root, "worker", "index.ts"));
    const rewritten = compiled
      .replace(/from\s*["']vinext\/server\/image-optimization["']/g, `from "${imageStubUrl}"`)
      .replace(/from\s*["']vinext\/server\/app-router-entry["']/g, `from "${routerStubUrl}"`)
      .replace(/from\s*["']cloudflare:workers["']/g, `from "${workersMockUrl}"`);
    await writeFile(path.join(tree, "worker.mjs"), rewritten);
  }

  return tree;
}

export function buildE2ETree() {
  if (!builtTreePromise) builtTreePromise = buildTree();
  return builtTreePromise;
}

// relativeOutput: e.g. "app/api/moderation/route.mjs"
export async function loadE2ERoute(relativeOutput) {
  const tree = await buildE2ETree();
  return import(pathToFileURL(path.join(tree, relativeOutput)).href);
}

// Load any module compiled into the same tree (cloudflare-workers.mjs,
// worker.mjs, db/cameras.mjs, app/lib/*.mjs). The cached tree is shared, so
// the module instance is the same one the route handlers imported.
export async function loadE2EModule(relativeOutput) {
  const tree = await buildE2ETree();
  return import(pathToFileURL(path.join(tree, relativeOutput)).href);
}

// The shared env object routes and db modules read live. Tests assign
// env.DB = new D1SqliteDatabase() after applying migrations.
export async function e2eEnv() {
  return (await loadE2EModule("cloudflare-workers.mjs")).env;
}

export async function cleanupE2ETree() {
  if (!builtTreePromise) return;
  const tree = await builtTreePromise;
  await rm(tree, { recursive: true, force: true });
  builtTreePromise = null;
}
