/**
 * Preview map generator for import run #1 (FASE B — kanban t_c338e9df).
 *
 *   node scripts/import/adapters/preview-map.mjs
 *     [--zurigo=<csv>] [--milano-c=<geojson>] [--milano-b=<geojson>]
 *     [--osm=<overpass-json>] [--out=docs/data-sources/imports/preview-import-run-1.html]
 *
 * Uses cached payloads when given (or defaults under /tmp/osdb-import/);
 * parses through the real adapters, applies intra-source dedup (same rules as
 * the dry-run harness) and emits a self-contained Leaflet map (markers
 * coloured per source, popup with title/kind/direction/external_id) plus the
 * merged staged GeoJSON. Verification artifact for "verifica su mappa".
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parsePayload as zurigoParse } from "./zurigo-videokameras-2026.mjs";
import { parsePayload as milanoParse } from "./milano-varchi-2026.mjs";
import { parsePayload as osmParse } from "./osm-surveillance-italia-2026.mjs";
import { validateStagedRow } from "./lib.mjs";

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const CACHE = {
  zurigo: "/tmp/osdb-import/zurigo.csv",
  milanoC: "/tmp/osdb-import/milano_areac.geojson",
  milanoB: "/tmp/osdb-import/milano_areab.geojson",
  osm: "/tmp/osdb-import/osm_italia.json",
};

function loadOrThrow(path, what) {
  if (!path || !existsSync(path)) throw new Error(`missing ${what} payload at ${path}`);
  return path;
}

/** Intra-source dedup (mirror of the dry-run harness rules, § 4.1). */
function dedupIntra(staged) {
  const seenExternal = new Set();
  const seenCell = new Map();
  const kept = [];
  for (const row of staged) {
    if (seenExternal.has(row.external_id)) continue;
    seenExternal.add(row.external_id);
    const key = `${row.latitude.toFixed(4)},${row.longitude.toFixed(4)}|${row.kind}`;
    const existing = seenCell.get(key);
    if (existing) {
      if (existing.kind === row.kind) continue;
      seenCell.set(`${key}#${row.kind}`, row);
    }
    kept.push(row);
    seenCell.set(key, row);
  }
  return kept;
}

const SOURCE_META = {
  zurigo: { label: "Zürich (CC0)", color: "#0f766e" },
  milano: { label: "Milano varchi (CC BY)", color: "#b91c1c" },
  osm: { label: "OSM surveillance (ODbL)", color: "#1d4ed8" },
};

async function main() {
  const outPath = arg("out", "docs/data-sources/imports/preview-import-run-1.html");
  const geojsonOut = outPath.replace(/\.html$/, ".geojson");

  // Zürich (CSV) — payload cached or --fresh not supported: cached file needed.
  const zurigoRaw = zurigoParse({ text: readFileSync(loadOrThrow(arg("zurigo", CACHE.zurigo), "Zürich"), "utf8") });
  const milanoC = JSON.parse(readFileSync(loadOrThrow(arg("milano-c", CACHE.milanoC), "Milano Area C"), "utf8"));
  const milanoB = JSON.parse(readFileSync(loadOrThrow(arg("milano-b", CACHE.milanoB), "Milano Area B"), "utf8"));
  const osmRaw = JSON.parse(readFileSync(loadOrThrow(arg("osm", CACHE.osm), "OSM"), "utf8"));

  const milanoParsed = milanoParse({
    payloads: [
      { key: "areaC", geojson: milanoC },
      { key: "areaB", geojson: milanoB },
    ],
  });
  const osmParsed = osmParse({ elements: osmRaw.elements });

  const layers = [
    { slug: "zurigo-videokameras-2026", rows: dedupIntra(zurigoRaw.staged) },
    { slug: "milano-varchi-2026", rows: dedupIntra(milanoParsed.staged) },
    { slug: "osm-surveillance-italia-2026", rows: dedupIntra(osmParsed.staged) },
  ];

  const features = [];
  const markerGroups = layers
    .map((layer) => {
      const meta = SOURCE_META[layer.slug.startsWith("zurigo") ? "zurigo" : layer.slug.startsWith("milano") ? "milano" : "osm"];
      const valid = layer.rows.filter((r) => validateStagedRow(r).ok);
      for (const row of valid) {
        features.push({
          type: "Feature",
          properties: {
            source: `import:${layer.slug}`,
            title: row.title,
            kind: row.kind,
            direction: row.direction,
            external_id: row.external_id,
          },
          geometry: { type: "Point", coordinates: [row.longitude, row.latitude] },
        });
      }
      return {
        key: meta.color,
        label: `${meta.label} (${valid.length})`,
        color: meta.color,
        points: valid.map((r) => [r.latitude, r.longitude]),
      };
    });

  writeFileSync(geojsonOut, JSON.stringify({ type: "FeatureCollection", features }, null, 1));

  const attributionHtml = [
    "Zürich: Fonte: Stadt Zürich, dataset 'Aktuelle Auflistung von Videokameras der Stadtverwaltung Zürich', CC0 1.0.",
    "Milano: Fonte: Comune di Milano, dataset 'Varchi Area C' / 'Varchi Area B', concesso con CC BY 3.0 IT. Coordinate arrotondate a ~4 decimali (~10 m).",
    "OSM: © OpenStreetMap contributors (ODbL 1.0) — https://www.openstreetmap.org/copyright",
  ].map((t) => `<div>${t}</div>`).join("");

  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>Import run #1 — preview (${new Date().toISOString().slice(0, 10)})</title>
<link rel="stylesheet" href="../../../node_modules/leaflet/dist/leaflet.css">
<style>
  html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; }
  #map { height: 100%; }
  #legend { position: absolute; z-index: 1000; top: 12px; right: 12px; background: rgba(255,255,255,.94);
            border-radius: 8px; padding: 10px 12px; box-shadow: 0 1px 6px rgba(0,0,0,.25); font-size: 12px; }
  #legend div { margin: 2px 0; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
  #attribution { position: absolute; z-index: 1000; bottom: 24px; left: 12px; max-width: 480px;
                 background: rgba(255,255,255,.92); border-radius: 8px; padding: 8px 10px;
                 font-size: 11px; line-height: 1.45; box-shadow: 0 1px 6px rgba(0,0,0,.25); }
</style>
</head>
<body>
<div id="map"></div>
<div id="legend">
  ${markerGroups.map((g) => `<div><span class="swatch" style="background:${g.color}"></span>${g.label}</div>`).join("")}
</div>
<div id="attribution">
  <strong>Attribuzioni (testi esatti, licenze-compatibilita.md § 5.2):</strong>
  ${attributionHtml}
</div>
<script src="../../../node_modules/leaflet/dist/leaflet.js"></script>
<script>
  const map = L.map("map", { preferCanvas: true }).setView([42.5, 12.3], 6);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);
  const groups = ${JSON.stringify(markerGroups)};
  for (const g of groups) {
    const layer = L.layerGroup();
    for (const [lat, lon] of g.points) {
      L.circleMarker([lat, lon], {
        radius: 3, color: g.color, weight: 1, fillColor: g.color, fillOpacity: 0.7,
      }).addTo(layer);
    }
    layer.addTo(map);
    g.layer = layer;
  }
  window.__groups = groups;
</script>
</body>
</html>`;

  writeFileSync(outPath, html);
  console.log(`preview written: ${outPath}`);
  console.log(`geojson written: ${geojsonOut}`);
  console.log(`markers: ${features.length}`);
}

main().catch((err) => {
  console.error(`[preview-map] FAILED: ${err.message}`);
  process.exit(1);
});
