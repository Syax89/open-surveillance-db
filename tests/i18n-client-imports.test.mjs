/**
 * i18n client-import contract (JS size) — static source checks.
 *
 * The aggregated `messages` map (app/lib/i18n/index.ts, assembled from
 * app/lib/i18n/bundles/{en,it}.ts) holds EVERY domain in BOTH locales
 * (~170 KB raw). Any "use client" module that imports it — directly or
 * through the legacy `useMessages()` hook (app/lib/use-messages.ts) —
 * drags the whole dictionary into its route chunk; before this contract
 * it shipped on 9 of 12 routes.
 *
 * Client code imports only the domains it renders instead:
 *   import { homeByLocale } from "../lib/i18n/home";
 *   const t = useDomainMessages(homeByLocale);   // app/lib/use-domain-messages.ts
 *
 * This suite pins that:
 *   1. no client module (a "use client" file, anything under
 *      app/components/**, or an app/lib/use-*.ts hook) has a VALUE import
 *      of the i18n index, of i18n/bundles/*, or of lib/use-messages —
 *      type-only imports are erased and allowed; server-only modules
 *      (server-i18n.ts, Server Component pages, API routes) may keep
 *      using `messages`;
 *   2. the allow-list of not-yet-migrated files is exact (each entry still
 *      violates and still exists), so it can only shrink;
 *   3. every domain file exports its `<domain>ByLocale` map.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "app");
const i18nDir = path.join(appDir, "lib", "i18n");

/** Modules whose import ships the whole two-locale dictionary. */
const HEAVY = new Set([
  path.join(i18nDir, "index.ts"),
  path.join(i18nDir, "bundles", "en.ts"),
  path.join(i18nDir, "bundles", "it.ts"),
  path.join(appDir, "lib", "use-messages.ts"),
]);

/**
 * Client modules still on the aggregated dictionary, owned by other work
 * streams (map tool, record pages). Remove an entry once it migrates to
 * useDomainMessages — the "allow-list is exact" test enforces it.
 */
const ALLOWLIST = new Set([
  // The deprecated hook itself (it IS the heavy import).
  "app/lib/use-messages.ts",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function isClientModule(file, src) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  if (rel.startsWith("app/lib/i18n/")) return false; // the dictionary itself
  if (/^\s*["']use client["']/.test(src)) return true;
  if (rel.startsWith("app/components/")) return true;
  return /^app\/lib\/use-[^/]+\.tsx?$/.test(rel);
}

function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Value (non-type-only) import/export/dynamic-import specifiers of a source. */
function valueSpecifiers(src) {
  const specs = [];
  const fromRe = /^\s*(import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/gm;
  for (const m of src.matchAll(fromRe)) {
    if (!m[2]) specs.push(m[4]);
  }
  for (const m of src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) specs.push(m[1]);
  for (const m of src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
  return specs;
}

function violations() {
  const found = new Map();
  for (const file of walk(appDir)) {
    const src = readFileSync(file, "utf8");
    if (!isClientModule(file, src)) continue;
    const heavy = valueSpecifiers(src).filter((spec) => HEAVY.has(resolveSpecifier(file, spec)));
    if (heavy.length > 0) found.set(path.relative(root, file).split(path.sep).join("/"), heavy);
  }
  return found;
}

test("client modules never import the aggregated i18n dictionary", () => {
  const offenders = [...violations()]
    .filter(([rel]) => !ALLOWLIST.has(rel))
    .map(([rel, specs]) => `${rel} → ${specs.join(", ")}`);
  assert.deepEqual(
    offenders,
    [],
    "client code must import only its domain maps (`import { xxxByLocale } from \"…/i18n/xxx\"` + "
      + "useDomainMessages), never i18n/index, i18n/bundles or useMessages:\n" + offenders.join("\n"),
  );
});

test("the not-yet-migrated allow-list is exact (it may only shrink)", () => {
  const found = violations();
  for (const rel of ALLOWLIST) {
    assert.ok(existsSync(path.join(root, rel)), `${rel} no longer exists — drop it from ALLOWLIST`);
    assert.ok(found.has(rel), `${rel} no longer imports the full dictionary — drop it from ALLOWLIST`);
  }
});

test("the static scan sees the known shapes (self-check)", () => {
  assert.deepEqual(valueSpecifiers('import { messages } from "./i18n";'), ["./i18n"]);
  assert.deepEqual(valueSpecifiers('import type { Locale } from "./i18n";'), []);
  assert.deepEqual(valueSpecifiers('import {\n  a,\n  b,\n} from "../lib/i18n";'), ["../lib/i18n"]);
  assert.deepEqual(valueSpecifiers('const m = await import("./i18n/bundles/en");'), ["./i18n/bundles/en"]);
  const probe = path.join(appDir, "components", "Probe.tsx");
  assert.equal(resolveSpecifier(probe, "../lib/i18n"), path.join(i18nDir, "index.ts"));
  assert.equal(resolveSpecifier(probe, "../lib/i18n/bundles/it"), path.join(i18nDir, "bundles", "it.ts"));
  assert.equal(resolveSpecifier(probe, "../lib/use-messages"), path.join(appDir, "lib", "use-messages.ts"));
});

test("every i18n domain file exports its <domain>ByLocale map", () => {
  const missing = readdirSync(i18nDir)
    .filter((name) => name.endsWith(".ts") && name !== "index.ts" && name !== "types.ts")
    .filter((name) => {
      const domain = name.slice(0, -3).replace(/-(\w)/g, (_, c) => c.toUpperCase());
      const src = readFileSync(path.join(i18nDir, name), "utf8");
      return !new RegExp(`export const ${domain}ByLocale: Record<Locale, Translation<typeof en>> = \\{`).test(src);
    });
  assert.deepEqual(missing, [], `domain files without a typed xxxByLocale export: ${missing.join(", ")}`);
});
