/**
 * Route-scoped map stylesheet (perf 2026-11) — static + built-output contracts.
 *
 * Leaflet's CSS and the map-only rules used to sit in the single global,
 * render-blocking bundle on EVERY route. They now live in app/styles/map.css,
 * compiled by the `routeStylesheets` plugin (vite.config.ts) into a
 * content-hashed /assets/map-<hash>.css that app/components/MapStyles.tsx
 * links only from the routes rendering a Leaflet map. These checks keep that
 * split from silently regressing (a stray Leaflet import back in globals, a
 * map route that forgets the link, a non-map route that adds it).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { GLOBAL_CSS, MAP_CSS } from "./helpers/site-css.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Pages that render a Leaflet map (directly or through their tool body). */
const MAP_ROUTE_PAGES = [
  path.join("app", "(tools)", "mappa", "page.tsx"),
  path.join("app", "(tools)", "segnala", "page.tsx"),
  path.join("app", "records", "[id]", "edit", "page.tsx"),
  path.join("app", "records", "[id]", "page.tsx"),
];

test("Leaflet and the map-only rules are out of the global stylesheet", async () => {
  const globals = stripComments(await read(GLOBAL_CSS));
  assert.doesNotMatch(globals, /@import\s+["']leaflet/, "app/globals.css must not pull Leaflet into every route");
  assert.doesNotMatch(globals, /\.leaflet-[\w-]+[^{}]*\{/, "no Leaflet-scoped rule ships globally");
  for (const selector of [".map-layout", ".map-card", ".map-record-list", ".osm-popup", ".fov-cone", ".record-minimap", ".report-minimap"]) {
    assert.ok(!globals.includes(`${selector} {`) && !globals.includes(`${selector}{`), `${selector} lives in app/styles/map.css`);
  }

  const map = stripComments(await read(MAP_CSS));
  assert.match(map.trimStart(), /^@import\s+"leaflet\/dist\/leaflet\.css";/, "map.css starts with Leaflet, before the overrides");
  assert.doesNotMatch(map, /@import\s+["']tailwindcss/, "map.css never re-emits Tailwind");
});

test("only the Leaflet routes link the map stylesheet", async () => {
  const component = await read(path.join("app", "components", "MapStyles.tsx"));
  assert.match(component, /<link rel="stylesheet" href=\{MAP_CSS_HREF\} precedence="default" \/>/, "React 19 hoists it into <head>, after the global stylesheet");
  assert.match(component, /typeof __OSDB_MAP_CSS_HREF__ === "string"/, "the build-time href has a harness-safe fallback (no .css import)");

  for (const page of MAP_ROUTE_PAGES) {
    assert.match(await read(page), /<MapStyles \/>/, `${page} links the map stylesheet`);
  }
  const users = execFileSync("grep", ["-rlw", "--include=*.tsx", "--include=*.ts", "MapStyles", path.join(root, "app")], { encoding: "utf8" })
    .trim().split("\n").map((file) => path.relative(root, file)).sort();
  assert.deepEqual(users, [...MAP_ROUTE_PAGES, path.join("app", "components", "MapStyles.tsx")].sort());

  // Every Leaflet component is reachable only from those routes.
  for (const leafletComponent of ["SurveillanceMap", "RecordMiniMap", "ReportMiniMap", "EditPositionMap"]) {
    const out = execFileSync("grep", ["-rlE", "--include=*.tsx", `import \\{[^}]*\\b${leafletComponent}\\b`, path.join(root, "app")], { encoding: "utf8" });
    const importers = out.trim().split("\n").map((file) => path.relative(root, file));
    for (const importer of importers) {
      assert.ok(
        [
          ...MAP_ROUTE_PAGES,
          path.join("app", "components", "home", "MapPanel.tsx"),
          path.join("app", "components", "home", "ReportForm.tsx"),
          path.join("app", "records", "[id]", "RecordPageBody.tsx"),
        ].includes(importer),
        `${leafletComponent} imported by ${importer}: that route must link <MapStyles /> too`,
      );
    }
  }
});

test("the build plugin emits a content-hashed asset under the immutable /assets/* rule", async () => {
  const config = await read("vite.config.ts");
  assert.match(config, /const MAP_CSS_SOURCE = "app\/styles\/map\.css";/);
  assert.match(config, /href = `\/assets\/map-\$\{hash\}\.css`;/, "the URL carries a content hash");
  assert.match(config, /define: \{ __OSDB_MAP_CSS_HREF__: JSON\.stringify\(href\) \}/);
  assert.match(config, /routeStylesheets\(\),\s*\n\s*vinext\(\),/, "the plugin is registered");
  const headers = await read(path.join("public", "_headers"));
  assert.match(headers, /^\/assets\/\*\n\s+Cache-Control: public, max-age=31536000, immutable$/m);
});

test("built output: the hashed map stylesheet exists and the bundle points at it", { skip: !existsSync(path.join(root, "dist", "client", "assets")) && "run `npm run build` first" }, async () => {
  const assets = await readdir(path.join(root, "dist", "client", "assets"));
  const mapFiles = assets.filter((file) => /^map-[0-9a-f]{10}\.css$/.test(file));
  assert.equal(mapFiles.length, 1, `exactly one hashed map stylesheet, got ${mapFiles.join(", ")}`);
  const mapCss = await read(path.join("dist", "client", "assets", mapFiles[0]));
  assert.match(mapCss, /\.leaflet-container\{/, "Leaflet is bundled in");
  assert.match(mapCss, /\.osm-popup-footer a\{/, "the map overrides are bundled in");

  const globalCss = assets.filter((file) => /^index-.*\.css$/.test(file));
  assert.equal(globalCss.length, 1);
  assert.doesNotMatch(await read(path.join("dist", "client", "assets", globalCss[0])), /\.leaflet-container\{/, "the global bundle is Leaflet-free");

  const server = await read(path.join("dist", "server", "index.js"));
  assert.ok(server.includes(`/assets/${mapFiles[0]}`), "the server bundle links the emitted file");
  assert.doesNotMatch(server, /__OSDB_MAP_CSS_HREF__/, "the define was replaced at build time");
});
