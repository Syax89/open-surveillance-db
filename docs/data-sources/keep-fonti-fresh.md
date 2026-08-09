# Keeping /fonti always up to date (keep-fonti-fresh)

**Status:** operational plan + gap-fix (PR «feat/fonti-fresh-plan», kanban
t_ebd9f22d). **Updated:** 2026-08-08.

## 1. Goal

The `/fonti` page (server-rendered, `app/fonti/page.tsx` +
`app/components/SourcesPage.tsx`) lists the **committed** import batches
read from `import_batches` via `db/import-sources.ts`
(`listCommittedImportBatches()`). There is no «manual publish»: the
page reflects the DB on every request (`force-dynamic`). The problem is not
the page — it is the **flow**: every new import must end up in a
`committed` batch, and operators must know how to verify it. This document
is the reference runbook.

## 2. Current flow (audit, verified on the code)

```
npm run import:run -- --slug=<slug> --apply [--d1-path=…]
  → scripts/import/cli.mjs
  → scripts/import/runner.mjs (runImport)
      1. descriptor from the adapter (getDescriptor)
      2. licence-gate (fail-closed, only with --apply)
      3. INSERT import_batches  status='running'  import_date=now, created_at=now
      4. fetch payload + source_checksum (sha256)
      5. parse adapter → canonical staged rows
      6. validate → dedup Pass1/Pass2 → counters
      7. writeChunks: INSERT cameras (source='import:<slug>') + 'imported' events
         (chunk of 50 rows, idempotent via partial UNIQUE (source, external_id))
      7b. UPDATE import_batches  status='committed', counters, report JSON,
                                notes, source_checksum, updated_at=now
  → /fonti: listCommittedImportBatches() WHERE status='committed'
            ORDER BY import_date DESC, id DESC
```

- **Batch states** (`import_batches.status`, CHECK constraint): `running`
  (created, write in progress), `committed` (published), `failed` (parse or
  write failed), `rolled_back` (removed with `import:rollback`).
- **Rollback** (`scripts/import/rollback.mjs`): deletes ONLY the batch's
  rows (cascaded events/actions), audited in `moderation_events`, leaves the
  batch `rolled_back` (attribution history). The batch is never deleted.
- **Idempotency**: re-running an already-committed slug without `--force`
  aborts; `--force` refreshes in place (fills only NULLs, never overwrites
  community values, never deletes rows). A `failed` or `running` batch can
  be re-run without `--force` (counters are reset and it starts over).

## 3. Commit convention (the rule that keeps /fonti fresh)

1. **Dry-run by default**: `npm run import:run -- --slug=<slug>` writes
   nothing (no batch). It is the mandatory step before every apply.
2. **An import is «live» ONLY when its batch is `committed`.** The commit
   happens automatically at the end of the write phase: there is no
   separate action. If the run fails, the batch stays `failed` (visible
   only in the DB, never on /fonti — the page exposes committed batches
   only).
3. **`--force` to refresh an already-imported source**: the slug stays the
   same, `updated_at` is updated (and with it the /fonti «Last updated»
   line), `import_date` remains the batch's birth date. Do not create a
   new slug for a refresh: it violates idempotency and duplicates the
   attribution.
4. **After every apply, verify** (section 4). The commit is «done» only
   when the verification confirms it.

## 4. How to verify that /fonti reflects the latest imports

After an apply (local or on the LXC), the verification has two levels — DB and page:

```bash
# 1) DB — the batch must be committed with the expected counters
sqlite3 <d1-path> "SELECT slug, status, import_date, updated_at,
                          records_total, records_inserted, records_invalid
                   FROM import_batches ORDER BY updated_at DESC LIMIT 8;"
#    expected: status='committed' for the latest slug, updated_at ≈ now.

# 2) Page — /fonti must show the source at the top of the table
#    (the list orders by import_date DESC) and the «Last updated» line
#    updated to the most recent commit.
curl -s https://<your-host>/fonti | grep -oE 'Last updated: [^<]+'
#    expected: the date of the latest commit.
```

Since the page is `force-dynamic` it has no cache: a new batch appears on
the next request and a `rolled_back` disappears — no TTL to invalidate.

## 5. Stuck batches: detection and recovery

- **Symptom**: an import was interrupted (ssh drop, container crash, D1
  error) and the batch stays `running` or `failed`.
- **Detection** (batches in `running` for too long = never committed):
  ```bash
  sqlite3 <d1-path> "SELECT slug, import_date FROM import_batches
                     WHERE status='running'
                       AND datetime(import_date) < datetime('now','-2 hours');"
  ```
  A recent `running` batch is an import in progress (normal); an old one is
  a dead run. `failed` batches are visible with `WHERE status='failed'`
  (the reason is in the `report` field, JSON: `writeError` / `adapterError`).
- **Recovery**: re-run the same slug without `--force` — the runner
  resets the counters and starts over; already-inserted rows are idempotent
  no-ops (partial UNIQUE `(source, external_id)`). After the re-run, verify
  as per section 4.
- **Never roll back a non-committed batch**: `import:rollback` aborts with
  `expected 'committed'` (a `running`/`failed` batch has no complete rows
  to remove).

## 6. Recommended automation (kanban task / cron)

Freshness requires no new code: it requires someone to look. Two options,
in order of value:

1. **Weekly kanban verification task** (board OSDB):
   runs section 4 + the section 5 detection on the test LXC and flags any
   divergence between `import_batches` and `docs/data-sources/README.md`
   (table «Imported sources»). Cost: ~10 min. It is the human check that
   catches forgotten refreshes.
2. **Cron (no_agent) on a watchdog query**: every day at 08:00, a script
   runs the section 5 query (batches `running` > 2 h) and stays silent if
   it finds nothing — it notifies only on a dead run.
   The commit convention (section 3) remains human: a cron cannot decide
   on the operator's behalf.

## 7. Gaps closed by this PR (2026-08-08)

- **Dynamic «Last updated» note** (`app/fonti/page.tsx`, `SourcesPage.tsx`,
  `app/lib/i18n/sources.ts`, `db/import-sources.ts`): the old
  `versionNote` was a hardcoded date («Updated 5 August 2026») — already
  false the day after the first FR/ES/NL import (the page showed batches
  from 8 August and said «updated to the 5th»). Now the line is
  `max(COALESCE(updated_at, import_date))` over committed batches, computed
  on every request; `updatedAt` is exposed in the public
  `ImportBatchPublic` type. No hardcoded string survives.
- **Write-phase failure → `failed` batch** (`scripts/import/runner.mjs`):
  a crash during the INSERTs left the batch in `running` forever
  (indistinguishable from an import in progress). Now the catch marks it
  `failed` with `report.writeError` and re-throws `import write failed: …`;
  the recovery (re-run without `--force`) is unchanged. Tests:
  `tests/import-pipeline.test.mjs` (write failure + recovery),
  `tests/import-sources-read.test.mjs` (updatedAt on committed),
  `tests/fonti-page.test.mjs` (dynamic note).
- **Docs aligned with reality** (`docs/data-sources/README.md`):
  `source: "official"` → `source = 'import:<slug>'` (the runner owns the
  column); run reports no longer live in
  `docs/data-sources/imports/reports/` (removed by the docs-cleanup #352)
  but in the `import_batches.report` (JSON) DB column.
