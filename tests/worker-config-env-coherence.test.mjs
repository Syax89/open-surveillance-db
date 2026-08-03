/**
 * Directional coherence between the Env interfaces in worker/index.ts and
 * worker-configuration.d.ts.
 *
 * worker/index.ts declares `interface Env` with 24 keys; the manual
 * `declare module "cloudflare:workers"` in worker-configuration.d.ts used to
 * lag behind. The contract is DIRECTIONAL: every key the worker actually
 * reads must be declared in the configuration typings, while the typings may
 * carry extra keys (ENVIRONMENT, GEOCODER_*, TILE_*, REGISTER_IP_*) that are
 * read elsewhere through a structural EnvLike cast — those are legitimate
 * and must NOT be removed.
 *
 * This suite catches a future drift (a new env var added to the worker but
 * never typed in worker-configuration.d.ts) with a clear failure message.
 *
 * NOTE on the body regex: the worker interface closes with an unindented
 * `}` while the d.ts interface closes at `\n  }`, and nested object types
 * end in `};` — so the body is captured up to `\n\s*\}\n` (a closing brace
 * alone on its own line) rather than a bare `\n\}`, which would stop early
 * inside the nested IMAGES type.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const workerSource = readFileSync(path.join(root, "worker/index.ts"), "utf8");
const configSource = readFileSync(path.join(root, "worker-configuration.d.ts"), "utf8");

/** The 13 keys that were missing from worker-configuration.d.ts and are now
 * added: a regression here must fail with its own named assertion, not be
 * absorbed into the generic directional check. */
const KNOWN_MISSING_KEYS = [
  "AUTH_COOKIE_SECURE",
  "AUTH_RATE_LIMIT_MAX",
  "AUTH_RATE_LIMIT_WINDOW_SECONDS",
  "AUTH_SESSION_TTL_DAYS",
  "CACHE_PURGE_TOKEN",
  "CACHE_PURGE_ZONE_ID",
  "EMAIL_SEND_LIMIT_MAX",
  "EMAIL_SEND_LIMIT_WINDOW_SECONDS",
  "MODERATION_USER",
  "MODERATION_PASSWORD",
  "MODERATION_TOKEN",
  "MODERATION_IDENTITY_EMAIL",
  "TRUST_PLATFORM_HEADERS",
];

/** Extract the key names of the first `interface Env { ... }` in `source`. */
function extractEnvKeys(source) {
  const match = source.match(/interface Env \{([\s\S]*?)\n\s*\}\n/);
  if (!match) {
    throw new Error("could not locate `interface Env { ... }` in source");
  }
  const keys = [];
  const keyRe = /^([A-Z_][A-Z0-9_]*)\??:/;
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    // Only lines whose trimmed content starts with the key (comments and
    // nested types never start with an UPPER_CASE identifier).
    const keyMatch = keyRe.exec(trimmed);
    if (keyMatch) keys.push(keyMatch[1]);
  }
  return keys;
}

const configKeys = new Set(extractEnvKeys(configSource));

test("every Env key in worker/index.ts exists in worker-configuration.d.ts", () => {
  const workerKeys = extractEnvKeys(workerSource);
  const missing = workerKeys.filter((key) => !configKeys.has(key));
  assert.equal(
    missing.length,
    0,
    `worker/index.ts Env keys missing from worker-configuration.d.ts: ${missing.join(", ")}`,
  );
});

test("the 13 known-missing Env keys are now declared in worker-configuration.d.ts", () => {
  const missing = KNOWN_MISSING_KEYS.filter((key) => !configKeys.has(key));
  assert.equal(
    missing.length,
    0,
    `known keys still missing from worker-configuration.d.ts: ${missing.join(", ")}`,
  );
});
