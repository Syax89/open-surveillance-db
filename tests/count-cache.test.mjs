// db/count-cache.ts: the full-scan COUNT(*) is reused for 5 min, keyed by
// SQL+params (timestamps by hour), and fails open on any cache problem.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";

async function load() {
  const ts = (await import("typescript")).default;
  const src = await readFile(new URL("../db/count-cache.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext } }).outputText;
  const dir = await mkdtemp("/tmp/count-cache-");
  await writeFile(`${dir}/m.mjs`, js);
  return import(`${pathToFileURL(`${dir}/m.mjs`).href}?t=${Date.now()}`);
}

function fakeCache({ failMatch = false } = {}) {
  const store = new Map();
  globalThis.caches = { default: {
    async match(k) { if (failMatch) throw new Error("boom"); const r = store.get(k.url); return r ? r.clone() : null; },
    async put(k, r) { store.set(k.url, r); },
  } };
  return store;
}
afterEach(() => { delete globalThis.caches; });

test("second identical count is served from cache, ISO timestamps keyed by hour", async () => {
  const { cachedCount } = await load();
  fakeCache();
  let runs = 0;
  const run = async () => { runs += 1; return 42; };
  assert.equal(await cachedCount("SELECT 1", ["active", "2026-11-13T19:21:34.482Z"], run), 42);
  assert.equal(await cachedCount("SELECT 1", ["active", "2026-11-13T19:25:01.001Z"], run), 42);
  assert.equal(runs, 1);
  await cachedCount("SELECT 1", ["removed", "2026-11-13T19:25:01.001Z"], run);
  await cachedCount("SELECT 2", ["active", "2026-11-13T19:25:01.001Z"], run);
  assert.equal(runs, 3);
});

test("no Cache API or cache errors fall back to the query", async () => {
  const { cachedCount } = await load();
  let runs = 0;
  const run = async () => { runs += 1; return 7; };
  assert.equal(await cachedCount("S", [], run), 7);
  fakeCache({ failMatch: true });
  assert.equal(await cachedCount("S", [], run), 7);
  assert.equal(runs, 2);
});
