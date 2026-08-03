#!/usr/bin/env node
// QA tool v3: route API vs copertura nei test — loadRoute("app/api/.../route.mjs")
// (unit test diretti) E dispatch/Miniflare (worker buildato, pattern
// dispatch("/api/..."), dispatchFetch, renderRoute/renderPath). Stampa anche
// il tipo di copertura (loadRoute | dispatch) e le route senza test.
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

// route -> Set di tipi di copertura ("loadRoute" | "dispatch").
const coverage = new Map();
const byKind = { loadRoute: new Set(), dispatch: new Set() };

function record(route, kind) {
  if (!routes.includes(route)) return;
  if (!coverage.has(route)) coverage.set(route, new Set());
  coverage.get(route).add(kind);
  byKind[kind].add(route);
}

/** Un percorso concreto ("tiles/13/0/0.png") combacia col pattern della route
 *  ("tiles/[z]/[x]/[y]") quando i segmenti statici coincidono e ogni segmento
 *  dinamico [x] è coperto da una parte concreta qualsiasi. */
function matchRoute(concrete, pattern) {
  const c = concrete.split("/");
  const p = pattern.split("/");
  if (c.length !== p.length) return false;
  return p.every((seg, i) => {
    if (seg.startsWith("[") && seg.endsWith("]")) return c[i].length > 0;
    return seg === c[i];
  });
}

/** Estrae i literal "/api/..." da un frammento (niente query string). */
function apiPathsFrom(text) {
  const out = [];
  const re = /\/api\/([^"'`\s?)]*)/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1].replace(/\/+$/, ""));
  return out;
}

/** Registra copertura dispatch per ogni route combaciata da un path concreto. */
function recordDispatchPaths(concrete) {
  for (const route of routes) {
    if (matchRoute(concrete, route)) record(route, "dispatch");
  }
}

for (const f of readdirSync(join(root, "tests"))) {
  if (!f.endsWith(".test.mjs")) continue;
  const content = readFileSync(join(root, "tests", f), "utf-8");

  // 1) loadRoute("app/api/.../route.mjs") — unit test che carica la route.
  const reLoad = /load(?:E2E)?Route\(\s*["']app\/api\/([a-z0-9/_[\]-]+)\/route\.mjs["']/g;
  let m;
  while ((m = reLoad.exec(content))) record(m[1], "loadRoute");

  // 2) dispatch-based: literal dentro chiamate di dispatch sul worker buildato
  //    (Miniflare): dispatch("/api/..."), dispatchFetch("http://localhost..."),
  //    renderRoute("/api/..."), renderPath("/api/..."). Il literal è un
  //    argomento diretto della chiamata: nessun falso positivo da fetch-mock
  //    client-side (installFetchMock) o da semplici menzioni.
  const reDispatch = /\b(?:dispatch|dispatchFetch|renderRoute|renderPath)\s*\(\s*["'`](\/api\/[^"'`\s?)]*)/g;
  let dm;
  while ((dm = reDispatch.exec(content))) {
    for (const p of apiPathsFrom(dm[1])) recordDispatchPaths(p);
  }

  // 3) Vettori di route passati a un dispatch helper: array in `for (const r of
  //    ["/api/...", ...])` e probe `{ route: "/api/...", ... }` (es.
  //    navigation-pages, rendered-html). Solo se il file ha davvero un harness
  //    di dispatch, altrimenti sono solo liste/asserzioni.
  const hasDispatchHarness = /\b(?:dispatch|dispatchFetch|renderRoute|renderPath)\s*\(/.test(content);
  if (hasDispatchHarness) {
    const reLoop = /for\s*\(\s*const\s+\w+\s+of\s*\[([^\]]*)\]/g;
    let lm;
    while ((lm = reLoop.exec(content))) {
      for (const p of apiPathsFrom(lm[1])) recordDispatchPaths(p);
    }
    const reProbe = /route\s*:\s*["'`](\/api\/[^"'`\s?)]*)/g;
    let pm;
    while ((pm = reProbe.exec(content))) {
      for (const p of apiPathsFrom(pm[1])) recordDispatchPaths(p);
    }
  }
}

const untested = routes.filter((r) => !coverage.has(r));
const tested = routes.length - untested.length;

console.log("ROUTE SENZA TEST DIRETTI (loadRoute o dispatch/Miniflare):");
if (untested.length === 0) {
  console.log("  (nessuna — tutte le route coperte)");
} else {
  for (const r of untested) console.log("  " + r);
}
console.log("COVERAGE PER TIPO:");
console.log(`  loadRoute: ${byKind.loadRoute.size} route`);
console.log(
  `  dispatch:  ${byKind.dispatch.size} route` +
    (byKind.dispatch.size > 0
      ? ` (${[...byKind.dispatch].sort().join(", ")})`
      : ""),
);
console.log(`total: ${routes.length}, tested: ${tested}, untested: ${untested.length}`);
