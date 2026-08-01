/**
 * faq — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "FAQ navigation",
  homeAria: "OpenSurveillanceDB home",
  map: "Map",
  directory: "Directory",
  home: "Home",
  faqLabel: "FAQ",
  contactLabel: "Contacts",
  eyebrow: "Frequently asked questions",
  title: "Questions people ask about the database.",
  intro:
    "Short answers about reporting, map accuracy, corrections and privacy. For anything not covered here, use the correction form or the contact page.",
  qReport: "How do I report a camera?",
  aReport:
    "Choose an approximate location on the map (or enter coordinates), then add only what you can observe from public space: type, direction, visible notice, manufacturer. Do not include people, licence plates, private homes, credentials or live-feed links. The report starts as private pending data and becomes public only after a human review approves it.",
  qAccuracy: "How accurate is the map?",
  aAccuracy:
    "The map shows only reviewed public records, and published coordinates are intentionally rounded to about 4 decimal places (roughly 10 metres). A status describes the current review state, not a guarantee that a camera is active. An empty area does not prove that no cameras are present — it only shows that no reviewed record is currently published there.",
  qCorrect: "How do I correct an error?",
  aCorrect:
    "Use the private correction form on the home page (“Correct a record or raise a concern”) or write to privacy@opensurveillancedb. Correction requests are private: they do not change the map automatically and are never included in the public export. First response within 48 hours; substantive response within 14 days.",
  qPrivacy: "What about privacy?",
  aPrivacy:
    "Reports are private while pending; published records contain no faces, licence plates or personal data. The data controller is Simone Rondina (syax89) / OpenSurveillanceDB, Italy. Data-subject rights (access, rectification, erasure, objection) can be exercised via privacy@opensurveillancedb.",
  moreTitle: "Still have questions?",
  moreBody:
    "For corrections, removals and privacy requests use the correction form on the home page or the contact page.",
  contactCta: "Open the contact page",
  correctionCta: "Go to the correction form",
  footer: "Built for transparency, not tracking.",
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione FAQ",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  map: "Mappa",
  directory: "Elenco",
  home: "Home",
  faqLabel: "FAQ",
  contactLabel: "Contatti",
  eyebrow: "Domande frequenti",
  title: "Le domande che le persone fanno sul database.",
  intro:
    "Risposte brevi su segnalazioni, precisione della mappa, correzioni e privacy. Per tutto ciò che non è trattato qui, usa il modulo di correzione o la pagina dei contatti.",
  qReport: "Come si segnala una telecamera?",
  aReport:
    "Scegli una posizione approssimativa sulla mappa (o inserisci le coordinate), poi aggiungi solo ciò che puoi osservare dallo spazio pubblico: tipo, direzione, avviso visibile, produttore. Non includere persone, targhe, abitazioni private, credenziali o link a feed in diretta. La segnalazione nasce come dato privato in attesa e diventa pubblica solo dopo l'approvazione di una revisione umana.",
  qAccuracy: "Quanto è precisa la mappa?",
  aAccuracy:
    "La mappa mostra solo record pubblici revisionati e le coordinate pubblicate sono volutamente arrotondate a circa 4 decimali (circa 10 metri). Uno stato descrive la situazione di revisione corrente, non la garanzia che una telecamera sia attiva. Un'area vuota non dimostra che non ci siano telecamere: mostra solo che in quel punto non c'è attualmente alcun record revisionato pubblicato.",
  qCorrect: "Come si corregge un errore?",
  aCorrect:
    "Usa il modulo privato di correzione nella home page (“Correggi un record o segnala un problema”) oppure scrivi a privacy@opensurveillancedb. Le richieste di correzione sono private: non modificano la mappa automaticamente e non finiscono mai nell'esportazione pubblica. Prima risposta entro 48 ore; risposta sostanziale entro 14 giorni.",
  qPrivacy: "E per quanto riguarda la privacy?",
  aPrivacy:
    "Le segnalazioni sono private finché sono in attesa; i record pubblicati non contengono volti, targhe o dati personali. Il titolare del trattamento è Simone Rondina (syax89) / OpenSurveillanceDB, Italia. I diritti dell'interessato (accesso, rettifica, cancellazione, opposizione) si esercitano scrivendo a privacy@opensurveillancedb.",
  moreTitle: "Hai ancora domande?",
  moreBody:
    "Per correzioni, rimozioni e richieste relative alla privacy usa il modulo di correzione nella home page o la pagina dei contatti.",
  contactCta: "Apri la pagina dei contatti",
  correctionCta: "Vai al modulo di correzione",
  footer: "Creato per la trasparenza, non per il tracciamento.",
};
