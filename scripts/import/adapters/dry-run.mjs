/**
 * Dry-run harness for the FASE B adapters (kanban t_c338e9df).
 *
 *   node scripts/import/adapters/dry-run.mjs --slug=zurigo-videokameras-2026
 *     [--out=reports/<slug>.json] [--db=<path-to-D1.sqlite>] [--limit=N]
 *
 * What it does (offline/real-network, NO writes anywhere):
 *   1. loads the adapter (fetch + parse → canonical staged rows, § 2);
 *   2. validates every staged row (§ 7.1/7.3);
 *   3. dedup Pass 1 intra-source (§ 4.1: external_id + snap-cell + kind);
 *   4. dedup Pass 2 cross-source (§ 4.2) against a local D1 sqlite
 *      (default: the miniflare local state in .wrangler/);
 *   5. prints a summary and writes the report JSON (dry-run numbers:
 *      total / invalid / skipped-duplicate / review / insert candidates).
 *
 * This is a DEVELOPMENT tool: the production runner (`scripts/import/` +
 * migration 0040, FASE A) supersedes it; the numbers here are the ones that
 * feed docs/data-sources/import-run-1.md.
 */

import { existsSync, writeFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { haversineMeters, textSimilarity, validateStagedRow } from "./lib.mjs";

const DEFAULT_DB_GLOBS = [
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite",
  ".wrangler/smoke-state/v3/d1/miniflare-D1DatabaseObject/*.sqlite",
];

/** slug → adapter module file (module filenames are short, slugs are kebab). */
const ADAPTER_MODULES = {
  "zurigo-videokameras-2026": "./zurigo-videokameras-2026.mjs",
  "milano-varchi-2026": "./milano-varchi-2026.mjs",
  "osm-surveillance-italia-2026": "./osm-surveillance-italia-2026.mjs",
};

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function findLocalD1() {
  const explicit = arg("db");
  if (explicit) return existsSync(explicit) ? explicit : null;
  for (const pattern of DEFAULT_DB_GLOBS) {
    const dir = pattern.slice(0, pattern.lastIndexOf("/"));
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".sqlite"));
    for (const f of files) {
      const path = `${dir}/${f}`;
      try {
        const db = new DatabaseSync(path);
        const row = db.prepare("SELECT count(*) AS c FROM sqlite_master WHERE type='table' AND name='cameras'").get();
        db.close();
        if (Number(row.c) === 1) return path;
      } catch {
        // not a usable D1 state; keep scanning
      }
    }
  }
  return null;
}

/** Load existing non-demo cameras (raw coordinates) for Pass 2. */
function loadExistingCameras(dbPath) {
  if (!dbPath) return [];
  const db = new DatabaseSync(dbPath);
  const rows = db
    .prepare(
      "SELECT id, title, kind, latitude, longitude, direction, address, status, source FROM cameras WHERE status != 'demo'",
    )
    .all();
  db.close();
  return rows.map((r) => ({ ...r, latitude: Number(r.latitude), longitude: Number(r.longitude) }));
}

/** Simple grid index over existing cameras for radius queries (cell ~1.1 km). */
function buildGrid(cameras) {
  const cell = 0.01;
  const grid = new Map();
  for (const cam of cameras) {
    const kx = Math.floor(cam.longitude / cell);
    const ky = Math.floor(cam.latitude / cell);
    const key = `${kx},${ky}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(cam);
  }
  return { grid, cell };
}

function candidatesNear(grid, lon, lat, radiusM) {
  const cell = grid.cell;
  const deg = radiusM / 111000;
  const kx = Math.floor(lon / cell);
  const ky = Math.floor(lat / cell);
  const span = Math.ceil(deg / cell) + 1;
  const out = [];
  for (let dx = -span; dx <= span; dx += 1) {
    for (let dy = -span; dy <= span; dy += 1) {
      const bucket = grid.grid.get(`${kx + dx},${ky + dy}`);
      if (!bucket) continue;
      for (const cam of bucket) {
        const d = haversineMeters(lat, lon, cam.latitude, cam.longitude);
        if (d <= radiusM) out.push({ cam, distance: d });
      }
    }
  }
  return out;
}

/** Pass 2 classification per pipeline § 4.2. */
function classifyCross(staged, existing, grid) {
  let skipped = 0;
  let review = 0;
  let inserted = 0;
  const reviewItems = [];
  for (const row of staged) {
    const candidates = candidatesNear(grid, row.longitude, row.latitude, 215);
    let outcome = "insert";
    let best = null;
    for (const { cam, distance } of candidates) {
      if (cam.status === "hidden" || cam.status === "removed") {
        outcome = "review";
        best = { cam, distance, reason: `collision with ${cam.status}` };
        break;
      }
      const similarity = textSimilarity(`${row.title} ${row.address ?? ""} ${row.kind}`, `${cam.title} ${cam.address ?? ""} ${cam.kind}`);
      if (distance <= 10 && cam.kind === row.kind) {
        outcome = "skip";
        best = { cam, distance, reason: `≤10m same kind` };
        break;
      }
      if (distance <= 10 && cam.kind !== row.kind) {
        outcome = "review";
        best = { cam, distance, reason: `≤10m different kind` };
        break;
      }
      if (distance > 10 && distance <= 75 && similarity >= 0.6) {
        outcome = "skip";
        best = { cam, distance, reason: `≤75m similarity ${similarity.toFixed(2)}` };
        break;
      }
      if (distance > 75 && distance <= 200 && similarity >= 0.6) {
        outcome = "review";
        best = { cam, distance, reason: `≤200m similarity ${similarity.toFixed(2)}` };
        break;
      }
    }
    if (outcome === "skip") skipped += 1;
    else if (outcome === "review") {
      review += 1;
      reviewItems.push({ external_id: row.external_id, title: row.title, candidate: best?.cam?.id ?? null, distance: Math.round(best?.distance ?? 0), reason: best?.reason ?? "review" });
    } else inserted += 1;
  }
  return { skipped, review, inserted, reviewItems };
}

/** Pass 1 intra-source dedup (§ 4.1). Returns { kept, skipped, pairs }. */
function dedupIntraSource(staged) {
  const seenExternal = new Set();
  const seenCell = new Map(); // "snapLat,snapLon|kind" → row
  const kept = [];
  const skipped = [];
  const pairs = [];

  const completeness = (r) =>
    [r.title, r.address, r.manufacturer, r.direction !== null && r.direction !== undefined ? 1 : 0]
      .filter(Boolean).length;

  for (const row of staged) {
    // external_id duplicates (same source id twice).
    if (seenExternal.has(row.external_id)) {
      skipped.push({ row, reason: "duplicate external_id" });
      continue;
    }
    seenExternal.add(row.external_id);

    // snap-cell (4 decimals ≈ 11 m, ADR 0008) + kind.
    const key = `${row.latitude.toFixed(4)},${row.longitude.toFixed(4)}|${row.kind}`;
    const existing = seenCell.get(key);
    if (existing) {
      if (existing.kind !== row.kind) {
        // same cell, different kind: keep both, flag the pair (a pole with a
        // dome AND a traffic camera is real).
        pairs.push([existing, row]);
        kept.push(row);
        seenCell.set(`${key}#${row.kind}`, row);
        continue;
      }
      if (completeness(existing) >= completeness(row)) {
        skipped.push({ row, reason: "snap-cell same kind (less complete)" });
        continue;
      }
      // keep the richer row instead
      const idx = kept.indexOf(existing);
      if (idx >= 0) kept.splice(idx, 1);
      skipped.push({ row: existing, reason: "snap-cell same kind (less complete)" });
    }
    kept.push(row);
    seenCell.set(key, row);
  }
  return { kept, skipped, pairs };
}

async function main() {
  const slug = arg("slug");
  if (!slug) {
    console.error("usage: node dry-run.mjs --slug=<slug> [--out=<json>] [--db=<d1.sqlite>] [--limit=N]");
    process.exit(2);
  }

  const moduleFile = ADAPTER_MODULES[slug];
  if (!moduleFile) {
    console.error(`unknown adapter slug "${slug}" — known: ${Object.keys(ADAPTER_MODULES).join(", ")}`);
    process.exit(2);
  }
  const adapter = await import(moduleFile);

  const limitRaw = arg("limit");
  const limit = limitRaw ? Number(limitRaw) : null;

  console.log(`[dry-run] adapter=${slug}`);
  console.log("[dry-run] fetching payload (real network)…");
  const raw = await adapter.fetchPayload({
    onChunk: (p) =>
      console.log(`[dry-run] overpass chunk ${p.idx}/${p.total}: ${p.elements} elements (sleep ${p.sleepMs}ms)`),
  });
  const checksum = raw.checksum ?? null;

  console.log("[dry-run] parsing + normalising…");
  const parsed = adapter.parsePayload(raw);
  let staged = parsed.staged ?? [];
  const skipReasons = parsed.skipped ?? { total: 0, reasons: {} };

  if (limit && staged.length > limit) {
    console.log(`[dry-run] limiting staged rows to ${limit} (of ${staged.length})`);
    staged = staged.slice(0, limit);
  }

  // Validation (§ 7.1/7.3).
  const invalid = [];
  const valid = [];
  for (const row of staged) {
    const result = validateStagedRow(row);
    if (result.ok) valid.push(row);
    else invalid.push({ row, errors: result.errors });
  }

  // Pass 1 intra-source.
  const intra = dedupIntraSource(valid);

  // Pass 2 cross-source vs local D1.
  const dbPath = findLocalD1();
  const existing = dbPath ? loadExistingCameras(dbPath) : [];
  const grid = buildGrid(existing);
  const cross = classifyCross(intra.kept, existing, grid);

  const report = {
    slug,
    source_name: adapter.getDescriptor().source_name,
    license: adapter.getDescriptor().license,
    fetched_at: new Date().toISOString(),
    payload_checksum: checksum,
    local_d1_db: dbPath,
    existing_cameras: existing.length,
    rows: {
      raw: parsed.staged?.length ?? 0,
      limited: staged.length,
      valid: valid.length,
      invalid: invalid.length,
    },
    skipped_by_parse: skipReasons,
    dedup: {
      intra_skipped: intra.skipped.length,
      intra_flagged_pairs: intra.pairs.length,
      cross_skipped_duplicate: cross.skipped,
      cross_review: cross.review,
      cross_insert: cross.inserted,
    },
    review_items: cross.reviewItems.slice(0, 50),
    invariant:
      valid.length === invalid.length + intra.skipped.length + cross.skipped + cross.review + cross.inserted,
  };
  report.summary = `total ${report.rows.raw} | invalid ${report.rows.invalid} | dedup ${report.dedup.intra_skipped + report.dedup.cross_skipped_duplicate} | review ${report.dedup.cross_review} | insert ${report.dedup.cross_insert}`;

  console.log("");
  console.log(`=== DRY-RUN ${slug} ===`);
  console.log(`source:   ${report.source_name} (${report.license})`);
  console.log(`fetched:  ${report.fetched_at}  checksum: ${checksum?.slice(0, 12) ?? "n/a"}…`);
  console.log(`raw rows: ${report.rows.raw}   valid: ${report.rows.valid}   invalid: ${report.rows.invalid}`);
  if (report.rows.invalid > 0) {
    const reasons = {};
    for (const { errors } of invalid) for (const e of errors) reasons[e] = (reasons[e] ?? 0) + 1;
    console.log(`  invalid reasons: ${JSON.stringify(reasons)}`);
  }
  console.log(`skipped by parse: ${skipReasons.total ?? 0} ${JSON.stringify(skipReasons.reasons ?? {})}`);
  console.log(`dedup intra: ${report.dedup.intra_skipped} skipped, ${report.dedup.intra_flagged_pairs} flagged pairs`);
  console.log(`dedup cross (vs ${report.existing_cameras} existing): ${report.dedup.cross_skipped_duplicate} skip, ${report.dedup.cross_review} review, ${report.dedup.cross_insert} insert`);
  if (cross.reviewItems.length > 0) {
    console.log("  review candidates:");
    for (const item of cross.reviewItems.slice(0, 10)) {
      console.log(`    - ${item.external_id} ${item.title} (${item.reason})`);
    }
  }
  console.log(`invariant ok: ${report.invariant}`);
  console.log(`summary: ${report.summary}`);

  const out = arg("out");
  if (out) {
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`\nreport written: ${out}`);
  }
}

main().catch((err) => {
  console.error(`[dry-run] FAILED: ${err.message}`);
  process.exit(1);
});
