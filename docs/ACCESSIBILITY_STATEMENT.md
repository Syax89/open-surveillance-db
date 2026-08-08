# Accessibility statement

- **Status:** in force (personal open-source project), 2026-08-08 — version 0.3
- **Owner:** Marie (documentation) with review by Ada (technical) and Rosa (privacy/legal)
- **Standards target:** WCAG 2.2 AA (Web Content Accessibility Guidelines)
- **Related documents:** [FRONTEND_DESIGN.md](FRONTEND_DESIGN.md), [ADR 0006 — non-sensitive usability-feedback route](decisions/0006-non-sensitive-usability-feedback-route.md), [MODERATION_SLA.md](legal/MODERATION_SLA.md)

This statement describes the accessibility of the OpenSurveillanceDB public web
application as it is deployed today.

## Commitment

OpenSurveillanceDB is a public-interest civic database. The project is
committed to an inclusive web experience: the core journeys — browse, search,
submit, and correct/remove — must be usable with a keyboard, with assistive
technology, and on small screens, in Italian and in English. The product
target is **WCAG 2.2 AA** for the public website.

## Compliance status

**Partially compliant.** The project implements a meaningful accessibility
baseline, and **automated checks run in CI on every PR**: the QA gate audits
the SSR HTML of every public route with axe-core (WCAG 2.1/2.2 A/AA tags) and
enforces 0 critical/serious violations; a Lighthouse CI gate runs in real
Chromium and enforces a minimum accessibility score of **0.95**, covering the
layout-dependent WCAG 2.2 AA rules that jsdom cannot evaluate —
color-contrast, target-size (2.5.8), link-in-text-block,
scrollable-region-focusable. Lighthouse audits one representative route per
distinct layout template, so every layout in the app is covered by
real-rendering checks (`.github/workflows/lighthouse.yml`; local check:
`npx lhci autorun`).

### What is already implemented in the project

- A skip link and main-content target on every app surface.
- Visible keyboard focus states and logical focus order.
- `prefers-reduced-motion` support (animations reduced when requested).
- A searchable text directory and record-detail pages that work **without map
  interaction**; map and directory present the same public fields.
- Map interactions are **keyboard-operable**: markers are focusable and open
  their popup with Enter/Space, Leaflet controls are focusable, and the
  geocode search is an ARIA combobox; the text directory remains the full
  keyboard alternative for browsing.
- Report-location selection by map click **or** validated manual coordinates.
- English/Italian interface with a device-local language preference; the
  language choice does not affect API data.
- An in-app bilingual guide at `/guide` explaining data states and the
  moderation workflow.
- Status information is not conveyed by colour alone (text and icon labels are
  used), and safe type/order filters are shared by map and directory.

### Known limitations

- **No formal manual testing** with screen readers, 200% zoom, contrast
  checking, or small-screen devices has been run yet; the manual test plan is
  tracked as follow-up work. Automated checks are in place (axe-core on every
  route, CI, 0 critical/serious violations); contrast and target-size need a
  real rendering engine, so they are covered by the Lighthouse CI gate.
- Some map gestures (drag-panning) are pointer-first by nature; the directory
  is the equivalent keyboard surface for browsing.

## Reporting a barrier

Accessibility barriers can be reported **without creating an account and
without providing personal data** through these channels:

- open an issue on the project repository (public, non-sensitive content only —
  do not include personal data, screenshots of people, or private locations);
- use the [correction/request form](/) on the public page for issues related
  to a specific record;
- write to the privacy contact named in the
  [privacy notice](legal/PRIVACY_NOTICE.md).

A dedicated non-sensitive usability-feedback page is specified in
[ADR 0006](decisions/0006-non-sensitive-usability-feedback-route.md) and is
planned as a future route; until it exists, the channels above are the way to
report a barrier.

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
- at least quarterly while the service is running;
- whenever conformance results change, recording the updated results and any
  exceptions here.

---

# Dichiarazione di accessibilità

- **Stato:** in vigore (progetto personale open source), 2026-08-08 — versione 0.3
- **Responsabile:** Marie (documentazione) con revisione di Ada (tecnica) e Rosa (privacy/legale)
- **Standard di riferimento:** WCAG 2.2 AA (Web Content Accessibility Guidelines)
- **Documenti correlati:** [FRONTEND_DESIGN.md](FRONTEND_DESIGN.md), [ADR 0006 — percorso di feedback di usabilità non sensibile](decisions/0006-non-sensitive-usability-feedback-route.md), [MODERATION_SLA.md](legal/MODERATION_SLA.md)

Questa dichiarazione descrive l'accessibilità dell'applicazione web pubblica di
OpenSurveillanceDB così com'è oggi in produzione.

## Impegno

OpenSurveillanceDB è un database civico di interesse pubblico. Il progetto è
impegnato a offrire un'esperienza web inclusiva: i percorsi principali —
consultazione, ricerca, segnalazione e correzione/rimozione — devono essere
utilizzabili con tastiera, con tecnologie assistive e su schermi piccoli, in
italiano e in inglese. L'obiettivo di prodotto è la conformità **WCAG 2.2 AA**
per il sito pubblico.

## Stato di conformità

**Parzialmente conforme.** Il progetto implementa una base di accessibilità
significativa, e **i controlli automatizzati girano in CI su ogni PR**: il gate
QA verifica l'HTML SSR di ogni route pubblica con axe-core (tag WCAG 2.1/2.2
A/AA) e impone 0 violazioni critiche/serie; un gate Lighthouse CI gira in
Chromium reale e impone un punteggio di accessibilità minimo di **0.95**,
coprendo le regole WCAG 2.2 AA dipendenti dal layout che jsdom non può
valutare — color-contrast, target-size (2.5.8), link-in-text-block,
scrollable-region-focusable. Lighthouse controlla una rotta rappresentativa
per ogni template di layout distinto, quindi ogni layout dell'app è coperto
dal rendering reale (`.github/workflows/lighthouse.yml`; verifica locale:
`npx lhci autorun`).

### Cosa è già implementato nel progetto

- Collegamento "salta al contenuto" (skip link) e destinazione del contenuto principale su ogni schermata.
- Stati di focus visibili e ordine di focus logico.
- Supporto a `prefers-reduced-motion` (animazioni ridotte su richiesta).
- Directory testuale ricercabile e pagine di dettaglio utilizzabili **senza interazione con la mappa**; mappa e directory mostrano gli stessi campi pubblici.
- Le interazioni sulla mappa sono **operabili da tastiera**: i marker sono focusabili e aprono il popup con Invio/Spazio, i controlli Leaflet sono focusabili e la ricerca geografica è una combobox ARIA; la directory testuale resta l'alternativa completa per la consultazione.
- Selezione della posizione tramite clic sulla mappa **oppure** coordinate manuali validate.
- Interfaccia in inglese e italiano con preferenza di lingua salvata solo sul dispositivo; la scelta non influisce sui dati API.
- Guida in-app bilingue su `/guide` che spiega gli stati dei dati e il flusso di moderazione.
- Lo stato non è comunicato solo con il colore (sono usate etichette testuali e icone) e i filtri sicuri per tipo/ordine sono condivisi tra mappa e directory.

### Limitazioni note

- **Nessun test manuale formale** con screen reader, zoom al 200%, verifica del contrasto o dispositivi a schermo piccolo è stato ancora eseguito; il piano di test manuale è tracciato come lavoro successivo. I controlli automatizzati sono in atto (axe-core su ogni route, CI, 0 violazioni critiche/serie); contrasto e target-size richiedono un vero motore di rendering, quindi sono coperti dal gate Lighthouse CI.
- Alcuni gesti della mappa (panoramica con trascinamento) sono per natura orientati al puntatore; la directory è la superficie da tastiera equivalente per la consultazione.

## Segnalare una barriera

Le barriere di accessibilità possono essere segnalate **senza creare un
account e senza fornire dati personali** tramite questi canali:

- apri un issue sul repository del progetto (contenuti pubblici e non sensibili — non includere dati personali, foto di persone o luoghi privati);
- usa il [modulo di correzione/richiesta](/) nella pagina pubblica per problemi relativi a una scheda specifica;
- scrivi al contatto privacy indicato nell'[informativa privacy](legal/PRIVACY_NOTICE.md).

Una pagina dedicata di feedback non sensibile sull'usabilità è specificata in
[ADR 0006](decisions/0006-non-sensitive-usability-feedback-route.md) ed è
prevista come rotta futura; finché non esiste, i canali sopra sono il modo per
segnalare una barriera.

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
- almeno trimestralmente a servizio attivo;
- quando cambiano i risultati di conformità, registrando qui gli esiti aggiornati e le eventuali eccezioni.
