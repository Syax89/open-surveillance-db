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
    "Use the private correction form, or write to privacy@opensurveillancedb.org. Correction requests are private: they do not change the map automatically and are never included in the public export. First response within 48 hours; substantive response within 14 days.",
  qPrivacy: "What about privacy?",
  aPrivacy:
    "Reports are private while pending; published records contain no faces, licence plates or personal data. The data controller is Simone Rondina (syax89) / OpenSurveillanceDB, Italy. Data-subject rights (access, rectification, erasure, objection) can be exercised via privacy@opensurveillancedb.org.",
  qAccount: "Do I need an account?",
  aAccount:
    "Browsing works without an account. Submitting a report or a correction requires a free, verified account, which also adds attribution: you can follow your own reports, edit your contributions, verify records you have seen and build a trust level from your verified contributions.",
  qVerifications: "What are verifications?",
  aVerifications:
    "A verification is a personal confirmation that a camera exists at the documented location. Each account can add one verification per record, so the count reflects distinct people. Public pages show only the total number of verifications — who verified a record is never shown.",
  qEdit: "Can I edit my contribution?",
  aEdit:
    "Only the contributor who submitted a record can edit it. A report still in moderation can be corrected directly by its owner. Once a record is published, an edit goes back into moderation and appears in public data only after a human review approves it.",
  qLevels: "What are contributor levels?",
  aLevels:
    "Trust levels recognise accurate contributions: only verified records count, with thresholds at 1, 5, 20 and 50 verified contributions. Levels are recognition, not a competition — no public ranking or leaderboard exists.",
  qDeleteAccount: "What happens to my verifications if I delete my account?",
  aDeleteAccount:
    "Account erasure removes the link between you and the community data: verifications you received are deleted, verifications you gave are de-identified (they stay on the record without pointing to you), and your published reports remain published without attribution to you.",
  moreTitle: "Still have questions?",
  moreBody:
    "For corrections, removals and privacy requests, use the correction form or the contact page.",
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
    "Usa il modulo privato di correzione oppure scrivi a privacy@opensurveillancedb.org. Le richieste di correzione sono private: non modificano la mappa automaticamente e non finiscono mai nell'esportazione pubblica. Prima risposta entro 48 ore; risposta sostanziale entro 14 giorni.",
  qPrivacy: "E per quanto riguarda la privacy?",
  aPrivacy:
    "Le segnalazioni sono private finché sono in attesa; i record pubblicati non contengono volti, targhe o dati personali. Il titolare del trattamento è Simone Rondina (syax89) / OpenSurveillanceDB, Italia. I diritti dell'interessato (accesso, rettifica, cancellazione, opposizione) si esercitano scrivendo a privacy@opensurveillancedb.org.",
  qAccount: "Serve un account?",
  aAccount:
    "Per consultare, no. Per segnalare una telecamera o inviare una correzione serve un account gratuito e verificato, che aggiunge anche l'attribuzione: puoi seguire le tue segnalazioni, modificare i tuoi contributi, verificare i record che hai visto e costruire un livello di fiducia con i tuoi contributi verificati.",
  qVerifications: "Cosa sono le verifiche?",
  aVerifications:
    "Una verifica è una conferma personale che una telecamera esista nella posizione documentata. Ogni account può aggiungere una verifica per record, quindi il conteggio riflette persone distinte. Le pagine pubbliche mostrano solo il numero totale di verifiche: chi ha verificato un record non viene mai mostrato.",
  qEdit: "Posso modificare il mio contributo?",
  aEdit:
    "Solo chi ha inviato un record può modificarlo. Una segnalazione ancora in moderazione può essere corretta direttamente dal suo autore. Quando un record è pubblicato, una modifica torna in moderazione e compare nei dati pubblici solo dopo l'approvazione di una revisione umana.",
  qLevels: "Cosa sono i livelli di contributor?",
  aLevels:
    "I livelli di fiducia riconoscono i contributi accurati: contano solo i record verificati, con soglie a 1, 5, 20 e 50 contributi verificati. I livelli sono riconoscimento, non competizione: non esiste alcuna classifica pubblica.",
  qDeleteAccount: "Cosa succede alle mie verifiche se elimino l'account?",
  aDeleteAccount:
    "La cancellazione dell'account rimuove il collegamento tra te e i dati community: le verifiche che hai ricevuto vengono eliminate, quelle che hai dato vengono de-identificate (restano sul record senza puntare a te) e i tuoi record pubblicati restano pubblicati senza attribuzione a te.",
  moreTitle: "Hai ancora domande?",
  moreBody:
    "Per correzioni, rimozioni e richieste relative alla privacy usa il modulo di correzione o la pagina dei contatti.",
  contactCta: "Apri la pagina dei contatti",
  correctionCta: "Vai al modulo di correzione",
  footer: "Creato per la trasparenza, non per il tracciamento.",
};
