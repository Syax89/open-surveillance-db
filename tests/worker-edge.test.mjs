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
    __calls.push({ url: String(request.url), method: request.method, envKeys: Object.keys(env ?? {}), headers: Object.fromEntries(request.headers.entries()) });
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

  // The worker imports ../db/retention (scheduled retention sweep) and
  // ../db/oidc (OIDC expiry sweep). These gate tests exercise routing/authz
  // and the cron dispatch, not the sweep SQL, so minimal mocks keep the tree
  // self-contained (the real sweeps have their own suites:
  // tests/retention.test.mjs + tests/retention-contract.test.mjs and
  // tests/oidc-d1.test.mjs). Each mock records its invocations so tests can
  // assert the cron wires both sweeps.
  const dbDir = path.join(tree, "db");
  await mkdir(dbDir, { recursive: true });
  await writeFile(
    path.join(dbDir, "retention.mjs"),
    "export const __calls = [];\n" +
      "export const DEFAULT_RETENTION_POLICY = { pendingDays: 90, rejectedDays: 30, correctionDays: 730 };\n" +
      "export async function runRetentionSweep(...args) { __calls.push(args); return {}; }\n",
  );
  await writeFile(
    path.join(dbDir, "oidc.mjs"),
    "export const __calls = [];\n" +
      "export const __state = { throw: false };\n" +
      "export async function sweepOidcExpired(...args) {\n" +
      "  __calls.push(args);\n" +
      "  if (__state.throw) throw new Error(\"boom\");\n" +
      "  return { states: 0, mergeRequests: 0 };\n" +
      "}\n",
  );

  const rewritten = compiled
    .replace(
      /from\s*["']\.\.\/db\/retention["']/g,
      `from "${pathToFileURL(path.join(dbDir, "retention.mjs")).href}"`,
    )
    .replace(
      /from\s*["']\.\.\/db\/oidc["']/g,
      `from "${pathToFileURL(path.join(dbDir, "oidc.mjs")).href}"`,
    )
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
  const retention = await import(pathToFileURL(path.join(tree, "db", "retention.mjs")).href);
  const oidc = await import(pathToFileURL(path.join(tree, "db", "oidc.mjs")).href);
  return { worker: workerModule.default, image, app, retention, oidc };
}

/** Minimal Env shaped by the worker's Env interface. */
function testEnv(overrides = {}) {
  return {
    ASSETS: {},
    DB: {},
    IMAGES: {},
    ...overrides,
  };
}

const basic = (user, pass) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
const bearer = (token) => `Bearer ${token}`;

function request(pathAndQuery, { method = "GET", headers = {} } = {}) {
  return new Request(`https://osdb.test${pathAndQuery}`, { method, headers });
}

beforeEach(async () => {
  const { image, app, retention, oidc } = await loadWorker();
  image.__calls.length = 0;
  app.__calls.length = 0;
  retention.__calls.length = 0;
  oidc.__calls.length = 0;
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
  // an app route may ship a stricter X-Content-Type-Options / CSP on its
  // own response, which must survive.
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
    const response = await worker.fetch(request("/api/cameras/1"), testEnv(), ctx());
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
  for (const pathname of ["/moderation", "/api/moderation", "/api/moderation/corrections/1"]) {
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

// ---------------------------------------------------------------------------
// QA#3 F5 — per-operator moderation credentials (MODERATION_OPERATORS)
// ---------------------------------------------------------------------------

test("gate with MODERATION_OPERATORS admits each operator only with their own pair", async () => {
  const { worker, app } = await loadWorker();
  const env = testEnv({
    MODERATION_OPERATORS: JSON.stringify([
      { user: "alice", password: "alice-pass", email: "alice@mod.osdb" },
      { user: "bob", password: "bob-pass", email: "bob@mod.osdb" },
    ]),
  });
  // Alice's own pair admits and injects HER identity.
  const alice = await worker.fetch(
    request("/api/moderation", { headers: { authorization: basic("alice", "alice-pass") } }),
    env,
    ctx(),
  );
  assert.equal(alice.status, 200);
  // Bob's pair admits and injects HIS identity.
  const bob = await worker.fetch(
    request("/api/moderation", { headers: { authorization: basic("bob", "bob-pass") } }),
    env,
    ctx(),
  );
  assert.equal(bob.status, 200);
  // Cross-operator credentials are rejected: alice cannot act as bob.
  const cross = await worker.fetch(
    request("/api/moderation", { headers: { authorization: basic("alice", "bob-pass") } }),
    env,
    ctx(),
  );
  assert.equal(cross.status, 401);
  // An operator not in the list is rejected.
  const stranger = await worker.fetch(
    request("/api/moderation", { headers: { authorization: basic("mallory", "alice-pass") } }),
    env,
    ctx(),
  );
  assert.equal(stranger.status, 401);
  assert.equal(app.__calls.length, 2, "only the two admitted operators reach the handler");
});

test("gate with MODERATION_OPERATORS injects each operator's own identity email", async () => {
  const { worker, app } = await loadWorker();
  const env = testEnv({
    MODERATION_OPERATORS: JSON.stringify([
      { user: "alice", password: "alice-pass", email: "alice@mod.osdb" },
      { user: "bob", password: "bob-pass", email: "bob@mod.osdb" },
    ]),
  });
  await worker.fetch(
    request("/api/moderation", { headers: { authorization: basic("alice", "alice-pass") } }),
    env,
    ctx(),
  );
  await worker.fetch(
    request("/api/moderation", { headers: { authorization: basic("bob", "bob-pass") } }),
    env,
    ctx(),
  );
  const identities = app.__calls.map((call) => call.headers["x-osdb-user-email"]);
  assert.deepEqual(
    identities,
    ["alice@mod.osdb", "bob@mod.osdb"],
    "each operator's actions are attributed to their OWN email, not a shared identity",
  );
});

test("gate with MODERATION_OPERATORS ignores the legacy shared pair (no shared identity to impersonate)", async () => {
  const { worker, app } = await loadWorker();
  const env = testEnv({
    MODERATION_USER: "shared",
    MODERATION_PASSWORD: "shared-pass",
    MODERATION_OPERATORS: JSON.stringify([{ user: "alice", password: "alice-pass", email: "alice@mod.osdb" }]),
  });
  // The legacy pair must NOT admit when the per-operator list is configured.
  const legacy = await worker.fetch(
    request("/api/moderation", { headers: { authorization: basic("shared", "shared-pass") } }),
    env,
    ctx(),
  );
  assert.equal(legacy.status, 401, "the legacy shared pair is ignored when operators are configured");
  // The operator's own pair still admits.
  const alice = await worker.fetch(
    request("/api/moderation", { headers: { authorization: basic("alice", "alice-pass") } }),
    env,
    ctx(),
  );
  assert.equal(alice.status, 200);
  assert.equal(app.__calls.length, 1);
});

test("gate with malformed MODERATION_OPERATORS fails closed (503), never falls back to a shared identity", async () => {
  const { worker, app } = await loadWorker();
  for (const malformed of [
    "not-json",
    "{}",
    '[{"user":"alice"}]',
    '[{"user":"alice","password":"pw"}]',
    '[{"password":"pw","email":"a@b.c"}]',
    "null",
  ]) {
    const env = testEnv({
      MODERATION_USER: "shared",
      MODERATION_PASSWORD: "shared-pass",
      MODERATION_OPERATORS: malformed,
    });
    const response = await worker.fetch(request("/api/moderation"), env, ctx());
    assert.equal(response.status, 503, `malformed operator list ${JSON.stringify(malformed)} must fail closed`);
    assert.equal(app.__calls.length, 0, "the handler must never run on a broken operator list");
  }
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
  const gated = ["/moderation", "/api/moderation", "/api/moderation/corrections/1"];
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
// Appeals surface (audit finding 3.1, CEO decision 2026-08-02)
// ---------------------------------------------------------------------------
//
// The moderator-facing appeals routes (GET list, PATCH decide) stay behind
// the moderation gate. POST /api/appeals — filing an appeal — is a
// contributor action authenticated by the session at the route layer, so the
// edge must NOT gate it with moderation credentials; gating it made appeals
// unreachable for contributors (401/503 before requireRole).

test("POST /api/appeals is not gated: filing reaches the handler without moderation credentials", async () => {
  const { worker, app } = await loadWorker();
  // No credentials configured at all: a gated path would fail closed with
  // 503 — the filing route must pass straight through to the app handler.
  const response = await worker.fetch(
    request("/api/appeals", { method: "POST" }),
    testEnv(),
    ctx(),
  );
  assert.notEqual(response.status, 503, "POST /api/appeals must not fail closed on missing moderation creds");
  assert.notEqual(response.status, 401, "POST /api/appeals must not require moderation credentials");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "handler-ok");
  assert.equal(app.__calls.length, 1);
  assert.equal(app.__calls[0].url, "https://osdb.test/api/appeals");
  assert.equal(app.__calls[0].method, "POST");
});

test("POST /api/appeals strips client-supplied identity headers like every other path", async () => {
  const { worker, app } = await loadWorker();
  const response = await worker.fetch(
    request("/api/appeals", {
      method: "POST",
      headers: { "x-osdb-user-email": "contributor@osdb.test", "oai-authenticated-user-email": "contributor@osdb.test" },
    }),
    testEnv(),
    ctx(),
  );
  assert.equal(response.status, 200);
  assert.equal(app.__calls.length, 1);
  // The worker strips identity headers on every path; the route layer must
  // resolve the caller from the session cookie, never from a client header.
  assert.equal(app.__calls[0].headers["x-osdb-user-email"], undefined, "x-osdb-user-email must never reach the handler from a client");
  assert.equal(app.__calls[0].headers["oai-authenticated-user-email"], undefined, "platform identity headers are stripped too (no TRUST_PLATFORM_HEADERS)");
});

test("GET /api/appeals stays gated: 503 without credentials, 401 without auth, 200 with credentials", async () => {
  const { worker, app } = await loadWorker();

  const noCreds = await worker.fetch(request("/api/appeals"), testEnv(), ctx());
  assert.equal(noCreds.status, 503, "the moderator list must fail closed without moderation credentials");

  const env = testEnv({ MODERATION_USER: "moderator", MODERATION_PASSWORD: "s3cret" });
  const unauth = await worker.fetch(request("/api/appeals"), env, ctx());
  assert.equal(unauth.status, 401);
  assert.equal(app.__calls.length, 0);

  const authed = await worker.fetch(
    request("/api/appeals", { headers: { authorization: basic("moderator", "s3cret") } }),
    env,
    ctx(),
  );
  assert.equal(authed.status, 200);
  assert.equal(await authed.text(), "handler-ok");
  assert.equal(app.__calls.length, 1);
});

test("PATCH /api/appeals/[id] stays gated behind the moderation gate", async () => {
  const { worker, app } = await loadWorker();
  const noCreds = await worker.fetch(request("/api/appeals/1", { method: "PATCH" }), testEnv(), ctx());
  assert.equal(noCreds.status, 503, "the decide route must fail closed without moderation credentials");

  const env = testEnv({ MODERATION_TOKEN: "tok-123" });
  const denied = await worker.fetch(
    request("/api/appeals/1", { method: "PATCH", headers: { authorization: bearer("wrong") } }),
    env,
    ctx(),
  );
  assert.equal(denied.status, 401);
  assert.equal(app.__calls.length, 0);

  const admitted = await worker.fetch(
    request("/api/appeals/1", { method: "PATCH", headers: { authorization: bearer("tok-123") } }),
    env,
    ctx(),
  );
  assert.equal(admitted.status, 200);
  assert.equal(app.__calls.length, 1);
  assert.equal(app.__calls[0].method, "PATCH");
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

// ---------------------------------------------------------------------------
// Scheduled cron: retention sweep + OIDC expiry sweep (B1 review fix, PR #235)
// ---------------------------------------------------------------------------

test("scheduled() runs both the retention sweep and the OIDC expiry sweep", async () => {
  const { worker, retention, oidc } = await loadWorker();
  const waitUntilCalls = [];
  const ctxObj = {
    waitUntil(promise) {
      waitUntilCalls.push(promise);
    },
    passThroughOnException() {},
  };
  await worker.scheduled({ cron: "0 3 * * *" }, testEnv(), ctxObj);
  await Promise.all(waitUntilCalls);

  assert.equal(retention.__calls.length, 1, "retention sweep must run from the cron");
  assert.equal(oidc.__calls.length, 1, "OIDC expiry sweep must run from the cron (B1)");
  // The OIDC sweep takes the default `now` (expired rows are removed by
  // expires_at <= now, so the wall clock is the correct boundary).
  assert.deepEqual(oidc.__calls[0], []);
});

test("scheduled() keeps working when the OIDC expiry sweep throws (sweeps are isolated)", async () => {
  const { worker, retention, oidc } = await loadWorker();
  oidc.__state.throw = true;
  const waitUntilCalls = [];
  const ctxObj = {
    waitUntil(promise) {
      waitUntilCalls.push(promise);
    },
    passThroughOnException() {},
  };
  await worker.scheduled({ cron: "0 3 * * *" }, testEnv(), ctxObj);
  // Both promises settle; the OIDC one rejects but its catch inside the
  // worker must swallow it so the cron never throws unhandled, and the
  // retention sweep must still have run.
  await Promise.allSettled(waitUntilCalls);
  assert.equal(retention.__calls.length, 1, "retention sweep must run even if the OIDC sweep fails");
  assert.equal(oidc.__calls.length, 1, "the OIDC sweep is wired and was attempted");
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
