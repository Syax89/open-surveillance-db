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
    "Choose a location on the map or enter coordinates, then add only what you can observe from public space. Your report is published immediately after review.",
  navigation: "Report navigation",
  homeAria: "OpenSurveillanceDB home",
  // Report section (extracted from the home page bundle in F1).
  contribute: "Contribute",
  reportTitle: "Help make public space legible.",
  reportIntro:
    "Choose a location on the map or enter coordinates, then add only what you can observe from public space. Your report is published immediately after review.",
  beforeSubmitting: "Before submitting",
  beforeSubmittingBody:
    "Do not describe people, licence plates, private homes, security weaknesses or sensitive locations.",
  stepLocation: "1. Location",
  stepObservation: "2. What you observed",
  stepEvidence: "3. Confirm and publish",
  selectedPoint: "Selected point",
  // Report mini-map (t_ebbe0ea3): click to pick the position, drag the
  // cone's rotation handle to aim the field of view. The manual coordinate
  // fields below stay as the accessible fallback.
  mapAria: "Map — click to choose the camera position",
  mapHelp:
    "Click the map to choose the camera position. For directional cameras, drag the round handle on the cone to set the viewing direction.",
  manualCoordinatesTitle: "Or enter coordinates",
  manualCoordinatesHelp:
    "Use decimal degrees. Latitude must be between -90 and 90; longitude between -180 and 180. A comma is accepted as the decimal separator.",
  latitude: "Latitude",
  longitude: "Longitude",
  useCoordinates: "Use these coordinates",
  // One-tap geolocation (CEO 2026-08-09): the primary way to set a position
  // on a phone, standing in front of the camera. The map and the manual
  // fields stay as the alternatives when the device or the user says no.
  useMyPosition: "Use my position",
  locatingPosition: "Finding your position…",
  geolocationDenied:
    "Location permission was refused. Choose the point on the map, or type the coordinates below.",
  geolocationTimeout:
    "Your position took too long to arrive. Try again, choose the point on the map, or type the coordinates below.",
  geolocationUnavailable:
    "Your device could not provide a position. Choose the point on the map, or type the coordinates below.",
  checkingNearby: "Checking nearby public records…",
  possibleDuplicate: "Possible duplicate nearby",
  duplicateBody:
    "These public records are within 75 metres. You can still submit a new report; it will be published immediately.",
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
    "A record is already published at almost the same spot. If this is the same camera, use the correction form. If it is a different camera, confirm below to publish it.",
  duplicateConfirmLabel:
    "I confirm this is a distinct camera and I still want to submit it.",
  nearbyUnavailable:
    "We could not check nearby records. You can still submit this report.",
  recordTitle: "Record title",
  recordTitlePlaceholder: "e.g. Public security camera",
  selectOne: "Select one",
  cameraType: "Camera type",
  fixedDome: "Fixed dome",
  bullet: "Bullet",
  ptz: "PTZ",
  trafficReader: "Traffic / licence plate reader",
  otherUnknown: "Other / unknown",
  // Field-of-view direction (t_f8b775ec): shown only for directional kinds
  // (never for domes). A compass slider 0-359 with an arrow preview plus a
  // "don't know" option that stores NULL.
  directionTitle: "Field of view direction",
  directionHelp: "The compass bearing the camera points towards, clockwise from north (0–359°).",
  directionUnknown: "I don't know the direction",
  directionDegrees: "Direction",
  manufacturer: "Manufacturer (optional)",
  manufacturerPlaceholder: "e.g. manufacturer name",
  observedOn: "Date observed (optional)",
  approximateAddress: "Approximate address",
  addressPlaceholder: "Street and city (optional)",
  resolvingAddress: "Resolving address…",
  whatObserved: "What did you observe?",
  observedPlaceholder: "Direction, operator, visible notice, model…",
  reportConsent:
    "I confirm this observation was made from public space and contains no personal data.",
  privacyNotice: "Privacy notice",
  privacyDetails: "Privacy details",
  termsOfUse: "Terms of use",
  reportArt13:
    "The data you enter (location, notes) is processed by the controller Simone Rondina / OpenSurveillanceDB on the basis of legitimate interest (art. 6(1)(f) GDPR) to document public surveillance infrastructure. Full notice:",
  reportArt13Rights: "You can exercise your GDPR rights (arts. 15-22) by writing to",
  privacyContact: "privacy@opensurveillancedb.org",
  sendModeration: "Publish report",
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
    "Report published — it is now visible in the directory and on the map.",
  reportSavedWithNearby:
    "Nearby records were found close to this position — the community will check whether this is a duplicate.",
  // P1-2 (design review): the write gate (Fase E1) refuses submissions from
  // anonymous (401) and unverified (403) sessions. The login wall gates the
  // form itself; these messages cover a session that dies mid-form.
  loginRequired:
    "Your session has ended. Log in again to submit the report.",
  verifyRequired:
    "Your email is not verified yet. Verify it from your account page to submit the report.",
  moderationUnavailable:
    "Publishing is unavailable. Please try again later.",
} as const;

export const it: Translation<typeof en> = {
  // Chrome di pagina (/segnala).
  pageTitle: "Segnala una telecamera",
  pageIntro:
    "Scegli una posizione sulla mappa o inserisci le coordinate, poi aggiungi solo ciò che puoi osservare dallo spazio pubblico. La tua segnalazione viene pubblicata dopo la revisione.",
  navigation: "Navigazione segnalazione",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  // Sezione segnalazione (estratta dal bundle della home nella F1).
  contribute: "Contribuisci",
  reportTitle: "Rendi leggibile lo spazio pubblico.",
  reportIntro:
    "Scegli una posizione sulla mappa o inserisci le coordinate, poi aggiungi solo ciò che puoi osservare dallo spazio pubblico. La tua segnalazione viene pubblicata dopo la revisione.",
  beforeSubmitting: "Prima di inviare",
  beforeSubmittingBody:
    "Non descrivere persone, targhe, abitazioni private, debolezze di sicurezza o luoghi sensibili.",
  stepLocation: "1. Posizione",
  stepObservation: "2. Cosa hai osservato",
  stepEvidence: "3. Conferma e pubblicazione",
  selectedPoint: "Punto selezionato",
  // Mini-mappa del modulo (t_ebbe0ea3): click per scegliere la posizione e
  // trascina la maniglia sul cono per orientare il campo visivo. I campi
  // manuali qui sotto restano come fallback accessibile.
  mapAria: "Mappa — clicca per scegliere la posizione della telecamera",
  mapHelp:
    "Clicca sulla mappa per scegliere la posizione della telecamera. Per le telecamere direzionali, trascina la maniglia sul cono per impostare la direzione di visuale.",
  manualCoordinatesTitle: "Oppure inserisci le coordinate",
  manualCoordinatesHelp:
    "Usa gradi decimali. La latitudine deve essere tra -90 e 90; la longitudine tra -180 e 180. La virgola è accettata come separatore decimale.",
  latitude: "Latitudine",
  longitude: "Longitudine",
  useCoordinates: "Usa queste coordinate",
  useMyPosition: "Usa la mia posizione",
  locatingPosition: "Ricerca della posizione…",
  geolocationDenied:
    "Permesso di localizzazione negato. Scegli il punto sulla mappa, oppure inserisci le coordinate qui sotto.",
  geolocationTimeout:
    "La posizione ha richiesto troppo tempo. Riprova, scegli il punto sulla mappa, oppure inserisci le coordinate qui sotto.",
  geolocationUnavailable:
    "Il dispositivo non ha fornito una posizione. Scegli il punto sulla mappa, oppure inserisci le coordinate qui sotto.",
  checkingNearby: "Verifica dei record pubblici vicini…",
  possibleDuplicate: "Possibile duplicato nelle vicinanze",
  duplicateBody:
    "Questi record pubblici sono entro 75 metri. Puoi comunque inviare una nuova segnalazione: verrà pubblicata subito.",
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
    "È già pubblicato un record quasi nello stesso punto. Se è la stessa telecamera, usa il modulo di correzione. Se è una telecamera diversa, conferma qui sotto per pubblicarla.",
  duplicateConfirmLabel:
    "Confermo che è una telecamera diversa e voglio comunque inviarla.",
  nearbyUnavailable:
    "Non è stato possibile verificare i record vicini. Puoi comunque inviare la segnalazione.",
  recordTitle: "Titolo del record",
  recordTitlePlaceholder: "es. Telecamera di sicurezza pubblica",
  selectOne: "Seleziona un'opzione",
  cameraType: "Tipo di telecamera",
  fixedDome: "Dome fissa",
  bullet: "Bullet",
  ptz: "PTZ",
  trafficReader: "Traffico / lettore targhe",
  otherUnknown: "Altro / sconosciuto",
  // Direzione del campo visivo (t_f8b775ec): visibile solo per i tipi
  // direzionali (mai per le cupole). Slider bussola 0-359 con anteprima a
  // freccia più opzione "non so" che salva NULL.
  directionTitle: "Direzione del campo visivo",
  directionHelp: "Il rilevamento verso cui punta la telecamera, in senso orario da nord (0–359°).",
  directionUnknown: "Non conosco la direzione",
  directionDegrees: "Direzione",
  manufacturer: "Produttore (facoltativo)",
  manufacturerPlaceholder: "es. nome del produttore",
  observedOn: "Data osservata (facoltativa)",
  approximateAddress: "Indirizzo approssimativo",
  addressPlaceholder: "Via e città (facoltative)",
  resolvingAddress: "Ricerca indirizzo…",
  whatObserved: "Cosa hai osservato?",
  observedPlaceholder: "Direzione, gestore, avviso visibile, modello…",
  reportConsent:
    "Confermo che l'osservazione è stata fatta dallo spazio pubblico e non contiene dati personali.",
  privacyNotice: "Informativa privacy",
  privacyDetails: "Dettagli privacy",
  termsOfUse: "Termini d'uso",
  reportArt13:
    "I dati che inserisci (posizione, note) sono trattati dal titolare Simone Rondina / OpenSurveillanceDB su base di interesse legittimo (art. 6(1)(f) GDPR) per documentare infrastrutture di sorveglianza pubbliche. Informativa completa:",
  reportArt13Rights: "Puoi esercitare i diritti previsti dagli artt. 15-22 GDPR scrivendo a",
  privacyContact: "privacy@opensurveillancedb.org",
  sendModeration: "Pubblica la segnalazione",
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
    "Segnalazione pubblicata — ora è visibile nell'elenco e sulla mappa.",
  reportSavedWithNearby:
    "Trovati record pubblici vicino a questa posizione — la community verificherà se si tratta di un duplicato.",
  // P1-2 (design review): il write gate (Fase E1) rifiuta gli invii da sessioni
  // anonime (401) e non verificate (403). Il login wall copre il modulo; questi
  // messaggi gestiscono una sessione che scade a modulo compilato.
  loginRequired:
    "La sessione è terminata. Accedi di nuovo per inviare la segnalazione.",
  verifyRequired:
    "La tua email non è ancora verificata. Verificala dalla pagina del tuo account per inviare la segnalazione.",
  moderationUnavailable:
    "La pubblicazione non è disponibile. Riprova più tardi.",
};
