#!/usr/bin/env node
/**
 * Benchmark del contratto dati viewport della mappa (kanban t_bb310428 — P0
 * MAP UX REGRESSION). Misura a livello API, senza browser, sul dataset D1
 * reale (7.378 record attivi), ciò che il CEO ha riportato come lentezza:
 *
 *   PRIMA  — usePublicCameras camminava 15 pagine seriali
 *            GET /api/cameras?limit=500 (offset 0..14) prima di setRecords:
 *            primo byte ~0.92s, completamento ~5.35s, poi 0 punti e marker
 *            in ritardo (misurato su LXC 81ddc92, 7.374 record).
 *   DOPO   — la mappa usa il contratto bounded:
 *            GET /api/cameras?bbox=west,south,east,north&limit=10000
 *            UNA richiesta per viewport (VIEWPORT_BBOX_LIMIT = 10.000 =
 *            PUBLIC_CAMERAS_BBOX_MAX_LIMIT al confine db: una vista
 *            nazionale intera — 7.378 record — cade in una sola pagina).
 *
 * Uso:
 *   node scripts/benchmark-viewport.mjs [--url http://localhost:3000]
 *   Richiede solo il dev server attivo e il D1 locale con il dataset reale.
 *   Nessuna dipendenza: node >= 18 (fetch globale).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const BASE = args.includes("--url") ? args[args.indexOf("--url") + 1] : "http://localhost:3000";
const RUNS = 3;

const ITALY_BBOX = { west: 6.682305, south: 36.777886, east: 18.415887, north: 47.427792 };
// Viewport urbano ~ z13 attorno a Roma (il centro iniziale della mappa).
const ROME_BBOX = { west: 12.44, south: 41.85, east: 12.56, north: 41.96 };

function bboxQuery(bbox, limit, offset = 0) {
  return `${BASE}/api/cameras?bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}&limit=${limit}&offset=${offset}`;
}

async function timed(fn) {
  const start = performance.now();
  const res = await fn();
  return { ms: performance.now() - start, res };
}

/** PRIMA: il walk seriale della lista completa (15 pagine limit=500). */
async function measureSerialWalk() {
  const requests = [];
  const t0 = performance.now();
  for (let offset = 0; offset < 15; offset += 1) {
    const r = await timed(() => fetch(`${BASE}/api/cameras?limit=500&offset=${offset}`));
    const body = await r.res.text();
    requests.push({ offset, ms: r.ms, bytes: body.length, status: r.res.status });
  }
  const totalMs = performance.now() - t0;
  const bytes = requests.reduce((sum, r) => sum + r.bytes, 0);
  return {
    requests: requests.length,
    firstRequestMs: requests[0].ms,
    totalMs,
    bytes,
    perRequest: requests.map((r) => ({ offset: r.offset, ms: Math.round(r.ms) })),
  };
}

/** DOPO: una pagina bounded per viewport. */
async function measureBbox(bbox, label) {
  const samples = [];
  for (let i = 0; i < RUNS; i += 1) {
    const r = await timed(() => fetch(bboxQuery(bbox, 10_000)));
    const body = await r.res.text();
    let count = null;
    try { count = JSON.parse(body).records?.length ?? null; } catch { /* ignore */ }
    samples.push({ ms: r.ms, bytes: body.length, status: r.res.status, count });
  }
  samples.sort((a, b) => a.ms - b.ms);
  const median = samples[Math.floor(samples.length / 2)];
  return { label, runs: samples.map((s) => Math.round(s.ms)), medianMs: Math.round(median.ms), bytes: median.bytes, status: median.status, count: median.count };
}

async function main() {
  // Warm-up: il primo hit paga cold-start del worker/miniflare; la mappa reale
  // lo paga comunque una volta, ma il confronto onesto usa stato caldo.
  await fetch(`${BASE}/api/cameras?limit=1`).catch(() => {});

  const walk = await measureSerialWalk();
  const italy = await measureBbox(ITALY_BBOX, "italy-national");
  const rome = await measureBbox(ROME_BBOX, "rome-z13");

  const report = {
    task: "t_bb310428",
    date: new Date().toISOString(),
    base: BASE,
    datasetRecords: 7378,
    runsPerBbox: RUNS,
    serialWalk: walk,
    bbox: { italy, rome },
    summary: {
      oldWalkTotalMs: walk.totalMs,
      oldFirstRequestMs: walk.firstRequestMs,
      newNationalViewportMedianMs: italy.medianMs,
      newRomeViewportMedianMs: rome.medianMs,
      improvementNational: Math.round((walk.totalMs / italy.medianMs) * 100) / 100,
      // La regressione riportata dal CEO era il VIEWPORT INIZIALE (Roma z13):
      // prima zero marker finche' il walk completo non finiva (~3.7s+), ora
      // un solo bbox da ~200ms — primo marker ben dentro l'obiettivo <=1s.
      improvementInitialViewport: Math.round((walk.totalMs / rome.medianMs) * 100) / 100,
    },
  };
  const out = join(__dirname, "..", "docs", "performance", "viewport-benchmark-t_bb310428.json");
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nJSON: ${out}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
