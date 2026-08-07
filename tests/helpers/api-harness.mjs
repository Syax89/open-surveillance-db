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

import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { coverageTreeCleanupEnabled, coverageTreeRoot } from "./coverage-tree.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const ROUTES = [
  { source: "app/api/cameras/route.ts", output: "app/api/cameras/route.mjs" },
  { source: "app/api/cameras/[id]/route.ts", output: "app/api/cameras/[id]/route.mjs" },
  { source: "app/api/cameras/[id]/edit/route.ts", output: "app/api/cameras/[id]/edit/route.mjs" },
  { source: "app/api/cameras/[id]/confirmation/route.ts", output: "app/api/cameras/[id]/confirmation/route.mjs" },
  { source: "app/api/cameras/nearby/route.ts", output: "app/api/cameras/nearby/route.mjs" },
  { source: "app/api/cameras/search/route.ts", output: "app/api/cameras/search/route.mjs" },
  { source: "app/api/cameras/revisions/route.ts", output: "app/api/cameras/revisions/route.mjs" },
  { source: "app/api/moderation/route.ts", output: "app/api/moderation/route.mjs" },
  { source: "app/api/moderation/corrections/route.ts", output: "app/api/moderation/corrections/route.mjs" },
  { source: "app/api/moderation/photos/[id]/route.ts", output: "app/api/moderation/photos/[id]/route.mjs" },
  { source: "app/api/corrections/route.ts", output: "app/api/corrections/route.mjs" },
  { source: "app/api/tiles/[z]/[x]/[y]/route.ts", output: "app/api/tiles/[z]/[x]/[y]/route.mjs" },
  { source: "app/api/geocode/route.ts", output: "app/api/geocode/route.mjs" },
  { source: "app/api/auth/register/route.ts", output: "app/api/auth/register/route.mjs" },
  { source: "app/api/auth/login/route.ts", output: "app/api/auth/login/route.mjs" },
  { source: "app/api/auth/logout/route.ts", output: "app/api/auth/logout/route.mjs" },
  // Email verification + password reset (multi-method auth Fase B): the
  // verify-email GET consumes the emailed single-use token; the resend POST
  // (session-gated, 3/h budget) mints a fresh one; reset-password/request is
  // the public anti-enumeration entry; reset-password/confirm rotates the
  // hash and revokes sessions.
  { source: "app/api/auth/verify-email/route.ts", output: "app/api/auth/verify-email/route.mjs" },
  { source: "app/api/auth/verify-email/resend/route.ts", output: "app/api/auth/verify-email/resend/route.mjs" },
  { source: "app/api/auth/reset-password/request/route.ts", output: "app/api/auth/reset-password/request/route.mjs" },
  { source: "app/api/auth/reset-password/confirm/route.ts", output: "app/api/auth/reset-password/confirm/route.mjs" },
  { source: "app/api/auth/me/route.ts", output: "app/api/auth/me/route.mjs" },
  { source: "app/api/auth/me/submissions/route.ts", output: "app/api/auth/me/submissions/route.mjs" },
  { source: "app/api/auth/me/contributions/route.ts", output: "app/api/auth/me/contributions/route.mjs" },
  { source: "app/api/auth/account/route.ts", output: "app/api/auth/account/route.mjs" },
  // Multi-method auth Fase C (t_36989e06): passkey ceremonies, recovery
  // codes and passkey management. The [id]-less credentials route exports
  // GET (list) + DELETE (remove).
  { source: "app/api/auth/passkey/register/begin/route.ts", output: "app/api/auth/passkey/register/begin/route.mjs" },
  { source: "app/api/auth/passkey/register/complete/route.ts", output: "app/api/auth/passkey/register/complete/route.mjs" },
  { source: "app/api/auth/passkey/login/begin/route.ts", output: "app/api/auth/passkey/login/begin/route.mjs" },
  { source: "app/api/auth/passkey/login/complete/route.ts", output: "app/api/auth/passkey/login/complete/route.mjs" },
  { source: "app/api/auth/passkey/credentials/route.ts", output: "app/api/auth/passkey/credentials/route.mjs" },
  { source: "app/api/auth/recovery/route.ts", output: "app/api/auth/recovery/route.mjs" },
  // External OIDC login (Fase D, ADR 0020 decision 4): /start begins the
  // PKCE redirect, /callback consumes the provider handshake, /merge is the
  // manual email-conflict merge backend. The [provider] path segment is
  // parsed from the URL inside the handler, so the same compiled module
  // serves both providers.
  { source: "app/api/auth/oidc/[provider]/start/route.ts", output: "app/api/auth/oidc/[provider]/start/route.mjs" },
  { source: "app/api/auth/oidc/[provider]/callback/route.ts", output: "app/api/auth/oidc/[provider]/callback/route.mjs" },
  { source: "app/api/auth/oidc/merge/route.ts", output: "app/api/auth/oidc/merge/route.mjs" },
  { source: "app/api/photos/route.ts", output: "app/api/photos/route.mjs" },
  { source: "app/api/photos/[id]/route.ts", output: "app/api/photos/[id]/route.mjs" },
  // Contributor appeals (ADR 0014): POST/GET on the collection, PATCH on the
  // item. The [id] route lives in its own directory.
  { source: "app/api/appeals/route.ts", output: "app/api/appeals/route.mjs" },
  { source: "app/api/appeals/[id]/route.ts", output: "app/api/appeals/[id]/route.mjs" },
  { source: "app/api/cameras/[id]/actions/route.ts", output: "app/api/cameras/[id]/actions/route.mjs" },
  { source: "app/api/cameras/[id]/events/route.ts", output: "app/api/cameras/[id]/events/route.mjs" },
  { source: "app/api/import-sources/route.ts", output: "app/api/import-sources/route.mjs" },
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
  { source: "db/geocode.ts", output: "db-real/geocode.mjs" },
  { source: "db/moderation.ts", output: "db-real/moderation.mjs" },
  { source: "db/photos.ts", output: "db-real/photos.mjs" },
  // db/cameras.ts imports ./confirmations at runtime (the public payload
  // carries confirmationCount), so the real db layer must resolve it.
  { source: "db/confirmations.ts", output: "db-real/confirmations.mjs" },
  // db/camera-edits.ts (community editing, ADR 0018 §4) imports getD1 from
  // ./cameras and recordModerationEvent from ./moderation — both already in
  // this tree — so the real two-track logic runs against the same binding.
  { source: "db/camera-edits.ts", output: "db-real/camera-edits.mjs" },
  // db/community-settings.ts (ADR 0021 §5.1, t_4a7469bb FASE 1): tunable
  // community configuration. db/community-actions.ts imports it — both
  // compiled so the real threshold evaluation runs against the same binding.
  { source: "db/community-settings.ts", output: "db-real/community-settings.mjs" },
  // db/community-actions.ts (ADR 0021 FASE 2, kanban t_a9f23581) imports
  // getD1 from ./cameras, verifiedContributionCount from ./confirmations,
  // and getCommunitySettingsCached from ./community-settings — all already
  // in this tree. The threshold evaluation runs real SQL against the same
  // in-memory D1 as every other db module.
  { source: "db/community-actions.ts", output: "db-real/community-actions.mjs" },
  // db/import-sources.ts (import pipeline FASE C, t_4dbce318): the public
  // read side of import_batches; db/cameras.ts imports getImportBatchById
  // from it for the record-detail provenance, so the real db tree must
  // resolve it (the /api/import-sources route also imports it directly).
  { source: "db/import-sources.ts", output: "db-real/import-sources.mjs" },
  // db/reverse-geocode.ts (CEO 2026-08-07): coordinate → address via
  // Nominatim with a persistent geocode_reverse_cache table; imports
  // getD1 from ./cameras (already in this tree).
  { source: "db/reverse-geocode.ts", output: "db-real/reverse-geocode.mjs" },
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
  const tree = await mkdtemp(path.join(coverageTreeRoot(), "osdb-routes-"));

  // The passkey routes (t_36989e06) are the first to import a bare package
  // (@simplewebauthn/server) from a handler. The tree lives under the system
  // tmpdir where no node_modules exists, so bare specifiers cannot resolve —
  // symlink the repo's node_modules into the tree (Node resolves symlinks to
  // the real path, so package-internal imports keep working too).
  await symlink(path.join(root, "node_modules"), path.join(tree, "node_modules"), "dir");

  // Mirror the mocked db modules at the same relative depth the routes
  // expect (tmp/db/cameras.mjs etc.). The mock modules import the shared
  // state via a relative path that no longer holds after the copy, so the
  // specifier is rewritten to the absolute path of the real file — tests and
  // mocks then share a single module instance.
  const mocksDir = path.join(root, "tests", "helpers", "mocks");
  const mockStateUrl = pathToFileURL(path.join(root, "tests", "helpers", "mock-state.mjs")).href;
  await mkdir(path.join(tree, "db"), { recursive: true });
  for (const mockName of ["cameras", "camera-edits", "corrections", "geocode", "moderation", "auth", "users", "photos", "appeals", "confirmations", "passkeys", "oidc", "mailer", "community-actions", "import-sources"]) {
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

  // Mirror app/lib/**/*.ts (pure helpers, no Workers bindings) so relative
  // `lib/*` imports resolve inside the temp tree. Recursive: lib
  // subdirectories (i18n/, legal/) hold the locale registry and the legal
  // content, which routes now import (kanban t_6424f961).
  const libDir = path.join(root, "app", "lib");
  const walkLib = async (dir, relOut) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkLib(abs, path.join(relOut, entry.name));
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        const libCompiled = rewriteSpecifiers(
          ts.transpileModule(await readFile(abs, "utf8"), {
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ESNext,
              moduleResolution: ts.ModuleResolutionKind.Bundler,
            },
            fileName: abs,
          }).outputText,
          "",
        );
        const outPath = path.join(tree, relOut, entry.name.replace(/\.ts$/, ".mjs"));
        await mkdir(path.dirname(outPath), { recursive: true });
        await writeFile(outPath, libCompiled);
      }
    }
  };
  await walkLib(libDir, "app/lib");

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

  // Directory-index fixup: a relative specifier that points at a directory
  // (e.g. `../lib/i18n` rewritten to `../lib/i18n.mjs`) resolves to the
  // directory's index module when the .mjs file does not exist — same rule
  // as the DOM harness and the bundler (app/lib/i18n, app/lib/legal).
  const fixup = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await fixup(abs);
      else if (entry.name.endsWith(".mjs")) {
        let code = await readFile(abs, "utf8");
        const original = code;
        code = code.replace(/from\s*["'](\.[^"']+)\.mjs["']/g, (match, spec) => {
          const resolved = path.resolve(path.dirname(abs), spec);
          const asFile = `${resolved}.mjs`;
          const asIndex = path.join(resolved, "index.mjs");
          if (!existsSync(asFile) && existsSync(asIndex)) return `from "${spec}/index.mjs"`;
          return match;
        });
        if (code !== original) await writeFile(abs, code);
      }
    }
  };
  await fixup(tree);
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
  if (coverageTreeCleanupEnabled()) {
    await rm(tree, { recursive: true, force: true });
  }
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
