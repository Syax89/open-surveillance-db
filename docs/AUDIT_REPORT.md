# AUDIT_REPORT — Punto reale del progetto (sintesi consolidata 7 audit)

- **Data:** 2026-08-02
- **Commit verificato:** `9eb3082` (main, PR #187 — feat moderation H1)
- **Metodo:** 7 audit indipendenti eseguiti in parallelo (CTO, Backend, QA, DevSecOps, Legal, Docs, UX/Frontend), ognuno con **verifica reale su codice/test/deploy**, non su dichiarazioni. Tutte le suite sono state eseguite davvero: `npm test` **1384/1384 PASS (0 fail, 0 skip)** confermato da 4 audit indipendenti; coverage reale **93.33% righe** (promesso 94.12%); a11y axe 0 criticità/serie su 21 route; i18n parity EN/IT verificata; build produzione OK.
- **Documenti fonte:** AUDIT_CTO_architettura_main.md (ada), AUDIT_BACKEND_2026-08-02.md (linus), AUDIT_QA_main.md (grace), AUDIT_DEVSECOPS_REPORT.md (ken), AUDIT_LEGALE_FULL_2026-08-02.md (rosa), AUDIT_DOCS_REPORT.md (marie), AUDIT_UX_FRONTEND.md (vera/design).

---

## 1. SINTESI ESECUTIVA — il punto reale

**Il progetto è molto più avanti di quanto la documentazione racconti, e la documentazione è il problema più grande.**

### Cosa è DAVVERO implementato e funzionante (verificato)
- **Nessuna feature fantasma**: ogni voce marcata "done" nei docs esiste nel codice e ha test. ADR 0001–0019 **tutte rispettate** nel codice (verifica puntuale ada).
- **Community wave C1–C6** (ADR 0018): verifiche/trust levels, editing a due binari, correzioni whitelist, /account esteso, erasure estesa — **tutta reale e testata**.
- **Nucleo privacy-by-design**: retention automatica R1–R7/R13 wired al cron `0 3 * * *`, coordinate ~4 decimali (~10 m) a ogni confine pubblico, foto fail-closed (strip EXIF, R2+D1, storage_key mai esposto), auth PBKDF2-210k/CSRF/lockout, erasure art. 17, moderazione+appelli, ODbL nelle export, zero analytics. **436/436 test privacy-relevant PASS** (rosa).
- **Postura sicurezza dichiarata in gran parte reale** (ken): header edge su ogni risposta, gate moderazione fail-closed, anti-spoofing identità, rate limiting per famiglia, CSRF double-submit, foto 404 senza leak di esistenza, proxy tile OSMF-compliant, retention con finestre legali fisse non overridabili. `npm audit` produzione **0 vulnerabilità**, gitleaks pulito.
- **Frontend rifattorizzato e usabile** (vera): F1–F4 (route tool separate, home hub, nav diretta, filtri in URL) **già implementati e funzionanti**; design system sobrio e coerente (13 token), baseline a11y forte, i18n type-checked EN/IT con parità strutturale garantita dal build.
- **Backend di qualità alta** (linus): boundary pubblico stretto su tutte le superfici, validazione quasi totale, audit trail append-only, 1384/1384 test verdi, coverage 94% baseline.

### Cosa NON è vero (dichiarato ma non funzionante) — i gap più gravi
1. ~~**POST /api/appeals irraggiungibile in produzione** (HIGH, linus)~~ → **RISOLTO** (CEO decision 2026-08-02, opzione a): l'edge gate-a `/api/appeals` con credenziali moderation, ma la rotta richiede solo ruolo contributor → i contributori non potevano presentare appello. `POST /api/appeals` è stato spostato fuori da `identityPath`: ora autentica con la sessione ADR 0013 al route layer (cookie + CSRF, bridge `users` per il ruolo), mentre `GET`/`PATCH` restano dietro il gate moderation. Test edge-worker aggiunti.
2. **La pipeline di deploy non è MAI stata eseguita** (P1, ken): deploy.yml ha **0 run in assoluto** e la modalità dry-run è **rotta** (`--dry-run` non esiste su `wrangler d1 migrations apply`, exit 1). Il primo trigger fallirebbe.
3. **Cloudflare è il target di deploy attivo ma i prerequisiti legali non esistono** (P0, rosa): PROCESSOR_REGISTER marca Cloudflare "futuro" mentre `wrangler.jsonc` ha il database_id REALE `osdb-production` e il deploy è pronto. **DPA Cloudflare + SCC + pin region R2 = P0 assoluto prima di caricare dati reali.**
4. **Main SENZA branch protection** (P1/P2, ken): push diretto bypassa CI; `cancel-in-progress` può nascondere commit rotti.
5. **D1 produzione 11 migrazioni indietro** (ken): `osdb-production` ha 0015–0025 pendenti; **0 secret sul worker CF** (moderazione sul deploy = 503).
6. **Snapshot Drizzle 0011–0025 mancanti** (HIGH, ada): `npm run db:generate` oggi emetterebbe una migrazione spuria enorme — la "no-op guarantee" dichiarata è falsa.

### Il problema trasversale: i docs sono sistematicamente INDIETRO rispetto al codice
Tutti i 7 audit convergono: **il codice è avanti, la documentazione è stale**. In particolare SITEMAP.md (descrive F2/F3/F4 come pending quando sono merged; rotta fantasma `/account/contributions`), STATUS.md (manca l'intera wave community C1–C6), DATA_MODEL.md ("Ten tables" → 13 reali; migrazioni 0000–0011 → 0000–0025), README.md (paragrafo duplicato, ADR fermo a 0014), QA_COVERAGE.md (1287 vs 1384 reali), EXECUTION_BOARD.md (righe stale), LOCAL_PLAYBOOK/DEVELOPMENT_SETUP (errori fattuali: "three tables", Hide→`removed`).

### Verdetto complessivo
**Nessuna falla di sicurezza dati sfruttabile sul percorso pubblico** (confermato da linus e ada). Il progetto è un prototipo/staging **conforme per progettazione** e pronto per la public alpha **dopo** i fix P0/P1 elencati in §6. Lo stato reale è migliore della reputazione che i docs gli danno: il rischio più grande oggi non è il codice, ma (a) la pipeline di deploy mai collaudata, (b) i prerequisiti legali Cloudflare non chiusi, (c) la documentazione che racconta una storia più vecchia della realtà.

---

## 2. AUDIT CTO (ada) — architettura

**Verdetto:** architettura solida, coerente, fedele agli ADR. Debito = processo/docs, non design.

| # | Severità | Finding |
|---|---|---|
| 1 | **HIGH** | **Snapshot Drizzle 0011–0025 mancanti**: journal ha 26 voci ma snapshot solo fino a 0010 → `npm run db:generate` differirebbe lo schema completo e **emetterebbe una migrazione spuria enorme**. La no-op guarantee dichiarata nei commenti è falsa; `db-migration-smoke` non verifica l'allineamento snapshot. |
| 2 | MED | docs/STATUS.md indietro di un'intera wave: manca community C1–C6 (ADR 0018) e fix H1/H2 del 08-02; header "Last reviewed 2026-08-01" contiene item del 08-02. |
| 3 | MED | docs/ARCHITECTURE.md non menziona ADR 0018/0019 (community layer, two-track PATCH, duplicate gate). |
| 4 | MED | docs/EXECUTION_BOARD.md righe stale: "ODbL export notice open (PR #81)" → implementato; "per-domain bundle in flight (PR #80)" → completato; "security.txt drafted" → merged. |
| 5 | LOW | `login_attempts` senza regola di retention (crescita illimitata per email mai autenticate). |
| 6 | LOW | Dipendenze pre-1.0: vinext 0.0.50 (runtime entry), miniflare alpha. Rischio churn API/supply-chain. |
| 7 | OBS | Demo records nelle export CSV/GeoJSON: coerente con ADR 0001 ma la garanzia ADR 0008 "mai esportati" poggia solo sul purge R12 pre-lancio (nessun gate nel codice). |

**Punti di forza verificati:** confine pubblico/privato a strati con `PUBLIC_CAMERA_STATUSES` come fonte unica; `roundPublicCoordinate` su ogni superficie pubblica; freshness ancorata a `last_verified_at`; anti-gaming dentro il write path; level mai denormalizzato (`deriveLevel` puro); erasure atomica con de-attribuzione; edge come unica autorità identità; audit trail immutabile (trigger ABORT); retention con costanti legali non overridabili.

**Azioni:** Ada/Linus → rigenerare snapshot 0011–0025 + check "generate no-op" in db-migration-smoke. Marie → riallineare STATUS/ARCHITECTURE/EXECUTION_BOARD. Linus → retention login_attempts. Ada/Ken → pinning vinext/miniflare + gate demo purge R12.

---

## 3. AUDIT BACKEND (linus) — API / data model / auth

**Verifica reale:** tsc 0 errori, eslint 0 errori (1 warning), **1384/1384 test PASS**, db:smoke PASS (26 migrazioni, 0 demo identity), runtime bundle verificato (Miniflare dispatchFetch: `/` 200 con header, `/api/cameras` 503 fail-closed, `/moderation` 503, `/api/tiles/0/0/0` 200).

| # | Severità | Finding |
|---|---|---|
| 1 | ~~**HIGH**~~ **RISOLTO** | **POST /api/appeals irraggiungibile**: edge gate-a `/api/appeals` (identityPath → credenziali moderation), ma la rotta richiede solo ruolo contributor → i contributori non possono MAI appellare (401/503 prima di requireRole). **Risolto** con decisione CEO (opzione a): `POST /api/appeals` fuori da identityPath, auth a sessione ADR 0013 al route layer; `GET`/`PATCH` restano dietro il gate moderation; test edge-worker aggiunti (PR t_df331399). |
| 2 | MEDIUM | **Admin può impersonare qualunque reviewer** nell'audit trail (actorId client fidato per admin, moderation/route.ts 389-399): integrità dell'audit append-only compromessa. Da rimuovere in produzione. |
| 3 | MEDIUM | Rate-limit **per-isolate in-memory**: bypassabile su deploy multi-isolate (sostituire con CF Rate Limiting prima del lancio). |
| 4 | MEDIUM | **callerKey spoofabile** (fallback x-forwarded-for fuori da CF): rate-limit, burst conferme, quota foto anonime aggirabili su deployment non-CF. |
| 5 | MED/LOW | `latitude: null` → record a **(0,0)** (`Number(null)===0`): vettore junk/submission-spam, documentato ma live. Fix: `typeof payload.latitude === "number"`. |
| 6 | LOW | Query riflessa nel 404 di search (XSS bassissimo, da neutralizzare). |
| 7 | LOW | Pre-lancio: AUTH_COOKIE_SECURE default false, HSTS assente, TRUST_PLATFORM_HEADERS misconfig = auth bypass, seed demo client da rimuovere. |

**Inventario API:** 24 route (~33 handler), tutte con test dedicato. **Schema DB:** 13 tabelle, 26 migrazioni (0000–0025), indici allineati, partial unique anti-dedupe, `submitter_key` mai pubblico, migrazione 0017 rimuove identity demo in modo guardato. **Auth a doppio binario verificata:** contributore (cookie PBKDF2-210k, sessioni SHA-256, CSRF, lockout) + ruolo coarse edge-gated (Basic/Bearer, fail-closed 503) + ruoli granular con matrice corretta.

**Giudizio:** qualità alta; nessuna falla di sicurezza dati sfruttabile sul percorso pubblico. Unico difetto funzionale vero: raggiungibilità appelli (§3.1).

---

## 4. AUDIT QA (grace) — test / coverage / a11y / i18n

**Verifica reale (clone fresco):** `npm test` → **1384/1384 PASS (0 fail, 0 skip)**, promesse superate (QA_COVERAGE diceva 1287, C-QA 1312). Coverage reale **93.33% righe** vs 94.12% promesso (delta -0.79pp; soglia CI 75% ampiamente superata). axe 0 crit/ser su 21 route; a11y-interactive 29/29; Lighthouse CI SUCCESS; i18n parity EN/IT 13/13; contratti API 24/24 route; edge worker 8/8; anti-gaming 19/19.

| # | Severità | Finding |
|---|---|---|
| 1 | 🔴 rilevante | **PATCH /api/auth/me (displayName C6) ha 0 test route-level** — coverage crollata da 92.86% a **54.72%** (il modulo più basso del progetto). Il test client mocka la fetch. Whitelist 400, sameOrigin 403, CSRF, 414, 503 non verificati. Viola la promessa §8.4 (≥90% community). |
| 2 | 🟠 | `db/camera-edits.ts` **76.45%** (peggiorato da 87.63%) e `confirmation` 88.83% — **finding #1 C-QA mai chiuso**, sotto soglia §8.4. Anche `db/users.ts` 82.05%. |
| 3 | 🟡 | 3 doc stale: QA_COVERAGE.md (baseline 1795b95, non 9eb3082), QA_REPORT_a11y-interactive.md (dice 24 test, reali 29; pin "known gap" non esistono più), messaggio skip F4 in url-contract.test.mjs (F4 atterrato da tempo). |

**Cosa NON è testato:** PATCH /api/auth/me route-level; ratio gate livelli ADR 0018 §3.5 (>50% rejected → livello non sale) **documentato ma non implementato** (finding C-QA #2 aperto); test manuali a11y formali pendenti (ACCESSIBILITY_STATEMENT: "Partially compliant").

**Raccomandazioni:** (a) test route-level per PATCH /api/auth/me; (b) alzare camera-edits e confirmation ≥90%; (c) aggiornare i 3 doc stale. Nessun bloccante di sicurezza/funzionalità.

---

## 5. AUDIT DEVSECOPS (ken) — CI/CD / security / deploy

**Verifiche reali:** lint OK, tsc OK, 1384/1384 test, db:smoke PASS, **npm audit prod 0 vuln** (completo: 9 dev, 1 high in `tmp` via @lhci/cli — debito tooling), gitleaks pulito, `wrangler deploy --dry-run` OK (40 asset, bundle 1.27 MiB), **`d1 migrations list --remote` → 11 migrazioni PENDENTI** sul D1 reale, worker CF con 2 versioni caricate a mano (attiva 7cd46db4), **0 secret sul worker**, CI/Security/Lighthouse verdi su main, **deploy.yml: 0 run in assoluto**.

| # | Severità | Finding |
|---|---|---|
| 1 | **P1** | **deploy.yml dry-run ROTTO**: `--dry-run` non esiste su `wrangler d1 migrations apply` (exit 1, "Unknown arguments"). Fix verificato: `wrangler d1 migrations list osdb-production --remote`. Mai eseguito → nessuno se n'è accorto. |
| 2 | **P1** | **ops-monitoring muto**: 403 "Resource not accessible by integration" (manca `permissions: issues: write`) + PROD_URL mai impostata. L'alerting primario non ha MAI consegnato nulla. |
| 3 | **P1/P2** | **main SENZA branch protection** ("Branch not protected"): push diretto bypassa CI; cancel-in-progress può nascondere commit rotti. |
| 4 | P2 | **Deploy dichiarato ≠ implementato**: deploy.yml NON ha `db:provision --remote` (DEPLOYMENT.md lo promette), secret PROVISION_ACCOUNTS assente, environment production senza required reviewers, worker CF con 0 secret (moderazione = 503 fail-closed sul deploy). |
| 5 | P3 | Hardening: azioni non pinnate a SHA, allowed_actions all, HSTS assente (task t_6148aa6f), rate limit in-memory per-isolate, AUTH_COOKIE_SECURE default false. |

**Stato deploy reale (Cloudflare):** worker 2 versioni manuali (attiva 7cd46db4, 01/08); D1 `osdb-production` **14 commit dietro main** (0015–0025 pendenti); nessun deploy GitHub Actions in assoluto; backup D1: ultimi 3 run falliti al guard secret (da confermare al run 02/08 con i secret ora presenti).

---

## 6. AUDIT LEGAL (rosa) — GDPR / privacy / termini

**Verifica reale:** 436/436 test privacy-relevant PASS. **Verdetto: nucleo privacy-by-design IMPLEMENTATO** — retention automatica (cron 03:00 UTC, R1-R7/R13), coordinate ~10 m, foto fail-closed, auth hardening, erasure art. 17, moderazione+appelli con recusal, ODbL notice, mini-informativa art. 13, zero analytics.

| # | Severità | Finding |
|---|---|---|
| F1 | **ALTA** | Pagina /privacy: **"un solo cookie" è falso dopo login** — 3 cookie: `osdb_session`, `osdb_csrf`, `opensurveillancedb-locale`. Trasparenza art. 13/122 richiede la tabella completa. |
| F2 | MEDIA-ALTA | Notice §3: "identità moderatore mai registrata né memorizzata" **INACCURATO**: `users` memorizza email+display_name (authz). Corretto solo per il nome completo OpenAI. |
| F3 | MEDIA | R5: notice promette "audit entries 2 anni → delete", il codice **non le cancella mai** (append-only, archivio out of scope). Decisione: implementare o documentare conservazione art. 5(2). |
| F4 | MEDIA | Trust levels dichiarati "non-ordinali": l'implementazione è **ORDINALE** (L0-L4, gated quota verifiche). Errore terminologico. |
| F5 | MEDIA | TERMS §15 / PRIVACY §7 / RETENTION_SCHEDULE §3: enforcement retention marcato "pre-lancio" ma **è implementato** (PR #87). Docs stale. |
| F6 | MEDIA | PROCESSOR_REGISTER: "Cloudflare futuro per ADR 0012" ma wrangler.jsonc ha database_id REALE e deploy.yml fa `wrangler deploy` → **Cloudflare ATTIVO**. DPA+SCC+pin R2 = **P0 prima di dati reali**. |
| F7/F8 | BASSA | R14 "conferma aggregata" non implementato come scritto (delete righe); eraseContributor non de-attribuisce `photos.contributor_id` (orifano). |
| F9 | BASSA | Pagine pubbliche /privacy v0.5 e /termini v0.3 laggano canonico v0.9/v0.5 (mancano disclosure community). Sync prima del go-live community. |
| F10-F12 | BASSA/INFO | IP non dichiarato in notice (solo in-memory, ok); LEGAL_DELIVERABLES_INDEX "licenza da confermare" STALE (AGPL confermata); demo records da ripulire al beta. |

**Open item confermati P0:** G1 = DPA Cloudflare (SCC 2021/914) + conferma versione SCC; G2 = pin/pin region R2 `opensurveillancedb-photos` (EU). **P1:** external counsel review, decisione R5, sync pagine web. **P2:** email verification, MFA moderatori, ADR adozione termini, DCO, tile provider, backup drill.

**Nota finale rosa:** nessun dato reale deve essere caricato nel D1 `osdb-production` prima di G1-G2. Stato attuale = "prototipo/staging conforme per progettazione, pre-contratto".

---

## 7. AUDIT DOCS (marie) — documentazione vs codice

**Verifica reale:** 1384/1384 PASS; confronto doc ↔ codice su main.

| # | Severità | Finding |
|---|---|---|
| 1 | Alta | **README.md**: paragrafo "For local moderation testing" **duplicato** (138-149 + 161-175, prima copia stale/contraddittoria); ADR range riga 99 fermo a 0014 (esistono 19); community system assente dall'elenco feature. |
| 2 | Alta | **docs/DATA_MODEL.md**: "Ten tables" (reali **13**); migrazioni "0000–0011" (reali **0000–0025**); mancano **6 route API** (cameras/[id] GET/PATCH, confirmation PUT/DELETE/GET, cameras/[id]/edit, moderation/corrections, locale, PATCH auth/me) e 3 sezioni tabella. |
| 3 | Alta | **docs/SITEMAP.md** — il più indietro: dichiara "implemented state" ma è fermo a F1; F2/F3/C5 marcati pending (tutti merged); footer tool links "not yet" (falso); **rotta fantasma `/account/contributions`** (mai esistita); `/records/[id]/edit` "planned" (implementato); tabella nav `/` stale; "Open items" tutti superati. |
| 4 | Media | **docs/STATUS.md**: "Implemented locally" senza community system C1–C6 (un lettore concluderebbe che non esiste). |
| 5 | Media | **docs/FUTURE_ROADMAP.md**: 3 checkbox H1 non spuntate ma implementate (freshness, filtri, test). |
| 6 | Media | **docs/LOCAL_PLAYBOOK.md**: "three tables" (13 reali); "Hide → hidden" (reale: `removed`, 2 punti). |
| 7 | Media | **docs/DEVELOPMENT_SETUP.md**: migrazioni 0000-0007 (reali 0000-0025); "8 files: 3 tables" (26 file, 13 tabelle); ref branch H3 obsoleto. |
| 8 | Bassa | **docs/QA_COVERAGE.md**: "1287/1287" vs 1384/1384 reale; baseline pinnata a commit vecchio. |
| 9 | Bassa | **docs/ARCHITECTURE.md**: non menziona ADR 0018/0019 (community, duplicate gate). |

**Verificato corretto:** CHANGELOG aggiornato fino a #187; ADR log 0001–0019 con status corretti; rename D1 `osdb-production` applicato; ODbL notice coerente con TERMS §7.1; /guide e /faq bilingui live; trigger append-only; ruoli governance coerenti.

**Fix task già creati da marie:** t_bd483485 (README), t_3db10293 (DATA_MODEL+ARCHITECTURE), t_1f4589c2 (SITEMAP), t_bf60c226 (STATUS+ROADMAP+QA_COVERAGE), t_e0bb14af (PLAYBOOK+SETUP).

---

## 8. AUDIT UX/FRONTEND (vera) — usabilità reale

**Verifica reale:** build ✓, 156/156 test ✓, lettura di tutte le 21 route + 37 componenti.

**Il frontend è molto più maturo di quanto dichiarato:** il refactor verso pagine separate (F1–F4) è GIÀ implementato e funzionante — SITEMAP.md è stale. Home hub SSR-pure, 4 route tool con ToolLayout, filtri in URL, LegacyAnchorRedirect, footer 13 link con aria-current.

| # | Severità | Finding |
|---|---|---|
| 1 | **P1** | **BUG 1 — link rotto**: ReportForm.tsx riga 39 `href="#correction"` su /segnala → punta a `/segnala#correction` (inesistente). Deve essere `href="/correggi"`. Il LegacyAnchorRedirect NON intercetta (same-page anchor). |
| 2 | **P2** | **BUG 2 — i18n toggle rotto su /accessibility**: manca da `SERVER_RENDERED_INFO_ROUTES` in LocaleProvider.tsx → la pagina è SSR ma il cambio lingua non fa router.refresh() (testo non si aggiorna). |
| 3 | P3 | **BUG 3 — 31 anchor legacy** (`/#map`, `/#records`, `/#report`, `/#correction`) in 9 pagine interne: funzionano via LegacyAnchorRedirect ma con hop indiretto + dipendenza JS. Sostituire con route dirette. |
| 4 | P3 | SITEMAP.md descrive F2/F3/F4 come pending (implementati); FRONTEND_DESIGN.md "migration path" completata da riflettere. |
| 5 | P4 | `aria-invalid` non cablato sugli input auth (gap tracciato); token spaziatura da consolidare; aria-current nei nav-shell interni. |

**Valutazione design:** architettura informativa corretta (una rotta, un job, un h1); navigazione cross-tool completa (niente vicoli ciechi); design system sobrio e coerente (palette 13 token, contrasto AA verificato); accessibilità baseline forte (skip link, focus 3px, reduced-motion, landmark, mappa con fallback, status dot con label); i18n type-checked con parità semantica verificata; responsive mobile-first coerente, niente scroll orizzontale a 320px, touch target ≥44px.

**Verdetto design:** progetto **pronto per la public alpha dopo i fix P1** (BUG 1 e BUG 2 sono puntuali e a basso rischio).

---

## 9. ERRORI COMUNI (tematiche trasversali)

1. **Docs sistematicamente stale rispetto al codice** (tutti i 7 audit): SITEMAP, STATUS, DATA_MODEL, README, ARCHITECTURE, EXECUTION_BOARD, QA_COVERAGE, FUTURE_ROADMAP, LOCAL_PLAYBOOK, DEVELOPMENT_SETUP. Il codice è AVANTI, i docs raccontano una storia più vecchia. → Fix task docs già creati (marie).
2. **Pipeline di deploy dichiarata ma mai collaudata** (ken): 0 run, dry-run rotto, main senza branch protection, D1 produzione indietro di 11 migrazioni, 0 secret sul worker.
3. **Prerequisiti legali non chiusi mentre l'infrastruttura è già puntata** (rosa): Cloudflare attivo senza DPA/SCC/pin R2.
4. **Feature dichiarata ma non raggiungibile** (linus): POST /api/appeals bloccato dall'edge.
5. **Test che coprono la UI ma non la route** (grace): PATCH /api/auth/me mockato → coverage 54.72%.
6. **Convenzione dichiarata ma non verificata** (ada): snapshot Drizzle incompleti → `db:generate` non è no-op.
7. **Terminologia/docs legali imprecisa** (rosa): "un solo cookie", "identità mai memorizzata", "non-ordinali", "pre-lancio" per cose implementate.

---

## 10. PRIORITÀ CONSIGLIATE (consolidate dai 7 audit)

### P0 — prima di dati reali / public deploy
1. **Legal**: DPA Cloudflare + conferma SCC + pin region R2 EU (G1-G2 rosa). *Nessun dato reale in osdb-production prima.*
2. **Ops**: fix deploy.yml dry-run (`d1 migrations list --remote`) + fix ops-monitoring (permissions issues:write + PROD_URL) (ken).
3. **Ops**: abilitare **branch protection su main** con required checks (CI, Security, Lighthouse) (ken).
4. ~~**Backend decisione CEO**: POST /api/appeals — spostarlo fuori da identityPath con auth a sessione, o dichiararlo moderator-only (linus HIGH)~~ → **RISOLTO** (t_df331399): opzione a implementata — POST /api/appeals fuori da identityPath, auth a sessione ADR 0013, gate moderation solo su GET/PATCH.
5. **Drizzle**: rigenerare snapshot 0011–0025 + check "generate no-op" in db-migration-smoke (ada HIGH).
6. **Deploy reale**: aggiungere step `db:provision --remote` + secret PROVISION_ACCOUNTS + configurare i secret CF sul worker + applicare le 11 migrazioni pendenti (ken).

### P1 — prima della public alpha
7. **QA**: test route-level per PATCH /api/auth/me (chiude il regresso 54.72%) + alzare camera-edits/confirmation ≥90% (grace).
8. **Backend**: rimuovere admin impersonation actorId; validazione `latitude` numerica; harden callerKey (linus).
9. **Frontend**: fix BUG 1 (`/correggi`) e BUG 2 (lista SSR + /accessibility) (vera).
10. **Legal**: fix sezione cookie (F1), riga moderatore (F2), decisione R5 (F3), sync pagine web al canonico (F9) (rosa).
11. **Docs**: fix README (dedup+community+ADR), DATA_MODEL (13 tabelle+26 migrazioni+6 route), SITEMAP (stati reali+rotta fantasma), STATUS (community wave), EXECUTION_BOARD (righe stale) (marie).

### P2 — prima del lancio pubblico
12. **Ops/Security**: rate-limit per-isolate → CF product; HSTS + AUTH_COOKIE_SECURE=true; pinning azioni a SHA; allowed_actions (ken).
13. **Backend**: retention login_attempts; query reflection search; TRUST_PLATFORM_HEADERS (linus/ada).
14. **Legal**: terminologia trust level (F4), docs retention (F5), R14 + de-attribuzione photos (F7/F8), riga IP (F10), indice licenza (F11) (rosa).
15. **Frontend**: cleanup 31 anchor legacy (BUG 3), aria-invalid (vera).
16. **Docs**: FUTURE_ROADMAP checkbox, LOCAL_PLAYBOOK, DEVELOPMENT_SETUP, QA_COVERAGE baseline, ARCHITECTURE ADR 0018/0019 (marie).

### P3 — pre-beta
17. Rimozione demo records dal dataset pubblico + seed demo client (F12, OBS ada/linus).
18. ADR adozione termini/accettazione, DCO/CONTRIBUTING, tile provider di produzione, backup drill formalizzato (rosa/marie/ken).
19. Valutazione pinning vinext/miniflare + gate demo purge R12 (ada/ken).

---

## 11. STATO PER IL CEO — in una riga

**Il codice è solido e davvero implementato (1384/1384 test, 93.33% coverage, 0 falla di sicurezza pubblica, ADR rispettate, frontend rifattorizzato e usabile); il progetto è pronto per la public alpha DOPO: DPA Cloudflare+R2 pinning (P0 legale), pipeline di deploy collaudata e branch protection (P0 ops), decisione sugli appelli contributore (P0 prodotto), snapshot Drizzle e fix deploy (P0 tecnico) — e la documentazione va riallineata al codice, che è avanti di un'intera wave community.**

---

*Documento consolidato da PM (orchestrazione) sulla base dei 7 audit indipendenti del 2026-08-02 (ada, linus, grace, ken, rosa, marie, vera). Report integrali allegati alle rispettive task kanban.*
