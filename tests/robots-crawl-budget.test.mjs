// Crawl-budget contract for /robots.txt (app/robots.ts).
//
// Workers Observability (2026-11-18..25) showed SemrushBot spending ~55% of
// the worker's total CPU time on /mappa?focus=<id>: one full map render per
// record, reached through the record pages' "view on map" links it had
// harvested before /records/ was disallowed. These tests pin the rules with
// the same prefix matching crawlers apply (RFC 9309 §2.2.2), so a future
// edit cannot silently re-open the per-record URL space or, the other way
// round, hide the map page itself from search engines.

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let tree = null;

async function loadRobots() {
  tree = await mkdtemp(path.join(os.tmpdir(), "osdb-robots-"));
  const transpile = async (relative) =>
    ts.transpileModule(await readFile(path.join(root, relative), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
    }).outputText;
  const siteUrl = path.join(tree, "site-url.mjs");
  await writeFile(siteUrl, await transpile("app/lib/site-url.ts"));
  const robotsFile = path.join(tree, "robots.mjs");
  const robotsSource = (await transpile("app/robots.ts")).replace(
    /from\s*["']\.\/lib\/site-url["']/,
    `from "${pathToFileURL(siteUrl).href}"`,
  );
  await writeFile(robotsFile, robotsSource);
  const { default: robots } = await import(pathToFileURL(robotsFile).href);
  return robots();
}

after(async () => {
  if (tree) await rm(tree, { recursive: true, force: true });
});

/** RFC 9309 longest-match evaluation for one group (no wildcards used here). */
function allowed(rule, pathAndQuery) {
  const list = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
  let best = { length: -1, allow: true };
  for (const [patterns, allow] of [[list(rule.allow), true], [list(rule.disallow), false]]) {
    for (const pattern of patterns) {
      if (!pathAndQuery.startsWith(pattern)) continue;
      // Longest match wins; on a tie the allow rule wins (RFC 9309 §2.2.2).
      if (pattern.length > best.length || (pattern.length === best.length && allow)) {
        best = { length: pattern.length, allow };
      }
    }
  }
  return best.allow;
}

test("robots: per-record map deep links are excluded, the map page itself is not", async () => {
  const config = await loadRobots();
  const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
  const catchAll = rules.find((rule) => rule.userAgent === "*");
  assert.ok(catchAll, "a catch-all user-agent group must exist");

  for (const blocked of [
    "/mappa?focus=92016",
    "/mappa?focus=1&freshness=30d",
    "/mappa?q=roma",
    "/mappa?type=dome",
    "/records/6745",
  ]) {
    assert.equal(allowed(catchAll, blocked), false, `${blocked} must be disallowed (crawl budget)`);
  }

  for (const open of ["/", "/mappa", "/directory", "/guide", "/fonti", "/faq"]) {
    assert.equal(allowed(catchAll, open), true, `${open} must stay crawlable`);
  }
});
