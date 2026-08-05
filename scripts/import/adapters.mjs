// Adapter loading for the import pipeline (FONTI PUBBLICHE FASE A, kanban
// t_6030d390; docs/data-sources/normalizzazione-pipeline.md §3/§8.2).
//
// CONTRACT (shared with FASE B, kanban t_c338e9df — see
// scripts/import/adapters/README.md): an adapter is a per-source module at
// scripts/import/adapters/<slug>.mjs exporting:
//
//   slug          — batch slug, must match the descriptor
//   getDescriptor()        → descriptor object (validated shape)
//   fetchPayload()         → { ...raw payload, checksum }  (sha256, §7.6)
//   parsePayload(raw)      → { staged, skipped, checksum }
//     staged:  array of CANONICAL staged rows (design §2), ALREADY
//              normalised by the adapter:
//                { title, kind, latitude, longitude, direction, address,
//                  notes, description, external_id }
//              `source` ('import:<slug>') and `import_batch_id` are
//              RUNNER-OWNED and must NOT be set by the adapter.
//     skipped: { total, reasons } — parse-time skips for the report
//     checksum: optional override (null → runner uses fetchPayload's)
//
// The runner (runner.mjs) consumes this contract: it validates the staged
// rows defensively (design §7.1/§7.3), dedups, writes batch + events and
// owns source/import_batch_id. FASE A ships ONLY the fixture adapter
// (offline staging / tests); the concrete per-source adapters land in
// FASE B.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRow } from "./normalize.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADAPTERS_DIR = path.join(root, "scripts", "import", "adapters");

/**
 * Load the adapter for a batch slug. FASE B modules are named
 * scripts/import/adapters/<slug>.mjs (the FASE B dry-run harness uses the
 * same convention). A missing adapter is a runner error — FASE A ships no
 * per-source adapters by design (that is FASE B's deliverable).
 *
 * The special slug 'fixture' returns the built-in fixture adapter (tests /
 * offline staging, NOT a production source).
 */
export async function loadAdapter(slug) {
  if (slug === "fixture") return fixtureAdapter;
  const safe = String(slug).replace(/[^a-z0-9-]/g, "");
  const modulePath = path.join(ADAPTERS_DIR, `${safe}.mjs`);
  try {
    const mod = await import(`${pathToFileUrl(modulePath)}?v=${Date.now()}`);
    if (typeof mod?.getDescriptor !== "function" || typeof mod?.parsePayload !== "function") {
      throw new Error(`adapter ${safe}.mjs must export getDescriptor() and parsePayload() (FASE B contract)`);
    }
    return mod;
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND" || /Cannot find module|ENOENT/.test(err.message)) {
      throw new Error(
        `no adapter for slug '${slug}' — per-source adapters are a FASE B deliverable ` +
          `(expected scripts/import/adapters/${safe}.mjs); the FASE A runner only ships the fixture adapter for tests/staging`,
      );
    }
    throw err;
  }
}

/** file path → file:// URL for dynamic import. */
function pathToFileUrl(filePath) {
  return new URL(`file://${filePath}`).href;
}

/**
 * Fixture adapter (FASE A — offline staging / tests ONLY, not a production
 * source). Consumes a local JSON file (or inline array) of RAW rows and
 * normalises them into the canonical staged shape with the same pipeline
 * the real adapters use — so the FASE A runner, dedup and rollback are
 * exercised end-to-end without any per-source adapter.
 *
 * Raw rows use the common field names the normaliser reads (see
 * normalize.mjs): name/description, operator, kind, latitude, longitude,
 * direction, address/street/housenumber/city, manufacturer, id/external_id.
 */
export const fixtureAdapter = {
  slug: "fixture",
  async getDescriptor() {
    throw new Error("fixture adapter has no descriptor — pass an inline descriptor to runImport");
  },
  async fetchPayload() {
    throw new Error("fixture adapter has no network payload — pass --source=<file> or an inline payload");
  },
  async parsePayload(raw, descriptor = {}) {
    const rows = Array.isArray(raw) ? raw : [raw];
    const staged = [];
    const skipped = { total: 0, reasons: {} };
    for (const row of rows) {
      const { row: stagedRow, problems } = normalizeRow(row, descriptor, "fixture");
      // The fixture adapter ignores the canonical source string — the
      // runner owns `source` (contract). normalizeRow uses the slug for
      // notes; replace with the runner's slug at write time.
      stagedRow.source = undefined;
      staged.push({ ...stagedRow, external_id: stagedRow.externalId });
      if (problems.length > 0) {
        skipped.total += 1;
        skipped.reasons[problems[0]] = (skipped.reasons[problems[0]] ?? 0) + 1;
      }
    }
    return { staged, skipped, checksum: null };
  },
};
