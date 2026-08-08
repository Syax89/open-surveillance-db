# COPY PIVOT COMMUNITY — sweep totale del copy stale (modello a moderazione umana → community-driven)

**Task:** t_43bd44c7 — PIVOT COMMUNITY — FASE FINALE: SWEEP COPY TOTALE (CEO 2026-08-04: «aggiornare il sito togliendo le info vecchie»)
**Autore:** Marie (Technical Writer)
**Data:** 2026-08-05
**Dipendenze soddisfatte:** ADR 0021 (PR #295), FASE 1 DB (PR #297), FASE 2 API (PR #299), FASE 3 UI (PR #305) — pivot su main @ d31f53c.

---

## 1. Metodo

1. **Recon**: grep su bundle i18n EN+IT, legali, template email, page.tsx e componenti con la famiglia stale
   (`moderator|moderatore|reviewed by a person|esaminato da una persona|review|revisione|coda|queue|pending|appeal|ricorso|submissions are private|invii restano privati|not published automatically|in moderazione|under review|awaiting|in attesa di`).
   Esito: **310 hit** (guida 44, report 22, rules 19, community 24, manifesto 17, directory 15, faq 7, correction 6, record 5, home 4, status 4, contact 2, map 1, bundles en/it 2, moderation.ts 85, moderazione.ts 51).
2. **Verifica di veridicità**: ogni stringa residua è stata confrontata con lo stato implementato su main
   (db/schema.ts, db/cameras.ts, db/community-actions.ts, app/api/cameras/[id]/actions/route.ts,
   app/api/cameras/[id]/events/route.ts, ADR 0021). NIENTE è stato riscritto se descriveva un comportamento
   ancora reale (foto in moderazione, modifiche ai record pubblicati, correzioni private, emergenza legale).
3. **Riscrittura** solo delle stringhe che descrivevano il vecchio flusso ormai ritirato.
4. **Verifica finale**: `tsc --noEmit` (parità strutturale EN/IT), build, suite i18n + community (161 test verdi).

## 2. Cosa NON è stato toccato (e perché — veridicità assoluta)

| Area | Motivo |
|---|---|
| `app/lib/i18n/moderation.ts` (84 hit residui) | Strumento locale di moderazione **residuale per emergenza legale** (ADR 0021 §8): esiste ancora su main, non linkato dal sito pubblico, non pubblica nulla da solo. La sua copy descrive la realtà. |
| `app/components/ModerationDashboard.tsx` (33 hit) | Dashboard dello stesso strumento locale residuo. Invariata. |
| `app/lib/legal/en.ts` / `it.ts` (34 hit residui) | Tutti i residui sono sensi diversi da quello stale: foto mai pubbliche senza moderazione (reale), identità dei moderatori legali (reale), «review» = riesame del documento / calendario di revisione accessibilità, «pending» = testing accessibilità non ancora eseguito. Già aggiornati a ADR 0021 dal run precedente (versioni 0.6/0.4). |
| Foto segnalazione (`report.ts` photoAdded/photoHelp, legali) | **SUPERSEDED (2026-08-08):** le foto sono state **rimosse integralmente** dal sistema per decisione CEO — `report.ts` non ha più chiavi photo, il form /segnala non raccoglie immagini e il legale descrive il sistema senza foto. La riga originale ("le foto restano…") era vera post-pivot ed è diventata falsa con la PR "remove photo upload". |
| Modifiche ai record pubblicati (`community.ts` editReview*, `guide.ts` editRemoderation*, `faq.ts` aEdit) | Le modifiche a record già pubblicati passano ancora dalla coda di moderazione (`moderation_queue` entità `camera_edit`) prima di sostituire il record. Vero post-pivot. |
| Correzioni private (`correction.ts` needsReview/consenso, `contact.ts`, `rules.ts` correctionBody) | Le richieste di correzione sono ancora private, esaminate da una persona, mai automatiche. Vero post-pivot. |
| Banner nascosto/rimosso (`record.ts` hiddenBody/removedBody, `guide.ts` reviewBody/pendingBody, `moderazione.ts` outcome*) | «Withdrawn pending community or legal verification» è la terminologia ADR 0021 §6.3. Vero. |
| Label di stato `pending`/`needs_review` (`status.ts`, `community.ts` status) | Stati residui reali: flussi legacy e modifica-in-revisione; usati nei filtri account del contributor. Vero. |
| `app/moderazione/page.tsx` | Pagina pubblica riscritta dal run precedente (bundle `moderazione.ts` ora spiega il modello community); solo il **commento header** era stale → aggiornato. |

## 3. Stringhe riscritte in questo run (prima → dopo → motivo)

### 3.1 `report.ts` — duplicato vicino (form /segnala)

| Chiave | EN prima | EN dopo | IT prima | IT dopo | Motivo |
|---|---|---|---|---|---|
| `duplicateConfirmBody` | A reviewed record at almost the same spot was found. | A record is already published at almost the same spot. | È stato trovato un record revisionato quasi nello stesso punto. | È già pubblicato un record quasi nello stesso punto. | Il duplicate gate (ADR 0019) segnala un record **già pubblicato**, non un record «revisionato»: la revisione umana non esiste più per il flusso normale. |

### 3.2 `record.ts` — pagina record + cronologia

| Chiave | EN prima | EN dopo | IT prima | IT dopo | Motivo |
|---|---|---|---|---|---|
| `recordNote` | This page contains only **reviewed** public records… | This page contains only **live** public records… | record pubblici **revisionati** | record pubblici **attivi** | La pubblicazione è immediata (ADR 0021 §1): non esistono più record «revisionati». «Live/attivi» = stato pubblico `active`. |
| `changeHistoryNote` | This history lists **reviewed changes** only. | This history lists **public events** only. | elenca solo le **modifiche revisionate** | elenca solo **eventi pubblici** | La timeline pubblica (ADR 0021 §7) elenca eventi del ciclo di vita (`published`, `confirmed`, `hidden`…), non modifiche revisionate. |
| `lastVerification` | Last verification | Last confirmation | Ultima verifica | Ultima conferma | Vocabolario ADR 0021: le «verifiche» sono diventate «conferme» (faq.ts già aggiornato nel run precedente). |
| `changeHistoryLabels.approve` | Approved and published | Published | Approvato e pubblicato | Pubblicato | Chiave legacy non più renderizzata (la timeline usa `timelineLabels`); allineata al nuovo vocabolario per coerenza se mai riattivata. |
| `changeHistoryLabels.mark-stale` | Marked for re-review | Flagged as no longer there | Segnalato per un nuovo riesame | Segnalato come non più presente | Idem: il ciclo verified→needs_review→stale è ritirato (ADR 0021 §5). |
| `changeHistoryLabels.reverify` | Re-verified | Re-verified | Riverificato | Riverificato | Invariato (la riverifica esiste ancora). |
| `changeHistoryLabels.hide` | Removed from public listing | Hidden | Rimosso dall'elenco pubblico | Nascosto | Allineato alla label di stato `hidden` ADR 0021 §6.3. |

### 3.3 `correction.ts` — form /correggi

| Chiave | EN prima | EN dopo | IT prima | IT dopo | Motivo |
|---|---|---|---|---|---|
| `correctionUnavailable` | The correction **queue** is unavailable. | The correction **service** is unavailable. | La **coda** delle correzioni non è disponibile. | Il **servizio** di correzione non è disponibile. | «Coda» appartiene alla famiglia stale; il servizio di correzione è un intake privato, non una coda di moderazione. |

### 3.4 `community.ts` — stringhe morte con copy stale

| Chiave | EN prima | EN dopo | IT prima | IT dopo | Motivo |
|---|---|---|---|---|---|
| `deleteContributionBody` | …removed from the public directory **and sent to moderation**. | …removed from the public directory. | …rimosso dall'elenco pubblico **e inviato in moderazione**. | …rimosso dall'elenco pubblico. | Chiave non renderizzata (nessun consumer nei componenti) ma la copy citava l'invio in moderazione, flusso ritirato. |
| `abuseReportThanks` | Thank you. **A moderator will review this verification.** | Thank you. **Your report has been recorded.** | Grazie. **Un moderatore esaminerà questa verifica.** | Grazie. **La tua segnalazione è stata registrata.** | Chiave non renderizzata; prometteva una revisione da moderatore che nel modello community non esiste più per le verifiche/conferme. |

### 3.5 `moderazione.ts` — parola bandita

| Chiave | IT prima | IT dopo | Motivo |
|---|---|---|---|
| `safeguardPairBody` | …account **contributore** verificato… | …account **contributor** verificato… | Vincolo task «niente contributore IT» — il test `community-i18n.test.mjs` (no "contributore" nei bundle IT) falliva su questa stringa. |

### 3.6 `app/moderazione/page.tsx` — commento stale

Il commento header descriveva ancora la pagina come «How moderation works / review flow, appeals and corrections, moderator safeguards»: aggiornato per descrivere il contenuto reale (modello community ADR 0021, pubblicazione immediata, soglie automatiche, cronologia pubblica, emergenza legale residua).

## 4. Verifiche

| Verifica | Esito |
|---|---|
| `npx tsc --noEmit` (parità EN/IT `Translation<typeof en>`) | PASS |
| `npm run build` | PASS |
| `tests/community-i18n.test.mjs` + `tests/i18n-pages.test.mjs` | 13/13 PASS |
| `client-record-page`, `client-community-actions`, `community-actions`, `community-thresholds`, `community-pivot-fase1`, `client-moderation-dashboard`, `i18n-registry`, `legal-pages`, `navigation-pages`, `pages-render` | 148/148 PASS |

## 5. Note

- I bundle `guide.ts`, `faq.ts`, `manifesto.ts`, `rules.ts`, `directory.ts`, `home.ts`, `legal/en.ts`, `legal/it.ts` e la pagina pubblica `moderazione.ts` erano già stati riscritti dai run precedenti (1560/1563, interrotti per budget di iterazioni): questo run li ha verificati contro l'implementazione e completato la sweep sulle stringhe residue.
- Il task richiedeva una tabella prima→dopo→motivo per ogni pagina: la tabella completa per i bundle riscritti nei run precedenti è in `docs/design/copy-finale.md` e nel diff della PR; qui è documentato il delta di questo run.
- `email-templates.ts` e le meta description: **zero hit stale** sia nella recon sia nel re-grep (nessuna modifica necessaria).
