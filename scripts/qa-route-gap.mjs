#!/usr/bin/env node
// QA tool v2: route API vs loadRoute("app/api/.../route.mjs") nei test.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function walk(dir, base, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.name === "route.ts") {
      out.push(full.replace(base + "/", "").replace("/route.ts", ""));
    }
  }
}

const routes = [];
walk(join(root, "app", "api"), join(root, "app", "api"), routes);

const tested = new Set();
for (const f of readdirSync(join(root, "tests"))) {
  if (!f.endsWith(".test.mjs")) continue;
  const content = readFileSync(join(root, "tests", f), "utf-8");
  const re = /load(?:E2E)?Route\(\s*["']app\/api\/([a-z0-9/_[\]-]+)\/route\.mjs["']/g;
  let m;
  while ((m = re.exec(content))) tested.add(m[1]);
}

const untested = routes.filter((r) => !tested.has(r));
console.log("ROUTE SENZA TEST DIRETTI (loadRoute):");
for (const r of untested) console.log("  " + r);
console.log(`total: ${routes.length}, tested: ${tested.size}, untested: ${untested.length}`);
