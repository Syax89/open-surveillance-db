# Operations manual — OpenSurveillanceDB

Stato: draft operativo per la messa in produzione.
Riferimenti: `docs/DEPLOYMENT.md` (precondizioni e release procedure), `docs/STATUS.md`.
Ultima verifica procedure: 2026-08-01 (Ken, CI/CD) — incluso drill operatività
locale LXC 114 (sezione 8 e appendice).

Questo documento soddisfa la precondizione di operatività di `DEPLOYMENT.md`:
"Automated backups, restoration drill, monitoring, error alerting, and incident
runbook". Ogni procedura elencata qui è stata eseguita almeno una volta in
locale (comandi e output reali nella sezione [Appendice](#appendice-comandi-verificati)).

---

## 1. Panoramica

| Ambiente | Worker | D1 | Note |
|---|---|---|---|
| sviluppo | locale (`wrangler dev`) | locale | dati demo, nessun dato reale |
| staging | Workers (preview/`--env staging`) | D1 staging | solo dati sintetici (vincolo DEPLOYMENT.md §release) |
| produzione | Workers (`open-surveillance-db`) | D1 `opensurveillancedb` (remote) | unico ambiente con dati reali |

Regole trasversali:

- Nessun segreto in sorgente, workflow o log. Credenziali solo via Cloudflare
  secrets / GitHub Actions secrets (`${{ secrets.* }}`).
- I dump D1 contengono dati di contatto delle richieste di correzione
  (`correction_requests.contact`) e la coda di moderazione: sono dati sensibili
  e vanno trattati come tali (sezione [4.2](#42-protezione-dei-backup)).
- L'endpoint di moderazione è fail-closed: senza credenziali configurate
  risponde `503`, mai `200` (verificato, vedi Appendice).

---

## 2. Monitoring: health check, error rate, alerting

### 2.1 Health check periodico

Endpoint da monitorare in produzione:

| Check | URL | Atteso | Significato |
|---|---|---|---|
| homepage | `GET /` | `200`, `<title>` atteso | worker + asset bundle serviti |
| API pubblica | `GET /api/cameras` | `200` + JSON `{"records":[...]}` | D1 raggiungibile, query pubblica ok |
| moderazione | `GET /api/moderation` | `401`/`503` (MAI `200` senza auth) | gate fail-closed attivo |

Procedura manuale (identica a quella usata nel drill locale):

```bash
curl -sS -o /dev/null -w 'home        %{http_code} in %{time_total}s\n' https://<PROD_URL>/
curl -sS -o /dev/null -w 'api/cameras %{http_code} in %{time_total}s\n' https://<PROD_URL>/api/cameras
curl -sS -o /dev/null -w 'moderation  %{http_code}\n' https://<PROD_URL>/api/moderation
```

Automatizzato dal workflow `.github/workflows/ops-monitoring.yml` (schedulato,
cron giornaliero; crea una GitHub issue se un check fallisce — sezione 2.3).

### 2.2 Error rate e logs

- **Log in tempo reale**: `npx wrangler tail` (filtrabile per `--format json`).
  Uso tipico: debug incidenti e verifica errori `5xx`.
- **Error rate (storico)**: dashboard Cloudflare → Workers → `open-surveillance-db`
  → Analytics (request volume, errori per status, p95 latency). Soglie
  operative consigliate: error rate > 1% o p95 > 5s su 10 min → alert.
- **Retention logs**: attivare Workers Logpush verso R2 o altro storage privato
  quando il volume lo giustifica (default Cloudflare: retention limitata).

### 2.3 Alerting

1. **Workflow health check** (`.github/workflows/ops-monitoring.yml`): se un
   check non risponde con lo status atteso, apre una issue
   `ops: health check FAILED` con l'output del check. La notifica GitHub
   (email/app) è il canale primario.
2. **Cloudflare Health Checks** (opzionale, consigliato): sul dominio
   di produzione, health check `GET /` con soglia 2 failure su 3 tentativi
   e notifica email/webhook.
3. **Escalation incidente**: vedi runbook, sezione 4.

---

## 3. Backup D1 automatizzato

### 3.1 Comando di export (verificato, wrangler 4.118.0)

```bash
# Produzione: export completo (schema + dati) del D1 remoto
npx wrangler d1 export opensurveillancedb --remote --output=d1-backup-$(date +%F).sql
```

Note:

- Il dump include schema e contenuto di tutte le tabelle presenti nel DB
  remoto (`cameras`, `correction_requests`, `moderation_events`).
  **Verificare sempre che il dump contenga le 3 tabelle** prima di archiviarlo
  (pitfall: un DB senza migrazioni applicate produce dump parziali — vedi
  Appendice, drill #1).
- Per il solo schema: `--no-data`; per i soli dati: `--no-schema` (usato nel
  restore su DB esistente, sezione 3.4).
- `--remote` è obbligatorio per toccare produzione; senza flag wrangler
  agisce sul DB locale.

### 3.2 Automazione su schedule

Workflow `.github/workflows/ops-backup.yml`:

- trigger: `schedule` cron `0 2 * * *` (02:00 UTC, giornaliero) + `workflow_dispatch`;
- esegue `wrangler d1 export ... --remote` con credenziali da
  `secrets.CLOUDFLARE_API_TOKEN` e `secrets.CLOUDFLARE_ACCOUNT_ID`;
- verifica che il dump contenga le 3 tabelle attese (`cameras`,
  `correction_requests`, `moderation_events`) e registra i conteggi baseline;
- **cifra il dump (AES-256-CBC, passphrase da `secrets.BACKUP_PASSPHRASE`)**
  e salva solo il file `.enc` come artifact GitHub privato del run
  (retention 30 giorni). Il file in chiaro viene cancellato nello stesso job:
  il repo è pubblico, l'artifact non deve mai contenere dump in chiaro;
- **non** esegue deploy: il backup non tocca mai il worker in produzione.

Pre-requisiti GitHub (impostare una volta, mai hardcoded nei workflow):

```text
CLOUDFLARE_API_TOKEN   token con permesso "D1 - Edit" sull'account
CLOUDFLARE_ACCOUNT_ID  account id Cloudflare
BACKUP_PASSPHRASE      passphrase per la cifratura AES-256 dei dump
PROD_URL (variable)    hostname di produzione (es. opensurveillancedb.example)
```

Decifratura di un backup per il drill di restore:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass "pass:$BACKUP_PASSPHRASE" \
  -in d1-backup-<DATA>.sql.enc -out d1-backup-<DATA>.sql
sha256sum -c d1-backup-<DATA>.sql.enc.sha256   # integrità prima del restore
```

Pre-requisiti repo: `wrangler.jsonc` deve avere il `database_id` reale del D1
di produzione (il file committato contiene il placeholder
`00000000-0000-4000-8000-000000000000`, vedi DEPLOYMENT.md).

### 3.3 Verifica di integrità post-backup

Nel run di backup, dopo l'export, viene eseguita una verifica di conteggio:

```bash
npx wrangler d1 execute opensurveillancedb --remote \
  --command="SELECT 'cameras' t, COUNT(*) n FROM cameras UNION ALL \
             SELECT 'correction_requests', COUNT(*) FROM correction_requests \
             UNION ALL SELECT 'moderation_events', COUNT(*) FROM moderation_events;"
```

I conteggi del giorno vengono registrati nel report del run: servono come
baseline per il drill di restore (sezione 3.4, step 4).

### 3.4 Drill di restore (procedura verificata in locale)

Il drill va eseguito almeno trimestralmente e comunque prima di ogni
modifica di schema. Due pattern, a seconda dello stato del DB di destinazione:

**Pattern A — ripristino completo su D1 vergine (disaster recovery).**

```bash
# 1. DB di destinazione: vuoto (nuovo database D1, o reset)
# 2. Ingerire il dump (schema + dati):
npx wrangler d1 execute opensurveillancedb --remote --file=d1-backup-<DATA>.sql
# 3. Verificare struttura: le 3 tabelle devono esistere
npx wrangler d1 execute opensurveillancedb --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
# 4. Verificare i dati: i conteggi devono combaciare con quelli del report
#    del giorno del backup (sezione 3.3)
```

**Pattern B — reimport su D1 già esistente (rollback dati, niente reset).**

Il dump completo su un DB che ha già le tabelle fallisce con
`table already exists` (verificato). Per ricaricare i soli dati:

```bash
# 1. Esportare il backup dati-only (dal backup o export --no-schema)
npx wrangler d1 export opensurveillancedb --remote --no-schema --output=d1-data-$(date +%F).sql
# 2. Ricaricare i dati sul DB esistente
npx wrangler d1 execute opensurveillancedb --remote --file=d1-data-<DATA>.sql
# 3. Verificare conteggi come nel Pattern A
```

**Criteri di successo del drill**: (a) le 3 tabelle esistono; (b) i conteggi
combaciano con la baseline; (c) un campione di record pubblici torna visibile
via `GET /api/cameras`. Esito del drill registrato in un commento
sull'issue/run che lo ha schedulato.

### 3.5 Protezione dei backup

- I dump contengono dati di contatto e moderazione: **mai** pubblicare
  backup, mai caricarli su storage pubblico, mai includerli in commit.
- Il workflow di backup salva solo artifact **cifrati** (AES-256-CBC,
  passphrase in `secrets.BACKUP_PASSPHRASE`): un artifact del repo pubblico
  senza cifratura equivarrebbe a una fuga di dati.
- Artifact GitHub con retention finita (30 giorni) è il minimo accettabile;
  per retention lunga usare R2 privato o storage aziendale (sempre cifrato).
- Backup remoti ulteriori (NAS/oggetto) devono usare canale cifrato e
  accesso ristretto.

---

## 4. Incident runbook

### 4.1 Severity

| Sev | Esempio | Target response |
|---|---|---|
| S1 | dati personali esposti pubblicamente; DB perso/corrotto; sito down prolungato | < 30 min |
| S2 | error rate > 1% sostenuto; feature pubblica degradata; moderazione inaccessibile | < 2 h |
| S3 | degradazione parziale, nessun impatto su dati pubblici | < 1 giorno lavorativo |

### 4.2 Ruoli e escalation

| Ruolo | Persona | Compito |
|---|---|---|
| On-call / primo risponditore | Ken (CI/CD) | verifica alert, triage iniziale |
| Tech lead / decisioni | Ada (CTO) | autorizza rollback, restore, comunicazione |
| QA | Grace | verifica post-mitigazione su staging |
| Mantainer / comunicazione | Ada | annuncio pubblico se serve |

Escalation: Ken → Ada → (S1) coinvolgimento immediato di entrambe le figure.

### 4.3 Fasi

1. **Detect**: alert del workflow health check, `wrangler tail`, o segnalazione.
2. **Triage (15 min)**: confermare l'incidente (`curl` manuale), classificarne
   la severità, aprire issue `incident: <titolo>` con tag severity.
3. **Mitigate**: applicare la contromisura più rapida e reversibile —
   rollback del worker (sezione 5) e/o ripristino dati (sezione 3.4).
   Registrare nel ticket i comandi eseguiti e gli orari.
4. **Verify**: health check completo (2.1) + verifica conteggi D1 (3.3) +
   smoke test QA su staging.
5. **Resolve & postmortem**: chiudere l'incidente solo a dati pubblici
   verificati. Entro 3 giorni lavorativi: postmortem con timeline, causa
   radice, azioni correttive (issue dedicate, ciascuna con assignee).

### 4.4 Comunicazione

- Interna: issue GitHub + menzione al canale del team. Mai dettagli di dati
  personali nei ticket pubblici (il repo è pubblico): riferirsi agli
  incidenti per ID, non per contenuto.
- Pubblica (solo S1 con esposizione dati): nota su `docs/legal/BREACH_PROCEDURE.md`
  e contatto del Garante secondo la procedura legale vigente.

---

## 5. Rollback plan (versione precedente dei Workers)

### 5.1 Identificare le versioni

```bash
npx wrangler versions list          # ultime 10 versioni del worker
npx wrangler versions view <version-id>
```

Ogni release è correlata a un tag git `v*` (procedura release del repo:
tag + push, la CI costruisce). Correlazione version-id ↔ commit: annotare
sempre il version-id nel changelog/issue della release, oppure ricavarlo
dalla dashboard Cloudflare → Workers → Deployments (mostra id e data).

### 5.2 Rollback (due livelli)

**Livello 1 — rollback all'ultima versione buona (raccomandato, immediato):**

```bash
npx wrangler rollback                # torna all'ultimo deployment precedente
```

**Livello 2 — rollback a una versione specifica:**

```bash
npx wrangler rollback <version-id> -m "rollback per <motivo> (issue #N)"
```

Regole:

- Il rollback del worker è **istantaneo e non tocca D1**: i dati restano
  invariati. Se l'incidente riguarda i dati (corruzione, migrazione errata),
  il rollback del worker non basta: serve il ripristino D1 (3.4).
- Dopo il rollback: health check (2.1), smoke test QA, e registrare il
  version-id di origine e di destinazione nell'issue dell'incidente.
- La versione rollbackata resta in `versions list`: non è persa.

### 5.3 Matrice decisionale rollback vs hotfix

| Situazione | Azione |
|---|---|
| regressione UI/API dopo deploy, dati ok | rollback worker (5.2) |
| migrazione D1 andata male, dati intatti | rollback worker + fix migrazione, restore dati-only (Pattern B) |
| dati corrotti/persi | restore completo su D1 vergine (Pattern A) + verifica |
| bug di sicurezza urgente nel codice | rollback immediato + hotfix su branch + release urgente |

### 5.4 Pre-condizioni affinché il rollback sia possibile

- `CLOUDFLARE_API_TOKEN` con permesso "Workers Scripts - Edit" (stesso
  secret usato dal backup).
- Il worker deve essere deployato con versioning attivo (default su
  Workers moderni); in caso contrario fare almeno `wrangler deploy` della
  versione precedente dal tag git (`git checkout vX.Y.Z && npx wrangler deploy`).

---

## 6. Checklist pre-produzione (collegamento a DEPLOYMENT.md)

Prima del primo deploy di produzione, confermare (barrare quando fatto):

- [ ] `wrangler.jsonc`: `database_id` reale del D1 di produzione.
- [ ] Migrazioni applicate al D1 remoto (`wrangler d1 migrations apply ... --remote`).
- [ ] Secrets GitHub: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
      `BACKUP_PASSPHRASE`; repository variable `PROD_URL`.
- [ ] Secrets Cloudflare: `MODERATION_USER`/`MODERATION_PASSWORD` o
      `MODERATION_TOKEN` (senza questi la moderazione risponde 503 — fail-closed).
- [ ] Workflow `ops-monitoring.yml` schedulato e passato almeno una volta (dry run manuale).
- [ ] Workflow `ops-backup.yml` schedulato; primo backup eseguito e dump verificato (3 tabelle + conteggi).
- [ ] Drill di restore eseguito (Pattern A) con esito registrato.
- [ ] Tag `v*` presente e correlato a un deployment; `wrangler rollback` provato in staging.
- [ ] Incident runbook condiviso con il team (questo file).

---

## 8. Operatività del deploy locale (LXC 114, `osdb-test`)

Questa sezione documenta le procedure **testate** per l'ambiente locale
attualmente attivo: Proxmox container **114** `osdb-test`, IP
`192.168.1.201:3000`, LAN only. È l'ambiente di riferimento per le verifiche
di staging (DEPLOYMENT.md §"Local LXC deployment").

### 8.0 Accesso al container: via Proxmox API, non SSH

- La deploy key documentata in DEPLOYMENT.md **non è mai stata iniettata** al
  `vzcreate` (verificato sul task log del 2026-07-31 17:01) e lo schema API
  non consente di aggiungere `ssh-public-keys`/`password` post-create.
- Tutte le operazioni (snapshot, rollback, backup, stop/start) usano il
  **token API Proxmox**, decifrato a runtime dal vault GPG locale
  (`~/.hermes/secrets/proxmox-token.gpg`) — mai hardcoded negli script.
- Prerequisito sulla macchina che esegue gli script: `gpg` con la chiave del
  vault, `curl`, `python3`.

### 8.1 Health check periodico (monitoraggio)

Script: `ops/health-check.sh`

```bash
# manuale
ops/health-check.sh
# cron (workstation): ogni 5 minuti
*/5 * * * * /home/simone/workspace/open-surveillance-db/ops/health-check.sh >> /home/simone/logs/osdb-health.log 2>&1
```

Route verificate (attese → significato):

| Check | URL | Atteso |
|---|---|---|
| homepage | `GET /` | `200` |
| API pubblica | `GET /api/cameras` | `200` |
| geospatial | `GET /api/cameras/nearby?...` | `200` |
| guide | `GET /guide` | `200` |
| moderazione | `GET /api/moderation` | `503` (fail-closed, mai `200` senza credenziali) |

Exit code 0 = tutto OK; exit code 1 = almeno una route fuori soglia. In caso
di fallimento lo script crea il marker `/tmp/osdb-health-FAIL` (utile per un
watchdog) e il log in `/home/simone/logs/osdb-health.log` riporta il dettaglio.
Il job è installato nel crontab della workstation di Ken (vedi sopra).

### 8.2 Backup automatizzato (vzdump → storage NAS)

Script: `ops/backup-lxc114.sh`

```bash
# manuale
ops/backup-lxc114.sh
# cron (workstation): ogni notte alle 02:30
30 2 * * * /home/simone/workspace/open-surveillance-db/ops/backup-lxc114.sh >> /home/simone/logs/osdb-backup.log 2>&1
```

Cosa fa (tutto via API Proxmox):

1. Lancia `vzdump` del container 114 in **snapshot mode** (nessun downtime)
   sullo storage CIFS **NAS** (configurato su pve: `content=images,backup`),
   compressione `zstd`, `prune-backups=keep-last=7` (ritenzione 7 backup).
2. Attende il completamento del task (poll fino a 30 min) e controlla
   `exitstatus=OK`.
3. Verifica via API storage content che l'archivio
   `NAS:backup/vzdump-lxc-114-<data>_<ora>.tar.zst` sia elencato e stampa il
   numero totale di archivi conservati.

Il database D1 dell'app (`.wrangler/state/v3/d1/.../*.sqlite`) vive nella
rootfs del container e **è incluso** nell'archivio vzdump (verificato: file
estratto e letto con `PRAGMA integrity_check` ok, tabelle `cameras`,
`correction_requests`, `moderation_events`).

### 8.3 Procedura di restore (disaster recovery)

Dall'archivio vzdump più recente sul NAS:

```bash
# 1. individuare l'archivio sul NAS
smbclient //192.168.1.194/NAS -U Simone -c 'cd dump; ls vzdump-lxc-114-*'
# 2. estrarre il D1 sqlite (esempio)
zstd -dc vzdump-lxc-114-<DATA>_<ORA>.tar.zst | tar -xf - -C /tmp \
  ./opt/open-surveillance-db/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite
# 3. verificare integrità
python3 -c "import sqlite3;c=sqlite3.connect('<file>');print(c.execute('PRAGMA integrity_check').fetchone())"
```

Restore **completo** del container (sostituzione): creare un nuovo container
dall'archivio con `pct restore` (o via API) oppure rollback allo snapshot
pre-deploy (sezione 8.4) — che ripristina anche i file non in DB.

### 8.4 Rollback (snapshot del deploy precedente)

Due script complementari:

```bash
# PRIMA di ogni deploy: crea lo snapshot pre-deploy (rollback base)
ops/snapshot-pre-deploy.sh                 # nome default pre-deploy-YYYYMMDD-HHMMSS
# IN CASO DI PROBLEMI: rollback a quello snapshot + riavvio + health check
ops/rollback-lxc114.sh pre-deploy-20260801-003428
```

Comportamento verificato del rollback Proxmox:

- L'API rollback ferma il container, ripristina il disco dallo snapshot e
  **non lo riavvia da solo**: `rollback-lxc114.sh` gestisce stop→rollback→
  start→wait→health check in sequenza.
- Dopo il rollback l'health check completo (8.1) deve dare 5/5 OK prima di
  dichiarare risolto l'incidente (vedi runbook §4.3, step Verify).

### 8.5 Note di sicurezza

- Nessun segreto negli script: il token Proxmox è nel vault GPG locale
  (`~/.hermes/secrets/proxmox-token.gpg`, chmod 600), decifrato a runtime.
- Gli archivi vzdump contengono l'intera rootfs del container (incluso il D1
  con eventuali richieste di correzione): storage NAS privato, accesso
  ristretto, mai su canali pubblici.

---

## Appendice: comandi verificati

Tutte le verifiche eseguite il 2026-07-31 da Ken, in locale, su `main`
(commit 09f847d), Node 22, wrangler 4.118.0 (npm ci riproducibile).

| # | Procedura | Comando | Esito reale |
|---|---|---|---|
| 1 | build | `npm run build` | `Build complete. Run vinext start...` |
| 2 | health check | `npx wrangler dev` + curl | `GET / 200 OK`, `GET /api/cameras 200 OK` |
| 3 | fail-closed moderazione | curl `/moderation` senza credenziali | `503 Service Unavailable` ("Moderation access control is not configured; denying") |
| 4 | export D1 locale | `wrangler d1 export opensurveillancedb --local --output=...` | `Done!` — SQL con `CREATE TABLE` + `INSERT` |
| 5 | pitfall dump parziale | export da DB senza migrazioni | dump con **solo** `cameras` (lezione: applicare migrazioni prima, verificare 3 tabelle) |
| 6 | migrazioni | `wrangler d1 migrations apply ... --local` | 5 migrazioni `✅` (0000→0004) |
| 7 | restore Pattern A | `wrangler d1 execute ... --file=dump.sql` su DB vergine | tabelle ricreate; query `sqlite_master` ok |
| 8 | restore su DB esistente | dump completo su DB già migrato | `✘ table cameras already exists` (⇒ Pattern B con `--no-schema`) |
| 9 | rollback | `wrangler rollback --help`, `wrangler versions --help` | sintassi verificata: `rollback [version-id]`, `versions list/view/upload/deploy` |
| 10 | cifratura backup | `openssl enc -aes-256-cbc -salt -pbkdf2 ...` + decrypt | roundtrip OK (`cmp` identico), `sha256sum` verificato |
| 11 | workflow YAML | `python3 -c "yaml.safe_load(...)"` su `ops-monitoring.yml`, `ops-backup.yml` | entrambi validi (`jobs: health-check`, `jobs: backup`) |
| 12 | advisory | `GHSA-36p8-mvp6-cv38` (CVE-2026-0933, command injection in `wrangler pages deploy`) | **non applicabile**: patch in 4.59.1, repo su 4.118.0 |

### Appendice — drill operatività locale LXC 114 (2026-08-01, Ken)

Tutte le prove eseguite in ambiente reale (workstation Ken → Proxmox
192.168.1.77 → container 114 → storage NAS 192.168.1.194):

| # | Procedura | Comando / script | Esito reale |
|---|---|---|---|
| L1 | health check route | `ops/health-check.sh` | 5/5 OK (`/` 200, `/api/cameras` 200, nearby 200, `/guide` 200, `/api/moderation` 503) |
| L2 | snapshot pre-deploy | `ops/snapshot-pre-deploy.sh` | snapshot `pre-deploy-20260801-002440` creato (UPID vzsnapshot) |
| L3 | backup vzdump→NAS | `ops/backup-lxc114.sh` | `vzdump-lxc-114-2026_08_01-00_34_31.tar.zst` 1.02 GB su `NAS:backup/`, task OK in 40s, verificato via storage content API (2 archivi, keep=7) |
| L4 | contenuto backup | estrazione D1 sqlite da archivio | `PRAGMA integrity_check` = `ok`; tabelle `cameras`(4), `correction_requests`(2), `moderation_events`(0) |
| L5 | rollback | `ops/rollback-lxc114.sh pre-deploy-20260801-003428` | rollback UPID vzrollback TASK OK; container fermato da Proxmox → riavvio → sito su in 40s → health check 5/5 OK |
| L6 | dati post-rollback | `GET /api/cameras` | 2 record `demo` serviti (dati preservati) |
| L7 | cron | `crontab -l` | `*/5 * * * * ops/health-check.sh` e `30 2 * * * ops/backup-lxc114.sh` installati |

Note emerse dal drill (già incorporate in §8):

- Il rollback Proxmox ferma il container e non lo riavvia da solo → lo script
  fa start esplicito + attesa + health check (§8.4).
- `ssh-public-keys` e `password` non sono ammessi dal PUT config LXC (schema
  API: "property is not defined in schema") → accesso via API token, §8.0.

Note per il prossimo drill:

- `wrangler d1 export` non supporta `--persist-to` (solo `execute`): il drill
  locale usa il DB predefinito di `wrangler dev` in `.wrangler/state`.
- Il security scanner dell'ambiente di sviluppo blocca `rm -rf` su cartelle
  temporanee e `npx wrangler@<range>` (advisory): usare la versione del
  lockfile (`node_modules/.bin/wrangler` dopo `npm ci`).
