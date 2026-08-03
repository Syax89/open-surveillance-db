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
  lastVerification: "Last verification",
  generalLocation: "General location",
  manufacturer: "Manufacturer",
  observedOn: "Observed on",
  viewOnMap: "View on map",
  reportIssue: "Report an issue",
  recordNote:
    "This page contains only reviewed public records or clearly labelled prototype data. It does not provide live feeds or operational camera details.",
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
    "This history lists reviewed changes only. It never includes contributor identities or internal notes.",
  changeHistoryFallback: "Record updated",
  changeHistoryLabels: {
    approve: "Approved and published",
    "mark-stale": "Marked for re-review",
    reverify: "Re-verified",
    hide: "Removed from public listing",
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
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione del record",
  backToDirectory: "← Torna all'elenco",
  loading: "Caricamento del record pubblico…",
  publicRecord: "Record pubblico",
  recordId: "ID record",
  source: "Fonte",
  lastVerification: "Ultima verifica",
  generalLocation: "Posizione generale",
  manufacturer: "Produttore",
  observedOn: "Data osservata",
  viewOnMap: "Vedi sulla mappa",
  reportIssue: "Segnala un problema",
  recordNote:
    "Questa pagina contiene solo record pubblici revisionati o dati di prototipo chiaramente etichettati. Non fornisce flussi video in diretta né dettagli operativi delle telecamere.",
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
    "Questa cronologia elenca solo le modifiche revisionate. Non include mai identità dei contributori né note interne.",
  changeHistoryFallback: "Record aggiornato",
  changeHistoryLabels: {
    approve: "Approvato e pubblicato",
    "mark-stale": "Segnalato per un nuovo riesame",
    reverify: "Riverificato",
    hide: "Rimosso dall'elenco pubblico",
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
};
