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
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const ROUTES = [
  { source: "app/api/cameras/route.ts", output: "app/api/cameras/route.mjs" },
  { source: "app/api/cameras/nearby/route.ts", output: "app/api/cameras/nearby/route.mjs" },
  { source: "app/api/cameras/revisions/route.ts", output: "app/api/cameras/revisions/route.mjs" },
  { source: "app/api/moderation/route.ts", output: "app/api/moderation/route.mjs" },
  { source: "app/api/corrections/route.ts", output: "app/api/corrections/route.mjs" },
];

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
  for (const mockName of ["cameras", "corrections", "moderation"]) {
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
  return tree;
}

// Rewrite the transpiled ESM so it resolves inside the temp tree:
//   - relative db/* and lib/* imports get an explicit .mjs extension,
//   - the bare `cloudflare:workers` specifier is pointed at the mock module.
function rewriteSpecifiers(code, workersMockUrl) {
  let rewritten = code
    .replace(/(from\s*["'])(\.[^"']*\/db\/[^"']+)(["'])/g, "$1$2.mjs$3")
    .replace(/(from\s*["'])(\.[^"']*\/lib\/[^"']+)(["'])/g, "$1$2.mjs$3");
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

// relativeOutput: e.g. "app/lib/duplicate-detection.mjs" — the tree already
// transpiles every pure lib module, so tests can exercise them directly.
export async function loadLib(relativeOutput) {
  const tree = await buildRouteTree();
  return import(pathToFileURL(path.join(tree, relativeOutput)).href);
}

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
