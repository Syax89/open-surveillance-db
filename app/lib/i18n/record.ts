/**
 * record — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Record navigation",
  backToDirectory: "← Back to directory",
  loading: "Loading the public record…",
  publicRecord: "Public record",
  recordId: "Record ID",
  source: "Source",
  lastVerification: "Last confirmation",
  // F4 (QA#6): the demo seed rows carry raw, language-neutral markers
  // ("Prototype seed"/"Demo data" — test contract, see DATA_DICTIONARY);
  // the presentation shows these localized labels instead.
  demoSource: "Illustrative seed",
  demoUpdated: "Demo data",
  generalLocation: "General location",
  manufacturer: "Manufacturer",
  observedOn: "Observed on",
  viewOnMap: "View on map",
  reportIssue: "Report an issue",
  recordNote:
    "This page contains only live public records or clearly labelled illustrative records. It does not provide live feeds or operational camera details.",
  unavailable: "Record unavailable",
  notFound: "We could not find that public record.",
  notFoundDetail:
    "It may have been removed, is not public, or the link is incorrect.",
  browseDirectory: "Browse the directory",
  offlineTitle: "You are offline",
  offlineBody: "Showing the last loaded records.",
  offlineAction: "Try again",
  loadError: "Could not load the public record.",
  loadErrorDetail:
    "The record service is unreachable right now. Check your connection and try again.",
  retryLoad: "Try again",
  statusFallback: "Status",
  changeHistory: "Change history",
  changeHistoryNote:
    "This history lists public events only. It never includes contributor identities or internal notes.",
  changeHistoryFallback: "Record updated",
  changeHistoryLabels: {
    approve: "Published",
    "mark-stale": "Flagged as no longer there",
    reverify: "Re-verified",
    hide: "Hidden",
  },
  // Contribution edit form (/records/[id]/edit, C6). The page keeps its own
  // field labels here (record.ts is the form bundle per SITEMAP) instead of
  // mixing the report bundle: same per-page isolation rule as statusFilters.
  editTitle: "Record title",
  editTitlePlaceholder: "e.g. Public security camera",
  editKind: "Camera type",
  editKindSelect: "Select one",
  editKindOptions: {
    fixedDome: "Fixed dome",
    bullet: "Bullet",
    ptz: "PTZ",
    trafficReader: "Traffic / licence plate reader",
    otherUnknown: "Other / unknown",
  },
  editManufacturer: "Manufacturer (optional)",
  editManufacturerPlaceholder: "e.g. manufacturer name",
  editObservedOn: "Date observed (optional)",
  editAddress: "Approximate address (optional)",
  editAddressPlaceholder: "Street and city",
  editNotes: "What did you observe?",
  editNotesPlaceholder: "Direction, operator, visible notice, model…",
  editDescription: "Description (optional)",
  editDescriptionPlaceholder: "Additional context about the record…",
  editBlockedRemovedTitle: "This record can no longer be edited",
  editTitleRequired: "The record title is required.",
  editFieldTooLong: (limit: number) =>
    `This field must be at most ${limit} characters.`,
  editObservedOnInvalid: "Enter a valid date (YYYY-MM-DD).",
  // Field-of-view direction (t_f8b775ec) — edit form, same pattern as the
  // report form: only for directional kinds, compass slider + "don't know".
  editDirectionTitle: "Field of view direction",
  editDirectionHelp: "The compass bearing the camera points towards, clockwise from north (0–359°).",
  editDirectionUnknown: "I don't know the direction",
  editDirectionDegrees: "Direction",
  // Record detail fact (t_f8b775ec): "Direction: NE 45°" when the record
  // has a stored bearing (domes and unknown directions omit the row).
  direction: "Direction",

  // --- Community status badge (ADR 0021 §9, FASE 3 UI): informational
  // freshness line — never a state change. A record with no confirmations
  // shows the neutral "never confirmed" badge; a confirmed one shows the
  // count and the last-confirmed date.
  communityStatus: "Community status",
  neverConfirmed: "Never confirmed",
  confirmedTimes: (count: number) =>
    `Confirmed ${count} ${count === 1 ? "time" : "times"}`,
  lastConfirmed: "Last confirmed",

  // --- Hidden/removed banner (ADR 0021 §6.3, FASE 3 UI): a withdrawn
  // record stays reachable by direct link with an explicit banner; the
  // reversal signals (confirm / gone) stay open, and the public history
  // link is the transparency control.
  hiddenTitle: "Record hidden",
  hiddenBody:
    "This record was withdrawn pending community or legal verification. It is not listed in the directory or on the map; you can still read its public history and take part.",
  removedTitle: "Reported as no longer present",
  removedBody:
    "The community reported that this camera is no longer there. It is not listed in the directory or on the map; you can still read its public history and confirm it if it is back.",
  bannerHistoryLink: "View the public history",
  bannerNote: "The reversal signals (confirm, no longer there) stay open on this record.",

  // --- Public per-record event timeline (ADR 0021 §7, FASE 3 UI): the
  // unattributed aggregate history. Labels cover every semantic event type
  // the API can emit; anything unknown falls back to the neutral fallback.
  timeline: "Public history",
  timelineNote:
    "Aggregate public events only — never contributor identities, emails or internal notes.",
  timelineEmpty: "No public events yet.",
  timelineFallback: "Record updated",
  timelineLabels: {
    published: "Published",
    confirmed: "Confirmed present",
    liked: "Marked useful",
    "gone-flagged": "Flagged as no longer there",
    hidden: "Hidden",
    removed: "Removed",
    restored: "Restored to the directory",
    "action-consumed": "Triggering actions reset",
    migration: "History migrated",
    "setting-changed": "Settings changed",
  },
  hideReasons: {
    problem: "reason: flagged",
    privacy: "reason: privacy",
    adminLegal: "reason: legal emergency",
  },
  eventPeople: (count: number) => `${count} ${count === 1 ? "person" : "people"}`,
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione del record",
  backToDirectory: "← Torna all'elenco",
  loading: "Caricamento del record pubblico…",
  publicRecord: "Record pubblico",
  recordId: "ID record",
  source: "Fonte",
  lastVerification: "Ultima conferma",
  // F4 (QA#6): i record del seed demo hanno marcatori grezzi neutri
  // ("Prototype seed"/"Demo data" — contratto di test, vedi DATA_DICTIONARY);
  // la presentazione mostra invece queste etichette localizzate.
  demoSource: "Seed illustrativo",
  demoUpdated: "Dato dimostrativo",
  generalLocation: "Posizione generale",
  manufacturer: "Produttore",
  observedOn: "Data osservata",
  viewOnMap: "Vedi sulla mappa",
  reportIssue: "Segnala un problema",
  recordNote:
    "Questa pagina contiene solo record pubblici attivi o record illustrativi chiaramente etichettati. Non fornisce flussi video in diretta né dettagli operativi delle telecamere.",
  unavailable: "Record non disponibile",
  notFound: "Non è stato possibile trovare questo record pubblico.",
  notFoundDetail:
    "Potrebbe essere stato rimosso, non essere pubblico oppure il collegamento non è corretto.",
  browseDirectory: "Sfoglia l'elenco",
  offlineTitle: "Sei offline",
  offlineBody: "Mostriamo gli ultimi record caricati.",
  offlineAction: "Riprova",
  loadError: "Non è stato possibile caricare il record pubblico.",
  loadErrorDetail:
    "Il servizio dei record non è raggiungibile in questo momento. Controlla la connessione e riprova.",
  retryLoad: "Riprova",
  statusFallback: "Stato",
  changeHistory: "Cronologia delle modifiche",
  changeHistoryNote:
    "Questa cronologia elenca solo eventi pubblici. Non include mai identità dei contributori né note interne.",
  changeHistoryFallback: "Record aggiornato",
  changeHistoryLabels: {
    approve: "Pubblicato",
    "mark-stale": "Segnalato come non più presente",
    reverify: "Riverificato",
    hide: "Nascosto",
  },
  // Form di modifica del contributo (/records/[id]/edit, C6). La pagina
  // tiene qui le proprie label di campo (record.ts è il bundle del form
  // secondo SITEMAP) invece di mescolare il bundle report: stessa regola di
  // isolamento per pagina di statusFilters.
  editTitle: "Titolo del record",
  editTitlePlaceholder: "es. Telecamera di videosorveglianza pubblica",
  editKind: "Tipo di telecamera",
  editKindSelect: "Seleziona una voce",
  editKindOptions: {
    fixedDome: "Dome fissa",
    bullet: "Bullet",
    ptz: "PTZ",
    trafficReader: "Lettore traffico / targhe",
    otherUnknown: "Altro / sconosciuto",
  },
  editManufacturer: "Produttore (facoltativo)",
  editManufacturerPlaceholder: "es. nome del produttore",
  editObservedOn: "Data osservata (facoltativa)",
  editAddress: "Indirizzo approssimativo (facoltativo)",
  editAddressPlaceholder: "Via e città",
  editNotes: "Cosa hai osservato?",
  editNotesPlaceholder: "Direzione, gestore, cartello visibile, modello…",
  editDescription: "Descrizione (facoltativa)",
  editDescriptionPlaceholder: "Contesto aggiuntivo sul record…",
  editBlockedRemovedTitle: "Questo record non può più essere modificato",
  editTitleRequired: "Il titolo del record è obbligatorio.",
  editFieldTooLong: (limit: number) =>
    `Questo campo deve avere al massimo ${limit} caratteri.`,
  editObservedOnInvalid: "Inserisci una data valida (AAAA-MM-GG).",
  // Direzione del campo visivo (t_f8b775ec) — form di modifica, stesso
  // pattern del form di segnalazione: solo per tipi direzionali, slider
  // bussola + "non so".
  editDirectionTitle: "Direzione del campo visivo",
  editDirectionHelp: "Il rilevamento verso cui punta la telecamera, in senso orario da nord (0–359°).",
  editDirectionUnknown: "Non conosco la direzione",
  editDirectionDegrees: "Direzione",
  // Fattore del dettaglio record (t_f8b775ec): "Direzione: NE 45°" quando il
  // record ha un rilevamento salvato (le cupole e le direzioni ignote
  // omettono la riga).
  direction: "Direzione",

  // --- Badge di stato della community (ADR 0021 §9, FASE 3 UI): riga di
  // freschezza informativa — mai un cambio di stato. Un record senza
  // conferme mostra il badge neutro "mai confermata"; uno confermato
  // mostra il conteggio e la data dell'ultima conferma.
  communityStatus: "Stato della community",
  neverConfirmed: "Mai confermata",
  confirmedTimes: (count: number) =>
    `Confermata ${count} ${count === 1 ? "volta" : "volte"}`,
  lastConfirmed: "Ultima conferma",

  // --- Banner nascosto/rimosso (ADR 0021 §6.3, FASE 3 UI): un record
  // ritirato resta raggiungibile tramite link diretto con un banner
  // esplicito; i segnali di inversione (confermo / non c'è più) restano
  // aperti e il link alla cronologia pubblica è il controllo di trasparenza.
  hiddenTitle: "Record nascosto",
  hiddenBody:
    "Questo record è stato ritirato in attesa di verifica da parte della community o legale. Non è elencato nell'elenco né sulla mappa; puoi comunque leggere la sua cronologia pubblica e partecipare.",
  removedTitle: "Segnalato come non più presente",
  removedBody:
    "La community ha segnalato che questa telecamera non c'è più. Non è elencata nell'elenco né sulla mappa; puoi comunque leggere la sua cronologia pubblica e confermarla se è tornata.",
  bannerHistoryLink: "Vedi la cronologia pubblica",
  bannerNote: "I segnali di inversione (confermo, non c'è più) restano aperti su questo record.",

  // --- Cronologia eventi pubblica per record (ADR 0021 §7, FASE 3 UI):
  // la storia aggregata senza attribuzioni. Le etichette coprono ogni tipo
  // di evento semantico che l'API può emettere; gli sconosciuti cadono sul
  // fallback neutro.
  timeline: "Cronologia pubblica",
  timelineNote:
    "Solo eventi pubblici aggregati — mai identità dei contributori, email o note interne.",
  timelineEmpty: "Nessun evento pubblico ancora.",
  timelineFallback: "Record aggiornato",
  timelineLabels: {
    published: "Pubblicato",
    confirmed: "Confermato presente",
    liked: "Segnato come utile",
    "gone-flagged": "Segnalato come non più presente",
    hidden: "Nascosto",
    removed: "Rimosso",
    restored: "Ripristinato nell'elenco",
    "action-consumed": "Azioni di soglia azzerate",
    migration: "Cronologia migrata",
    "setting-changed": "Impostazioni modificate",
  },
  hideReasons: {
    problem: "motivo: segnalazione",
    privacy: "motivo: privacy",
    adminLegal: "motivo: emergenza legale",
  },
  eventPeople: (count: number) => `${count} ${count === 1 ? "persona" : "persone"}`,
};
