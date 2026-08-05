import { env } from "cloudflare:workers";

/** D1 handle with the same guard as db/cameras.ts (no import cycle: cameras
 *  imports these helpers). */
async function getD1() {
  if (!env.DB) throw new Error("Database binding unavailable");
  return env.DB;
}

/**
 * Imported public datasets — read side of the import pipeline (FASE A/B,
 * kanban t_6030d390 / t_c338e9df; attribution UI FASE C, t_4dbce318).
 *
 * The write side is the runner (scripts/import/cli.mjs); these helpers are
 * the ONLY public read path for `import_batches` and are used by:
 *   - GET /fonti (server-rendered page): the full list of committed
 *     batches with the exact attribution fields the licence matrix
 *     requires (docs/data-sources/licenze-compatibilita.md);
 *   - the record detail API (db/cameras.ts resolvers): per-record
 *     provenance ("Imported from <source> · <licence>").
 *
 * Only `committed` batches are public by construction: a batch in
 * `running`, `failed` or `rolled_back` state has either no rows yet or
 * rows that were removed by rollback — exposing it would leak an
 * attribution for data that is not (or no longer) published.
 */

export type ImportBatchPublic = {
  id: number;
  slug: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  /** Exact attribution text persisted by the runner (licence matrix). */
  attributionText: string | null;
  importDate: string;
  recordsInserted: number;
  recordsTotal: number;
};

const PUBLIC_BATCH_COLUMNS = `
  id, slug, source_name AS sourceName, source_url AS sourceUrl,
  license, license_url AS licenseUrl, attribution_text AS attributionText,
  import_date AS importDate, records_inserted AS recordsInserted,
  records_total AS recordsTotal
`;

/** Every committed import batch, newest first (GET /fonti data source). */
export async function listCommittedImportBatches(): Promise<ImportBatchPublic[]> {
  const d1 = await getD1();
  const { results } = await d1
    .prepare(
      `SELECT ${PUBLIC_BATCH_COLUMNS} FROM import_batches
       WHERE status = 'committed'
       ORDER BY import_date DESC, id DESC`,
    )
    .all<ImportBatchPublic>();
  return results;
}

/**
 * The batch behind an imported camera (`cameras.import_batch_id`), or null
 * for community reports. Additive payload for the record detail API — the
 * provenance line renders only when this is present.
 */
export async function getImportBatchById(id: number): Promise<ImportBatchPublic | null> {
  const d1 = await getD1();
  return d1
    .prepare(`SELECT ${PUBLIC_BATCH_COLUMNS} FROM import_batches WHERE id = ?`)
    .bind(id)
    .first<ImportBatchPublic>();
}
