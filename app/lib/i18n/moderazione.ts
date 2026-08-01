/**
 * moderazione — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Moderation navigation",
  homeAria: "OpenSurveillanceDB home",
  map: "Map",
  directory: "Directory",
  home: "Home",
  eyebrow: "How moderation works",
  title: "Reviewed by people, not published by default.",
  intro:
    "Every record in OpenSurveillanceDB is checked by a trained moderator before it can appear on the map, in the directory or in the exports. This page explains the review flow, how to challenge a decision, and the safeguards that keep the process fair.",
  correctionCta: "Request a correction",
  exploreMapCta: "Explore the map",
  flowEyebrow: "The review flow",
  flowTitle: "From observation to public data.",
  flowBody:
    "A report is private while it waits. Publication is never automatic: a moderator checks every submission against the publication standard before anything becomes public.",
  stepReceiveTitle: "Receive",
  stepReceiveBody: "A report arrives as a private pending record and is acknowledged, without promising publication.",
  stepScreenTitle: "Screen",
  stepScreenBody: "Spam, personal data, prohibited content and dangerous operational details are removed.",
  stepVerifyTitle: "Verify",
  stepVerifyBody: "Moderators assess whether the camera is public, visible, current and within local policy.",
  stepMinimiseTitle: "Minimise",
  stepMinimiseBody: "The least specific location and metadata that still serve transparency are published. Coordinates are rounded to about 4 decimal places (roughly 10 metres); the exact location stays in the private moderation record, visible only to moderators.",
  stepDecideTitle: "Decide",
  stepDecideBody: "The record is approved, sent back for clarification, rejected or escalated — always with a recorded reason.",
  stepMaintainTitle: "Maintain",
  stepMaintainBody: "Published records are re-checked periodically and respond to corrections and removal requests.",
  appealsEyebrow: "Appeals and corrections",
  appealsTitle: "A decision can be challenged.",
  appealsBody:
    "Anyone can request a correction, challenge a decision or report harm — without an account, and without the request becoming public. An appeal is decided by a senior moderator or administrator who did not make the original decision.",
  urgentTitle: "Urgent privacy or safety concerns",
  urgentBody:
    "Reports that raise an urgent privacy or safety concern can be temporarily hidden while they are reviewed. Decisions and their reasons stay auditable internally, without exposing the people who reported or reviewed.",
  outcomeUpheldTitle: "Upheld",
  outcomeUpheldBody: "The decision is reversed and the record returns to the moderation queue for a fresh decision by a different reviewer. An upheld appeal never publishes anything by itself.",
  outcomeDismissedTitle: "Dismissed",
  outcomeDismissedBody: "After an independent review, the original decision stands.",
  outcomeEscalatedTitle: "Escalated",
  outcomeEscalatedBody: "The appeal is routed to an administrator for a final decision. The moderator who made the original decision never decides the appeal.",
  slaTitle: "Response targets",
  slaBody:
    "First response within 48 hours; substantive response within 14 days; emergency content hide within 24 hours. These targets are a draft proposed for pre-launch review, not yet in force.",
  safeguardsEyebrow: "Moderator safeguards",
  safeguardsTitle: "Checks on the people who check.",
  safeguardsBody: "Moderation is structured so that no single person decides alone and mistakes stay visible.",
  safeguardPairTitle: "Two-person review",
  safeguardPairBody: "Sensitive or disputed records require a second reviewer before a publish, reject or reverify decision.",
  safeguardEscalationTitle: "A clear escalation route",
  safeguardEscalationBody: "Legal and privacy questions have a defined path to senior reviewers and administrators.",
  safeguardCredentialsTitle: "Separate credentials",
  safeguardCredentialsBody: "Moderation credentials are separate from general contributor accounts, so the queue is only reachable by trained moderators.",
  safeguardTrainingTitle: "Training and bias awareness",
  safeguardTrainingBody: "Moderators apply consistent criteria and receive bias-awareness training.",
  safeguardAuditTitle: "Regular review and audit",
  safeguardAuditBody: "Published records, reversals and false-positive patterns are reviewed regularly, and every action lands in an append-only audit trail.",
  notDashboardTitle: "This page is not the moderation queue",
  notDashboardBody:
    "The moderation dashboard is a private tool, protected by access control and never linked from the public site. This page only explains how the process works.",
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione moderazione",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  map: "Mappa",
  directory: "Elenco",
  home: "Home",
  eyebrow: "Come funziona la moderazione",
  title: "Revisionato da persone, non pubblicato di default.",
  intro:
    "Ogni record di OpenSurveillanceDB viene controllato da un moderatore formato prima di poter comparire sulla mappa, nell'elenco o nelle esportazioni. Questa pagina spiega il flusso di revisione, come contestare una decisione e le garanzie che mantengono equo il processo.",
  correctionCta: "Richiedi una correzione",
  exploreMapCta: "Esplora la mappa",
  flowEyebrow: "Il flusso di revisione",
  flowTitle: "Dall'osservazione ai dati pubblici.",
  flowBody:
    "Una segnalazione è privata mentre attende. La pubblicazione non è mai automatica: un moderatore verifica ogni invio rispetto allo standard di pubblicazione prima che qualcosa diventi pubblico.",
  stepReceiveTitle: "Ricezione",
  stepReceiveBody: "Una segnalazione arriva come record privato in attesa e viene confermata, senza prometterne la pubblicazione.",
  stepScreenTitle: "Selezione",
  stepScreenBody: "Vengono rimossi spam, dati personali, contenuti vietati e dettagli operativi pericolosi.",
  stepVerifyTitle: "Verifica",
  stepVerifyBody: "I moderatori valutano se la telecamera è pubblica, visibile, attuale e conforme alla normativa locale.",
  stepMinimiseTitle: "Minimizzazione",
  stepMinimiseBody: "Vengono pubblicate la posizione e i metadati meno specifici che servono comunque alla trasparenza. Le coordinate sono arrotondate a circa 4 decimali (circa 10 metri); la posizione esatta resta nel record privato di moderazione, visibile solo ai moderatori.",
  stepDecideTitle: "Decisione",
  stepDecideBody: "Il record viene approvato, rimandato per chiarimenti, rifiutato o inoltrato — sempre con una motivazione registrata.",
  stepMaintainTitle: "Manutenzione",
  stepMaintainBody: "I record pubblicati vengono ricontrollati periodicamente e rispondono a correzioni e richieste di rimozione.",
  appealsEyebrow: "Ricorsi e correzioni",
  appealsTitle: "Una decisione può essere contestata.",
  appealsBody:
    "Chiunque può richiedere una correzione, contestare una decisione o segnalare un danno — senza account e senza che la richiesta diventi pubblica. Un ricorso è deciso da un moderatore senior o da un amministratore che non ha preso la decisione originale.",
  urgentTitle: "Preoccupazioni urgenti di privacy o sicurezza",
  urgentBody:
    "Le segnalazioni che sollevano una preoccupazione urgente di privacy o sicurezza possono essere nascoste temporaneamente durante la revisione. Le decisioni e le loro motivazioni restano verificabili internamente, senza esporre chi ha segnalato o revisionato.",
  outcomeUpheldTitle: "Accolto",
  outcomeUpheldBody: "La decisione viene ribaltata e il record torna in coda di moderazione per una nuova decisione di un revisore diverso. Un ricorso accolto non pubblica mai nulla da solo.",
  outcomeDismissedTitle: "Respinto",
  outcomeDismissedBody: "Dopo una revisione indipendente, la decisione originale resta valida.",
  outcomeEscalatedTitle: "Inoltrato",
  outcomeEscalatedBody: "Il ricorso viene inoltrato a un amministratore per la decisione finale. Il moderatore che ha preso la decisione originale non decide mai il ricorso.",
  slaTitle: "Obiettivi di risposta",
  slaBody:
    "Prima risposta entro 48 ore; risposta sostanziale entro 14 giorni; rimozione d'emergenza dei contenuti entro 24 ore. Questi obiettivi sono una bozza proposta per la revisione pre-lancio, non ancora in vigore.",
  safeguardsEyebrow: "Garanzie dei moderatori",
  safeguardsTitle: "Controlli su chi controlla.",
  safeguardsBody: "La moderazione è strutturata perché nessuna singola persona decida da sola e gli errori restino visibili.",
  safeguardPairTitle: "Revisione a due persone",
  safeguardPairBody: "I record sensibili o contestati richiedono un secondo revisore prima di una decisione di pubblicazione, rifiuto o riverifica.",
  safeguardEscalationTitle: "Un percorso di escalation chiaro",
  safeguardEscalationBody: "Le questioni legali e di privacy hanno un percorso definito verso revisori senior e amministratori.",
  safeguardCredentialsTitle: "Credenziali separate",
  safeguardCredentialsBody: "Le credenziali di moderazione sono separate dagli account contributor generali, così la coda è raggiungibile solo dai moderatori formati.",
  safeguardTrainingTitle: "Formazione e consapevolezza dei bias",
  safeguardTrainingBody: "I moderatori applicano criteri coerenti e ricevono formazione sulla consapevolezza dei bias.",
  safeguardAuditTitle: "Revisione e audit regolari",
  safeguardAuditBody: "Record pubblicati, ribaltamenti e pattern di falsi positivi vengono riesaminati regolarmente e ogni azione finisce in una traccia di audit append-only.",
  notDashboardTitle: "Questa pagina non è la coda di moderazione",
  notDashboardBody:
    "La dashboard di moderazione è uno strumento privato, protetto dal controllo degli accessi e mai linkato dal sito pubblico. Questa pagina spiega solo come funziona il processo.",
};
