// Import runner — the idempotent one-shot pipeline (FONTI PUBBLICHE FASE A,
// kanban t_6030d390; docs/data-sources/normalizzazione-pipeline.md §8.3/§8.4).
//
// Orchestrates: descriptor load → licence gate (--apply) → batch create →
// adapter fetchPayload → adapter parsePayload → defensive validation →
// dedup Pass 1+2 → chunked D1 writes → batch commit. Dry-run (default)
// executes everything EXCEPT the write phase and prints the would-be diff.
//
// The runner consumes the shared adapter CONTRACT (see adapters.mjs /
// scripts/import/adapters/README.md): an adapter produces CANONICAL staged
// rows — already normalised (title/kind/direction/external_id) — and the
// runner owns `source` ('import:<slug>') and `import_batch_id`. FASE A
// ships the fixture adapter for tests/staging; FASE B adds the per-source
// adapters that plug into this same contract.
//
// The runner is a pure module: it receives a D1-compatible `db` (real
// Cloudflare binding in the CLI, LocalD1Database for offline runs,
// D1SqliteDatabase in tests) and never imports `cloudflare:workers`, so the
// same code is exercised by the in-memory test harness and by the operator.
//
// Idempotency semantics (design §8.4):
//   - same slug + existing committed batch → abort unless --force;
//   - (source, external_id) partial UNIQUE makes every INSERT safe to
//     re-run (crash mid-run resumes without duplicates);
//   - --force refreshes: NULL-gap fills import-owned nullable columns,
//     never overwrites community values, never deletes rows.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadAdapter } from "./adapters.mjs";
import { validateStagedRow, applyRecordCap } from "./validate.mjs";
import { pass1IntraSource, pass2CrossSource } from "./dedup.mjs";
import { isLicenceImportable } from "./licence-gate.mjs";
import { haversineMeters } from "./geo.mjs";

/** D1 batch statement budget — 100 statements/call → 50 rows (insert + event). */
export const D1_BATCH_CHUNK_ROWS = 50;
export const DEFAULT_MAX_RECORDS = 100_000;

export const BATCH_STATUS = { RUNNING: "running", COMMITTED: "committed", ROLLED_BACK: "rolled_back", FAILED: "failed" };

/**
 * Fetch the source payload. Accepts a local file path (offline staging,
 * design §8.3 step 4) or an http(s) URL (with the project User-Agent).
 * Returns { payload, checksum } where payload is whatever the adapter
 * parses (file contents as string; URL text as string).
 */
export async function fetchPayload(source, userAgent = "OpenSurveillanceDB/0.1 (+https://github.com/Syax89/open-surveillance-db; contact: privacy@opensurveillancedb.org)") {
  const isUrl = /^https?:\/\//i.test(source);
  if (!isUrl) {
    const text = await readFile(source, "utf8");
    return { payload: text, checksum: sha256(text) };
  }
  const response = await fetch(source, {
    headers: { "User-Agent": userAgent, Accept: "application/json, text/csv, application/geo+json, */*" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`source fetch failed: HTTP ${response.status} for ${source}`);
  }
  const text = await response.text();
  return { payload: text, checksum: sha256(text) };
}

/** sha256 hex of a string (source_checksum, design §7.6). */
export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Find candidate existing cameras near a point (Pass 2 DB read, design
 * §4.2): ALL non-demo cameras — community reports AND previous imports —
 * on RAW stored coordinates inside a bounding box. The dedup query reads
 * the raw columns (not the public rounded projection) because the import
 * compares exact positions (the ~10 m rounding is a public-surface rule,
 * ADR 0008).
 */
export async function findImportCandidates(db, latitude, longitude, radiusMeters) {
  // ~1° latitude ≈ 111 320 m; longitude degrees shrink with cos(latitude).
  const latDelta = radiusMeters / 111_320;
  const lonDelta = radiusMeters / (111_320 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.01));
  // await works on both the async Cloudflare D1 binding and the sync
  // in-memory/local harness (await on a non-Promise is a no-op).
  const { results } = await db
    .prepare(
      "SELECT id, title, kind, address, latitude, longitude, status, source FROM cameras WHERE status != 'demo' AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?",
    )
    .bind(latitude - latDelta, latitude + latDelta, longitude - lonDelta, longitude + lonDelta)
    .all();
  return results;
}

/**
 * Execute one import run.
 *
 * @param db D1-compatible database
 * @param {object} input
 * @param {string} input.slug batch slug ('fixture' uses the built-in fixture adapter)
 * @param {object} [input.adapter] adapter override (tests) — { getDescriptor, parsePayload }
 * @param {object} [input.descriptor] validated descriptor object (inline —
 *   tests / fixture); when omitted the runner loads it from the adapter
 * @param {string} [input.source] payload source (file path or URL)
 * @param {*} [input.payload] inline raw payload (tests) — wins over `source`
 * @param {object} [input.options] { apply?: boolean, force?: boolean }
 * @returns {object} run summary (same shape for dry-run and apply)
 */
export async function runImport(db, { slug, adapter: adapterOverride, descriptor: inlineDescriptor, source, payload: inlinePayload, options = {} }) {
  const apply = options.apply === true;
  const force = options.force === true;
  const nowIso = new Date().toISOString();
  const counts = {
    total: 0, inserted: 0, skippedDuplicate: 0, merged: 0, review: 0, invalid: 0,
  };
  const report = { errors: [], reviews: [], notes: [] };

  // --- adapter + descriptor ---
  const adapter = adapterOverride ?? (await loadAdapter(slug));
  const descriptor = inlineDescriptor ?? (await adapter.getDescriptor());
  if (descriptor.slug !== slug) {
    throw new Error(`descriptor slug mismatch: adapter is for '${slug}' but descriptor.slug is ${descriptor.slug}`);
  }

  // --- step 2: licence gate (--apply only, design §8.3) ---
  if (apply && !isLicenceImportable(descriptor.license)) {
    throw new Error(
      `licence ${JSON.stringify(descriptor.license)} is not importable into the ODbL database — ` +
        "see docs/data-sources/licenze-compatibilita.md and update the descriptor or the licence matrix",
    );
  }

  // --- step 3: batch create / exclusive slug (design §8.3/§8.4) ---
  let batchId = null;
  let existingBatch = null;
  if (apply) {
    existingBatch = await db.prepare("SELECT id, status FROM import_batches WHERE slug = ?").bind(slug).first();
    if (existingBatch && existingBatch.status === BATCH_STATUS.COMMITTED && !force) {
      throw new Error(
        `batch '${slug}' already committed (id ${existingBatch.id}) — re-running is a no-op by design; ` +
          "use --force to refresh in place or a new slug for a new run",
      );
    }
    if (existingBatch) {
      // --force refresh: reuse the row, reset counters, back to running.
      batchId = existingBatch.id;
      await db
        .prepare(
          "UPDATE import_batches SET status = ?, records_total = 0, records_inserted = 0, records_skipped_duplicate = 0, records_merged = 0, records_review = 0, records_invalid = 0, source_checksum = ?, report = ?, updated_at = ? WHERE id = ?",
        )
        .bind(BATCH_STATUS.RUNNING, null, null, nowIso, batchId)
        .run();
    } else {
      const inserted = await db
        .prepare(
          "INSERT INTO import_batches (slug, source_name, format, license, license_url, attribution_text, source_url, import_date, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'import-runner', ?) RETURNING id",
        )
        .bind(
          slug,
          descriptor.source_name,
          descriptor.format,
          descriptor.license,
          descriptor.license_url ?? null,
          descriptor.attribution_text ?? null,
          descriptor.source_url,
          nowIso,
          BATCH_STATUS.RUNNING,
          nowIso,
        )
        .first();
      batchId = inserted?.id ?? null;
      if (!batchId) throw new Error(`batch '${slug}' could not be created`);
    }
  }

  // --- step 4: fetch payload + checksum ---
  let rawPayload;
  let checksum = null;
  if (inlinePayload !== undefined) {
    rawPayload = inlinePayload;
    checksum = sha256(typeof inlinePayload === "string" ? inlinePayload : JSON.stringify(inlinePayload));
  } else if (source) {
    const fetched = await fetchPayload(source);
    rawPayload = fetched.payload;
    checksum = fetched.checksum;
  } else {
    // Adapters fetch their own payload (network etiquette inside the
    // adapter); the runner falls back to --source for offline staging.
    const fetched = await adapter.fetchPayload();
    rawPayload = fetched.payload ?? fetched;
    checksum = fetched.checksum ?? checksum;
  }

  // --- step 5: adapter parse → canonical staged rows ---
  let parsed;
  try {
    // The descriptor is passed along (retro-compatible: FASE B adapters may
    // ignore it) so normalisers that need provenance fields (source_name,
    // external_id_prefix, kind_map) can use them instead of baking them in.
    parsed = await adapter.parsePayload(rawPayload, descriptor);
  } catch (err) {
    if (apply && batchId) {
      await db
        .prepare("UPDATE import_batches SET status = ?, report = ?, source_checksum = ? WHERE id = ?")
        .bind(BATCH_STATUS.FAILED, JSON.stringify({ adapterError: err.message }), checksum, batchId)
        .run();
    }
    throw new Error(`adapter parse failed: ${err.message}`);
  }
  const stagedRows = Array.isArray(parsed) ? parsed : parsed.staged ?? [];
  const skipInfo = parsed?.skipped ?? { total: 0, reasons: {} };
  counts.total = stagedRows.length;
  if (skipInfo.total > 0) {
    report.notes.push(`parse-time skips: ${skipInfo.total} row(s) — ${JSON.stringify(skipInfo.reasons ?? {})}`);
  }

  // --- step 6: validate (defensive — the adapter already normalised, but
  // the runner never trusts its input; design §7.1/§7.3) ---
  const validRows = [];
  for (const row of stagedRows) {
    const { ok, errors } = validateStagedRow(row);
    if (!ok) {
      counts.invalid += 1;
      report.errors.push({ externalId: row.external_id, title: row.title, errors });
      continue;
    }
    validRows.push(row);
  }

  // Hard cap (design §7.5): a runaway import cannot hammer D1 or the source.
  const maxRecords = descriptor.max_records ?? DEFAULT_MAX_RECORDS;
  const { rows: cappedRows, cut } = applyRecordCap(validRows, maxRecords);
  if (cut > 0) {
    counts.invalid += cut;
    report.notes.push(`record cap exceeded: ${cut} row(s) beyond max_records=${maxRecords} counted as invalid`);
  }

  // --- step 6b: dedup Pass 1 (intra-source) ---
  const { kept, skipped: intraSkipped } = pass1IntraSource(cappedRows);
  for (const s of intraSkipped) {
    counts.skippedDuplicate += 1;
    report.notes.push(`pass1 skip: ${s.row.external_id} — ${s.reason}`);
  }

  // --- step 6c: dedup Pass 2 (cross-source, against the whole non-demo DB) ---
  // Idempotent re-run guard: rows whose (source, external_id) already exist
  // in the DB are no-ops by the UNIQUE index; count them as skipped without
  // querying candidates (design §4.3/§8.4).
  const existingKeys = new Set();
  {
    const existing = await db
      .prepare("SELECT external_id FROM cameras WHERE source = ? AND external_id IS NOT NULL")
      .bind(`import:${slug}`)
      .all();
    for (const row of existing.results) existingKeys.add(row.external_id);
  }
  const toCrossCheck = kept.filter((row) => !existingKeys.has(row.external_id));
  for (const row of kept) {
    if (existingKeys.has(row.external_id)) {
      counts.skippedDuplicate += 1;
      report.notes.push(`idempotent re-run skip: ${row.external_id} already imported`);
    }
  }

  const { inserts, skips, reviews } = await pass2CrossSource(toCrossCheck, (lat, lon, radius) =>
    findImportCandidates(db, lat, lon, radius),
  );
  for (const s of skips) {
    counts.skippedDuplicate += 1;
    report.notes.push(`pass2 skip: ${s.row.external_id} (${s.reason}) vs camera #${s.candidate.id}`);
  }
  for (const r of reviews) {
    counts.review += 1;
    report.reviews.push({
      externalId: r.row.external_id,
      title: r.row.title,
      reason: r.reason,
      candidateId: r.candidate.id,
      candidateTitle: r.candidate.title,
      candidateStatus: r.candidate.status,
      distanceMeters: Math.round(haversineMeters(r.row.latitude, r.row.longitude, r.candidate.latitude, r.candidate.longitude)),
    });
  }
  counts.inserted = inserts.length;

  // Summary invariant (design §7.5): total = inserted + skipped + merged + review + invalid.
  const invariantTotal = counts.inserted + counts.skippedDuplicate + counts.merged + counts.review + counts.invalid;

  // --- step 7: write phase (--apply only) ---
  let committed = false;
  if (apply) {
    await writeChunks(db, batchId, slug, inserts, report, counts, nowIso, checksum);
    committed = true;
  }

  return {
    dryRun: !apply,
    committed,
    slug,
    batchId,
    counts,
    invariantTotal,
    checksum,
    reviewItems: report.reviews,
    report,
  };
}

/**
 * Write phase: chunked D1 batch inserts (design §8.3 step 7). Each chunk is
 * ≤ 50 staged rows → two D1 batch calls of ≤ 50 statements each (first the
 * INSERTs with RETURNING, then the lifecycle `imported` events with the
 * real camera ids — the same ON CONFLICT DO NOTHING RETURNING pattern as
 * db/community-actions.ts). Every INSERT carries (source, external_id) and
 * the partial UNIQUE makes it safe to re-run; a crash mid-run resumes
 * without duplicates.
 *
 * The runner owns `source` ('import:<slug>') and `import_batch_id` — the
 * adapter contract forbids the adapter from setting them. Imported rows
 * are inserted `status='active'` with `last_verified_at=NULL` (D1, ADR 0021
 * §9.1: the community validates them; the "never confirmed" badge).
 *
 * Merge (enrich) is disabled in v1 (design §4.4): inserts only. The
 * `rollback_payload` column stays NULL — nothing to restore yet.
 */
async function writeChunks(db, batchId, slug, inserts, report, counts, nowIso, checksum) {
  for (let offset = 0; offset < inserts.length; offset += D1_BATCH_CHUNK_ROWS) {
    const chunk = inserts.slice(offset, offset + D1_BATCH_CHUNK_ROWS);

    // Batch 1: the row inserts. RETURNING id lets us write the events with
    // the real camera id in the second batch.
    const insertStatements = chunk.map((row) =>
      db
        .prepare(
          `INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, direction, status, source, updated, description, last_verified_at, review_due_at, review_interval_months, external_id, import_batch_id, created_at)
           VALUES (?, ?, ?, NULL, 0, 0, ?, ?, ?, ?, ?, 'active', ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
           ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING
           RETURNING id`,
        )
        .bind(
          row.title,
          row.kind,
          row.manufacturer ?? null,
          row.address ?? null,
          row.notes ?? "",
          row.latitude,
          row.longitude,
          row.direction ?? null,
          `import:${slug}`,
          nowIso,
          row.description ?? "",
          row.reviewIntervalMonths ?? row.review_interval_months ?? 12,
          row.external_id,
          batchId,
          nowIso,
        ),
    );
    const insertResults = await db.batch(insertStatements);

    // Batch 2: one `imported` lifecycle event per actually-inserted row
    // (ON CONFLICT DO NOTHING rows return no id → no event; provenance is
    // only for rows this run really created, design §5.1).
    const eventStatements = [];
    for (let i = 0; i < chunk.length; i += 1) {
      const cameraId = insertResults[i]?.results?.[0]?.id;
      if (cameraId === undefined) continue; // duplicate — no new row, no event
      eventStatements.push(
        db
          .prepare(
            "INSERT INTO camera_lifecycle_events (camera_id, event_type, detail, created_at) VALUES (?, 'imported', ?, ?)",
          )
          .bind(cameraId, JSON.stringify({ batch: slug, external_id: chunk[i].external_id }), nowIso),
      );
    }
    if (eventStatements.length > 0) {
      await db.batch(eventStatements);
    }
  }

  // --- step 7b: commit the batch row (counters + report + status) ---
  await db
    .prepare(
      `UPDATE import_batches SET
         status = ?, records_total = ?, records_inserted = ?, records_skipped_duplicate = ?,
         records_merged = ?, records_review = ?, records_invalid = ?, source_checksum = ?,
         report = ?, notes = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      BATCH_STATUS.COMMITTED,
      counts.total,
      counts.inserted,
      counts.skippedDuplicate,
      counts.merged,
      counts.review,
      counts.invalid,
      checksum,
      JSON.stringify(report),
      report.notes.length > 0 ? report.notes.join("\n") : null,
      nowIso,
      batchId,
    )
    .run();
}
