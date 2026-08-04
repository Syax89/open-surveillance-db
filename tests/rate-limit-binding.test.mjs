// Binding-backend contract for the rate limiter (audit #3, MEDIUM, t_dff3dadf).
//
// app/lib/rate-limit.ts selects its backend per route family at runtime:
//   - a Cloudflare Workers Rate Limiting binding (env.AUTH_LIMITER /
//     WRITE_LIMITER / READ_LIMITER / TILES_LIMITER, configured in
//     wrangler.jsonc `ratelimits`) when present — the production backend,
//     enforced by Cloudflare edge infrastructure shared across worker
//     isolates so a caller cannot spread a burst across isolates to bypass
//     the ceiling (the per-isolate in-memory bucket it replaces);
//   - the in-memory sliding window otherwise — local dev / tests / staging
//     without the binding (the original per-isolate implementation).
//
// This suite pins the selection logic and the binding-path contract:
//   1. only the auth / submit / read / tiles buckets resolve a binding;
//   2. with a binding present the decision comes from binding.limit() and
//      the in-memory counters are NOT touched;
//   3. a blocked binding answers denied with Retry-After = the window upper
//      bound (the platform binding does not expose the counter reset time);
//   4. without a binding — or with a malformed one — the in-memory fallback
//      runs, including at the route layer.
//
// All fixtures are fictional; no personal data is used.

import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  apiRequest,
  buildRouteTree,
  cleanupRouteTree,
  loadLibModule,
  loadRoute,
} from "./helpers/api-harness.mjs";
import { resetMockState } from "./helpers/mock-state.mjs";

// The shared env mock the transpiled routes read (same instance the tree
// routes import); the binding tests inject/remove the four binding slots.
let env;
let rateLimit;

async function sharedEnv() {
  const tree = await buildRouteTree();
  return import(pathToFileURL(path.join(tree, "cloudflare-workers.mjs"))).then((m) => m.env);
}

const BINDING_KEYS = ["AUTH_LIMITER", "WRITE_LIMITER", "READ_LIMITER", "TILES_LIMITER"];

beforeEach(async () => {
  resetMockState();
  if (!env) {
    env = await sharedEnv();
    rateLimit = await loadLibModule("rate-limit");
  }
  rateLimit.resetRateLimitState();
  for (const key of BINDING_KEYS) delete env[key];
});

afterEach(() => {
  for (const key of BINDING_KEYS) delete env[key];
});

after(async () => cleanupRouteTree());

/** A scriptable binding mock that records every key it is called with. */
function bindingThat(success) {
  const calls = [];
  return {
    calls,
    binding: {
      limit: async ({ key }) => {
        calls.push(key);
        return { success };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Bucket -> binding resolution
// ---------------------------------------------------------------------------

test("only auth, submit, read and tiles buckets resolve a rate-limiter binding", () => {
  const { binding } = bindingThat(true);
  const fullEnv = {
    AUTH_LIMITER: binding,
    WRITE_LIMITER: binding,
    READ_LIMITER: binding,
    TILES_LIMITER: binding,
  };
  assert.equal(rateLimit.rateLimitBindingFor(fullEnv, "auth"), binding);
  assert.equal(rateLimit.rateLimitBindingFor(fullEnv, "submit"), binding);
  assert.equal(rateLimit.rateLimitBindingFor(fullEnv, "read"), binding);
  assert.equal(rateLimit.rateLimitBindingFor(fullEnv, "tiles"), binding);

  // Every other family stays on the in-memory fallback: binding the four
  // critical public surfaces is the audit #3 scope; the rest are documented
  // follow-ups for the public launch. session (QA#2 F3 — GET /api/auth/me
  // reads) is deliberately unbound too: it is a per-caller personal read,
  // not a credential-guessing or data-exfiltration surface, and its
  // generous default (120/min) is a scraper bound, not a security gate.
  for (const bucket of ["export", "nearby", "revisions", "moderate", "appeal", "geocode", "confirm", "edit", "search", "session"]) {
    assert.equal(
      rateLimit.rateLimitBindingFor(fullEnv, bucket),
      undefined,
      `${bucket} must stay on the in-memory fallback`,
    );
  }

  // Absent or malformed bindings never resolve.
  assert.equal(rateLimit.rateLimitBindingFor({}, "auth"), undefined, "absent binding -> fallback");
  assert.equal(
    rateLimit.rateLimitBindingFor({ AUTH_LIMITER: { notALimiter: true } }, "auth"),
    undefined,
    "a binding without a limit() function must not resolve",
  );
});

// ---------------------------------------------------------------------------
// 2. Binding path: the binding decides, the in-memory map stays untouched
// ---------------------------------------------------------------------------

test("with a binding present the decision comes from the binding, keyed per family", async () => {
  const mock = bindingThat(true);
  env.AUTH_LIMITER = mock.binding;
  const options = { maxRequests: 1, windowSeconds: 60 };

  // Two calls from the same caller: the in-memory bucket (max 1) would have
  // blocked the second, the binding (always success) allows both.
  assert.deepEqual(await rateLimit.checkRateLimit(env, "auth", "203.0.113.50", options), {
    allowed: true,
    retryAfterSeconds: 0,
  });
  assert.deepEqual(await rateLimit.checkRateLimit(env, "auth", "203.0.113.50", options), {
    allowed: true,
    retryAfterSeconds: 0,
  });
  assert.deepEqual(
    mock.calls,
    ["auth:203.0.113.50", "auth:203.0.113.50"],
    "binding keys must be namespaced per route family",
  );

  // The binding path must never write to the in-memory map: a fresh
  // in-memory check on the same bucket/key is still allowed.
  assert.equal(
    rateLimit.checkRateLimitInMemory("auth", "203.0.113.50", options).allowed,
    true,
    "the binding path must not touch the in-memory counters",
  );
});

test("a blocked binding answers denied with Retry-After set to the window upper bound", async () => {
  env.READ_LIMITER = bindingThat(false).binding;
  const options = { maxRequests: 60, windowSeconds: 60 };
  const decision = await rateLimit.checkRateLimit(env, "read", "203.0.113.51", options);
  // The binding does not expose the counter reset time, so the contract is
  // the window upper bound — still a positive Retry-After.
  assert.deepEqual(decision, { allowed: false, retryAfterSeconds: 60 });
});

// ---------------------------------------------------------------------------
// 3. Fallback: no binding (or malformed) -> in-memory sliding window
// ---------------------------------------------------------------------------

test("without a binding the in-memory fallback enforces the window", async () => {
  const options = { maxRequests: 1, windowSeconds: 60 };
  assert.equal((await rateLimit.checkRateLimit(env, "auth", "203.0.113.52", options)).allowed, true);
  assert.equal(
    (await rateLimit.checkRateLimit(env, "auth", "203.0.113.52", options)).allowed,
    false,
    "the in-memory fallback must enforce the family window",
  );
});

test("a malformed binding (no limit() function) falls back to the in-memory backend", async () => {
  env.AUTH_LIMITER = { notALimiter: true };
  const options = { maxRequests: 1, windowSeconds: 60 };
  assert.equal((await rateLimit.checkRateLimit(env, "auth", "203.0.113.53", options)).allowed, true);
  assert.equal(
    (await rateLimit.checkRateLimit(env, "auth", "203.0.113.53", options)).allowed,
    false,
    "the fallback must still enforce the window",
  );
});

// ---------------------------------------------------------------------------
// 4. Route layer honours the binding
// ---------------------------------------------------------------------------

test("route layer honours the binding: the first tile request answers 429 when the binding blocks", async () => {
  env.TILES_LIMITER = bindingThat(false).binding;
  const { GET } = await loadRoute("app/api/tiles/[z]/[x]/[y]/route.mjs");
  const response = await GET(
    apiRequest("/api/tiles/13/4250/2900"),
    { params: Promise.resolve({ z: "13", x: "4250", y: "2900" }) },
  );
  assert.equal(response.status, 429, "the binding's block must surface as a clean 429");
  assert.ok(
    Number.parseInt(response.headers.get("Retry-After") ?? "0", 10) >= 1,
    "the 429 must carry a positive Retry-After",
  );
});
