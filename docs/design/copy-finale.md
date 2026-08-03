# COPY FINALE — audit completo del copy frontend (EN + IT)

**Task:** t_ee3adc33 — COPY FINALE frontend (CEO: «scritte in frontend che siano quelle finali, rivalutarle tutte e aggiornarle al meglio»)
**Autore:** Vera (Designer UX/UI)
**Data:** 2026-08-03
**Scope:** 19 bundle i18n (`home, map, directory, report, correction, status, guide, manifesto, moderazione, faq, contact, rules, record, moderation, auth, community, errors, footer, common`) + `app/lib/legal/en.ts` + `app/lib/legal/it.ts` + `app/lib/email-templates.ts`

**Vincolo rispettato:** NESSUNA nuova chiave — solo contenuto. La parità strutturale EN/IT (`Translation<typeof en>`) è garantita dal typecheck; nessuna firma di funzione è cambiata.

---

## 1. Metodo e criteri

Per ogni stringa ho valutato quattro assi, in ordine:

1. **Veridicità** rispetto allo stato implementato (write gate ADR 0020 d.1, route tool separate F1, de-prototipizzazione CEO 2026-08-02, multi-metodo auth Fase E2).
2. **Tono manifesto** — chiarezza, fiducia, sobrietà; mai allarmismo, mai estetica "poliziesca".
3. **IT naturale** — niente anglicismi forzati, accordi di genere corretti.
4. **EN pulita e coerente** — ortografia britannica pilota (`licence plates`, `prioritised`), coerenza terminologica cross-bundle.

## 2. Esito sintetico

| Area | Esito |
|---|---|
| Bundle già finali, nessuna modifica | `common`, `status`, `errors`, `footer`, `directory`, `report`, `correction`, `manifesto`, `moderazione`, `rules`, `record` (EN), `community` (EN), `email-templates` (EN+IT) |
| Bundle con modifiche di copy | `home`, `map`, `guide`, `faq`, `contact`, `record` (IT), `moderation`, `auth`, `community` (IT) |
| Legali (`legal/en.ts` + `legal/it.ts`) | Audit completato, **contenuto invariato** — vedi §4 (segnalazioni) |
| Test aggiornati | `tests/community-i18n.test.mjs`, `tests/client-moderation-correction-associate.test.mjs` |
| Stringhe placeholder/dev trovate | **Zero** nei bundle, nei legali e nei template email |

---

## 3. Tabelle delle modifiche (prima → dopo → motivo)

### 3.1 `home.ts` — hero hub (3 chiavi × 2 lingue)

| Chiave | EN prima | EN dopo | IT prima | IT dopo | Motivo |
|---|---|---|---|---|---|
| `prototypeStats` (aria-label) | Prototype database statistics | Database statistics | Statistiche del database prototipo | Statistiche del database | La mappa non è più presentata come prototipo (feedback CEO 2026-08-02, commento in `map.ts`); l'aria-label del blocco statistiche deve descrivere dati reali, non il frame prototipo. |
| `accountsRequired` | accounts required | accounts needed to browse | account richiesti | account necessari per navigare | **Falso prima della modifica**: il write gate (ADR 0020 d.1, `WriteGateWall` su /segnala e /correggi) richiede un account verificato per inviare; "0 accounts required" prometteva il contrario. La scritta finale dichiara la verità: navigare non richiede account. |
| `openPrototype` | open prototype | open source | prototipo aperto | open source | "100% open prototype" era un anglicismo ambiguo (un prototipo "aperto"?). "100% open source" è la scritta finale: software AGPL-3.0 + dati ODbL 1.0. |

### 3.2 `map.ts` — fallback API (1 chiave × 2 lingue)

| Chiave | EN prima | EN dopo | IT prima | IT dopo | Motivo |
|---|---|---|---|---|---|
| `apiUnavailable` | The public API is not available yet, so the prototype is showing illustrative records. | The public API is temporarily unreachable, so the map is showing illustrative records. | L'API pubblica non è ancora disponibile: il prototipo mostra record illustrativi. | L'API pubblica è temporaneamente non raggiungibile: la mappa mostra record illustrativi. | Il messaggio compare su errore transitorio (`onError` di `usePublicCameras`), non perché l'API non esista: "not available yet" era impreciso. Inoltre reintroduceva il frame prototipo rimosso per volere del CEO; "the map" è il soggetto vero. |

### 3.3 `guide.ts` — sezione account (4 chiavi × 2 lingue + 1 EN)

| Chiave | EN prima | EN dopo | IT prima | IT dopo | Motivo |
|---|---|---|---|---|---|
| `accountBody` | An account is optional. It lets you keep track… | A free, verified account is required to submit reports and corrections. It also lets you keep track… | L'account è facoltativo. Ti permette di tenere traccia… | Per inviare segnalazioni e correzioni serve un account gratuito e verificato. Ti permette anche di tenere traccia… | Veridicità col write gate: l'account non è più "facoltativo" per chi vuole contribuire. Il nuovo incipit risponde direttamente al titolo "Why create an account?". |
| `accountHowBody` | …The login method may change before launch; this guide will be updated to match the final choice. | …You can also sign in with a passkey or a social account; when you add a passkey you receive 10 one-time recovery codes. | …Il metodo di accesso può cambiare prima del lancio; questa guida verrà aggiornata in base alla scelta finale. | …Puoi anche accedere con una passkey o con un account social; quando aggiungi una passkey ricevi 10 codici di recupero monouso. | Il multi-metodo è implementato (Fase E2, ADR 0020): password + passkey + OIDC. "may change before launch" era un residuo di incertezza superata; la guida ora documenta la realtà. |
| `accountAnonymousTitle` | Anonymous remains possible | Browsing stays anonymous | L'anonimato resta possibile | La navigazione resta anonima | Il titolo prometteva l'invio anonimo, non più possibile; "la navigazione resta anonima" è la promessa vera e ha lo stesso peso di rassicurazione. |
| `accountAnonymousBody` | You can still submit a report or a correction without an account. An account adds attribution…; it is never required to participate. | You can browse the map, the directory and every public record without an account. An account is required only to submit reports and corrections; it adds attribution… | Puoi comunque inviare una segnalazione o una correzione senza account. L'account aggiunge attribuzione…; non è mai obbligatorio per partecipare. | Puoi consultare la mappa, l'elenco e ogni record pubblico senza account. L'account serve solo per inviare segnalazioni e correzioni; aggiunge attribuzione… | Stessa correzione di veridicità, applicata al corpo del paragrafo. |
| `geoJsonBody` | …compatible mapping tools—not for finding… | …compatible mapping tools — not for finding… | (invariato) | (invariato) | Coerenza tipografica: l'em-dash senza spazi era l'unico caso nel codebase (tutti gli altri usano " — "). |

### 3.4 `faq.ts` — correzioni e account (3 chiavi × 2 lingue)

| Chiave | EN prima | EN dopo | IT prima | IT dopo | Motivo |
|---|---|---|---|---|---|
| `aCorrect` | Use the private correction form on the home page ("Correct a record or raise a concern") or write to… | Use the private correction form, or write to… | Usa il modulo privato di correzione nella home page ("Correggi un record o segnala un problema") oppure scrivi a… | Usa il modulo privato di correzione oppure scrivi a… | **Stale**: dalla F1 il form di correzione vive su /correggi, non nella home (la home è un hub senza form — `app/page.tsx`). La citazione del titolo era inoltre disallineata in IT ("segnala un problema" vs `correctionTitle` "segnala una criticità"); rimossa la citazione, resta il CTA dedicato. |
| `aAccount` | No. Browsing, reporting a camera and sending a correction all work without an account. An account is optional… | Browsing works without an account. Submitting a report or a correction requires a free, verified account, which also adds attribution… | No. Consultare, segnalare una telecamera e inviare una correzione funzionano anche senza account. L'account è facoltativo… | Per consultare, no. Per segnalare una telecamera o inviare una correzione serve un account gratuito e verificato, che aggiunge anche l'attribuzione… | Veridicità col write gate: "reporting works without an account" era falso. La nuova risposta distingue esplicitamente consultazione (libera) da contributo (account). |
| `moreBody` | …use the correction form on the home page or the contact page. | …use the correction form or the contact page. | …usa il modulo di correzione nella home page o la pagina dei contatti. | …usa il modulo di correzione o la pagina dei contatti. | Stale (stesso motivo di `aCorrect`). |

### 3.5 `contact.ts` — correzioni e ruoli (2 chiavi × 2 lingue)

| Chiave | EN prima | EN dopo | IT prima | IT dopo | Motivo |
|---|---|---|---|---|---|
| `correctionBody` | Use the private correction form on the home page, or write to the privacy contact. | Use the private correction form, or write to the privacy contact. | Usa il modulo privato di correzione nella home page oppure scrivi al contatto privacy. | Usa il modulo privato di correzione oppure scrivi al contatto privacy. | Stale: il form è su /correggi (stesso motivo di faq `aCorrect`). |
| `roleMaintainersBody` | Simone (syax89) and Ada (CTO). Ada is the sole merge authority. | Simone (syax89) and Ada (CTO). Ada is the only person who can merge code changes. | Simone (syax89) e Ada (CTO). Ada è l'unica autorità di merge. | Simone (syax89) e Ada (CTO). Ada è l'unica persona autorizzata a fare il merge del codice. | "sole merge authority" è gergo dev su una pagina pubblica "Chi siamo": la perifrasi spiega il ruolo senza perdere precisione. "unica autorità di merge" → "unica persona autorizzata a fare il merge del codice" mantiene il tecnicismo necessario ma è più chiaro. |

### 3.6 `record.ts` — form di modifica (2 chiavi, solo IT)

| Chiave | IT prima | IT dopo | Motivo |
|---|---|---|---|
| `editObservedOn` | Data osservata (facoltativo) | Data osservata (facoltativa) | Accordo di genere: "data" è femminile. |
| `editDescription` | Descrizione (facoltativo) | Descrizione (facoltativa) | Accordo di genere: "descrizione" è femminile. |

### 3.7 `moderation.ts` — dashboard moderazione (vocabolario + ID)

Tool privato, ma stessa disciplina di copy. Due famiglie di problemi: vocabolario non allineato e grafia di "ID".

| Chiave | Prima | Dopo | Motivo |
|---|---|---|---|
| `recordId` (EN) | Record id | Record ID | Coerenza con tutti gli altri bundle ("Record ID" / "ID record"). Il test `client-moderation-correction-associate` è stato aggiornato di conseguenza. |
| `recordIdHelp` (EN) | …the id of the record this request relates to. | …the ID of the record this request relates to. | Idem. |
| `associateRequiresCameraId` (EN) | Enter the record id to link… | Enter the record ID to link… | Idem. |
| `invalidRecordId` (EN) | Enter a positive integer record id. | Enter a positive integer record ID. | Idem. |
| `recordIdHistoryHelp` (EN) | The id of the record to inspect. | The ID of the record to inspect. | Idem. |
| `historyNotFoundText` (EN) | No record exists with this id. Check the id and try again. | No record exists with this ID. Check the ID and try again. | Idem. |
| `cameraReport` (IT) | Segnalazione videocamera | Segnalazione telecamera | Vocabolario unico: ogni altro bundle usa "telecamera"; "videocamera" era l'unica occorrenza. |
| `pendingReports` (IT) | Segnalazioni di videocamere in attesa | Segnalazioni di telecamere in attesa | Idem. |
| `noPendingTitle` (IT) | Non ci sono segnalazioni di videocamere in attesa. | Non ci sono segnalazioni di telecamere in attesa. | Idem. |
| `fieldLabels.manufacturer` (IT) | Marca | Produttore | Coerenza con `record.ts` / `report.ts` ("Produttore"). |
| `manufacturer` (IT) | Marca | Produttore | Idem. |
| `fieldLabels.observedOn` (IT) | Osservata il | Data osservata | Coerenza con `record.ts` / `report.ts` ("Data osservata"). |
| `observedOn` (IT) | Osservata il | Data osservata | Idem. |
| `recordIdHelp` (IT) | …l'id del record a cui la richiesta si riferisce. | …l'ID del record a cui la richiesta si riferisce. | Grafia dell'acronimo in italiano ("ID"), coerente con "ID record". |
| `associateRequiresCameraId` (IT) | Inserisci l'id del record… | Inserisci l'ID del record… | Idem. |
| `invalidRecordId` (IT) | Inserisci un id record intero positivo. | Inserisci un ID record intero positivo. | Idem. |
| `recordIdHistoryHelp` (IT) | L'id del record da ispezionare. | L'ID del record da ispezionare. | Idem. |
| `historyNotFoundText` (IT) | Non esiste alcun record con questo id. Controlla l'id e riprova. | Non esiste alcun record con questo ID. Controlla l'ID e riprova. | Idem. |

### 3.8 `auth.ts` — note account e metodi (3 chiavi)

| Chiave | EN prima | EN dopo | IT prima | IT dopo | Motivo |
|---|---|---|---|---|---|
| `anonymousNote` | You do not need an account to report a camera. An account lets you track your own reports. | A free account is required to report a camera, and it lets you track your own reports. | Non serve un account per segnalare una telecamera. Un account ti permette di tenere traccia… | Per segnalare una telecamera serve un account gratuito, che ti permette anche di tenere traccia… | Nota mostrata su /login e /register: l'affermazione "non serve un account per segnalare" era falsa col write gate. La nuova versione trasforma il requisito in motivazione (account gratuito + tracciamento). |
| `registerTitle` (IT) | — (EN invariata: "Create a contributor account") | — | Crea un account da contributor | Crea un account per contribuire | "da contributor" è un anglicismo forzato e grammaticalmente goffo; la forma verbale è naturale, chiara e non perde il collegamento al concetto di contributo. Test `community-i18n` aggiornato. |
| `methodSocial` (IT) | — (EN invariata: "Social sign-in") | — | Accesso con social | Accesso tramite social | Italiano più naturale nel selettore metodo ("Scegli come accedere"). |

### 3.9 `community.ts` — livelli di fiducia (1 chiave, solo IT)

| Chiave | IT prima | IT dopo | Motivo |
|---|---|---|---|
| `levelDescriptions.trusted` | …possano essere prioritarizzate nella coda di moderazione. | …possano avere priorità nella coda di moderazione. | "prioritarizzare" è un neologismo-anglicismo non necessario; la perifrasi è italiano naturale. Il vocabolo congelato (trust levels, contributor, verifica) non è toccato; golden string del test aggiornata. |

---

## 4. Audit dei blocchi invariati e segnalazioni

### 4.1 Bundle verificati e lasciati invariati (già finali)

- **`common.ts`, `footer.ts`, `status.ts`, `errors.ts`** — chrome condivisa: concisa, coerente col tono, a11y-ready. Nessuna modifica.
- **`directory.ts`** — copy del redesign editoriale (#258): coerente, veridicità ("un risultato non è mai la prova che un'area non abbia sorveglianza") rispettata ovunque, EN/IT allineati.
- **`report.ts` / `correction.ts`** — moduli di scrittura: microcopy di fiducia (consensi, art. 13, foto) accurate e allineate ai legali; stati di errore/gate chiari. Nessuna modifica.
- **`manifesto.ts`, `moderazione.ts`, `rules.ts`** — pagine istituzionali: tono manifesto rispettato, confini ("mai feed, mai tracciamento, mai elusione") espressi con sobrietà. Nessuna modifica.
- **`record.ts` (EN), `community.ts` (EN)** — nessuna modifica lato EN.
- **`email-templates.ts`** — template verifica + reset: bilinguismo EN/IT nello stesso messaggio (ADR 0007), zero tracking, TTL dichiarati ("24 hours" / "3 hours") coerenti con le costanti di rotta. Nessuna modifica.

### 4.2 Segnalazioni NON implementate (richiedono decisione/competenza altrui)

1. **`legal/en.ts` + `legal/it.ts`, terms §6 (e `docs/TERMS_OF_USE.md` §6)**: «via the in-app correction form **(home page**, "Report a problem / correction" section)» / IT «(home page, sezione "Segnala un problema / correzione")» — **stale in due modi**: (a) il form non è nella home ma su /correggi; (b) il nome della sezione citato non corrisponde a `correctionTitle` ("Correct a record or raise a concern." / "Correggi un record o segnala una criticità.").
   **Non modificato di proposito**: `legal/*.ts` è dichiaratamente il layer di presentazione di documenti canonici («the repository copies of those documents remain the canonical source of record» — header del file). Cambiare il layer senza aggiornare `docs/TERMS_OF_USE.md` creerebbe divergenza. **Raccomandazione**: aggiornare `docs/TERMS_OF_USE.md` (proprietà docs/Marie), poi allineare `legal/en.ts` + `legal/it.ts` allo stesso commit. La stessa correzione si applica a `faq.aCorrect`/`contact.correctionBody` già sistemati in questo task.
2. **`guide.ts` `localLabel`/`localTitle`/`localBody` ("Local prototype" / "This version is not a public service")** — lasciati invariati: la guida è il posto giusto per dichiarare i limiti del prototipo (a differenza del banner mappa rimosso dal CEO); il tono è onesto e sobrio. Da rivalutare solo al passaggio da prototipo a servizio pubblico.
3. **`home.ts` hero stats** — il valore "0" di `accountsRequired` è hard-coded in `Hero.tsx` (non una chiave i18n). La nuova label ("accounts needed to browse") è vera; se in futuro il CEO vuole una stat diversa, va cambiato anche il valore in `Hero.tsx` (fuori scope copy).

---

## 5. Verifica

- `npx tsc --noEmit` — 0 errori (parità strutturale EN/IT garantita, nessuna chiave persa).
- `npm run build` — in corso/verificato (vedi esito in PR).
- `node --test "tests/*.test.mjs"` — suite completa, inclusi i due test aggiornati:
  - `tests/community-i18n.test.mjs` (golden string IT `levelDescriptions.trusted` + `auth.it.registerTitle`);
  - `tests/client-moderation-correction-associate.test.mjs` (label `/Record ID/`).
- Nessun altro test pinnava le stringhe modificate (verificato con grep sui test).

## 6. Riepilogo per il CEO

- **17 stringhe EN e 20 stringhe IT** aggiornate su **9 bundle**; zero nuove chiavi; zero placeholder/dev residui.
- Tre famiglie di interventi: (1) **veridicità** — tutto ciò che prometteva "si segnala senza account" o "il form è nella home" ora riflette lo stato reale (write gate, route tool); (2) **de-prototipizzazione** coerente col feedback del 2026-08-02 (stat hero, fallback API); (3) **qualità linguistica** — accordi di genere IT, anglicismi rimossi ("prioritarizzate", "account da contributor", "Accesso con social"), vocabolario unico ("telecamera", "Produttore", "Record ID").
- **Una segnalazione aperta** per Marie/docs: il riferimento "home page" nel terms §6 dei legali (canonico in `docs/TERMS_OF_USE.md`).
