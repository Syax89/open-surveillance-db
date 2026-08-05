#!/usr/bin/env node
/**
 * Benchmark riproducibile della mappa /mappa (kanban t_26ce96f3).
 *
 * Misura sul dataset reale (D1 locale, 7.378 record importati):
 *  1. walk paginato: tempo + conteggio richieste a /api/cameras?limit=500
 *  2. picco marker DOM a zoom nazionale (z5) e città (z13): il primo è la
 *     metrica chiave (tutti i punti materializzati come divIcon prima della
 *     soluzione a griglia)
 *  3. heap JS (performance.memory.usedJSHeapSize)
 *  4. first meaningful paint della mappa (fcp/lcp + primo marker)
 *  5. FPS pan/zoom a z5 e z13: gesti mouse reali con frame counter rAF in pagina
 *  6. click popup: tempo dal click reale al popup visibile
 *
 * Uso:
 *   node scripts/benchmark-map.mjs [--label before|after] [--url http://localhost:3000/mappa]
 *
 * Richiede playwright raggiungibile via `require("playwright")` (o
 * PLAYWRIGHT_PATH=/path) e un browser installato (npx playwright install
 * chromium). Nessuna dipendenza nel package.json: è uno strumento di misura.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  const alt = process.env.PLAYWRIGHT_PATH;
  if (!alt) throw new Error("playwright non raggiungibile: installalo o imposta PLAYWRIGHT_PATH");
  playwright = require(alt);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const label = args.includes("--label") ? args[args.indexOf("--label") + 1] : "run";
const url = args.includes("--url") ? args[args.indexOf("--url") + 1] : "http://localhost:3000/mappa";
const OUT = join(__dirname, "..", "docs", "performance", `benchmark-${label}.json`);

const isWalkRequest = (request) => {
  const u = new URL(request.url());
  return u.pathname === "/api/cameras" && u.searchParams.get("limit") === "500" && !u.searchParams.has("bbox");
};

async function measureWalk(page) {
  const requests = [];
  page.on("request", (r) => { if (isWalkRequest(r)) requests.push({ url: r.url(), start: Date.now() }); });
  page.on("response", (r) => {
    if (!isWalkRequest(r)) return;
    const req = requests.find((item) => item.url === r.url() && item.end === undefined);
    if (req) req.end = Date.now();
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(250);
    if (requests.filter((r) => r.end === undefined).length === 0 && requests.length > 0) break;
  }
  await page.waitForTimeout(500);
  const completed = requests.filter((r) => r.end !== undefined);
  const totalMs = completed.length ? Math.max(...completed.map((r) => r.end)) - Math.min(...completed.map((r) => r.start)) : null;
  const perRequest = completed.map((r) => ({ offset: new URL(r.url).searchParams.get("offset"), ms: r.end - r.start }));
  let bytes = 0;
  for (const r of completed) {
    try {
      bytes += await page.evaluate(async (u) => (await (await fetch(u)).text()).length, r.url);
    } catch { /* body già consumato dal walk */ }
  }
  return { requests: completed.length, totalMs, perRequest, bytes };
}

async function setZoom(page, target) {
  for (let i = 0; i < 16; i += 1) {
    const z = await page.evaluate(() => {
      const t = document.querySelector(".leaflet-tile");
      const m = t?.src.match(/\/tiles\/(\d+)\//);
      return m ? Number(m[1]) : null;
    });
    if (z === null) break;
    if (z === target) return z;
    const btn = z < target ? ".leaflet-control-zoom-in" : ".leaflet-control-zoom-out";
    await page.click(btn, { force: true }).catch(() => {});
    await page.waitForTimeout(220);
  }
  return page.evaluate(() => {
    const t = document.querySelector(".leaflet-tile");
    const m = t?.src.match(/\/tiles\/(\d+)\//);
    return m ? Number(m[1]) : null;
  });
}

async function measureMarkerCounts(page) {
  const atZoom = async (zoom) => {
    await setZoom(page, zoom);
    await page.waitForTimeout(1600); // lascia stabilizzare culling/rebuild
    return page.evaluate(() => ({
      markers: document.querySelectorAll(".leaflet-marker-pane > div").length,
      divIcons: document.querySelectorAll(".leaflet-marker-pane .leaflet-marker-icon").length,
    }));
  };
  return {
    national: await atZoom(5),
    city: await atZoom(13),
  };
}

async function measurePaint(page) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page.evaluate(async () => {
    const t0 = performance.now();
    return new Promise((resolve) => {
      const timings = { fcp: null, lcp: null, firstMarker: null };
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === "largest-contentful-paint") timings.lcp = Math.round(entry.startTime);
          if (entry.entryType === "paint" && entry.name === "first-contentful-paint") timings.fcp = Math.round(entry.startTime);
        }
      });
      obs.observe({ type: "largest-contentful-paint", buffered: true });
      obs.observe({ type: "paint", buffered: true });
      const check = () => {
        const n = document.querySelectorAll(".leaflet-marker-pane > div").length;
        if (timings.firstMarker === null && n > 0) timings.firstMarker = Math.round(performance.now() - t0);
        if (timings.firstMarker !== null && performance.now() - t0 > 4000) {
          obs.disconnect();
          resolve(timings);
        } else setTimeout(check, 50);
      };
      setTimeout(check, 50);
      setTimeout(() => { obs.disconnect(); resolve(timings); }, 20000);
    });
  });
}

const FRAME_COUNTER_INIT = () => {
  window.__startFrames = () => {
    window.__fs = { frames: 0, last: 0, deltas: [], t0: performance.now() };
    const tick = (now) => {
      const s = window.__fs;
      if (s.frames > 0) s.deltas.push(now - s.last);
      s.last = now; s.frames += 1;
      if (performance.now() - s.t0 < 5000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  window.__readFrames = () => {
    const s = window.__fs;
    if (!s || s.deltas.length === 0) return { frames: s?.frames ?? 0, fps: null, avgFrameMs: null };
    const avg = s.deltas.reduce((a, b) => a + b, 0) / s.deltas.length;
    return { frames: s.frames, fps: Math.round((1000 / avg) * 10) / 10, avgFrameMs: Math.round(avg * 10) / 10 };
  };
};

async function measureInteraction(page, zoom) {
  await setZoom(page, zoom);
  await page.waitForTimeout(600);
  const box = await page.locator(".leaflet-container").boundingBox();
  if (!box) return { error: "leaflet container non trovato" };
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  // pan: drag reale
  await page.evaluate(() => window.__startFrames());
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(cx + (i / 12) * 220, cy + (i / 12) * 140, { steps: 3 });
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const pan = await page.evaluate(() => window.__readFrames());

  // zoom in: 2 click sul controllo
  await page.evaluate(() => window.__startFrames());
  await page.click(".leaflet-control-zoom-in", { force: true });
  await page.waitForTimeout(500);
  await page.click(".leaflet-control-zoom-in", { force: true });
  await page.waitForTimeout(500);
  const zoomIn = await page.evaluate(() => window.__readFrames());

  const markersAfter = await page.evaluate(() => document.querySelectorAll(".leaflet-marker-pane > div").length);
  return { zoom, pan, zoomIn, markersAfter };
}

async function measurePopupClick(page) {
  // reload pulito: vista iniziale Roma z13, walk servito dalla cache HTTP
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  // walk completo: il pane dei marker si popola solo dopo che i dati reali
  // arrivano (5-7s con cache fredda); aspetta che il conteggio sia stabile
  // e > del seed demo (4), poi altri 1.5s per il layout dei marker.
  await page.waitForFunction(() => document.querySelectorAll(".leaflet-marker-pane > div").length > 10, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const mapBox = await page.locator(".leaflet-container").boundingBox();
  if (!mapBox) return { error: "container mappa non trovato" };

  // CLICK SU MARKER INDIVIDUALE, MAI SU BADGE (t_26ce96f3): un badge di
  // griglia fa zoom-in, non apre il popup — misurarlo come "popup latency"
  // inquina la metrica (il run precedente misurava 726ms "after" perché il
  // primo click cadeva su badge che scattavano zoom). Qui: zoom fino a che
  // esiste un marker con .osm-camera-marker (individuale), poi un click
  // solo su quello e tempo click->popup.
  const individualSelector = ".leaflet-marker-pane > div:not(.osm-grid-badge-wrap)";
  let zoomed = 0;
  while (zoomed < 4) {
    const hasIndividual = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return Boolean(el && el.querySelector(".osm-camera-marker"));
    }, individualSelector);
    if (hasIndividual) break;
    await page.click(".leaflet-control-zoom-in", { force: true }).catch(() => {});
    zoomed += 1;
    await page.waitForTimeout(600);
  }
  const individualCount = await page.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)];
    return els.filter((el) => el.querySelector(".osm-camera-marker")).length;
  }, individualSelector);
  if (individualCount === 0) return { error: "nessun marker individuale visibile dopo zoom-in" };

  // pick del primo marker individuale completamente dentro il container
  const markers = page.locator(individualSelector);
  const n = await markers.count();
  let targetIdx = -1;
  for (let i = 0; i < n; i += 1) {
    const el = await markers.nth(i).evaluate((node) => Boolean(node.querySelector(".osm-camera-marker")));
    if (!el) continue;
    const b = await markers.nth(i).boundingBox();
    if (!b) continue;
    const px = b.x + b.width / 2, py = b.y + b.height / 2;
    if (px < mapBox.x || px > mapBox.x + mapBox.width || py < mapBox.y || py > mapBox.y + mapBox.height) continue;
    targetIdx = i;
    break;
  }
  if (targetIdx < 0) return { error: `marker individuale fuori viewport (tot ${n})` };
  const tClick = Date.now();
  await markers.nth(targetIdx).click({ force: true, position: { x: 14, y: 14 } }).catch(() => {});
  // popup appare con il contenuto (h3) montato da React — poll rapido
  let popupState = null;
  for (let i = 0; i < 50 && !popupState; i += 1) {
    await page.waitForTimeout(50);
    popupState = await page.evaluate(() => {
      const p = document.querySelector(".leaflet-popup");
      return p && p.querySelector(".osm-popup h3")
        ? { visible: true, hasTitle: true, hasActions: Boolean(p.querySelector(".osm-popup-actions")) }
        : null;
    });
  }
  const openMs = Date.now() - tClick;
  if (!popupState) return { error: `click su marker individuale senza popup (idx ${targetIdx})` };
  // chiudi il popup (click sulla mappa) per non sporcare le misure successive
  await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + 20).catch(() => {});
  return { openMs, zoomedToReach: zoomed, individualCount, ...popupState };
}

async function main() {
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(FRAME_COUNTER_INIT);
  const browserVersion = browser.version();
  const results = { label, url, ts: new Date().toISOString(), node: process.version, browser: browserVersion };

  console.log(`[${label}] walk...`);
  results.walk = await measureWalk(page);

  console.log(`[${label}] marker counts...`);
  results.markers = await measureMarkerCounts(page);

  console.log(`[${label}] paint...`);
  results.paint = await measurePaint(page);

  console.log(`[${label}] click popup...`);
  results.popup = await measurePopupClick(page);

  console.log(`[${label}] heap...`);
  results.heap = await page.evaluate(() => ({
    usedJSHeapSize: performance.memory?.usedJSHeapSize ?? null,
    totalJSHeapSize: performance.memory?.totalJSHeapSize ?? null,
  }));

  console.log(`[${label}] pan/zoom nazionale (z5)...`);
  results.interactionNational = await measureInteraction(page, 5, "nazionale");
  console.log(`[${label}] pan/zoom città (z13)...`);
  results.interactionCity = await measureInteraction(page, 13, "citta");

  await browser.close();

  const fs = await import("node:fs");
  fs.mkdirSync(dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(`\n[${label}] salvato -> ${OUT}`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
