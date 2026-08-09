import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const enableScript = path.join(root, "scripts", "enable-d1-authoritative.mjs");
const legacySyncScript = path.join(root, "scripts", "sync-d1-backfill.mjs");
const serviceDropIn = path.join(root, "ops", "osdb-test-d1-authoritative.conf");
const serviceStarter = path.join(root, "ops", "osdb-test-d1-authoritative-start.sh");
const PLACEHOLDER_D1_ID = "00000000-0000-4000-8000-000000000000";

function config(databaseId, remote = undefined) {
  const remoteLine = remote === undefined ? "" : `,\n      \"remote\": ${remote}`;
  return `{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "osdb-production",
      "database_id": "${databaseId}",
      "migrations_dir": "drizzle"${remoteLine}
    }
  ]
}
`;
}

function run(script, ...args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

test("enable-d1-authoritative makes only an operational D1 binding remote and is idempotent", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "osdb-d1-authoritative-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, "wrangler.jsonc");
  await writeFile(configPath, config("11111111-2222-4333-8444-555555555555"));

  const first = run(enableScript, "--config", configPath);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /enabled/i);
  const enabled = await readFile(configPath, "utf8");
  assert.match(enabled, /"remote"\s*:\s*true/, "only the operational file opts into remote D1");

  const checked = run(enableScript, "--config", configPath, "--check");
  assert.equal(checked.status, 0, checked.stderr);
  const second = run(enableScript, "--config", configPath);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /already active/i);
  assert.equal((await readFile(configPath, "utf8")).match(/"remote"\s*:\s*true/g)?.length, 1);
});

test("enable-d1-authoritative refuses the committed placeholder without modifying it", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "osdb-d1-authoritative-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = path.join(directory, "wrangler.jsonc");
  const original = config(PLACEHOLDER_D1_ID);
  await writeFile(configPath, original);

  const result = run(enableScript, "--config", configPath);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /real D1 database_id/i);
  assert.equal(await readFile(configPath, "utf8"), original, "a placeholder must never be made remote");
});

test("legacy container-to-D1 sync fails closed unless an operator explicitly opts in", () => {
  const result = run(legacySyncScript);
  assert.equal(result.status, 64, result.stderr);
  assert.match(result.stderr, /D1 is authoritative/i);
});

test("LXC service template consumes an encrypted credential without committing a token", async () => {
  const [dropIn, starter] = await Promise.all([
    readFile(serviceDropIn, "utf8"),
    readFile(serviceStarter, "utf8"),
  ]);
  assert.match(dropIn, /LoadCredentialEncrypted=cloudflare_api_token:/);
  assert.match(dropIn, /ExecStart=\/usr\/local\/libexec\/osdb-test-d1-authoritative-start/);
  assert.doesNotMatch(dropIn, /CLOUDFLARE_API_TOKEN\s*=/);
  assert.match(starter, /CREDENTIALS_DIRECTORY/);
  assert.match(starter, /CLOUDFLARE_API_TOKEN="\$\(cat "\$token_file"\)"/);
  assert.doesNotMatch(starter, /CLOUDFLARE_API_TOKEN="(?!\$)/, "template must not embed a token literal");
});
