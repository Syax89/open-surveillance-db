// Static-asset cache headers (perf 2026-11): public/_headers is copied by
// Vite into dist/client/_headers, which the Cloudflare assets binding
// applies to files it serves directly (wrangler.jsonc "assets"). vinext only
// generates its own dist/client/_headers (the immutable /assets/* rule) when
// none exists, so this file must carry that rule itself — otherwise adding
// it would silently drop the hashed-bundle immutable caching.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "public", "_headers"), "utf8");

/** Parse the Cloudflare `_headers` format into { pattern: { header: value } }. */
function parseHeaders(text) {
  const rules = new Map();
  let current = null;
  for (const raw of text.split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = raw.trim();
      assert.ok(!rules.has(current), `duplicate rule for ${current}`);
      rules.set(current, {});
      continue;
    }
    assert.ok(current, "header line before any path");
    const [name, ...value] = raw.trim().split(":");
    rules.get(current)[name.trim().toLowerCase()] = value.join(":").trim();
  }
  return rules;
}

const rules = parseHeaders(source);

test("hashed bundle assets keep vinext's immutable rule", () => {
  assert.equal(rules.get("/assets/*")?.["cache-control"], "public, max-age=31536000, immutable");
});

test("brand and social assets get a one-day cache instead of must-revalidate", () => {
  for (const file of ["/favicon.svg", "/logo-dark.svg", "/og.png"]) {
    assert.ok(existsSync(path.join(root, "public", file.slice(1))), `${file} exists in public/`);
    assert.equal(rules.get(file)?.["cache-control"], "public, max-age=86400", `${file} is cached for a day`);
  }
});

test("the explorer view-transition stylesheet gets a bounded cache", () => {
  assert.ok(existsSync(path.join(root, "public", "explorer-view-transition.css")));
  assert.equal(rules.get("/explorer-view-transition.css")?.["cache-control"], "public, max-age=3600");
});

test("no rule can reach HTML documents or API responses", () => {
  for (const pattern of rules.keys()) {
    assert.notEqual(pattern, "/*", "no catch-all rule");
    assert.ok(!pattern.startsWith("/api"), "API responses keep their own Cache-Control");
    assert.ok(pattern === "/assets/*" || /^\/[\w.-]+\.(svg|png|css)$/.test(pattern), `${pattern} targets one static file`);
  }
});
