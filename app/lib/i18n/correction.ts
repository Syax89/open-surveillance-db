/**
 * correction — interface strings for the correction tool (/correggi).
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  // Page-level chrome (/correggi).
  pageTitle: "Correct a record",
  pageIntro:
    "Corrections are private. They do not change the map automatically and are never included in the public data export.",
  navigation: "Correction navigation",
  homeAria: "OpenSurveillanceDB home",
  // Correction section (extracted from the home page bundle in F1).
  accountability: "Accountability",
  correctionTitle: "Correct a record or raise a concern.",
  correctionIntro:
    "Corrections are private. They do not change the map automatically and are never included in the public data export.",
  urgentConcern: "Urgent privacy or safety concern?",
  urgentConcernBody:
    "Describe only the minimum needed to identify the problem. Do not include personal data, live-feed links, credentials, or images.",
  relatedRecord: "Related public record",
  noSpecificRecord: "No specific record / general concern",
  needsReview: "What needs review?",
  selectOne: "Select one",
  inaccurate: "Inaccurate information",
  outdated: "Outdated record",
  privacySafety: "Privacy or safety concern",
  duplicate: "Duplicate record",
  other: "Other",
  briefDescription: "Brief description",
  correctionPlaceholder:
    "Explain the issue without including personal data or operational details.",
  contactEmail: "Contact email (optional)",
  contactPlaceholder: "Only if you want a reply",
  correctionConsent:
    "I understand that this request is private, reviewed by humans, and may not result in an automatic change.",
  correctionArt13:
    "The request data and your contact details are processed by the controller Simone Rondina / OpenSurveillanceDB to handle your request, on the basis of legal obligation (art. 6(1)(c) GDPR — arts. 15-22) and legitimate interest (art. 6(1)(f)). Full notice:",
  correctionArt13Rights: "You can exercise your GDPR rights by writing to",
  privacyContact: "privacy@opensurveillancedb",
  sendPrivateRequest: "Send private request",
  privacyNotice: "Privacy notice",
  termsOfUse: "Terms of use",
  saveRequestError: "Unable to save request",
  correctionSaved: "Private correction request saved with reference",
  correctionPrivate: "It is not displayed in the public directory.",
  correctionUnavailable: "The correction queue is unavailable. Please try again later.",
  // ?record=ID prefill announcement (aria-live).
  recordPreselected: (recordId: number, title: string) =>
    `Record ${recordId} preselected: ${title}. Describe the issue below.`,
} as const;

export const it: Translation<typeof en> = {
  // Chrome di pagina (/correggi).
  pageTitle: "Correggi un record",
  pageIntro:
    "Le correzioni sono private. Non modificano automaticamente la mappa e non sono mai incluse nell'esportazione dei dati pubblici.",
  navigation: "Navigazione correzione",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  // Sezione correzione (estratta dal bundle della home nella F1).
  accountability: "Responsabilità",
  correctionTitle: "Correggi un record o segnala una criticità.",
  correctionIntro:
    "Le correzioni sono private. Non modificano automaticamente la mappa e non sono mai incluse nell'esportazione dei dati pubblici.",
  urgentConcern: "Problema urgente di privacy o sicurezza?",
  urgentConcernBody:
    "Descrivi solo il minimo necessario per identificare il problema. Non includere dati personali, link a feed in diretta, credenziali o immagini.",
  relatedRecord: "Record pubblico collegato",
  noSpecificRecord: "Nessun record specifico / segnalazione generale",
  needsReview: "Cosa deve essere rivisto?",
  selectOne: "Seleziona un'opzione",
  inaccurate: "Informazione inesatta",
  outdated: "Record non aggiornato",
  privacySafety: "Problema di privacy o sicurezza",
  duplicate: "Record duplicato",
  other: "Altro",
  briefDescription: "Breve descrizione",
  correctionPlaceholder:
    "Spiega il problema senza inserire dati personali o dettagli operativi.",
  contactEmail: "Email di contatto (facoltativa)",
  contactPlaceholder: "Solo se desideri una risposta",
  correctionConsent:
    "Comprendo che questa richiesta è privata, viene revisionata da persone e potrebbe non produrre una modifica automatica.",
  correctionArt13:
    "I dati della richiesta e i tuoi recapiti sono trattati dal titolare Simone Rondina / OpenSurveillanceDB per gestire la tua richiesta, su base di obbligo legale (art. 6(1)(c) GDPR — artt. 15-22) e di interesse legittimo (art. 6(1)(f)). Informativa completa:",
  correctionArt13Rights: "Puoi esercitare i tuoi diritti GDPR scrivendo a",
  privacyContact: "privacy@opensurveillancedb",
  sendPrivateRequest: "Invia richiesta privata",
  privacyNotice: "Informativa privacy",
  termsOfUse: "Termini d'uso",
  saveRequestError: "Impossibile salvare la richiesta",
  correctionSaved: "Richiesta privata di correzione salvata con riferimento",
  correctionPrivate: "Non viene mostrata nell'elenco pubblico.",
  correctionUnavailable: "La coda delle correzioni non è disponibile. Riprova più tardi.",
  // Annuncio precompilazione ?record=ID (aria-live).
  recordPreselected: (recordId: number, title: string) =>
    `Record ${recordId} preselezionato: ${title}. Descrivi il problema qui sotto.`,
};
