#!/usr/bin/env node
/**
 * Enable the D1-authoritative binding on an operational checkout.
 *
 * The committed wrangler.jsonc deliberately carries a placeholder D1 ID and
 * keeps remote access disabled, so contributors and tests never accidentally
 * touch production data. The LAN container has a locally preserved real D1
 * ID; this helper makes that one operational config use the remote binding.
 *
 * It never prints the database ID or credentials. Run it only after the
 * deployment procedure has restored the container's real database_id.
 *
 * Usage:
 *   node scripts/enable-d1-authoritative.mjs [--config path] [--check]
 */
import { chmodSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const PLACEHOLDER_D1_ID = "00000000-0000-4000-8000-000000000000";
const args = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a path`);
  return value;
}

function fail(message) {
  console.error(`D1 authoritative configuration: ${message}`);
  process.exit(1);
}

const configPath = path.resolve(option("--config", "wrangler.jsonc"));
const checkOnly = args.includes("--check");
const unsupported = args.filter((value, index) => {
  if (value === "--check" || value === "--config") return false;
  return args[index - 1] !== "--config";
});
if (unsupported.length > 0) fail(`unsupported option ${unsupported[0]}`);

let source;
try {
  source = readFileSync(configPath, "utf8");
} catch (error) {
  fail(`cannot read ${path.basename(configPath)} (${error.code ?? "unknown error"})`);
}

// OSDB deliberately has one D1 object in a flat JSONC configuration. Limiting
// the edit to that object prevents unrelated `remote` keys from being changed.
const match = source.match(/("d1_databases"\s*:\s*\[\s*\{)([\s\S]*?)(\}\s*\])/);
if (!match) fail("D1 binding was not found");

const [wholeBlock, prefix, body, suffix] = match;
const id = body.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1];
if (!id || id === PLACEHOLDER_D1_ID) {
  fail("a real D1 database_id is required; refusing to enable remote access");
}

const remote = body.match(/"remote"\s*:\s*(true|false)/)?.[1];
if (checkOnly) {
  if (remote !== "true") fail("the D1 binding is not configured with remote: true");
  console.log("D1 authoritative configuration is active.");
  process.exit(0);
}

if (remote === "true") {
  console.log("D1 authoritative configuration was already active.");
  process.exit(0);
}

let updatedBody;
if (remote === "false") {
  updatedBody = body.replace(/("remote"\s*:\s*)false/, "$1true");
} else {
  updatedBody = body.replace(
    /("migrations_dir"\s*:\s*"[^"]+")(\s*)$/,
    "$1,$2\n      \"remote\": true\n    ",
  );
}
if (updatedBody === body) fail("could not safely add remote: true to the D1 binding");

const next = source.replace(wholeBlock, `${prefix}${updatedBody}${suffix}`);
const mode = statSync(configPath).mode & 0o777;
const temporaryPath = `${configPath}.d1-authoritative-${process.pid}.tmp`;
writeFileSync(temporaryPath, next, { encoding: "utf8", mode });
chmodSync(temporaryPath, mode);
renameSync(temporaryPath, configPath);
console.log("D1 authoritative configuration enabled.");
