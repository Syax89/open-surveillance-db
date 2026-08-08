# Accessibility statement

- **Status:** in force (personal open-source project), 2026-08-08 — version 0.2
- **Owner:** Marie (documentation) with review by Ada (technical) and Rosa (privacy/legal)
- **Standards target:** WCAG 2.2 AA (Web Content Accessibility Guidelines)
- **Related documents:** [PRODUCT_UX.md](workstreams/PRODUCT_UX.md), [ADR 0006 — non-sensitive usability-feedback route](decisions/0006-non-sensitive-usability-feedback-route.md), [MODERATION_SLA.md](legal/MODERATION_SLA.md)

This statement describes the accessibility of the OpenSurveillanceDB public web
application. It is written for the current **local project** and will be
updated before any public launch, when the pilot area, languages, and review
method are decided (see [roadmap.md](roadmap.md), Horizon 2 and 4).

## Commitment

OpenSurveillanceDB is a public-interest civic database. The project is
committed to an inclusive web experience: the core journeys — browse, search,
submit, and correct/remove — must be usable with a keyboard, with assistive
technology, and on small screens, in the pilot language and in English. The
product target is **WCAG 2.2 AA** for the public website, with manual testing
by disabled users before the pilot is widened, as agreed in
[PRODUCT_UX.md](workstreams/PRODUCT_UX.md#accessibility-mobile-and-internationalisation-requirements).

## Compliance status

**Partially compliant.** The local project implements a meaningful
accessibility baseline, and **automated checks now run in CI**: the F-QA
gate audits the SSR HTML of every public route with axe-core (WCAG 2.1/2.2
A/AA tags) and enforces 0 critical/serious violations. **Formal manual
testing is still pending** (screen readers, zoom, small screens), and some
known limitations remain (listed below). This section will be replaced by a
measured conformance statement (WCAG 2.2 A/AA, per success criterion) once
the manual testing gates in Horizon 2 are complete.

### What is already implemented in the project

- A skip link and main-content target on every app surface.
- Visible keyboard focus states and logical focus order.
- `prefers-reduced-motion` support (animations reduced when requested).
- A searchable text directory and record-detail pages that work **without map
  interaction**; map and directory present the same public fields.
- Report-location selection by map click **or** validated manual coordinates.
- English/Italian interface with a device-local language preference; the
  language choice does not affect API data.
- An in-app bilingual guide at `/guide` explaining data states and the
  moderation workflow.
- Status information is not conveyed by colour alone (text and icon labels are
  used), and safe type/order filters are shared by map and directory.
- **Automated accessibility gates run in CI on every PR:** axe-core over every
  SSR route (jsdom) plus a Lighthouse CI gate in real Chromium enforcing the
  layout-dependent WCAG 2.2 AA rules jsdom cannot evaluate — color-contrast,
  target-size (2.5.8), link-in-text-block, scrollable-region-focusable — with
  a minimum accessibility score of **0.95**. Lighthouse audits one
  representative route per distinct layout template (all auth pages, the map,
  catalog, report/correct forms, record detail and the two static templates —
  InfoPage via `/guide`, LegalPage via `/privacy`, the latter covering the
  legal/static pages with their own colour tokens on `.legal-table`/
  `.legal-note`), so every layout in the app is covered by real-rendering
  checks while content-level axe rules still run on every
  route (`.github/workflows/lighthouse.yml`, local check: `npx lhci autorun`).

### Known limitations (not yet implemented)

- **Map tasks are not yet fully keyboard-equivalent.** The text-list
  alternative covers browsing; remaining map interactions are still being
  brought to keyboard parity (tracked in Horizon 2).
- **No formal manual testing** with screen readers, 200% zoom, contrast
  checking, or small-screen devices has been run yet; the manual test plan
  is pending (Horizon 2). Automated checks are in place (axe-core on every
  route, CI, 0 critical/serious violations); contrast and target-size need
  a real rendering engine, so they stay covered by the manual plan and the
  Lighthouse CI proposal (ops).
- **Some user-visible strings are still defined inline** in components while
  the interface-string externalisation and pilot-language review are in
  progress (Horizon 2).
- **The dedicated feedback page (`/feedback`) is not yet implemented.** The
  non-sensitive usability-feedback route is specified in
  [ADR 0006](decisions/0006-non-sensitive-usability-feedback-route.md);
  implementation is tracked as follow-up work. Until it exists, barriers can
  be reported through the alternative channels listed below.

## Reporting a barrier: the usability-feedback route

The project provides a **non-sensitive usability-feedback route** so that
anyone can report an interface barrier **without creating an account and
without providing personal data** (see ADR 0006). When implemented, the route
will be available at `/feedback` and will ask only for:

1. the type of barrier (navigation/keyboard, screen reader, colour/contrast,
   zoom/layout, other);
2. a plain-language description of what happened;
3. an optional URL of the page where the barrier occurred;
4. an optional contact address, **only if** the visitor wants a reply (never
   required, never used for anything else, and deleted once the exchange is
   closed).

No account, no mandatory email, no analytics, and no behavioural tracking are
involved. The route is designed to collect no sensitive personal data.

### Alternative channels (current project)

Until `/feedback` is implemented, please report accessibility barriers through
one of these channels:

- open an issue on the project repository (public, non-sensitive content only —
  do not include personal data, screenshots of people, or private locations);
- use the [correction/request form](/) on the public page for issues related
  to a specific record;
- write to the privacy contact named in the
  [privacy notice](legal/PRIVACY_NOTICE.md).

### Response commitment

Feedback is handled with the same targets as correction and takedown requests
([MODERATION_SLA.md](legal/MODERATION_SLA.md)): an acknowledgement within
**48 hours** and a substantive response within **14 days**, in the language of
the message when possible.

## Enforcement and contact

- **Accessibility owner:** Marie (documentation), with technical validation by
  Ada (CTO) and privacy review by Rosa (Legal & Privacy Officer).
- **Escalation:** if a reported barrier is not resolved or the response
  commitment is not met, escalate to the maintainers via
  [GOVERNANCE.md](../GOVERNANCE.md); for privacy-sensitive concerns use the
  privacy contact in the [privacy notice](legal/PRIVACY_NOTICE.md).

## Review schedule

This statement is reviewed:

- after every release that changes the interface or the accessibility
  behaviour;
- at least quarterly once the service is running, together with the
  accessibility task-completion measures in
  [PRODUCT_UX.md](workstreams/PRODUCT_UX.md#non-commercial-success-measures);
- before any public launch, with the final conformance results and known
  exceptions recorded here.

---

# Dichiarazione di accessibilità

- **Stato:** bozza — pre-lancio, fase di progetto locale
- **Responsabile:** Marie (documentazione) con revisione di Ada (tecnica) e Rosa (privacy/legale)
- **Standard di riferimento:** WCAG 2.2 AA (Web Content Accessibility Guidelines)
- **Documenti correlati:** [PRODUCT_UX.md](workstreams/PRODUCT_UX.md), [ADR 0006 — percorso di feedback di usabilità non sensibile](decisions/0006-non-sensitive-usability-feedback-route.md), [MODERATION_SLA.md](legal/MODERATION_SLA.md)

Questa dichiarazione descrive l'accessibilità dell'applicazione web pubblica di
OpenSurveillanceDB. È redatta per l'attuale **progetto locale** e sarà
aggiornata prima di qualsiasi lancio pubblico, quando saranno decisi l'area
pilota, le lingue e il metodo di verifica (vedi [roadmap.md](roadmap.md), Orizzonte 2 e 4).

## Impegno

OpenSurveillanceDB è un database civico di interesse pubblico. Il progetto è
impegnato a offrire un'esperienza web inclusiva: i percorsi principali —
consultazione, ricerca, segnalazione e correzione/rimozione — devono essere
utilizzabili con tastiera, con tecnologie assistive e su schermi piccoli, nella
lingua pilota e in inglese. L'obiettivo di prodotto è la conformità **WCAG 2.2
AA** per il sito pubblico, con test manuali condotti da utenti con disabilità
prima di ampliare il pilota, come concordato in
[PRODUCT_UX.md](workstreams/PRODUCT_UX.md#accessibility-mobile-and-internationalisation-requirements).

## Stato di conformità

**Parzialmente conforme.** Il progetto locale implementa una base di
accessibilità significativa, e **i controlli automatizzati ora girano in CI**:
il gate F-QA verifica l'HTML SSR di ogni route pubblica con axe-core (tag
WCAG 2.1/2.2 A/AA) e impone 0 violazioni critiche/serie. **Il test manuale
formale è ancora previsto** (screen reader, zoom, schermi piccoli), e
permangono alcune limitazioni note (elencate sotto). Questa sezione sarà
sostituita da una dichiarazione di conformità misurata (WCAG 2.2 A/AA, per
singolo criterio di successo) al termine dei test manuali previsti
nell'Orizzonte 2.

### Cosa è già implementato nel progetto

- Collegamento "salta al contenuto" (skip link) e destinazione del contenuto principale su ogni schermata.
- Stati di focus visibili e ordine di focus logico.
- Supporto a `prefers-reduced-motion` (animazioni ridotte su richiesta).
- Directory testuale ricercabile e pagine di dettaglio utilizzabili **senza interazione con la mappa**; mappa e directory mostrano gli stessi campi pubblici.
- Selezione della posizione tramite clic sulla mappa **oppure** coordinate manuali validate.
- Interfaccia in inglese e italiano con preferenza di lingua salvata solo sul dispositivo; la scelta non influisce sui dati API.
- Guida in-app bilingue su `/guide` che spiega gli stati dei dati e il flusso di lavoro di moderazione.
- Lo stato non è comunicato solo con il colore (sono usate etichette testuali e icone) e i filtri sicuri per tipo/ordine sono condivisi tra mappa e directory.
- **Gate di accessibilità automatizzati in CI su ogni PR:** axe-core su ogni rotta SSR (jsdom) più un gate Lighthouse CI in Chromium reale che applica le regole di layout WCAG 2.2 AA che jsdom non può valutare — color-contrast, target-size (2.5.8), link-in-text-block, scrollable-region-focusable — con punteggio di accessibilità minimo **0.95**. Lighthouse controlla una rotta rappresentativa per ogni template di layout distinto (tutte le pagine auth, mappa, catalogo, form segnala/correggi, dettaglio record e i due template statici — InfoPage via `/guide`, LegalPage via `/privacy`, quest'ultimo che copre le pagine legali/statiche con i propri token colore su `.legal-table`/`.legal-note`), quindi ogni layout dell'app è coperto dal rendering reale, mentre le regole di contenuto axe-core restano attive su ogni rotta (`.github/workflows/lighthouse.yml`, verifica locale: `npx lhci autorun`).

### Limitazioni note (non ancora implementate)

- **I compiti sulla mappa non sono ancora pienamente equivalenti da tastiera.** L'alternativa testuale copre la consultazione; le restanti interazioni sulla mappa sono in corso di allineamento (Orizzonte 2).
- **Nessun test manuale formale** con screen reader, zoom al 200%, verifica del contrasto o dispositivi a schermo piccolo è stato ancora eseguito; il piano di test manuale è previsto (Orizzonte 2). I controlli automatizzati sono in atto (axe-core su ogni route, CI, 0 violazioni critiche/serie); contrasto e target-size richiedono un vero motore di rendering, quindi restano coperti dal piano manuale e dalla proposta Lighthouse CI (ops).
- **Alcune stringhe visibili sono ancora definite inline** nei componenti, in attesa dell'esternalizzazione delle stringhe di interfaccia e della revisione della lingua pilota (Orizzonte 2).
- **La pagina di feedback dedicata (`/feedback`) non è ancora implementata.** Il percorso di feedback di usabilità non sensibile è specificato in [ADR 0006](decisions/0006-non-sensitive-usability-feedback-route.md); l'implementazione è tracciata come lavoro successivo. Finché non esiste, le barriere possono essere segnalate tramite i canali alternativi elencati sotto.

## Segnalare una barriera: il percorso di feedback di usabilità

Il progetto offre un **percorso di feedback di usabilità non sensibile** per
consentire a chiunque di segnalare una barriera dell'interfaccia **senza creare
un account e senza fornire dati personali** (vedi ADR 0006). Quando
implementato, il percorso sarà disponibile su `/feedback` e chiederà solo:

1. il tipo di barriera (navigazione/tastiera, screen reader, colore/contrasto, zoom/layout, altro);
2. una descrizione in linguaggio semplice di cosa è accaduto;
3. l'URL facoltativo della pagina in cui si è verificata la barriera;
4. un contatto facoltativo, **solo se** si desidera una risposta (mai obbligatorio, mai usato per altri scopi, eliminato a chiusura dello scambio).

Nessun account, nessuna email obbligatoria, nessuna analisi e nessun tracciamento comportamentale. Il percorso è progettato per non raccogliere dati personali sensibili.

### Canali alternativi (progetto attuale)

Finché `/feedback` non è implementato, segnala le barriere di accessibilità tramite uno di questi canali:

- apri un issue sul repository del progetto (contenuti pubblici e non sensibili — non includere dati personali, foto di persone o luoghi privati);
- usa il [modulo di correzione/richiesta](/) nella pagina pubblica per problemi relativi a una scheda specifica;
- scrivi al contatto privacy indicato nell'[informativa privacy](legal/PRIVACY_NOTICE.md).

### Impegno di risposta

Il feedback è gestito con gli stessi obiettivi delle richieste di correzione e
rimozione ([MODERATION_SLA.md](legal/MODERATION_SLA.md)): conferma di ricezione
entro **48 ore** e risposta sostanziale entro **14 giorni**, nella lingua del
messaggio quando possibile.

## Applicazione e contatti

- **Responsabile accessibilità:** Marie (documentazione), con validazione tecnica di Ada (CTO) e revisione privacy di Rosa (Legal & Privacy Officer).
- **Scalata:** se una barriera segnalata non viene risolta o l'impegno di risposta non viene rispettato, rivolgiti ai maintainer tramite [GOVERNANCE.md](../GOVERNANCE.md); per questioni sensibili dal punto di vista della privacy usa il contatto privacy nell'[informativa privacy](legal/PRIVACY_NOTICE.md).

## Calendario di revisione

Questa dichiarazione viene rivista:

- dopo ogni rilascio che modifica l'interfaccia o il comportamento di accessibilità;
- almeno trimestralmente a servizio attivo, insieme alle misure di completamento dei compiti di accessibilità in [PRODUCT_UX.md](workstreams/PRODUCT_UX.md#non-commercial-success-measures);
- prima di qualsiasi lancio pubblico, registrando qui i risultati finali di conformità e le eccezioni note.
