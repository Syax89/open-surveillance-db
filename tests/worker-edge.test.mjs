// Dedicated unit tests for the Cloudflare edge worker entry point
// (worker/index.ts, kanban t_ee01cf79).
//
// The worker is the fail-closed moderation gate and the image-optimization
// router for the whole deployment; until now it was only exercised
// indirectly through the Miniflare E2E suites (pages-render /
// navigation-pages). These tests import the real worker module in isolation
// with the two vinext server entries (app-router-entry, image-optimization)
// replaced by deterministic mocks, so routing, the Basic/Bearer gate and
// header handling are pinned without a build or a network call.
//
// Compilation mirrors tests/helpers/api-harness.mjs: the route is
// transpiled with the repo's own TypeScript and bare imports are rewritten
// to file:// URLs of mock modules in a fresh temp tree.
//
// No personal data: all credentials are throwaway test strings.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_SOURCE = path.join(root, "worker", "index.ts");

// Mock of vinext/server/app-router-entry: records every fetch the worker
// forwards, so tests can assert routing decisions without the Next runtime.
const appRouterMock = `
export const __calls = [];
export default {
  async fetch(request, env, ctx) {
    __calls.push({ url: String(request.url), method: request.method, envKeys: Object.keys(env ?? {}) });
    const url = new URL(request.url);
    if (url.pathname.startsWith("/definitely-unknown")) {
      return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } });
    }
    return new Response("handler-ok", { status: 200, headers: { "content-type": "text/plain" } });
  },
};
`;

// Mock of vinext/server/image-optimization: records the invocation and
// returns a canned image so the worker's /_vinext/image branch is testable.
const imageOptimizationMock = `
export const DEFAULT_DEVICE_SIZES = [640, 750];
export const DEFAULT_IMAGE_SIZES = [1080, 1200, 1920];
export const __calls = [];
export async function handleImageOptimization(request, options, allowedWidths) {
  __calls.push({
    url: String(request.url),
    hasFetchAsset: typeof options.fetchAsset === "function",
    hasTransformImage: typeof options.transformImage === "function",
    allowedWidths: [...allowedWidths],
  });
  return new Response("optimized", { status: 200, headers: { "content-type": "image/webp" } });
}
`;

let treePromise = null;

async function buildWorkerTree() {
  const tree = await mkdtemp(path.join(os.tmpdir(), "osdb-worker-"));
  const source = await readFile(WORKER_SOURCE, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
    fileName: WORKER_SOURCE,
  }).outputText;

  const mocksDir = path.join(tree, "mocks");
  await mkdir(mocksDir, { recursive: true });
  await writeFile(path.join(mocksDir, "app-router-entry.mjs"), appRouterMock);
  await writeFile(path.join(mocksDir, "image-optimization.mjs"), imageOptimizationMock);

  const rewritten = compiled
    .replace(
      /from\s*["']vinext\/server\/image-optimization["']/g,
      `from "${pathToFileURL(path.join(mocksDir, "image-optimization.mjs")).href}"`,
    )
    .replace(
      /from\s*["']vinext\/server\/app-router-entry["']/g,
      `from "${pathToFileURL(path.join(mocksDir, "app-router-entry.mjs")).href}"`,
    );

  // The worker must not contain any leftover bare vinext/cloudflare import.
  const unresolved = [...rewritten.matchAll(/from\s*["'](?:vinext\/|cloudflare:)[^"']+["']/g)];
  if (unresolved.length > 0) {
    throw new Error(`worker/index.ts still has unresolvable imports: ${unresolved.map((m) => m[0]).join(", ")}`);
  }

  await writeFile(path.join(tree, "worker.mjs"), rewritten);
  return tree;
}

function getTree() {
  if (!treePromise) treePromise = buildWorkerTree();
  return treePromise;
}

/** Load the worker module plus its mock call captures. */
async function loadWorker() {
  const tree = await getTree();
  const workerModule = await import(pathToFileURL(path.join(tree, "worker.mjs")).href);
  const image = await import(pathToFileURL(path.join(tree, "mocks", "image-optimization.mjs")).href);
  const app = await import(pathToFileURL(path.join(tree, "mocks", "app-router-entry.mjs")).href);
  return { worker: workerModule.default, image, app };
}

/** Minimal Env shaped by the worker's Env interface. */
function testEnv(overrides = {}) {
  return {
    ASSETS: {},
    DB: {},
    IMAGES: {},
    PHOTOS: {},
    ...overrides,
  };
}

const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
const bearer = (token) => `Bearer ${token}`;

function request(pathAndQuery, { method = "GET", headers = {} } = {}) {
  return new Request(`https://osdb.test${pathAndQuery}`, { method, headers });
}

beforeEach(async () => {
  const { image, app } = await loadWorker();
  image.__calls.length = 0;
  app.__calls.length = 0;
});

// ---------------------------------------------------------------------------
// Routing base
// ---------------------------------------------------------------------------

test("routes non-gated, non-image requests straight to the app handler", async () => {
  const { worker, app } = await loadWorker();
  const req = request("/api/cameras?format=geojson");
  const response = await worker.fetch(req, testEnv(), { waitUntil() {}, passThroughOnException() {} });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "handler-ok");
  assert.equal(response.headers.get("content-type"), "text/plain");
  assert.equal(app.__calls.length, 1);
  assert.equal(app.__calls[0].url, "https://osdb.test/api/cameras?format=geojson");
  assert.equal(app.__calls[0].method, "GET");
});

test("forwards unknown-route 404 responses from the handler unchanged", async () => {
  const { worker, app } = await loadWorker();
  const response = await worker.fetch(request("/definitely-unknown/xyz"), testEnv(), ctx());

  assert.equal(response.status, 404);
  assert.equal(await response.text(), "Not Found");
  assert.equal(app.__calls.length, 1);
});

test("preserves security headers set by the app handler (pass-through, never stripped)", async () => {
  // The worker wraps every response with the global security headers
  // (t_6148aa6f, PR #83), but must never overwrite handler-set headers —
  // e.g. the photo routes ship X-Content-Type-Options: nosniff + CSP
  // sandbox on binary bodies, which are stricter and must survive.
  const { worker, app } = await loadWorker();
  const handler = app.default;
  const originalFetch = handler.fetch;
  handler.fetch = async () =>
    new Response("img", {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  try {
    const response = await worker.fetch(request("/api/photos/1"), testEnv(), ctx());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; sandbox");
  } finally {
    handler.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// Moderation auth gate (Basic / Bearer), fail-closed
// ---------------------------------------------------------------------------

test("gate fails closed with no credentials configured (503, no-store, no handler call)", async () => {
  const { worker, app } = await loadWorker();
  const ctxObj = ctx();
  for (const pathname of ["/moderation", "/api/moderation", "/api/moderation/photos/1"]) {
    const response = await worker.fetch(request(pathname), testEnv(), ctxObj);
    assert.equal(response.status, 503, `${pathname} must be 503 without credentials`);
    assert.deepEqual(JSON.parse(await response.text()), { error: "Moderation is unavailable." });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(app.__calls.length, 0, "the app handler must never run when the gate denies");
});

test("gate rejects a wrong Basic credential with 401 + WWW-Authenticate", async () => {
  const { worker, app } = await loadWorker();
  const env = testEnv({ MODERATION_USER: "moderator", MODERATION_PASSWORD: "s3cret" });
  const response = await worker.fetch(
    request("/api/moderation", { headers: { authorization: basic("moderator", "wrong") } }),
    env,
    ctx(),
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), 'Basic realm="moderation", charset="UTF-8"');
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(app.__calls.length, 0);
});

test("gate admits a correct Basic credential and lets the request through", async () => {
  const { worker, app } = await loadWorker();
  const env = testEnv({ MODERATION_USER: "moderator", MODERATION_PASSWORD: "s3cret" });
  const response = await worker.fetch(
    request("/api/moderation", { headers: { authorization: basic("moderator", "s3cret") } }),
    env,
    ctx(),
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "handler-ok");
  assert.equal(app.__calls.length, 1);
});

test("gate admits a correct Bearer token and rejects a wrong one", async () => {
  const { worker, app } = await loadWorker();
  const env = testEnv({ MODERATION_TOKEN: "tok-123" });

  const denied = await worker.fetch(
    request("/api/moderation", { headers: { authorization: bearer("tok-124") } }),
    env,
    ctx(),
  );
  assert.equal(denied.status, 401, "a one-character-different token must be rejected");

  const admitted = await worker.fetch(
    request("/api/moderation", { headers: { authorization: bearer("tok-123") } }),
    env,
    ctx(),
  );
  assert.equal(admitted.status, 200);
  assert.equal(app.__calls.length, 1);
});

test("token-only config admits Bearer without any user/password pair", async () => {
  const { worker, app } = await loadWorker();
  const env = testEnv({ MODERATION_TOKEN: "tok-only" });
  const response = await worker.fetch(
    request("/moderation", { headers: { authorization: bearer("tok-only") } }),
    env,
    ctx(),
  );
  assert.equal(response.status, 200);
  assert.equal(app.__calls.length, 1);
});

test("partial credential config still fails closed (user without password)", async () => {
  const { worker, app } = await loadWorker();
  for (const partial of [
    { MODERATION_USER: "moderator" },
    { MODERATION_PASSWORD: "s3cret" },
    { MODERATION_USER: "moderator", MODERATION_PASSWORD: "" },
  ]) {
    const response = await worker.fetch(request("/api/moderation"), testEnv(partial), ctx());
    assert.equal(response.status, 503, `partial env ${JSON.stringify(partial)} must fail closed`);
    assert.equal(app.__calls.length, 0);
  }
});

test("non-moderation paths are not gated, even with no credentials configured", async () => {
  const { worker, app } = await loadWorker();
  for (const pathname of ["/", "/api/cameras", "/records/1", "/_vinext/image", "/api/moderation-events"]) {
    const response = await worker.fetch(request(pathname), testEnv(), ctx());
    assert.notEqual(response.status, 503, `${pathname} must not be caught by the moderation gate`);
    assert.notEqual(response.status, 401, `${pathname} must not be caught by the moderation gate`);
  }
  assert.equal(app.__calls.length, 4, "all non-moderation paths except the image route reach the handler");
});

test("the moderation path predicate covers the API subtree, not lookalikes", async () => {
  const { worker, app } = await loadWorker();
  const gated = ["/moderation", "/api/moderation", "/api/moderation/photos/1"];
  const ungated = ["/moderation-help", "/api/moderation-extra", "/api/moderationx"];
  for (const pathname of gated) {
    const response = await worker.fetch(request(pathname), testEnv(), ctx());
    assert.equal(response.status, 503, `${pathname} is a moderation path and must be gated`);
  }
  for (const pathname of ungated) {
    const response = await worker.fetch(request(pathname), testEnv(), ctx());
    assert.notEqual(response.status, 503, `${pathname} is not a moderation path`);
    assert.notEqual(response.status, 401, `${pathname} is not a moderation path`);
  }
  assert.equal(app.__calls.length, ungated.length, "only the ungated paths reach the handler");
});

// ---------------------------------------------------------------------------
// Image optimization route
// ---------------------------------------------------------------------------

test("/_vinext/image is routed to the image optimizer with the configured widths", async () => {
  const { worker, image } = await loadWorker();
  const env = testEnv();
  env.ASSETS.fetch = async () => new Response("asset", { status: 200 });
  env.IMAGES.input = () => ({
    transform: () => ({ output: async () => ({ response: () => new Response("img", { status: 200 }) }) }),
  });
  const response = await worker.fetch(request("/_vinext/image?url=%2Fog.png&w=1080&q=80"), env, ctx());

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "optimized");
  assert.equal(image.__calls.length, 1);
  assert.equal(image.__calls[0].url, "https://osdb.test/_vinext/image?url=%2Fog.png&w=1080&q=80");
  assert.equal(image.__calls[0].hasFetchAsset, true);
  assert.equal(image.__calls[0].hasTransformImage, true);
  assert.deepEqual(image.__calls[0].allowedWidths, [640, 750, 1080, 1200, 1920]);
});

// Small helper: a no-op ExecutionContext shaped like the Worker API.
function ctx() {
  return { waitUntil() {}, passThroughOnException() {} };
}

test("after suite: remove temp worker tree", async () => {
  if (treePromise) {
    const tree = await treePromise;
    await rm(tree, { recursive: true, force: true });
    treePromise = null;
  }
  assert.ok(true);
});
