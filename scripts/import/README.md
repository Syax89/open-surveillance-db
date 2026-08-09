# Import pipeline — Phase A infrastructure (scripts/import/)

Idempotent one-shot import runner for public camera datasets. Blueprint:
`docs/data-sources/normalizzazione-pipeline.md` (PUBLIC SOURCES #3,
kanban t_6030d390). This directory is the Phase A common framework; the
per-source adapters (Phase B, kanban t_c338e9df) live in
`scripts/import/adapters/` and plug into the contract below.

## Layout

| File | Role |
| --- | --- |
| `cli.mjs` | Operator CLI (`npm run import:run`, `import:rollback`) |
| `runner.mjs` | The one-shot idempotent pipeline: descriptor → licence gate → batch → adapter → validate → dedup → chunked D1 writes → commit |
| `rollback.mjs` | Whole-batch removal (only rows the batch itself inserted) |
| `adapters.mjs` | Adapter loader (Phase B per-slug modules) + the `fixture` adapter for tests/offline staging |
| `descriptor.mjs` | Descriptor load + structural validation (`docs/data-sources/imports/<slug>.json`) |
| `normalize.mjs` | RAW row → canonical staged row (used by the fixture adapter; real adapters normalise themselves) |
| `validate.mjs` | Hard minimums: coordinates, title/kind/external_id, direction range, record cap |
| `dedup.mjs` | Pass 1 intra-source + Pass 2 cross-source (design §4) |
| `geo.mjs` | haversine, bbox, compass/numeric direction parsing |
| `kinds.mjs` | Canonical kind vocabulary + default kind_map |
| `text-similarity.mjs` | Verbatim mirror of `app/lib/duplicate-detection.ts` (parity-tested) |
| `licence-gate.mjs` | `--apply` hard gate: importable licences per the compatibility matrix |
| `local-d1.mjs` | Local SQLite D1-compatible surface for offline runs (`--d1-path`) |

## Adapter contract (shared with Phase B)

An adapter is a per-source module at `scripts/import/adapters/<slug>.mjs`:

```js
export const slug = "milano-varchi-2026";
export async function getDescriptor() { /* → descriptor object */ }
export async function fetchPayload()  { /* → { ...raw, checksum } (network etiquette inside) */ }
export async function parsePayload(raw) {
  // → { staged: [...], skipped: { total, reasons }, checksum }
  //   staged rows are ALREADY canonical (design §2):
  //   { title, kind, latitude, longitude, direction, address, notes,
  //     description, external_id }
  //   `source` and `import_batch_id` are RUNNER-OWNED — do not set them.
}
```

The runner validates staged rows defensively (it never trusts its input),
dedups against the whole non-demo database (community reports AND previous
imports, raw coordinates), writes batch + `imported` lifecycle events, and
owns provenance.

## Semantics (design §8.4 / §5)

- Imported rows are inserted `status='active'`, `last_verified_at=NULL` —
  ADR 0021's "never confirmed" badge. The community validates them with the
  same actions as any record.
- `source = 'import:<slug>'` verbatim; `external_id` is the idempotency
  key (partial UNIQUE `(source, external_id)`, migration 0040).
- Re-running a committed slug aborts unless `--force`; `--force` refreshes
  in place (NULL-gap fills only, never overwrites community values, never
  deletes).
- Every inserted row gets one public `imported` lifecycle event
  (`{ batch, external_id }`) — provenance without attribution.

## Usage

```bash
# dry-run (default — no writes)
npm run import:run -- --slug=zurigo-videokameras-2026 --d1-path=.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0000.sqlite

# apply (licence gate + batch + writes)
npm run import:run -- --slug=zurigo-videokameras-2026 --apply --d1-path=...

# rollback a whole batch (only rows that batch inserted)
npm run import:rollback -- --slug=zurigo-videokameras-2026 --d1-path=...
```

Offline staging / tests: the `fixture` adapter reads a JSON array of raw
rows (common field names, see `normalize.mjs`) and normalises them exactly
like a real adapter would — pass an inline descriptor + payload through
`runImport()` (tests) or stage a file and point the runner at it.

## GDPR / safety (design §7.6)

- The runner never ingests PII: staged rows carry only the camera-metadata
  whitelist; `notes` is a deterministic provenance string, never free
  source text.
- No credentials in descriptors/adapters (URLs + licences only); API keys
  come from the environment.
- `source_checksum` (sha256) is stored on the batch — a changed payload is
  a different batch unless `--force`.
- Rollback is reversible-undo: deletes only the batch's own rows (and
  their cascaded events/actions), audits internally
  (`moderation_events` `import-rollback`), never touches community data.
