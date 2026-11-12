// Shared same-origin redirect validation (app/lib/safe-redirect.ts,
// security audit 2026-11). Used by the OIDC start route (redirect_to), the
// login page (?returnTo=) and /api/locale (?next=). The browser normalises
// `\` to `/` and strips TAB/CR/LF from URLs, so any of those inside a
// "relative path" can turn it into a protocol-relative URL to another host.

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function loadModule() {
  const source = await readFile(new URL("../app/lib/safe-redirect.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
  }).outputText;
  const dir = await mkdtemp(path.join(os.tmpdir(), "safe-redirect-"));
  const file = path.join(dir, "safe-redirect.mjs");
  await writeFile(file, js);
  return import(pathToFileURL(file).href);
}

const { safeRedirectTarget, safeSameOriginRedirect, isSameOrigin } = await loadModule();

const HOSTILE = [
  "https://evil.example/phish",
  "javascript:alert(1)",
  "//evil.example",
  "/\\evil.example",
  "/\\/evil.example",
  "/\t/evil.example",
  "/\n/evil.example",
  "/\r/evil.example",
  "/ /evil.example",
  "/guide\u0000",
  "/guide\u007f",
  "/guide\u000b",
  "/%09/evil.example",
  "/%5Cevil.example",
  "/%5cevil.example",
  "/guide%0d%0aX-Evil:%20yes",
  "/guide%0AX-Evil",
  "guide",
  "",
  null,
  undefined,
  42,
];

test("safeRedirectTarget rejects schemes, protocol-relative, backslash, whitespace and control characters", () => {
  for (const value of HOSTILE) {
    assert.equal(safeRedirectTarget(value), null, `must reject ${JSON.stringify(value)}`);
  }
});

test("safeRedirectTarget accepts plain same-site paths with query and hash", () => {
  for (const value of ["/", "/account", "/segnala?lat=41.9&lng=12.5", "/correggi?record=42#form", "/guide%20x"]) {
    assert.equal(safeRedirectTarget(value), value);
  }
  assert.equal(safeRedirectTarget(`/${"a".repeat(400)}`).length, 300, "long targets are truncated");
});

test("safeSameOriginRedirect pins the resolved URL to the given origin", () => {
  const origin = "https://opensurveillancedb.org";
  assert.equal(safeSameOriginRedirect("/account", origin), "/account");
  for (const value of HOSTILE) {
    assert.equal(safeSameOriginRedirect(value, origin), null, `must reject ${JSON.stringify(value)}`);
  }
  assert.equal(isSameOrigin("/a", origin), true);
  assert.equal(isSameOrigin("//evil.example/a", origin), false);
  assert.equal(isSameOrigin("/\\evil.example", origin), false);
  assert.equal(isSameOrigin("/a", "not a url"), false);
});
