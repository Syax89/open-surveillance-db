# Community system plan — piano consolidato (login, profilo contributi, livelli, verifiche)

Last reviewed: 2026-08-02
Status: **roadmap da approvare** (consolidamento dei pareri di Ricerca/Data/CTO/QA/Legal/Copy/Docs/Backend/Design) — § 1 aggiornato alla decisione multi-method auth ([ADR 0020](decisions/0020-multi-method-authentication.md), 2026-08-02)

Questo documento è il **piano unico** del community system: login sicuro, profilo dei
contributi, trust levels e verifiche (stelline) sui record. Consolida:

- **Ricerca login**: [`docs/AUTH_OPTIONS.md`](AUTH_OPTIONS.md) (Ken, t_530958a2) — valutazione
  opzioni di autenticazione.
- **Parere Data** (Nora, t_f49b0226): modello dati, anti-gaming a 6 strati, livelli, qualità.
- **Parere CTO** (Ada, t_e7e94d17): architettura, editing a due binari, cache, rischi.
- **Parere Backend** (Linus, t_25843be7): API, contratti, vincoli DB, migrazioni D1.
- **Parere QA** (Grace, t_45ff2bfd): criteri di accettazione, test anti-gaming, a11y/i18n.
- **Parere Legal** (Rosa, t_9e11b89b): GDPR, base giuridica, erasure, informativa.
- **Parere Copy** (Eva, t_290dce27): terminologia e microcopy EN/IT.
- **Parere Docs** (Marie, t_2acb8f70): documenti da creare/aggiornare.
- **Parere Design** (Vera, t_c9a9ca46): UI livelli, verifiche, profilo, editing.

Il piano è la **roadmap dell'implementazione**: ogni fase è un task kanban con assignee e
priorità (sezione 7) e ha criteri di accettazione verificabili (sezione 8).

---

## 1. Scelta autenticazione (dalla ricerca Ken, con motivazione)

Fonte: `docs/AUTH_OPTIONS.md` (PR #163, mergiata su main da Ada). Status: ricerca di supporto
alla decisione — nessuna opzione è ancora implementata.

### 1.1 Baseline attuale (ADR 0013)

Il sistema esistente è già solido: password PBKDF2-HMAC-SHA256 210k iterazioni (formato con
conteggio iterazioni embedded), sessioni opache a 32 byte salvate in D1 **solo come SHA-256**,
cookie `HttpOnly; SameSite=Strict; Path=/`, CSRF double-submit, lockout 5 fail/15 min con
backoff, GDPR data-minimising senza identity provider terzi. Gap noti: **nessun mailer**
(no email verification né password reset), **nessuna 2FA**, sessioni con solo TTL assoluto
(30 giorni), PBKDF2 sotto la raccomandazione OWASP attuale (600k).

### 1.2 Opzioni valutate (sintesi)

| Opzione | Phishing-res. | Open/OSS | Costo | GDPR/privacy | Verdetto |
|---|---|---|---|---|---|
| Passkeys (WebAuthn/FIDO2) | **Sì** (strutturale) | W3C, lib MIT | €0 (KV+D1) | minimo | **Strategico, dopo** |
| OIDC terze parti (GitHub/Google) | No (sposta il target) | protocollo sì, provider no | €0 | **alto (tracking + trasferimento US)** | **No** (viola ADR 0013) |
| OIDC self-hosted (Keycloak/Authentik/Hanko) | No | sì | €4–10/mo VM + ops | buono se EU | No (overkill 1 app) |
| Magic link / email OTP | No | convenzione | mailer nuovo + processor | medio (nuovo processor) | **No come login** (serve il mailer per reset) |
| TOTP 2FA (RFC 6238) | No (ma difende stuffing) | RFC, lib MIT | €0 | trascurabile | **Tattico, ora (opt-in)** |
| Session hardening (OWASP) | riduce la finestra | OWASP | €0 | nessuno | **Tattico, ora** |

### 1.3 Decisione consolidata

> **Aggiornato 2026-08-02 (ADR 0020, progetto AUTH MULTI-METODO fasi A–G).** La
> decisione sotto è la *prima* consolidazione (pareri 2026-08-01). Con il multi-method
> auth il CEO ha deciso tre metodi con disclosure dei rischi invece di esclusioni:
> i punti 1–3 sono rivisti in § 1.5. In sintesi: **passkey passano da "dopo" a Fase C**;
> **OIDC terze parti passano da "esclusi" a metodo opzionale con disclosure (Fase D)**;
> il vincolo "non esiste mailer" (punto 3) è risolto da **Cloudflare Email Routing**
> (Fase A2) — zero nuovi processor, zero DPA.

1. **Tattico, subito: harden le sessioni + TOTP opt-in.** Chiudono i due gap reali di oggi
   ("no 2FA", "sessioni con solo TTL assoluto") senza nuovi terzi, senza costi, dentro
   Workers+D1. Interventi (§7 di AUTH_OPTIONS.md): `Secure` fail-closed in produzione, idle
   timeout 14 giorni, rotazione token su privilege change, PBKDF2 → 600k con rehash on-login,
   prefisso `__Host-`, logout-all-devices, password change+reset (col futuro mailer).
   *(Nota 2026-08-02: lo hardening sessioni resta baseline; **TOTP è deferito** — le passkey
   coprono la stessa storia di secondo fattore con phishing-resistance strutturale, ADR 0020.)*
2. **Strategico, dopo: passkey/WebAuthn come metodo aggiuntivo parallelo** (email+password
   resta fallback). Unica opzione strutturalmente phishing-resistant; open standard, costo
   zero, gira su Workers (SimpleWebAuthn + KV challenge store + tabella D1 `passkeys`).
   Rollout: enrollment post-login + Conditional UI; mai sostituire la password subito
   (adoption ~36%). *(Nota 2026-08-02: **adottato come Fase C** — enrollment → 10 recovery
   codes hashed, anti-replay counter, fallback email/PW obbligatorio.)*
3. **Esclusi esplicitamente**: OIDC terze parti (tracking + trasferimento dati → contraddice
   ADR 0013 e PRIVACY_AND_SAFETY), IdP self-hosted (nuova superficie operativa per una sola
   app), magic link come login (richiede il mailer che non esiste e aggiunge un processor
   senza risolvere il phishing — il suo vero valore, password reset + email verification,
   arriverà col mailer). *(Nota 2026-08-02: **superato per l'OIDC** — GitHub/Google diventano
   metodo opzionale con disclosure (Fase D); restano esclusi IdP self-hosted e magic-link come
   login. Vedi § 1.5.)*

### 1.4 Impatto sul community system

Il community system **non dipende** dalla scelta login: poggia su `contributors.id` + sessioni
esistenti (ADR 0013). Requisito per il futuro: **qualsiasi login scelto deve produrre un
`contributors.id`** (colonne `auth_provider` + `external_sub` + `email_verified_at` nullable
nella migrazione multi-auth, ADR 0020/Fase A), mai
un terzo layer. L'hardening sessioni è ortogonale e può procedere in parallelo; se atterra
nella stessa finestra, `auth-flow-e2e.test.mjs` va esteso nella stessa PR.

### 1.5 Decisione multi-method auth (2026-08-02, ADR 0020)

Il progetto **AUTH MULTI-METODO** (fasi A–G, kanban) implementa la scelta multi-method
registrata in [ADR 0020](decisions/0020-multi-method-authentication.md). Rispetto a § 1.2/1.3:

| Metodo | Fase | Note |
|---|---|---|
| **email+password con verifica** | A (schema), A2 (mailer Cloudflare Email Routing `opensurveillancedb.org`), B (register→token→email→sessione read-only finché non verificato; verify-email 200/400/410; re-send rate-limited; password reset) | Verifica email **obbligatoria per write access**: `resolveVerifiedContributor()` → 401 anonimo / 403 non verificato (Fase E1). Token SHA-256 single-use 24h; 3 email/h per contributor. |
| **passkey/WebAuthn** | C | `@simplewebauthn/server` (MIT), challenge store con expiry, tabella D1 `passkeys` (credential_id UNIQUE, public_key, counter) + anti-replay; enrollment → 10 recovery codes (hash); fallback email/PW obbligatorio. |
| **OIDC GitHub/Google** | D | **Opt-in per account**, PKCE + discovery, account linking `auth_provider`+`external_sub` → contributor; conflitto email → merge manuale; **nessuna email importata dal provider** (solo sub + verified flag); client id/secret in GPG. Rischi dichiarati in UI (matrice rischi, Fase E2), privacy notice e terms: tracking provider (vede login e IP) + trasferimento US (EU–US DPF). |
| UX trasparenza | E2 | `/login` con 3 metodi + matrice rischi esplicita per metodo (phishing-resistance, tracking, dipendenza da device). |

**Impatto su questo piano:** le conferme/stelline restano ancorate ai livelli (§ 3.1: L1 = ≥1
contributo verificato); il *write gate* per le segnalazioni usa invece la **verifica email**
(E1, ADR 0020 § 2) — i due gate sono separati (vedi note a § 3.2 e § 8.3). L'erasure (R7) si
estende ai nuovi dati di autenticazione: token, passkey e recovery codes hard-deleted, `external_sub`
pulito (RETENTION_SCHEDULE R15; PRIVACY_NOTICE § 10).

---

## 2. Architettura profilo contributi + editing

Fonte: Ada (t_e7e94d17), Linus (t_25843be7), Vera (t_c9a9ca46), Marie (t_2acb8f70).

### 2.1 Fatto architetturale: due identità separate

- **`contributors`** (ADR 0013): identità del *reporter* — self-service register/login,
  sessioni cookie + CSRF double-submit. Il community system poggia **esclusivamente** qui.
- **`users` + `reviewers`** (ADR 0014): identità del *moderatore* — provisioned, header edge
  (`oai-authenticated-user-email`/`x-osdb-user-email`), mai dal client. Solo moderazione.

Non esiste collegamento tra i due: nessuna FK, nessuna mappatura. **Questa separazione va
preservata e documentata in un ADR nuovo (0018) prima di toccare codice** (vincolo CTO).

### 2.2 Editing contributi — PATCH /api/cameras/[id] a due binari

| Stato record | Comportamento | Risposta |
|---|---|---|
| `pending` (mai pubblico) | **PATCH diretto** con ownership check (`record.contributor_id === session.contributor.id`), CSRF + same-origin + rate-limit (bucket `edit`). Record anonimi/non-owner → **404 fail-closed** (pattern no-existence-oracle). | 200, owner-view completa incl. notes, `Cache-Control: no-store` |
| `verified` / `needs_review` / `stale` (storia pubblica) | Il PATCH **non muta `cameras`**: crea riga in `camera_edit_requests` (diff esplicito per colonna) + riga `moderation_queue` (entity `camera_edit`). Approve applica il diff + `moderation_events` action `edit_applied`; reject → `edit_rejected`. Un solo edit-request aperto per camera (partial unique, pattern `moderation_queue_open_unique`). | **202** `{ editRequest: { id, cameraId, status: 'pending', createdAt } }` |
| `removed` / `rejected` (terminale) | Edit bloccato, nessuna riga in coda. | **409** |

**Decisione PM su divergenza Ada↔Linus:** il binario diretto vale **solo su `pending`**
(posizione Linus, più stretta): `needs_review`/`stale` hanno già storia pubblica e dati
pubblicati sotto moderazione → edit-request con gate umano, coerente col parere legal
(rosa: pending→review). La posizione Ada (diretto anche su needs_review) resta documentata
ma **non adottata** in questa roadmap.

Campi editabili (whitelist, stessi limiti di POST /api/cameras): `title` (90), `kind` (60),
`address` (180), `notes` (1000), `manufacturer` (80), `observedOn` (data valida),
`description`. **Mai editabili**: `status`, `contributor_id`, `source`,
`publish_manufacturer/observed_on` (decisione moderatore), `last_verified_at/review_due_at`
(orologio freshness). Coordinate proposte: rounding ~10 m + sensitivity review.

Moderatori/admin **non-owner** sull'edit API → **403** (agiscono solo via endpoint
moderazione). No-op edit (stesso contenuto) → 200 "no changes", nessun evento (anti-farming).

### 2.3 Profilo contributi — estensione di /account

- **API**: `GET /api/auth/me/contributions?type=camera|correction|photo&status=&page=&pageSize=`
  paginato (contratto canonico F0: `page`/`pageSize` max 100, `pagination` object),
  `Cache-Control: no-store` (dato personale, mai edge-cache). Sostituisce/estende
  `me/submissions` (oggi LIMIT 50 senza paginazione); vecchio endpoint resta per
  backward-compat, deprecato nei docs. `level` nel meta (pagina /account senza seconda
  chiamata); `GET /api/auth/me` esteso con `{ level }`.
- **UI**: estensione di `/account` (NON nuova `/profile`): sezione profilo + badge livello +
  riga testuale di progresso ("X contributi verificati per il prossimo livello", niente
  barra), lista contributi con filtri **stato locali** (no URL: pagina privata non
  condivisibile — diverso dal pattern D3 di mappa/directory), contatore `role="status"`,
  link "Modifica" per l'owner, empty state truthfull.
- **Nuova route privata** `/account/contributions` (se la lista cresce): kebab-case, listata
  in SITEMAP **prima** del codice, `robots: noindex`. (Decisione finale con la fase frontend.)
- **Nuova route privata** `/records/[id]/edit` (pagina dedicata, auth-gated, solo record
  propri e stati modificabili): form sobrio pattern `ReportForm`, avviso "le modifiche
  entrano in moderazione". L'edit inline è riservato **solo** al displayName (campo profilo).

### 2.4 Segnalazioni rimozione/abuso — estensione del correction flow

Nessuna nuova architettura: **whitelist `issue_type`** su `POST /api/corrections`
(`inaccurate|missing|removal|abuse|other`) — oggi free-text, **breaking change** da testare su
`corrections-intake-contract.test.mjs`. `removal`/`abuse` → stessa coda `moderateCorrection`
esistente. Anonimo **resta possibile** (privacy del segnalante); login opzionale; rate-limit
per IP (bucket `submit`). **Dedupe**: un report aperto per (user, target) → 409 o merge
(requisito nuovo, copre lo spam di report). La colonna `correction_requests.contributor_id`
(NULL=anonimo) abilita "my corrections" nel profilo.

---

## 3. Sistema livelli (soglie, benefici, anti-spam)

Fonte: Nora (t_f49b0226), Linus (t_25843be7), Eva (t_290dce27), Vera (t_c9a9ca46).

### 3.1 Soglie (parere data, adottate)

Livello = **funzione pura** `deriveLevel(count)` in un solo file (`app/lib/trust-levels.ts`),
soglie in un solo posto (const), contano **solo** i record `status='verified'` attribuiti
(`COUNT(cameras WHERE contributor_id=? AND status='verified'`), indice
`(contributor_id, status)` = index-only, µs. **MAI denormalizzati** (`contributors.contributor_level`
non esiste): si invaliderebbe a ogni cambio status in 5+ punti; a questi volumi D1 single-writer
un COUNT indicizzato è gratis (posizione Linus/CTO/QA, supera la cache proposta da Nora).

| Livello | Nome interno | Soglia (verified) | Peso conferma | Badge pubblico (Eva) |
|---|---|---|---|---|
| L0 | Nuovo | 0 | 0.0 (segnale grezzo, escluso dallo score) | New contributor |
| L1 | Contributore | 1 | 1.0 | Trusted contributor |
| L2 | Attivo | 5 | 1.5 | Trusted contributor |
| L3 | Affidabile | 20 | 2.0 | Experienced contributor |
| L4 | Esperto | 50 | 3.0 | Experienced contributor |

**Mapping 5 livelli ↔ 3 badge (da congelare, prerequisito QA):** interno L0–L4; UI mostra solo
3 badge Eva (`New`/`Trusted`/`Experienced contributor`) così mappati: L0→New, L1–L2→Trusted,
L3–L4→Experienced. I test i18n/a11y dei badge si scrivono su questo mapping.

### 3.2 Benefici

- **L0**: può segnalare e navigare; conferme registrate ma peso 0 (non alimentano lo score);
  toggle UI disabilitato con copy esplicativo.
- **L1+**: conferme con peso pieno; "può confermare" (gate anti-gaming: **≥1 contributo
  verificato = L1 — la verifica email NON è il gate delle conferme**; nota 2026-08-02: il
  mailer ora esiste (Fase A2) e la verifica email è requisito del *write access* per le
  segnalazioni (Fase E1, ADR 0020 § 2), ma il gate L1 delle conferme resta ancorato ai
  contributi verificati).
- **L2+**: peso 1.5; segnalazioni abuso con priorità.
- **L3+**: peso 2.0; abuso bypassa soglie di rimozione più basse.
- **L4**: peso 3.0. **Community verification path (L4) NON in alpha** — flag per ADR separata
  e decisione Angelina (sconsigliata da Nora per alpha).
- **Badge pubblico, peso privato**: il badge è visibile nel profilo; il peso numerico **non**
  è esposto (non gaming-designable). **Nessuna leaderboard/ranking pubblico** (vincolo
  non-negoziabile CTO + legal rosa + PRODUCT_UX.md: "Do not use contributor ranking as
  product goals").

### 3.3 Anti-spam / anti-farming livelli

1. **Soglia su APPROVATI, non sottomessi**: pending/rejected/removed non contano mai.
2. **Ratio gate**: se >50% dei record sottomessi è rejected, il livello non sale anche se gli
   approvati superano la soglia.
3. **Monotonia bidirezionale**: verify → sale; rimozione/rigetto di un verified → scende
   (recalcolo; erasure de-attribuisce → conteggio cala).
4. **Livello non decade** per inattività (tranne revoke/moderation): il decay delle conferme
   (§4.2f) basta per la freschezza del dato.
5. **No-op edit senza evento** (2.2): non si può farmare il livello con PATCH inutili.
6. **Cap per-IP alla registrazione** (P3-4, decisione CEO 2026-08-03, t_0941036b): max **5
   tentativi di registrazione / 24h rolling per IP** — il 5° tentativo nella finestra riceve
   **429** con body generico anti-enumeration + Retry-After (di fatto ≤ 4 account/IP/giorno;
   un farm non può nemmeno sondare l'endpoint). Stato quota **D1** (`registrations_ip_log`),
   NON bucket in-memory: la finestra di 24h deve reggere tra isolate (stessa logica di
   `appealAppellantLimits` e del cap giornaliero conferme §4.2.3). La riga dell'attempt viene
   riservata e contata in **un unico batch** (atomico, niente race), e **rollbackata su ogni
   uscita non-201** (tentativi falliti non consumano budget; il contratto no-write dei body
   malformati resta). Chiave = **SHA-256 del caller key** (`cf-connecting-ip`), mai l'IP raw
   (pattern `photos.submitter_key` / `callerHash` abuse-alerts). Finestra rolling → reset
   automatico dopo 24h senza job di cleanup. Knob env: `REGISTER_IP_RATE_LIMIT_MAX` (default 5),
   `REGISTER_IP_RATE_LIMIT_WINDOW_SECONDS` (default 86400). **Caveat NAT/CGNAT**: più utenti
   legittimi dietro lo stesso IP condividono il budget — al cap viene risposto 429 (soft-flag
   per il bucket conferme §4.2.5, hard-cap qui per scelta della decisione); eventuale
   affinamento (es. proof-of-work o allowlist) è follow-up. Le righe oltre la finestra restano
   come log (inerti); una purga retention allineata a R16 (login attempts) è follow-up.

---

## 4. Sistema verifiche/stelle (modello dati, anti-gaming)

Fonte: Nora (t_f49b0226), Linus (t_25843be7), Ada (t_e7e94d17), Grace (t_45ff2bfd).

### 4.1 Modello dati — migrazioni D1 0020–0023 (convenzione hand-written + journal/snapshot)

| Migrazione | Contenuto |
|---|---|
| **0020** `camera_confirmations` | `(id, camera_id FK CASCADE, contributor_id FK CASCADE, created_at, UNIQUE(camera_id, contributor_id))` + index `(contributor_id, created_at)`. ON DELETE CASCADE in schema + cancellazione esplicita in `eraseContributor` (l'harness non applica FK: l'app layer è fonte di verità). |
| **0021** `camera_edit_requests` | diff esplicito per colonna (whitelist §2.2), status, decision fields, **partial unique `(camera_id) WHERE status='pending'`** (pattern `moderation_queue_open_unique`), index `(contributor_id)`. |
| **0022** `correction_requests.contributor_id` | `ALTER TABLE ... ADD COLUMN contributor_id INTEGER NULL REFERENCES contributors(id)` + index. NULL = anonimo; de-attribuzione esplicita, MAI ON DELETE (come `cameras.contributor_id`). |
| **0023** `cameras (contributor_id, status)` | index per count livelli index-only. |

Nessuna modifica a `moderation_queue`/`moderation_events` (entity `camera_edit` sta nel testo
libero; trigger append-only già bloccano update/delete). **`eraseContributor` esteso
(codice)**: delete conferme, `SET NULL` su edit_requests e correction_requests, prima della
delete del contributor (batch atomico). **`confidence_score` pesato (Nora) = v2, FUORI da
alpha** (Linus): niente colonne confidence in schema ora.

### 4.2 Anti-gaming a 6 strati (Nora, con semplificazioni QA adottate)

1. **UNIQUE strutturale**: 1 conferma attiva per (camera, contributor) — niente doppie
   conferme; toggle = PUT/DELETE (2ª PUT → 409; DELETE senza conferma → 404).
2. **Level gate**: conferme da account L0 → **403 fail-closed + bottone disabilitato in UI**
   (decisione QA, sostituisce il "weight=0 no-op silenzioso" di Nora); self-verify (confermare
   il proprio record) → **403/409** (vettore farming, nessun parere la vieta).
3. **Cap giornaliero** per account: 20/giorno (40 trusted) come **state quota D1** (COUNT su
   `(contributor_id, created_at)` dentro la transazione del toggle), NON rate-limiter
   in-memory per-isolate (pattern `appealAppellantLimits`); 429 + Retry-After.
4. **Cap per-record**: max 5 conferme/giorno su un record da account distinti; 6ª → 429.
5. **IP-hash bucket** (pattern `photos.submitter_key`): N account stessa IP, burst → bucket IP
   scatta + surge alert con `callerHash` (mai IP raw). NAT/CGNAT: soft-flag, non ban.
6. **Decay temporale**: conferme oltre la review window (`created_at >= cameras.lastVerifiedAt`)
   escluse da count/score; il record re-verified "rinnova" le conferme.

**Semplificazione adottata (QA vs Nora):** **toggle unico di conferma**; `removal`/`abuse`
NON sono tipi di stellina ma vanno **solo** dal flusso corrections whitelist (§2.4). La colonna
`type` in `record_confirmations` di Nora **non serve** (niente weight removal nello score in
alpha). Formula confidence_score: v2 fuori alpha, ma se implementata: media pesata su
livello≥1 + freshness, soglia 0.75 + ≥3 contributori distinti, denominator blindato
(division-by-zero → test esplicito).

### 4.3 API verifiche

| Endpoint | Comportamento | Cache |
|---|---|---|
| `PUT /api/cameras/[id]/confirmation` | Toggle ON (body vuoto) → `{ confirmed: true, count }`; 401 no sessione, 403 CSRF, 409 duplicato, 429 cap, 403 L0/self | `no-store` (dato personale) |
| `DELETE /api/cameras/[id]/confirmation` | Toggle OFF → `{ confirmed: false, count }`; 404 senza conferma | `no-store` |
| `GET /api/cameras/[id]/confirmation` | Stato personale `{ confirmed }`; anonimo → false | `no-store` |
| `GET /api/cameras/[id]` (+ lista) | `confirmationCount` nel payload pubblico | `s-maxage=300, stale-while-revalidate=600` (staleness ≤5min accettata) |

Count per pagina = **una query GROUP BY con IN (page ids)**, niente N+1. Rate-limit: RouteKind
`edit` (5/min) e `confirm` (30/min), bucket indipendenti con env knobs. Naming: DB/API =
`confirmation` (Linus), UI/i18n = "verifiche/verifications" (Eva): i due piani sono separati e
**uniformati in questo piano** (terminologia congelata, prerequisito QA).

---

## 5. Requisiti legal/privacy

Fonte: Rosa (t_9e11b89b). Verificato su main: PRIVACY_NOTICE v0.7, TERMS v0.3, RETENTION R1–R13.

### 5.1 Natura dei dati

Livelli e verifiche sono **dati personali** (art. 4(1) GDPR: associati a `contributors.id`;
pseudonimizzazione non esclude identificabilità — Recital 26). Base giuridica: **6(1)(f)** per
tutti (riconoscimento/incentivo e verifica comunitaria), **MAI consenso** (funzione core,
squilibrio). Nessuna nuova raccolta: i livelli sono calcolati da dati già esistenti; nessuna
metrica comportamentale. Nota art. 22: livello auto-calcolato che sblocca funzionalità NON è
decisione automatizzata con effetti giuridici, ma criteri documentati, trasparenti,
non discriminatori; se un domani condizionasse diritti legali → valutazione 13(2)(f).

### 5.2 Decisioni vincolanti

1. **Niente leaderboard/ranking pubblici** (R1 Medio-Alto: conflitto PRODUCT_UX + identificabilità
   + potenziale art. 22). Livelli/verifiche non sono mai una classifica.
2. **Profilo pubblico OPT-IN, default privato** (R4). Mai nome reale/email pubblici, solo
   display name. Nessun export profili.
3. **Erasure art. 17 estesa** (R2): `eraseContributor` deve coprire profilo/livello/verifiche
   ricevute (→ cancellate), verifiche date (→ de-identificate, contributore=NULL o decremento),
   authorship delle revisioni/edit-request (→ NULL), `cameras` mai toccate. **Testata PRIMA
   del merge della PR schema** (bloccante QA).
4. **Editing**: modifiche ai record verificati con **gate pending→review** (ADR 0001) o seconda
   verifica umana; tracciamento append-only (pattern revisioni esistente); risponde il
   **controller** (art. 5(2)), la moderazione è salvaguardia non trasferimento; TERMS §5.3
   esteso agli edit.
5. **Verifiche dell'utente cancellato**: ricevute → spariscono col profilo; date ad altri →
   restano de-identificate sul record; conferme su record altrui non sono suoi dati.

### 5.3 Aggiornamenti documentali (check-list)

| Documento | Azione |
|---|---|
| `docs/legal/PRIVACY_NOTICE.md` → **v0.8** | §3 righe profilo/verifiche/conferme; §4 no-ranking; §5 pubblico destinatario (profilo opt-in); §7 R14; §8 diritti espliciti (art. 16/17/21); §10 open item |
| `docs/TERMS_OF_USE.md` → **v0.4** | §2 scope community; §3.4 profilo opt-in; §5 editing (attribuzione, moderazione, revert); §5.3 garanzie estese; §6 moderazione/edit + appeal; §8 community-edited; §11 rimozione edit errati |
| `docs/legal/RETENTION_SCHEDULE.md` | **R14 — Community data**: profilo/livello/verifiche finché account attivo, de-identificazione all'erasure; revisioni col record (R3/R6); audit 2 anni (R5) |
| `docs/MODERATION.md` | Sezione "Edit moderation": coda, standard, emergency hide, appeal |
| `docs/legal/LAWFUL_BASIS.md` | LIA §3.1 aggiornato (interesse: riconoscimento/verifica comunitaria; impatto basso se opt-in e pseudonimo; salvaguardie) |
| Mini-informativa register | Riga "il tuo profilo e le tue conferme possono essere pubblici" |
| `docs/decisions/0018-…` | **Nuovo ADR** (conferme + livelli + editing + doppia identità contributors/users) prima del codice |

**Estensione 2026-08-02 (AUTH MULTI-METODO, ADR 0020):**

| Documento | Azione |
|---|---|
| `docs/decisions/0020-multi-method-authentication.md` | **Nuovo ADR 0020** (multi-method auth: email+verifica, passkey, OIDC GitHub/Google opzionale) — aggiorna ADR 0013; AUTH_OPTIONS/COMMUNITY_PLAN/PRIVACY_AND_SAFETY allineati |
| `docs/legal/PRIVACY_NOTICE.md` → **v0.10** | Nuova sezione **§ 3.1 "How you authenticate"** (3 metodi; passkey vendor note; OIDC tracking disclosure); righe § 3 (token verifica, passkey, recovery codes, attributi OIDC — mai email); § 5 GitHub/Google condizionali + Cloudflare Email Routing; § 6 trasferimenti (OIDC US/DPF, sync passkey); § 7 R15; § 10 gate attivazione OIDC |
| `docs/TERMS_OF_USE.md` → **v0.6** | **§ 3.7 metodi di autenticazione**: verifica email obbligatoria per write access (sessione read-only finché non verificata); passkey vendor note; OIDC opt-in + tracking disclosure; § 15 open item gate OIDC |
| `docs/legal/PROCESSOR_REGISTER.md` | PR1 esteso a **Cloudflare Email Routing** (zero nuovi terzi: stessa DPA); **PR5/PR6 GitHub/Google condizionali** (dormienti finché OIDC non attivato: DPA + EU–US DPF; nessuna email importata) |
| `docs/legal/RETENTION_SCHEDULE.md` | **R15 — dati autenticazione**: token verifica 24 h single-use; passkey/recovery codes finché account attivo, hard-delete all'erasure |

---

## 6. Requisiti i18n/design

Fonte: Eva (t_290dce27), Vera (t_c9a9ca46), Marie (t_2acb8f70).

### 6.1 Terminologia congelata (prerequisito QA #1)

| Concetto | EN (pilot) | IT | Vietato |
|---|---|---|---|
| Livelli | Trust levels | Livelli di fiducia | tiers, rank, XP, punti |
| Verifiche (stelline) | Verifications | Verifiche | stars, badges, upvotes |
| Conferma esistenza | Verification | Verifica | like, confirm (solo) |
| Badge | New/Trusted/Experienced contributor | Nuovo/Contributor fidato/Contributor esperto | Pro, Expert, Master, VIP |
| Abuso | Report abuse | Segnala abuso | flag generico |
| Modifica contributo | Edit contribution | Modifica contributo | update/change |
| Contributo | Contribution | Contributo | segnalazione (qui) |

Fix preesistente: auth.ts IT usa "contributore", manifesto IT usa "contributor" →
**uniformare su "contributor" PRIMA** di aggiungere stringhe nuove (test parity lo beccherebbe).
"Community" resta invariato in IT. Plurale: "1 verifica / 3 verifiche / 0 verifiche".

### 6.2 Microcopy (golden, da Eva — usare nei test come fixture)

Tutte le stringhe chiave EN/IT affiancate sono nel parere copy (commento task #814):
profilo ("Your contributions/I tuoi contributi", edit/save/cancel), verifiche ("Confirm this
record exists/Conferma che questo record esiste", "Remove verification/Rimuovi verifica"),
abuso, livelli ("You are a trusted contributor/Sei un contributor fidato"), empty states,
errori, conferme distruttive. **Bundle nuovo `community.ts`** in `app/lib/i18n/` con `en`
pilot + `it` type-checked `Translation<typeof en>`, registrato in `index.ts` (ADR 0007).
Valutare keys in `auth.ts`/`record.ts` per le stringhe di dominio già coperte (decisione con
la PR i18n).

### 6.3 Design (Vera)

| # | Decisione |
|---|---|
| C1 | Livelli: label testuale `.card-topline` + dot esistente, **max 3 badge**, niente punti esposti; riga testuale di progresso, mai barra |
| C2 | Verifiche = "conferma avvistamento" (toggle), non like/voto |
| C3 | Verifiche **solo nel record detail**, mai in card/directory/home |
| C4 | Conferma / correzione / abuso = **3 azioni separate** (toggle stella; `/correggi?record=ID`; `/correggi?record=ID&type=abuse`) |
| C5 | Abuso convoglia in `/correggi?type=abuse` → moderazione esistente |
| C6 | Profilo = estensione `/account`, filtri stato locali (no URL) |
| C7 | Editing = pagina dedicata `/records/[id]/edit`, non inline |
| C8 | Edit displayName inline ok (campo profilo) |
| C9 | Micro-interactions: `aria-pressed` + cambio colore sobrio; **niente count-up, toast, burst, suoni** |
| C10 | Bundle `community.ts` EN/IT, zero gergo |

Componenti nuovi: **`StarConfirmButton`** (~40 righe: button nativo, stella SVG inline,
contatore, `aria-pressed`, `aria-live=polite`, target ≥44px, `prefers-reduced-motion`).
Token nuovi: **nessuno** (riuso `--status-verified`/`--status-community`, D6/D7).

### 6.4 Docs (Marie)

- **Nessun nuovo `docs/USER_GUIDE.md`**: /guide resta l'unica guida utente (regola SITEMAP).
- `docs/SITEMAP.md` aggiornato **PRIMA del codice**: `/account/contributions` (kebab-case,
  noindex, mapping bundle auth), spec `/records/[id]` (widget verifiche + `community`),
  `/records/[id]/edit` (privata, auth-gated).
- `/guide` esteso: account, modifica contributi (re-moderation), verifiche, livelli.
- `/faq` esteso: 4–6 Q&A ("Do I need an account?", "What are verifications?", "Can I edit my
  contribution?", "What are contributor levels?", "What happens to my stars if I delete my
  account?").
- `docs/decisions/0018-…` ADR nuovo; `DATA_DICTIONARY` con i contratti finali;
  `REFACTOR_I18N` tabella bundle; `PRODUCT_UX` journey "verifica e gestisci i contributi";
  `CHANGELOG` voce per ogni PR.

---

## 7. Piano di implementazione a fasi

**Vincolo CTO: una PR per fase, CI verde, review Ada + approve QA. Le fasi backend sono
sequenziali (dipendono l'una dall'altra); le fasi docs/legal/i18n girano in parallelo.**
Stima: 1-2 giorni/fase, ~2-3 sprint totali. Zero librerie nuove.

| Fase | Contenuto | Task kanban | Assignee | Priorità | Dipende da |
|------|-----------|-------------|----------|:---:|------------|
| **C-ADR** | ADR 0018 (conferme+livelli+editing+doppia identità) + SITEMAP route nuove prima del codice | `t_5dc6835a` | marie | 1 | — |
| **C-legal** | PRIVACY_NOTICE v0.8 + TERMS v0.4 + R14 + MODERATION edit + LIA + mini-informativa | `t_ded5f671` | rosa | 1 | — |
| **C-i18n** | Bundle `community.ts` + fix contributore/contributor + golden Eva nei test | `t_f0e2a3ab` | marie | 1 | — |
| **C1** | Backend schema+conferme+erasure: migrazioni 0020-0023, PUT/DELETE/GET confirmation, eraseContributor esteso, confirmationCount, anti-gaming quota D1, test | `t_46fbfaf4` | linus | 2 | C-ADR |
| **C2** | Backend profilo: GET /api/auth/me/contributions paginato + level nel meta + deriveLevel, test | `t_9480e6bc` | linus | 2 | C-ADR, C1 |
| **C3** | Backend edit-flow: PATCH /api/cameras/[id] a due binari + camera_edit_requests + entity camera_edit moderation + CSRF/rate-limit, test | `t_6abcdf55` | linus | 2 | C-ADR, C1 |
| **C4** | Backend whitelist issue_type su /api/corrections + dedupe + contributor_id, test (breaking change) | `t_92a83025` | linus | 2 | C-ADR, C1 |
| **C5** | Frontend profilo contributi: /account esteso (badge, riga progresso, filtri locali, lista paginata) + StarConfirmButton nel record detail, test | `t_46debd92` | linus | 3 | C2, C-i18n |
| **C6** | Frontend edit: /records/[id]/edit pagina dedicata + stato edit-request, test | `t_0079c980` | linus | 3 | C3, C-i18n |
| **C-docs** | /guide + /faq estesi + PRODUCT_UX + DATA_DICTIONARY + REFACTOR_I18N | `t_a4c983a1` | marie | 3 | C1, C2 |
| **C-QA** | QA trasversale: suite anti-gaming.test.mjs 1:1 sui 6 layer, axe-core 0, parity i18n, criteri P/E/L/V/A | `t_8f2d89ac` | grace | 4 | C1, C2, C3, C4 |

**Nota allocazione:** le fasi frontend sono assegnate a linus (unico developer full-stack nel
board, come per FRONTEND_PLAN F1–F4). Se il carico lo richiede, ada può supportare la review
continua; le fasi C5/C6 possono essere parallelizzate dopo C2/C3 solo se il dispatcher non
satura linus (in tal caso il PM riprogramma le priorità).

**Sequencing consigliato:** C-ADR + C-legal + C-i18n in parallelo → C1 (dopo C-ADR) →
C2/C3/C4 → C5/C6 → C-docs + C-QA.

---

## 8. Criteri di accettazione

Fonte: Grace (t_45ff2bfd) + pattern FRONTEND_PLAN §7.

### 8.1 Globali (bloccanti per ogni PR)

1. **CI verde 5/5** (lint, test, coverage, build, security) su ogni PR.
2. **Test nuovi nella stessa PR** (mai in PR separate).
3. **Vincoli DB testati a livello DB** (SQL direct + race), non solo API.
4. **Anti-gaming deterministico**: clock iniettato, zero dati reali, zero test tempo-reali.
5. **axe-core 0 criticità/serie + parity i18n EN/IT** su ogni nuova route.
6. **Erasure estesa testata PRIMA del merge della PR schema**.
7. **Review CTO (Ada) + approve QA (Grace) prima del merge** (unico merge: Ada).

### 8.2 Per area (sintesi; dettaglio completo nel parere QA #821)

| Area | Criteri chiave |
|---|---|
| **Profilo (P1–P8)** | 401 anonimo/200 autenticato; solo dati propri (cross-account 400); paginazione invalida mai 500; filtri whitelist 400; `no-store`; profilo pubblico opt-in senza email/coordinate/foto non approvate nel DOM; opt-out reversibile; empty state |
| **Editing (E1–E11)** | owner pending → 200 + audit; non-owner/anonimo/moderatore non-owner → 403/401; verified → 202 edit-request → approve/reject idempotente + `edit_applied`; removed → 409; campi non editabili 400 per-campo senza effetti parziali; CSRF; no-op senza evento; race 409; rate-limit 429; erasure de-attribuisce |
| **Livelli (L1–L8)** | boundary 0/1/4/5/19/20/49/50/51; solo verified conta; monotonia up E down; soglie in un const; sempre server-side; **nessun endpoint espone livelli altrui/globali**; erasure recalcola; funzione pura (niente cache in alpha) |
| **Verifiche (V1–V14)** | 201/409 toggle; UNIQUE a livello DB + race = 1 riga; DELETE 200/404; self-verify 403; pending/removed 404; L0 403 + bottone disabilitato; cap giornaliero 20→21° 429 + reset finestra; cap per-record 6° 429; IP-hash burst → alert con callerHash; header cache (300/600 vs no-store); staleness ≤5min; decay a `review_due_at`; CSRF+rate-limit; count GROUP BY IN, niente N+1 |
| **Abuso (A1–A7)** | whitelist issue_type 201/400; **mai free-text per removal/abuse**; removal/abuse → moderateCorrection + eventi; anonimo permesso ma rate-limitato; **dedupe 409**; rimozione approvata → edit owner bloccato + appeal possibile; input-limits |

### 8.3 Casi limite espliciti (QA §2)

- Utente X modifica contributo di Y → 403 anche con id manipolato; X moderatore → 403 (tranne
  se owner).
- Stelline da account nuovi → gate L1 (≥1 contributo verificato). La verifica email è un
  requisito di *write access* separato (Fase E1, ADR 0020 § 2), non del gate conferme.
- Editing verified → re-moderation; una riga open per entità (`moderation_queue_open_unique`);
  approve idempotente.
- Confidence score: division-by-zero (0 conferme + 0 rimozioni → NaN) test esplicito.
- Spoofing `x-osdb-user-email` sugli endpoint community → edge lo strippa (estendere test
  contratto edge, pattern ADR 0014).

### 8.4 Docs/i18n/a11y

- SITEMAP aggiornato come parte della PR (route listate prima del codice).
- Bundle `community.ts` con parity EN/IT type-checked; zero stringhe hardcoded nell'HTML IT.
- Toggle `aria-pressed` + accessible name localizzato + `aria-live=polite`; badge mai solo
  colore; form edit con `aria-invalid`/`aria-describedby` (chiude gap QA-2026-08-01-2/-3);
  paginazione con `aria-current`; 200% zoom/320px; reduced-motion.
- Coverage: soglia 75% righe mantenuta; ≥90% sui nuovi moduli community.

---

## Appendice: tracciabilità dei pareri

| Sezione del piano | Fonte primaria |
|-------------------|----------------|
| Scelta autenticazione | Ken (docs/AUTH_OPTIONS.md, PR #163) + ADR 0013 |
| Profilo + editing | Ada (t_e7e94d17) + Linus (t_25843be7) + Vera (t_c9a9ca46) |
| Livelli | Nora (t_f49b0226) + Linus (t_25843be7) + Eva (t_290dce27) |
| Verifiche/stelline | Nora (t_f49b0226) + Ada (t_e7e94d17) + Linus (t_25843be7) + Grace (t_45ff2bfd) |
| Legal/privacy | Rosa (t_9e11b89b) |
| i18n/design | Eva (t_290dce27) + Vera (t_c9a9ca46) + Marie (t_2acb8f70) |
| Fasi e criteri | Ada (stima 4 PR backend + frontend) + Grace (criteri) + pattern FRONTEND_PLAN |

## Punti aperti (decisione CEO/Angelina)

1. **Community verification path L4** (record con ≥3 conferme di livello ≥3 passano
   pending→verified senza moderatore): sconsigliato per alpha da Nora; richiede ADR + safeguard.
2. **Priorità di dispatch frontend**: se linus è saturo, C5/C6 slittano; nessun blocco
   funzionale ma la feature community è visibile solo a backend completo.
3. **AUTH_OPTIONS sequencing**: harden sessioni + TOTP (tattico) prima di passkey
   (strategico); il community system non ne dipende, ma la guida "come registrarsi" va
   riallineata alla scelta finale. → **Risolto 2026-08-02 (ADR 0020):** multi-method con
   verifica email (Fase A2/B) + passkey (Fase C) + OIDC GitHub/Google opzionale (Fase D);
   TOTP deferito; la guida "come registrarsi" si allinea alla pagina `/login` a 3 metodi
   (Fase E2).
