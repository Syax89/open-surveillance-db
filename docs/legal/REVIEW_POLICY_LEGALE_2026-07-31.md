# Revisione legale/privacy — PRIVACY_AND_SAFETY.md, OPEN_SOURCE.md, MODERATION.md

**Oggetto:** review policy in ottica pubblicazione e hosting test
**Autore:** Rosa (DPO / Legal & Privacy Officer)
**Data:** 2026-07-31
**Riferimenti:** repo `Syax89/open-surveillance-db` @ main (docs/, LICENSE, SECURITY.md, README.md, DATA_MODEL.md, ADR 0001, db/cameras.ts, app/api/cameras/route.ts, app/chatgpt-auth.ts, tests/)

---

## 1. Sintesi

I tre documenti sono di buon livello e coerenti tra loro: definiscono un confine pubblico/privato netto (ADR 0001), la pubblicazione per-campo opt-in, e rinviano correttamente i deliverable legali al pre-launch. L'implementazione rispetta il confine dichiarato (query pubblica solo `verified`/`demo`; `manufacturer`/`observedOn` soppressi senza flag; test automatici sul confine). **Tuttavia:** (a) ho trovato un leak reale nel JSON API (`notes` esposto per i record pubblici, incoerente con il data model e con la policy), (b) l'hosting test ha due rischi critici (pannello `/moderation` senza autenticazione, POST senza rate limit), (c) mancano deliverable legali che le stesse policy dichiarano necessari (retention schedule, privacy notice, lawful-basis assessment, registro processor).

Verdetto: le policy sono pronte come documento di progetto; **non** bastano da sole per il lancio pubblico. Hosting test consentito solo con le mitigazioni della sezione 3.

---

## 2. Findings per documento

### 2.1 PRIVACY_AND_SAFETY.md

| # | Livello | Finding | Base normativa |
|---|---------|---------|----------------|
| P1 | Alta | La retention è citata ("published retention schedule") ma non esiste alcun documento con termini concreti. Serve una retention schedule con valori operativi: `pending` non verificato → cancellazione (propongo 90 gg); `rejected` → 30 gg; record verificati → legati al ciclo di revisione; richieste di correzione → durata audit (2 anni); evidence → legata al record di riferimento. | GDPR art. 5(1)(e), 17 |
| P2 | Alta | Nessuna procedura di notifica data breach. Il progetto detiene pending submissions + evidence: un incidente espone dati potenzialmente sensibili (posizioni, note, identità contributori). Serve procedura art. 33/34 + contatto. | GDPR art. 33, 34 |
| P3 | Alta | Nessuna previsione su basi giuridiche concrete. Il doc cita giustamente la "lawful-basis analysis per giurisdizione" come pre-requisito, ma va schedulata come deliverable con deadline: per l'UE la base naturale è art. 6(1)(f) (legittimo interesse di trasparenza civica) o 6(1)(e) (interesse pubblico), con balancing test documentato per il caso d'uso "pubblicazione di posizioni di infrastruttura visibile". | GDPR art. 6(1)(e), 6(1)(f), 5(2) |
| P4 | Media | Nessun impegno esplicito alla pseudonimizzazione dei contributori. DATA_MODEL dice "pseudonymous internal ID where possible": la policy deve renderlo un requisito, non un'opzione. | GDPR art. 25(1), 4(5) |
| P5 | Media | Trasferimenti internazionali non coperti: hosting Cloudflare (D1) e identità via ChatGPT/OpenAI (vedi 2.4). Serve valutazione Cap. V GDPR: DPA con sub-processor, SCC, eventuale data residency UE. Con soli data demo il rischio è basso, ma va dichiarato per iscritto. | GDPR art. 28, Cap. V |
| P6 | Bassa | Manca il contatto dati/DPO e le regole di esercizzione diritti: verifica identità del richiedente, tempi di risposta (1 mese, art. 12(3)), formato della risposta. | GDPR art. 12, 13, 14 |

### 2.2 OPEN_SOURCE.md

| # | Livello | Finding | Azione |
|---|---------|---------|--------|
| O1 | Media | `package.json` non coerente con la licenza dichiarata: `"name": "site-creator-vinext-starter"` (nome template) e nessun campo `license`. Chi scarica da npm/Wrangler non vede AGPL. | Fix: `name: "open-surveillance-db"`, `license: "AGPL-3.0-or-later"`, `repository` + `homepage`. |
| O2 | Media | ODbL 1.0 ok come scelta, ma le esportazioni CSV/GeoJSON non trasportano notice di attribuzione né link al database sorgente (requisito ODbL per produced works). Anche i record `demo` fanno parte del DB: chiarire che rientrano nel perimetro ODbL. | Aggiungere header/metadata license nelle export; nota in `docs/`; campo `source` già presente aiuta la provenienza. |
| O3 | Bassa | Inbound licensing ambiguo: CONTRIBUTING dice "grant the rights needed" — per AGPL il modello più semplice e auditabile è **DCO** (Developer Certificate of Origin) o dichiarazione esplicita inbound=outbound. | Aggiungere sezione DCO in CONTRIBUTING.md. |
| O4 | Bassa | LICENSE short-form con link (SPDX style) è accettabile; per distribuzioni binary/npm conviene il testo integrale. | Opzionale: testo integrale AGPL in `LICENSE`, NOTICE per OSM/ODbL. |

### 2.3 MODERATION.md

| # | Livello | Finding | Azione |
|---|---------|---------|--------|
| M1 | Alta | Nessuna SLA per emergenze/takedown. La policy dice "temporarily hidden while reviewed" senza tempi. | Proposta: hide entro 24 h per segnalazioni urgenti; prima risposta alle richieste entro 48 h; risposta sostanziale entro 14 gg (compatibile art. 12(3)); riesame degli hide temporanei entro 30 gg. |
| M2 | Media | L/appello va deciso da persona diversa dal moderatore originale (indipendenza). Non è specificato. | Aggiungere requisito di indipendenza + escalation all'advisory circle. |
| M3 | Media | Audit log: definire il contenuto minimo (decisione, reason code, timestamp, reviewer pseudonimo) e la retention — oggi allineato a niente. | Definire in accordo con la retention schedule (P1). |
| M4 | Media | Privacy dei moderatori: se l'accesso passa da ChatGPT auth (email/nome completo negli header `oai-authenticated-user-*`), OpenAI è processor/terzo che vede identità dei moderatori. Va nel registro sub-processor e nella privacy notice; mai loggare email nei log applicativi. | Inserire nel registro processori + nota privacy. |
| M5 | Bassa | "Trained moderator" non definito; niente playbook per giurisdizione (es. Italia: Codice Privacy D.Lgs. 196/2003; Germania: molto restrittiva). | Definire training minimo; playbook per le prime 2-3 giurisdizioni. |

### 2.4 Fattori trasversali (non documentati in policy ma rilevanti)

- **Identità/autenticazione:** `app/chatgpt-auth.ts` definisce un flusso "signin-with-chatgpt" (identità via account ChatGPT/OpenAI) ma non è collegato a nessuna pagina: il pannello `/moderation` è **senza autenticazione** (confermato da README e da grep). Lo scaffold auth esiste: va completato o rimosso prima di ogni hosting.
- **Analytics/tracking:** nessuna libreria di analytics presente (ok, coerente con la policy "without behavioural advertising").
- **Segreti:** `.gitignore` esclude `.env*` (ok); `.openai/hosting.json` è innocuo (nessun segreto).

---

## 3. Hosting test — rischi specifici e mitigazioni

Ordine di severità (da risolvere PRIMA di rendere raggiungibile l'host):

| # | Livello | Rischio | Mitigazione |
|---|---------|---------|-------------|
| H1 | **Critico** | `/moderation` senza autenticazione: chiunque raggiunga l'host vede pending records, note, richieste di correzione e tool di moderazione. | Deploy di test SOLO su rete privata/VPN, oppure basic auth o IP allowlist. Vietato su URL pubblico senza auth. |
| H2 | **Alto** | `POST /api/cameras `senza rate limit né auth: su host pubblico diventa spam/farming e potenziale flooding DB. | Rate limiting (es. per IP), oppure disabilitare la rotta in test; CAPTCHA/turnstile prima di accettare segnalazioni reali. |
| H3 | **Alto** | `GET /api/cameras` (JSON) espone `notes` per i record `verified`/`demo` — campo di intake libero fino a 1000 char, NON previsto tra i campi publlici di DATA_MODEL (che elenca solo `description` "after review") e non presente in CSV/GeoJSON. Incoerenza API vs policy: contenuto non rivisto che diventa pubblico. | Fix in `db/cameras.ts` (rimuovere `notes` dalla public query) + test di confine. |
| H4 | Media | Gli errori 503/500 restituiscono `error.message` grezzo: può leakare dettagli interni (path, stack, nomi binding) su host pubblico. | Log dettagliti server-side; risposta generica al client. |
| H5 | Bassa | Tile OSM da `tile.openstreetmap.org` ok per test, non per produzione (già documentato in OSM_INTEGRATION.md). | Confermare provider conforme prima del launch. |
| H6 | Bassa | In test, `NEXT_PUBLIC_SITE_URL deve restare assente o puntare a valore non-prod (già in DEPLOYMENT.md). | Verifica in staging. |

Nota: con soli dati demo e accesso privato, l'hosting test è compatible con le policy attuali; **non** caricare dati reali in alcun ambiente di test (già vietato da DEPLOYMENT.md/SECURITY.md).

---

## 4. Azioni raccomandate (ordinate)

1. **Pre-host-test (bloccanti):** fix H3 (notes), H1 (auth/rete), H2 (rate limit o rotta disabilitata), H4 (errori generici). → task codice, assignee: **ada**.
2. **Pre-launch (già dichiarati dalle policy come necessari):** privacy notice; lawful-basis assessment per giurisdizione (P3); retention schedule con valori concreti (P1); terms of use; percorso correzione/rimozione con SLA (M1); registro processor/sub-processor con DPA/SCC per Cloudflare e OpenAI auth (P5, M4); procedura breach (P2); DCO (O3); package.json license (O1); ODbL notice nelle export (O2). → task drafting legale, assignee: **rosa** (run successiva).
3. **Governance:** ADR per retention schedule e scelta hosting provider; aggiornare le tre policy con gli esiti di questa review (possibile PR congiunta docs, assignee **marie** o rosa).

---

## 5. Riferimenti normativa principali

- GDPR (UE) 2016/679: art. 5, 6, 12, 13, 14, 17, 25, 28, 33, 34, Cap. V.
- ODbL 1.0 (Open Data Commons); CC BY-SA 4.0; AGPL-3.0-or-later; OSM tile usage policy.
- D.Lgs. 196/2003 (Codice Privacy, IT) come riferimento giurisdizione primaria.
