// Database-layer tests for the api-keys crypto helpers (EPIC api-keys, T3,
// plan §5.3, decisions D2/D3).
//
// These run the REAL db/api-keys.ts (transpiled into the harness tree, same
// harness as tests/auth-d1.test.mjs) and pin the mint contract at runtime:
//
//   - mintRawKey(): `osdb_` + 32 random bytes base64url (D2) — 48 chars,
//     CSPRNG entropy per call
//   - derivePrefix(): first 10 chars, display-only (D2), deterministic
//   - composition: derivePrefix(raw) === raw.slice(0, 10)
//   - WebCrypto only: no node:crypto anywhere in db/api-keys.ts (the raw-key
//     hashing path reuses sha256Hex from db/auth.ts, D3)
//
// No personal data: all fixtures are fictional/random.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupDbRuntime, loadDbRuntime } from "./helpers/db-runtime-harness.mjs";

const MODULE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "db",
  "api-keys.ts",
);

let runtime;

async function getApiKeys() {
  if (!runtime) runtime = await loadDbRuntime();
  return runtime.apiKeys;
}

after(async () => cleanupDbRuntime());

// D2: `osdb_` (5) + 32 random bytes base64url (43 unpadded chars) = 48 chars.
const RAW_KEY_RE = /^osdb_[A-Za-z0-9_-]{43}$/;

test("mintRawKey returns the D2 format: osdb_ + 32 bytes base64url", async () => {
  const { mintRawKey } = await getApiKeys();
  const raw = mintRawKey();
  assert.match(raw, RAW_KEY_RE, "osdb_ prefix + unpadded base64url body");
  assert.equal(raw.length, 48, "osdb_ (5) + 32 bytes base64url (43 chars)");
  assert.equal(raw.startsWith("osdb_"), true);
});

test("mintRawKey is CSPRNG-random: 100 consecutive mints are all distinct", async () => {
  const { mintRawKey } = await getApiKeys();
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) seen.add(mintRawKey());
  assert.equal(seen.size, 100, "no collisions across 100 mints");
});

test("derivePrefix returns the first 10 chars (D2 display handle), deterministically", async () => {
  const { derivePrefix } = await getApiKeys();
  // "osdb_" (5) + "abcde" (5) = 10 chars; the F… tail is truncated.
  assert.equal(derivePrefix("osdb_abcdeFGHIJKLMNOP"), "osdb_abcde");
  assert.equal(derivePrefix("osdb_abcdeFGHIJKLMNOP").length, 10);
  const raw = "osdb_xYz9876543210";
  assert.equal(derivePrefix(raw), derivePrefix(raw), "same input, same handle");
});

test("mintRawKey + derivePrefix compose: handle is a stable prefix of the raw key", async () => {
  const { derivePrefix, mintRawKey } = await getApiKeys();
  for (let i = 0; i < 20; i += 1) {
    const raw = mintRawKey();
    const prefix = derivePrefix(raw);
    assert.equal(prefix, raw.slice(0, 10));
    assert.equal(raw.startsWith(prefix), true);
    assert.equal(prefix.startsWith("osdb_"), true);
  }
});

test("derivePrefix is a strict fragment of the raw key (display-only, D2/D3)", async () => {
  const { derivePrefix, mintRawKey } = await getApiKeys();
  const raw = mintRawKey();
  assert.notEqual(derivePrefix(raw), raw, "prefix never equals the full key");
  assert.equal(raw.length > derivePrefix(raw).length, true);
  // The stored hash covers the FULL raw key (D3) — the 10-char prefix alone
  // cannot authenticate, so no path may truncate before hashing.
  const { sha256Hex } = runtime.auth;
  const fullHash = await sha256Hex(raw);
  const prefixHash = await sha256Hex(derivePrefix(raw));
  assert.notEqual(fullHash, prefixHash, "hash of full key differs from hash of prefix");
  // D3 pins the stored form: lowercase hex SHA-256, 64 chars.
  assert.match(fullHash, /^[0-9a-f]{64}$/, "full-key hash is the 64-char hex digest");
});

test("crypto helpers are WebCrypto only — db/api-keys.ts never imports node:crypto", async () => {
  const source = await readFile(MODULE_PATH, "utf8");
  // Comments stripped first: the module's own doc text mentions node:crypto
  // and crypto.subtle to explain what it does NOT use, so a raw-string check
  // would false-positive. Only the code (imports, expressions) is inspected.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(code.includes("node:crypto"), false, "no node:crypto import");
  assert.equal(
    /\b(createHash|createHmac|randomBytes|randomUUID)\b/.test(code),
    false,
    "no direct node:crypto API usage in the module",
  );
});
