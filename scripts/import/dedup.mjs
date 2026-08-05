// Duplicate detection for the import pipeline (FONTI PUBBLICHE FASE A,
// kanban t_6030d390; docs/data-sources/normalizzazione-pipeline.md §4).
//
// Two passes, both reusing the project's duplicate-detection primitives
// (textSimilarity — mirrored in text-similarity.mjs with a parity test):
//
//   Pass 1 (intra-source, §4.1): dedupe INSIDE the incoming dataset —
//   same snapped cell (4 decimals ≈ 11 m) + same kind keeps the most
//   complete row; external_id duplicates keep the first.
//
//   Pass 2 (cross-source, §4.2): dedupe AGAINST the whole non-demo
//   database (community reports AND previous imports — the task's
//   requirement) on RAW coordinates, per the design's rule table. A
//   collision with hidden/removed ALWAYS goes to review: an import never
//   silently resurrects a camera the community withdrew.
//
// Pure logic: the DB read (candidates inside a bounding box) is injected
// so the tests run it against the in-memory D1 harness and the runner
// against the real binding.
//
// Outcomes (design §4.2): "insert" | "skip" | "review". Skipped rows count
// records_skipped_duplicate, review rows records_review.

import { haversineMeters, snapCoordinate } from "./geo.mjs";
import { textSimilarity } from "./text-similarity.mjs";

/** The design's auto-skip radius: two raw points closer than ~10 m are
 * indistinguishable on every public surface (ADR 0008 rounding). */
export const DEDUP_SKIP_METERS = 10;
/** Review band ceiling for text-matched candidates. */
export const DEDUP_REVIEW_METERS = 200;
/** Text-similarity floor for the 75-200 m bands. */
export const DEDUP_TEXT_FLOOR = 0.6;

/**
 * Pass 1 — intra-source (design §4.1). Groups staged rows by snapped
 * coordinates + kind; keeps the row with the highest field completeness
 * (title + address + manufacturer + direction present), skips the rest.
 * `external_id` duplicates keep the first. Pure.
 *
 * Returns { kept, skipped } where each skipped row carries
 * { row, reason, duplicateOf }.
 */
export function pass1IntraSource(stagedRows) {
  const kept = [];
  const skipped = [];
  const byKey = new Map(); // key -> { row, score, index }
  const byExternalId = new Map(); // external_id -> row (first wins)

  for (const row of stagedRows) {
    // external_id duplicates: keep first (design §4.1).
    if (row.external_id !== undefined && row.external_id !== null && row.external_id !== "") {
      const existing = byExternalId.get(row.external_id);
      if (existing) {
        skipped.push({ row, reason: "external_id duplicate", duplicateOf: existing });
        continue;
      }
      byExternalId.set(row.external_id, row);
    }

    // snapped cell + kind group.
    const key = `${snapCoordinate(row.latitude)}|${snapCoordinate(row.longitude)}|${row.kind}`;
    const score = completenessScore(row);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { row, score, index: kept.length });
      kept.push(row);
      continue;
    }
    if (score > current.score) {
      // New row is more complete: demote the incumbent to skipped.
      const incumbent = kept[current.index];
      kept[current.index] = row;
      byKey.set(key, { row, score, index: current.index });
      skipped.push({ row: incumbent, reason: "intra-source duplicate (same snap cell + kind)", duplicateOf: row });
    } else {
      skipped.push({ row, reason: "intra-source duplicate (same snap cell + kind)", duplicateOf: current.row });
    }
  }
  return { kept, skipped };
}

/** Field-completeness score used by Pass 1 (design §4.1). */
function completenessScore(row) {
  let score = 0;
  if (row.title) score += 1;
  if (row.address) score += 1;
  if (row.manufacturer) score += 1;
  if (row.direction !== null && row.direction !== undefined) score += 1;
  return score;
}

/**
 * Pass 2 — cross-source (design §4.2). For each staged row, fetch ALL
 * non-demo cameras (any status) inside a 215 m bounding box on RAW stored
 * coordinates and classify per the rule table. `findCandidates` is the
 * injected DB read: (latitude, longitude, radiusMeters) → raw rows
 * [{ id, title, kind, address, latitude, longitude, status }].
 *
 * Returns { inserts, skips, reviews } where skips/reviews carry
 * { row, reason, candidate } (candidate = the existing record).
 */
export async function pass2CrossSource(stagedRows, findCandidates) {
  const inserts = [];
  const skips = [];
  const reviews = [];

  for (const row of stagedRows) {
    // Skip rows that are already the product of an earlier import of the
    // SAME batch: (source, external_id) unique would no-op the insert, but
    // Pass 2 should not count them as new either. The runner detects these
    // separately (idempotency re-run) before calling this pass.
    // await covers both async DB reads (Cloudflare D1) and sync harness
    // callbacks (await on a non-Promise is a no-op).
    const candidates = await findCandidates(row.latitude, row.longitude, DEDUP_REVIEW_METERS + 15);
    let decision = { outcome: "insert" };
    for (const candidate of candidates) {
      const distance = haversineMeters(row.latitude, row.longitude, candidate.latitude, candidate.longitude);
      if (distance > DEDUP_REVIEW_METERS) continue;
      const submittedText = [row.title, row.address ?? "", row.kind].filter(Boolean).join(" ");
      const candidateText = [candidate.title, candidate.address ?? "", candidate.kind].join(" ");
      const similarity = submittedText.trim() ? textSimilarity(submittedText, candidateText) : 0;
      const hasTextSignal = submittedText.trim().length > 0;
      const sameKind = row.kind === candidate.kind;

      // hidden/removed collision: ALWAYS review (never silently resurrect).
      if (candidate.status === "hidden" || candidate.status === "removed") {
        decision = { outcome: "review", reason: "collides with a hidden/removed community record", candidate };
        break;
      }
      if (distance <= DEDUP_SKIP_METERS && sameKind) {
        decision = { outcome: "skip", reason: `duplicate within ${DEDUP_SKIP_METERS} m with same kind`, candidate };
        break;
      }
      if (distance <= DEDUP_SKIP_METERS) {
        decision = { outcome: "review", reason: `within ${DEDUP_SKIP_METERS} m but different kind`, candidate };
        break;
      }
      if (distance <= 75 && hasTextSignal && similarity >= DEDUP_TEXT_FLOOR) {
        decision = { outcome: "skip", reason: "within 75 m with matching text", candidate };
        break;
      }
      if (hasTextSignal && similarity >= DEDUP_TEXT_FLOOR) {
        decision = { outcome: "review", reason: "within 200 m with matching text", candidate };
        break;
      }
    }
    if (decision.outcome === "insert") inserts.push(row);
    else if (decision.outcome === "skip") skips.push({ row, reason: decision.reason, candidate: decision.candidate });
    else reviews.push({ row, reason: decision.reason, candidate: decision.candidate });
  }
  return { inserts, skips, reviews };
}
