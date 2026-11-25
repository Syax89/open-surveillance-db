// Contract for app/lib/error-summary.ts: the one-line summary logged next to
// D1 failures so Workers Logs shows WHAT failed, not only the stack frames.

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let tree = null;
let mod = null;

before(async () => {
  tree = await mkdtemp(path.join(os.tmpdir(), "osdb-error-summary-"));
  const compiled = ts.transpileModule(await readFile(path.join(root, "app/lib/error-summary.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
  }).outputText;
  const file = path.join(tree, "error-summary.mjs");
  await writeFile(file, compiled);
  mod = await import(pathToFileURL(file).href);
});

after(async () => {
  if (tree) await rm(tree, { recursive: true, force: true });
});

test("errorSummary: name and message, then the cause chain", () => {
  const cause = new Error("D1_ERROR: string or blob too big: SQLITE_TOOBIG");
  const error = new Error("D1_ERROR: query failed", { cause });
  assert.equal(
    mod.errorSummary(error),
    "Error: D1_ERROR: query failed <- Error: D1_ERROR: string or blob too big: SQLITE_TOOBIG",
  );
});

test("errorSummary: a message-less error still names its type; non-errors degrade safely", () => {
  const empty = new TypeError("");
  assert.equal(mod.errorSummary(empty), "TypeError");
  assert.equal(mod.errorSummary("plain string"), "plain string");
  assert.equal(mod.errorSummary({ secret: "never printed" }), "object");
  assert.equal(mod.errorSummary(undefined), "");
});

test("errorSummary: email-shaped text is redacted and the result is length-capped", () => {
  const leaky = new Error("UNIQUE constraint failed for someone.name+tag@example.org");
  assert.equal(mod.errorSummary(leaky), "Error: UNIQUE constraint failed for [email]");

  const long = new Error("x".repeat(1000));
  const summary = mod.errorSummary(long);
  assert.equal(summary.length, mod.ERROR_SUMMARY_MAX_LENGTH);
  assert.ok(summary.endsWith("…"));
});

test("errorSummary: the cause chain is bounded (no infinite loop on a cycle)", () => {
  const a = new Error("a");
  const b = new Error("b", { cause: a });
  a.cause = b;
  assert.equal(mod.errorSummary(b), "Error: b <- Error: a <- Error: b <- Error: a");
});
