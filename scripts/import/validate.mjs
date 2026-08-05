// Row validation for the import pipeline (FONTI PUBBLICHE FASE A, kanban
// t_6030d390; docs/data-sources/normalizzazione-pipeline.md §7.1/§7.2).
// Pure module — no bindings.
//
// A staged row is INVALID (counted records_invalid, listed in the report,
// never inserted) when it fails the hard minimums below. Bad rows never
// abort the batch: the runner collects every error and continues.
//
// Input contract: the canonical staged row of the adapter contract
// (scripts/import/adapters/README.md) — { title, kind, latitude,
// longitude, direction, address, notes, description, external_id }.
// `source`/`import_batch_id` are runner-owned and validated separately at
// write time.

import { CANONICAL_KINDS } from "./kinds.mjs";

/**
 * Validate one staged row. Returns { ok: boolean, errors: string[] }.
 * Errors are human-readable; the runner attaches them to the report JSON
 * (per-row), never to the database.
 */
export function validateStagedRow(staged) {
  const errors = [];
  const { title, latitude, longitude, kind, external_id } = staged;

  // Required fields (design §7.2): title, latitude, longitude, kind,
  // source, external_id — source is runner-owned, the adapter must supply
  // the rest.
  if (typeof title !== "string" || title.trim() === "") {
    errors.push("title is required");
  } else if (title.length > 90) {
    errors.push(`title exceeds 90 chars (${title.length})`);
  }
  if (typeof kind !== "string" || !CANONICAL_KINDS.includes(kind)) {
    errors.push(`kind must be one of ${CANONICAL_KINDS.join(", ")}, got ${JSON.stringify(kind)}`);
  }
  if (typeof external_id !== "string" || external_id.trim() === "") {
    errors.push("external_id is required (idempotency key)");
  }

  // Coordinates (design §7.1): finite, in range, and not (0,0) unless the
  // descriptor whitelists the origin as "unknown".
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    errors.push("latitude/longitude must be finite numbers");
  } else {
    if (latitude < -90 || latitude > 90) errors.push(`latitude ${latitude} out of range [-90, 90]`);
    if (longitude < -180 || longitude > 180) errors.push(`longitude ${longitude} out of range [-180, 180]`);
  }
  if (Number.isFinite(latitude) && Number.isFinite(longitude) && latitude === 0 && longitude === 0) {
    errors.push("coordinates (0,0) look like an unknown placeholder — rejected unless the descriptor whitelists origin");
  }

  // Direction (design §7.3): integer 0-359 when present; domes are forced
  // to NULL by the adapters (invariant), but validate the range anyway.
  if (staged.direction !== null && staged.direction !== undefined) {
    if (!Number.isInteger(staged.direction) || staged.direction < 0 || staged.direction > 359) {
      errors.push(`direction must be an integer 0-359, got ${JSON.stringify(staged.direction)}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Apply the descriptor's hard caps (§7.5): max_records (default 100 000).
 * Returns the trimmed list + how many were cut. A runaway import cannot
 * hammer D1 or the source.
 */
export function applyRecordCap(stagedRows, maxRecords = 100_000) {
  if (stagedRows.length <= maxRecords) return { rows: stagedRows, cut: 0 };
  return { rows: stagedRows.slice(0, maxRecords), cut: stagedRows.length - maxRecords };
}
