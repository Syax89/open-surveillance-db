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
  title: "Clear answers about how the database works.",
  intro:
    "Short answers about reporting, map accuracy, community actions, corrections and privacy. For anything not covered here, use the correction form or the contact page.",
  qReport: "How do I report a camera?",
  aReport:
    "Pick an approximate location on the map, or enter coordinates. Then add only what you can observe from public space: type, direction, visible notice, manufacturer. Do not include people, licence plates, private homes, credentials or live-feed links. From a verified account, your report is published immediately.",
  qAccuracy: "How accurate is the map?",
  aAccuracy:
    "The map shows the live records: every report from a verified account appears right away, and the community keeps it accurate. Published coordinates are rounded to about four decimal places, roughly 10 metres. A status describes the current state, not a guarantee that a camera is active. An empty area does not prove that no cameras are present — it only shows that no record is currently published there.",
  qCorrect: "How do I correct an error?",
  aCorrect:
    "Use the private correction form, or write to privacy@opensurveillancedb.org. Correction requests are private: they do not change the map automatically and are never included in the public export. First response within 48 hours; substantive response within 14 days.",
  qPrivacy: "What about privacy?",
  aPrivacy:
    "Reports are public as soon as they are published and never contain faces, licence plates or personal data. Private correction requests stay private. The data controller is Simone Rondina (syax89) / OpenSurveillanceDB, Italy. Data-subject rights (access, rectification, erasure, objection) can be exercised via privacy@opensurveillancedb.org.",
  qAccount: "Do I need an account?",
  aAccount:
    "Browsing works without an account. Submitting a report, sending a correction or taking part in community actions requires a free, verified account. With one, you can follow your reports, edit your contributions, confirm records and build a trust level.",
  qVerifications: "What are confirmations?",
  aVerifications:
    "A confirmation is a personal check that a camera still exists at the documented location. Each account can keep one community action per record, so the counts reflect distinct people. Public pages show only aggregate counts and the record's public history — who confirmed or flagged a record is never shown.",
  qEdit: "Can I edit my contribution?",
  aEdit:
    "Only the contributor who submitted a record can edit it. An update to an already public record becomes a private proposal: the published version stays visible until a moderator applies or discards it. If a record you did not submit needs a change, use the private correction form — it never alters public data on its own.",
  qLevels: "What are contributor levels?",
  aLevels:
    "Trust levels recognise accurate contributions: only live records count, with thresholds at 1, 5, 20 and 50 contributions. Levels are recognition, not a competition — no public ranking or leaderboard exists.",
  qDeleteAccount: "What happens to my verifications if I delete my account?",
  aDeleteAccount:
    "Account erasure removes the link between you and the community data. Verifications you received are deleted; those you gave stay on the record, de-identified. Your published reports remain public without attribution to you.",
  moreTitle: "Still have questions?",
  moreBody:
    "For corrections, removals and privacy requests, use the correction form or the contact page.",
  guideCta: "Read the project guide",
  rulesCta: "Read participation rules",
  privacyCta: "Read privacy details",
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
  title: "Risposte chiare su come funziona il database.",
  intro:
    "Risposte brevi su segnalazioni, precisione della mappa, azioni della community, correzioni e privacy. Per tutto ciò che non è trattato qui, usa il modulo di correzione o la pagina dei contatti.",
  qReport: "Come si segnala una telecamera?",
  aReport:
    "Scegli una posizione approssimativa sulla mappa, oppure inserisci le coordinate. Poi aggiungi solo ciò che puoi osservare dallo spazio pubblico: tipo, direzione, avviso visibile, produttore. Non includere persone, targhe, abitazioni private, credenziali o link a feed in diretta. Da un account verificato, la tua segnalazione viene pubblicata subito.",
  qAccuracy: "Quanto è precisa la mappa?",
  aAccuracy:
    "La mappa mostra i record attivi: ogni segnalazione di un account verificato compare subito e la community la mantiene accurata. Le coordinate pubblicate sono volutamente arrotondate a circa quattro decimali, cioè circa 10 metri. Uno stato descrive la situazione corrente, non la garanzia che una telecamera sia attiva. Un'area vuota non dimostra che non ci siano telecamere: mostra solo che in quel punto non c'è attualmente alcun record pubblicato.",
  qCorrect: "Come si corregge un errore?",
  aCorrect:
    "Usa il modulo privato di correzione oppure scrivi a privacy@opensurveillancedb.org. Le richieste di correzione sono private: non modificano la mappa automaticamente e non finiscono mai nell'esportazione pubblica. Prima risposta entro 48 ore; risposta sostanziale entro 14 giorni.",
  qPrivacy: "E per quanto riguarda la privacy?",
  aPrivacy:
    "Le segnalazioni sono pubbliche appena pubblicate e non contengono mai volti, targhe o dati personali. Le richieste private di correzione restano private. Il titolare del trattamento è Simone Rondina (syax89) / OpenSurveillanceDB, Italia. I diritti dell'interessato (accesso, rettifica, cancellazione, opposizione) si esercitano scrivendo a privacy@opensurveillancedb.org.",
  qAccount: "Serve un account?",
  aAccount:
    "Per consultare, no. Per segnalare una telecamera, inviare una correzione o partecipare alle azioni della community serve un account gratuito e verificato. Con un account puoi seguire le tue segnalazioni, modificare i tuoi contributi, confermare record e costruire un livello di fiducia.",
  qVerifications: "Cosa sono le conferme?",
  aVerifications:
    "Una conferma è un controllo personale che una telecamera esista ancora nella posizione documentata. Ogni account può mantenere una sola azione della community per record, quindi i conteggi riflettono persone distinte. Le pagine pubbliche mostrano solo conteggi aggregati e la cronologia pubblica del record: chi ha confermato o segnalato non viene mai mostrato.",
  qEdit: "Posso modificare il mio contributo?",
  aEdit:
    "Solo chi ha inviato un record può modificarlo. Un aggiornamento a un record già pubblico diventa una proposta privata: la versione pubblicata resta visibile finché un moderatore non applica o scarta la modifica. Se va corretto un record che non hai inviato tu, usa il modulo privato di correzione: non modifica mai da solo i dati pubblici.",
  qLevels: "Cosa sono i livelli di contributor?",
  aLevels:
    "I livelli di fiducia riconoscono i contributi accurati: contano solo i record attivi, con soglie a 1, 5, 20 e 50 contributi. I livelli sono riconoscimento, non competizione: non esiste alcuna classifica pubblica.",
  qDeleteAccount: "Cosa succede alle mie verifiche se elimino l'account?",
  aDeleteAccount:
    "La cancellazione dell'account rimuove il collegamento tra te e i dati della community. Le verifiche che hai ricevuto vengono eliminate; quelle che hai dato restano sul record, senza puntare a te. I tuoi record pubblicati restano pubblici, senza attribuzione a te.",
  moreTitle: "Hai ancora domande?",
  moreBody:
    "Per correzioni, rimozioni e richieste relative alla privacy usa il modulo di correzione o la pagina dei contatti.",
  guideCta: "Leggi la guida al progetto",
  rulesCta: "Leggi le regole di partecipazione",
  privacyCta: "Leggi i dettagli sulla privacy",
  contactCta: "Apri la pagina dei contatti",
  correctionCta: "Vai al modulo di correzione",
  footer: "Creato per la trasparenza, non per il tracciamento.",
};
