/**
 * report — interface strings for the report tool (/segnala).
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  // Page-level chrome (/segnala).
  pageTitle: "Report a camera",
  pageIntro:
    "Choose a location on the map or enter coordinates, then add only what you can observe from public space. Photos are optional, stored privately, and only published after human review with confirmed redaction.",
  navigation: "Report navigation",
  homeAria: "OpenSurveillanceDB home",
  // Report section (extracted from the home page bundle in F1).
  contribute: "Contribute",
  reportTitle: "Help make public space legible.",
  reportIntro:
    "Choose a location on the map or enter coordinates, then add only what you can observe from public space. Photos are optional, stored privately, and only published after human review with confirmed redaction.",
  beforeSubmitting: "Before submitting",
  beforeSubmittingBody:
    "Do not upload or describe people, licence plates, private homes, security weaknesses or sensitive locations.",
  selectedPoint: "Selected point",
  manualCoordinatesTitle: "Or enter coordinates",
  manualCoordinatesHelp:
    "Use decimal degrees. Latitude must be between -90 and 90; longitude between -180 and 180. A comma is accepted as the decimal separator.",
  latitude: "Latitude",
  longitude: "Longitude",
  useCoordinates: "Use these coordinates",
  checkingNearby: "Checking reviewed records within 75 metres…",
  possibleDuplicate: "Possible duplicate nearby",
  duplicateBody:
    "These reviewed records are within 75 metres. You can still submit a new report; it will be reviewed separately.",
  metresAway: "m away",
  matchVeryClose: "very close match",
  matchLikely: "likely match",
  duplicateGuidance:
    "If this is the same camera, use the correction form instead of creating a duplicate.",
  // Horizon 1 duplicate gate (ADR 0019): a high-strength match must be
  // acknowledged before the report can be stored.
  duplicateConfirmNotice:
    "A very close match was found nearby. Confirm that this is a distinct camera to submit, or use the correction form for the existing record.",
  duplicateConfirmTitle: "A very close match already exists nearby",
  duplicateConfirmBody:
    "A reviewed record at almost the same spot was found. If this is the same camera, use the correction form. If it is a different camera, confirm below to submit it for moderation.",
  duplicateConfirmLabel:
    "I confirm this is a distinct camera and I still want to submit it.",
  nearbyUnavailable:
    "We could not check nearby records. You can still submit this report for moderation.",
  recordTitle: "Record title",
  recordTitlePlaceholder: "e.g. Public security camera",
  selectOne: "Select one",
  cameraType: "Camera type",
  fixedDome: "Fixed dome",
  bullet: "Bullet",
  trafficReader: "Traffic / licence plate reader",
  otherUnknown: "Other / unknown",
  manufacturer: "Manufacturer (optional)",
  manufacturerPlaceholder: "e.g. manufacturer name",
  observedOn: "Date observed (optional)",
  approximateAddress: "Approximate address",
  addressPlaceholder: "Street and city (optional)",
  whatObserved: "What did you observe?",
  observedPlaceholder: "Direction, operator, visible notice, model…",
  reportConsent:
    "I confirm this observation was made from public space and contains no personal data.",
  privacyNotice: "Privacy notice",
  termsOfUse: "Terms of use",
  photoRedactionConfirm:
    "I confirm that I have redacted (blurred or removed) any faces and licence plates in the photos.",
  reportArt13:
    "The data you enter (location, notes, any photos) is processed by the controller Simone Rondina / OpenSurveillanceDB on the basis of legitimate interest (art. 6(1)(f) GDPR) to document public surveillance infrastructure. Full notice:",
  reportArt13Rights: "You can exercise your GDPR rights (arts. 15-22) by writing to",
  privacyContact: "privacy@opensurveillancedb.org",
  photoUploadTitle: "Photo evidence (optional)",
  photoUploadHelp:
    "JPEG, PNG or WebP up to 10 MB and 4096 px per side. Faces, licence plates and other personal data must be redacted before uploading; location and camera metadata (EXIF) is stripped automatically on upload.",
  photoExifPrivacyNote: "EXIF metadata is stripped on upload — see the",
  photoExifPrivacyLink: "privacy notice",
  photoUploadLabel: "Choose photos",
  photoUploading: "Uploading…",
  photoUploadError: "The photo could not be uploaded.",
  photoAdded: "Photo added — it will be reviewed by a moderator before any publication.",
  photoRemove: "Remove",
  photoMaxReached: "A report can include up to 5 photos.",
  photoRedactionReminder:
    "Redact faces and licence plates before uploading. Photos are never shown publicly without moderator approval and confirmed redaction.",
  sendModeration: "Send to moderation",
  positionSelected: "Position selected",
  nearbyCheckError: "Unable to check nearby records",
  choosePosition:
    "Choose the approximate camera position on the map or enter valid coordinates before submitting.",
  invalidCoordinates:
    "Enter a valid latitude (-90 to 90) and longitude (-180 to 180).",
  defaultReportTitle: "Public camera report",
  unknown: "Unknown",
  submitReportError: "Unable to submit report",
  reportSaved:
    "Report saved. It is now marked ‘In moderation’ and is not shown publicly until reviewed.",
  reportSavedWithNearby:
    "Reviewed records were found close to this position — a moderator will check whether this is a duplicate before publication.",
  moderationUnavailable:
    "The moderation queue is unavailable. Please try again after restarting the local prototype.",
} as const;

export const it: Translation<typeof en> = {
  // Chrome di pagina (/segnala).
  pageTitle: "Segnala una telecamera",
  pageIntro:
    "Scegli una posizione sulla mappa o inserisci le coordinate, poi aggiungi solo ciò che puoi osservare dallo spazio pubblico. Le foto sono facoltative, restano private e vengono pubblicate solo dopo revisione umana con redazione confermata.",
  navigation: "Navigazione segnalazione",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  // Sezione segnalazione (estratta dal bundle della home nella F1).
  contribute: "Contribuisci",
  reportTitle: "Rendi leggibile lo spazio pubblico.",
  reportIntro:
    "Scegli una posizione sulla mappa o inserisci le coordinate, poi aggiungi solo ciò che puoi osservare dallo spazio pubblico. Le foto sono facoltative, restano private e vengono pubblicate solo dopo revisione umana con redazione confermata.",
  beforeSubmitting: "Prima di inviare",
  beforeSubmittingBody:
    "Non caricare né descrivere persone, targhe, abitazioni private, debolezze di sicurezza o luoghi sensibili.",
  selectedPoint: "Punto selezionato",
  manualCoordinatesTitle: "Oppure inserisci le coordinate",
  manualCoordinatesHelp:
    "Usa gradi decimali. La latitudine deve essere tra -90 e 90; la longitudine tra -180 e 180. La virgola è accettata come separatore decimale.",
  latitude: "Latitudine",
  longitude: "Longitudine",
  useCoordinates: "Usa queste coordinate",
  checkingNearby: "Verifica dei record revisionati entro 75 metri…",
  possibleDuplicate: "Possibile duplicato nelle vicinanze",
  duplicateBody:
    "Questi record revisionati sono entro 75 metri. Puoi comunque inviare una nuova segnalazione: sarà revisionata separatamente.",
  metresAway: "m di distanza",
  matchVeryClose: "corrispondenza molto vicina",
  matchLikely: "corrispondenza probabile",
  duplicateGuidance:
    "Se è la stessa telecamera, usa il modulo di correzione invece di creare un duplicato.",
  // Gate duplicati Horizon 1 (ADR 0019): una corrispondenza molto vicina
  // deve essere confermata prima che la segnalazione venga salvata.
  duplicateConfirmNotice:
    "Trovata una corrispondenza molto vicina. Conferma che si tratta di una telecamera diversa per inviare, oppure usa il modulo di correzione per il record esistente.",
  duplicateConfirmTitle: "Una corrispondenza molto vicina esiste già nelle vicinanze",
  duplicateConfirmBody:
    "È stato trovato un record revisionato quasi nello stesso punto. Se è la stessa telecamera, usa il modulo di correzione. Se è una telecamera diversa, conferma qui sotto per inviarla in moderazione.",
  duplicateConfirmLabel:
    "Confermo che è una telecamera diversa e voglio comunque inviarla.",
  nearbyUnavailable:
    "Non è stato possibile verificare i record vicini. Puoi comunque inviare la segnalazione per la moderazione.",
  recordTitle: "Titolo del record",
  recordTitlePlaceholder: "es. Telecamera di sicurezza pubblica",
  selectOne: "Seleziona un'opzione",
  cameraType: "Tipo di telecamera",
  fixedDome: "Dome fissa",
  bullet: "Bullet",
  trafficReader: "Traffico / lettore targhe",
  otherUnknown: "Altro / sconosciuto",
  manufacturer: "Produttore (facoltativo)",
  manufacturerPlaceholder: "es. nome del produttore",
  observedOn: "Data osservata (facoltativa)",
  approximateAddress: "Indirizzo approssimativo",
  addressPlaceholder: "Via e città (facoltative)",
  whatObserved: "Cosa hai osservato?",
  observedPlaceholder: "Direzione, gestore, avviso visibile, modello…",
  reportConsent:
    "Confermo che l'osservazione è stata fatta dallo spazio pubblico e non contiene dati personali.",
  privacyNotice: "Informativa privacy",
  termsOfUse: "Termini d'uso",
  photoRedactionConfirm: "Confermo di aver oscurato volti e targhe nelle foto.",
  reportArt13:
    "I dati che inserisci (posizione, note, eventuali foto) sono trattati dal titolare Simone Rondina / OpenSurveillanceDB su base di interesse legittimo (art. 6(1)(f) GDPR) per documentare infrastrutture di sorveglianza pubbliche. Informativa completa:",
  reportArt13Rights: "Puoi esercitare i diritti previsti dagli artt. 15-22 GDPR scrivendo a",
  privacyContact: "privacy@opensurveillancedb.org",
  photoUploadTitle: "Prova fotografica (facoltativa)",
  photoUploadHelp:
    "JPEG, PNG o WebP fino a 10 MB e 4096 px per lato. Volti, targhe e altri dati personali devono essere oscurati prima del caricamento; i metadati di posizione e della fotocamera (EXIF) vengono rimossi automaticamente all'upload.",
  photoExifPrivacyNote: "I metadati EXIF vengono rimossi all'upload — vedi l'",
  photoExifPrivacyLink: "informativa privacy",
  photoUploadLabel: "Scegli le foto",
  photoUploading: "Caricamento…",
  photoUploadError: "La foto non può essere caricata.",
  photoAdded: "Foto aggiunta — verrà esaminata da un moderatore prima di qualsiasi pubblicazione.",
  photoRemove: "Rimuovi",
  photoMaxReached: "Una segnalazione può includere fino a 5 foto.",
  photoRedactionReminder:
    "Oscura volti e targhe prima del caricamento. Le foto non vengono mai mostrate pubblicamente senza approvazione del moderatore e redazione confermata.",
  sendModeration: "Invia alla moderazione",
  positionSelected: "Posizione selezionata",
  nearbyCheckError: "Impossibile verificare i record vicini",
  choosePosition:
    "Scegli la posizione approssimativa della telecamera sulla mappa o inserisci coordinate valide prima di inviare.",
  invalidCoordinates:
    "Inserisci una latitudine valida (-90 a 90) e una longitudine valida (-180 a 180).",
  defaultReportTitle: "Segnalazione di telecamera pubblica",
  unknown: "Sconosciuto",
  submitReportError: "Impossibile inviare la segnalazione",
  reportSaved:
    "Segnalazione salvata. Ora è in moderazione e non viene mostrata pubblicamente finché non è revisionata.",
  reportSavedWithNearby:
    "Trovati record revisionati vicino a questa posizione: un moderatore verificherà se si tratta di un duplicato prima della pubblicazione.",
  moderationUnavailable:
    "La coda di moderazione non è disponibile. Riprova dopo aver riavviato il prototipo locale.",
};
