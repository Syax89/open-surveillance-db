# Mantenere /fonti sempre aggiornata (keep-fonti-fresh)

**Stato:** piano operativo + gap-fix (PR «feat/fonti-fresh-plan», kanban
t_ebd9f22d). **Aggiornato:** 2026-08-08.

## 1. Obiettivo

La pagina `/fonti` (server-rendered, `app/fonti/page.tsx` +
`app/components/SourcesPage.tsx`) elenca i batch di import **committed**
letti da `import_batches` tramite `db/import-sources.ts`
(`listCommittedImportBatches()`). Non esiste un «publish manuale»: la
pagina riflette il DB a ogni richiesta (`force-dynamic`). Il problema non è
la pagina — è il **flusso**: bisogna che ogni nuovo import finisca in un
batch `committed`, e che chi opera sappia come verificarlo. Questo documento
è il runbook di riferimento.

## 2. Flusso attuale (audit, verificato sul codice)

```
npm run import:run -- --slug=<slug> --apply [--d1-path=…]
  → scripts/import/cli.mjs
  → scripts/import/runner.mjs (runImport)
      1. descriptor dall'adapter (getDescriptor)
      2. licence-gate (fail-closed, solo --apply)
      3. INSERT import_batches  status='running'  import_date=now, created_at=now
      4. fetch payload + source_checksum (sha256)
      5. parse adapter → staged rows canonici
      6. validate → dedup Pass1/Pass2 → contatori
      7. writeChunks: INSERT cameras (source='import:<slug>') + eventi 'imported'
         (chunk 50 righe, idempotente via UNIQUE parziale (source, external_id))
      7b. UPDATE import_batches  status='committed', contatori, report JSON,
                                notes, source_checksum, updated_at=now
  → /fonti: listCommittedImportBatches() WHERE status='committed'
            ORDER BY import_date DESC, id DESC
```

- **Stati batch** (`import_batches.status`, CHECK constraint): `running`
  (creato, write in corso), `committed` (pubblicato), `failed` (parse o
  write falliti), `rolled_back` (rimosso con `import:rollback`).
- **Rollback** (`scripts/import/rollback.mjs`): cancella SOLO le righe del
  batch (eventi/azioni in cascata), audita in `moderation_events`, lascia il
  batch `rolled_back` (storia di attribuzione). Il batch non si cancella mai.
- **Idempotenza**: re-run di un slug committed senza `--force` aborta;
  `--force` refresha in place (fill dei soli NULL, mai sovrascrive valori
  community, mai cancella righe). Un batch `failed` o `running` si può
  ri-eseguire senza `--force` (i contatori vengono azzerati e si riparte).

## 3. Convenzione di commit (la regola che tiene /fonti fresca)

1. **Dry-run di default**: `npm run import:run -- --slug=<slug>` non scrive
   nulla (nessun batch). È il passaggio obbligato prima di ogni apply.
2. **Un import è «live» SOLO quando il suo batch è `committed`.** Il commit
   avviene automaticamente a fine write-phase: non esiste un'azione
   separata. Se il run fallisce, il batch resta `failed` (visibile solo in
   DB, mai su /fonti — la pagina espone esclusivamente i committed).
3. **`--force` per refrescare una fonte già importata**: lo slug resta lo
   stesso, `updated_at` si aggiorna (e con esso la riga «Last updated» di
   /fonti), `import_date` resta la data di nascita del batch. Non creare un
   nuovo slug per un refresh: viola l'idempotenza e duplica l'attribuzione.
4. **Dopo ogni apply, verificare** (sezione 4). Il commit è «fatto» solo
   quando la verifica conferma.

## 4. Come verificare che /fonti rifletta gli ultimi import

Dopo un apply (locale o su LXC), la verifica ha due livelli — DB e pagina:

```bash
# 1) DB — il batch deve essere committed con i contatori attesi
sqlite3 <d1-path> "SELECT slug, status, import_date, updated_at,
                          records_total, records_inserted, records_invalid
                   FROM import_batches ORDER BY updated_at DESC LIMIT 8;"
#    atteso: status='committed' per l'ultimo slug, updated_at ≈ adesso.

# 2) Pagina — /fonti deve mostrare la fonte in testa alla tabella
#    (la lista ordina per import_date DESC) e la riga «Last updated»
#    aggiornata al commit più recente.
curl -s https://osdb.syaxhome89.com/fonti | grep -oE 'Last updated: [^<]+'
#    atteso: la data dell'ultimo commit (o «Ultimo aggiornamento» in IT).
```

La pagina essendo `force-dynamic` non ha cache: un nuovo batch appare alla
richiesta successiva e un `rolled_back` scompare — nessun TTL da invalidare.

## 5. Batch bloccati: detection e recovery

- **Sintomo**: un import si è interrotto (ssh drop, crash container, D1
  errore) e il batch resta `running` o `failed`.
- **Detection** (batch in `running` da troppo tempo = mai committato):
  ```bash
  sqlite3 <d1-path> "SELECT slug, import_date FROM import_batches
                     WHERE status='running'
                       AND datetime(import_date) < datetime('now','-2 hours');"
  ```
  Un batch `running` recente è un import in corso (normale); uno vecchio è
  un run morto. I `failed` sono visibili con `WHERE status='failed'`
  (il motivo è nel campo `report`, JSON: `writeError` / `adapterError`).
- **Recovery**: ri-eseguire lo stesso slug senza `--force` — il runner
  azzera i contatori e riparte; le righe già inserite sono no-op idempotenti
  (UNIQUE parziale `(source, external_id)`). Dopo il re-run, verifica come
  da sezione 4.
- **Mai rollback di un batch non committed**: `import:rollback` abortisce
  con `expected 'committed'` (un batch `running`/`failed` non ha righe
  complete da togliere).

## 6. Automazione consigliata (task kanban / cron)

La freschezza non richiede codice nuovo: richiede che qualcuno guardi. Due
opzioni, in ordine di valore:

1. **Task kanban settimanale di verifica** (profilo ada/ken, board OSDB):
   esegue la sezione 4 + la detection della sezione 5 sull'LXC di test e
   segnala qualsiasi scostamento tra `import_batches` e `docs/data-sources/README.md`
   (tabella «Fonti importate»). Costo: ~10 min. È il controllo umano che
   becca i refresh dimenticati.
2. **Cron (no_agent) su una query watchdog**: ogni giorno alle 08:00, uno
   script che fa la query della sezione 5 (batch `running` > 2 h) e
   silenzia se non trova nulla — notifica solo in presenza di un run morto.
   Il commit della convenzione (sezione 3) resta comunque umano: un cron
   non può decidere al posto dell'operatore.

## 7. Gap chiusi da questa PR (2026-08-08)

- **Nota «Last updated» dinamica** (`app/fonti/page.tsx`, `SourcesPage.tsx`,
  `app/lib/i18n/sources.ts`, `db/import-sources.ts`): la vecchia
  `versionNote` era una data hardcoded («Updated 5 August 2026») — già
  falsa il giorno dopo il primo import FR/ES/NL (la pagina mostrava batch
  dell'8 agosto e diceva «aggiornata al 5»). Ora la riga è
  `max(COALESCE(updated_at, import_date))` sui batch committed, calcolata a
  ogni richiesta; `updatedAt` è esposto nel tipo pubblico di
  `ImportBatchPublic`. Nessuna stringa hardcoded sopravvive.
- **Write-phase failure → batch `failed`** (`scripts/import/runner.mjs`):
  un crash durante le INSERT lasciava il batch in `running` per sempre
  (indistinguibile da un import in corso). Ora il catch marca `failed` con
  `report.writeError` e rilancia `import write failed: …`; il recovery
  (re-run senza `--force`) è invariato. Test: `tests/import-pipeline.test.mjs`
  (write failure + recovery), `tests/import-sources-read.test.mjs`
  (updatedAt sul committed), `tests/fonti-page.test.mjs` (nota dinamica).
- **Doc allineati alla realtà** (`docs/data-sources/README.md`):
  `source: "official"` → `source = 'import:<slug>'` (il runner possiede la
  colonna); i report di run non vivono più in
  `docs/data-sources/imports/reports/` (rimossi dal docs-cleanup #352) ma
  nella colonna `import_batches.report` (JSON) del DB.
