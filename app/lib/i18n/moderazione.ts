/**
 * moderazione — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 *
 * ADR 0021 pivot (2026-08-05): this page no longer explains a human review
 * flow — there is none for the normal flow. It now explains the
 * community-driven model: immediate publication, community actions with
 * automatic thresholds, the public per-record event history, private
 * corrections, and the residual legal-emergency surface. Keys unchanged
 * (page.tsx renders them positionally); values rewritten.
 */
import type { Translation } from "./types";

export const en = {
  navigation: "Publication navigation",
  homeAria: "OpenSurveillanceDB home",
  map: "Map",
  directory: "Directory",
  home: "Home",
  eyebrow: "How publication works",
  title: "Published immediately, kept accurate by the community.",
  intro:
    "Every report from a verified account is published right away, on the map, in the directory and in the exports. This page explains how a record lives, how the community keeps it accurate, and the automatic thresholds that decide when a record is withdrawn or restored.",
  correctionCta: "Request a correction",
  exploreMapCta: "Explore the map",
  flowEyebrow: "The life of a record",
  flowTitle: "From observation to public record.",
  flowBody:
    "A report is public as soon as it is submitted by a verified account. There is no queue and no waiting: the community keeps the directory accurate from the first minute.",
  stepReceiveTitle: "Submit",
  stepReceiveBody: "A verified contributor submits an observation from public space. The report is published immediately.",
  stepScreenTitle: "Publish",
  stepScreenBody: "The record appears in the map, the directory and the exports. Coordinates are rounded to about 4 decimal places (roughly 10 metres); the exact location is never published.",
  stepVerifyTitle: "Act",
  stepVerifyBody: "Anyone with a verified account can confirm the camera is still there, flag it as no longer present, mark it useful, or raise a problem. One account, one active action per record.",
  stepMinimiseTitle: "Thresholds",
  stepMinimiseBody: "Automatic thresholds decide what changes: enough flags hide or remove a record, a privacy flag hides it immediately, and enough confirmations bring it back. No single account controls publication.",
  stepDecideTitle: "Withdraw",
  stepDecideBody: "A record that the community flags enough is hidden or removed from the public list. It stays reachable by direct link, with a banner and its public history.",
  stepMaintainTitle: "Restore",
  stepMaintainBody: "A hidden or removed record can return with enough confirmations from the community. Every transition is recorded in the record's public history.",
  appealsEyebrow: "Corrections and legal emergencies",
  appealsTitle: "Private requests, one emergency power.",
  appealsBody:
    "Correction requests stay private: they never change the map automatically and are never included in the public export. The only human write power left is the legal-emergency hide, used by an administrator when the law requires it.",
  urgentTitle: "Privacy flags are immediate",
  urgentBody:
    "A privacy concern from a verified account hides a record immediately, pending community verification. Legal emergencies use the same immediate path; the reversal requires enough confirmations and a cooldown period.",
  outcomeUpheldTitle: "Hidden",
  outcomeUpheldBody: "A record withdrawn pending community or legal verification. Not listed, but reachable by direct link with its public history.",
  outcomeDismissedTitle: "Removed",
  outcomeDismissedBody: "The community reported that the camera is no longer there. It is not listed, and confirmations can restore it.",
  outcomeEscalatedTitle: "Restored",
  outcomeEscalatedBody: "Enough confirmations brought the record back to the public list. The reversal is recorded in its public history.",
  slaTitle: "Response targets",
  slaBody:
    "Correction and takedown requests: first response within 48 hours, substantive response within 14 days; legal-emergency hides are immediate. These targets are in force.",
  safeguardsEyebrow: "Safeguards",
  safeguardsTitle: "Checks on the community model.",
  safeguardsBody: "The model is structured so that no single account controls publication and mistakes stay visible.",
  safeguardPairTitle: "Verified accounts only",
  safeguardPairBody: "Every report and every community action requires a verified contributor account — anonymous writes are refused.",
  safeguardEscalationTitle: "Automatic, transparent thresholds",
  safeguardEscalationBody: "Withdrawals and restorations follow published thresholds with distinct-contributor floors, so a single account can never decide alone.",
  safeguardCredentialsTitle: "Public, unattributed history",
  safeguardCredentialsBody: "Every transition is recorded in the record's public history as an aggregate event. Who confirmed or flagged is never shown and never linked to a profile.",
  safeguardTrainingTitle: "Consumption and quotas",
  safeguardTrainingBody: "Triggering actions are consumed on a transition, and daily quotas stop automated or mass actions.",
  safeguardAuditTitle: "Internal audit and erasure",
  safeguardAuditBody: "An append-only internal audit trail keeps full attribution for accountability, and erasing an account removes its community actions.",
  notDashboardTitle: "This page is not the moderation dashboard",
  notDashboardBody:
    "The moderation dashboard is a private tool, protected by access control and never linked from the public site, reserved for legal emergencies and the private correction flow. This page only explains the public model.",
} as const;

export const it: Translation<typeof en> = {
  navigation: "Navigazione pubblicazione",
  homeAria: "Pagina iniziale di OpenSurveillanceDB",
  map: "Mappa",
  directory: "Elenco",
  home: "Home",
  eyebrow: "Come funziona la pubblicazione",
  title: "Pubblicato subito, mantenuto accurato dalla community.",
  intro:
    "Ogni segnalazione di un account verificato viene pubblicata subito, sulla mappa, nell'elenco e nelle esportazioni. Questa pagina spiega come vive un record, come la community lo mantiene accurato e le soglie automatiche che decidono quando un record viene ritirato o ripristinato.",
  correctionCta: "Richiedi una correzione",
  exploreMapCta: "Esplora la mappa",
  flowEyebrow: "La vita di un record",
  flowTitle: "Dall'osservazione al record pubblico.",
  flowBody:
    "Una segnalazione è pubblica appena viene inviata da un account verificato. Niente code, niente attese: la community mantiene accurato l'elenco dal primo minuto.",
  stepReceiveTitle: "Invio",
  stepReceiveBody: "Un contributor verificato invia un'osservazione dallo spazio pubblico. La segnalazione viene pubblicata subito.",
  stepScreenTitle: "Pubblicazione",
  stepScreenBody: "Il record compare in mappa, elenco ed esportazioni. Le coordinate sono arrotondate a circa 4 decimali (circa 10 metri); la posizione esatta non viene mai pubblicata.",
  stepVerifyTitle: "Azioni",
  stepVerifyBody: "Chiunque abbia un account verificato può confermare che la telecamera c'è ancora, segnalarla come non più presente, marcarla come utile o segnalare un problema. Un account, un'azione attiva per record.",
  stepMinimiseTitle: "Soglie",
  stepMinimiseBody: "Soglie automatiche decidono cosa cambia: abbastanza segnalazioni nascondono o rimuovono un record, una segnalazione di privacy lo nasconde subito, e abbastanza conferme lo riportano online. Nessun singolo account controlla la pubblicazione.",
  stepDecideTitle: "Ritiro",
  stepDecideBody: "Un record che la community segnala a sufficienza viene nascosto o rimosso dall'elenco pubblico. Resta raggiungibile tramite link diretto, con un banner e la sua cronologia pubblica.",
  stepMaintainTitle: "Ripristino",
  stepMaintainBody: "Un record nascosto o rimosso può tornare online con abbastanza conferme dalla community. Ogni transizione è registrata nella cronologia pubblica del record.",
  appealsEyebrow: "Correzioni ed emergenze legali",
  appealsTitle: "Richieste private, un solo potere d'emergenza.",
  appealsBody:
    "Le richieste di correzione restano private: non modificano mai la mappa automaticamente e non sono mai incluse nell'esportazione pubblica. L'unico potere di scrittura umano rimasto è il nascondimento per emergenza legale, usato da un amministratore quando la legge lo richiede.",
  urgentTitle: "Le segnalazioni di privacy sono immediate",
  urgentBody:
    "Una preoccupazione di privacy da un account verificato nasconde subito un record, in attesa di verifica della community. Le emergenze legali usano lo stesso percorso immediato; l'inversione richiede abbastanza conferme e un periodo di attesa.",
  outcomeUpheldTitle: "Nascosto",
  outcomeUpheldBody: "Un record ritirato in attesa di verifica della community o legale. Non è elencato, ma resta raggiungibile tramite link diretto con la sua cronologia pubblica.",
  outcomeDismissedTitle: "Rimosso",
  outcomeDismissedBody: "La community ha segnalato che la telecamera non c'è più. Non è elencato e le conferme possono ripristinarlo.",
  outcomeEscalatedTitle: "Ripristinato",
  outcomeEscalatedBody: "Abbastanza conferme hanno riportato il record nell'elenco pubblico. L'inversione è registrata nella sua cronologia pubblica.",
  slaTitle: "Obiettivi di risposta",
  slaBody:
    "Richieste di correzione e rimozione: prima risposta entro 48 ore, risposta sostanziale entro 14 giorni; i nascondimenti per emergenza legale sono immediati. Questi obiettivi sono in vigore.",
  safeguardsEyebrow: "Garanzie",
  safeguardsTitle: "Controlli sul modello community.",
  safeguardsBody: "Il modello è strutturato perché nessun singolo account controlli la pubblicazione e gli errori restino visibili.",
  safeguardPairTitle: "Solo account verificati",
  safeguardPairBody: "Ogni segnalazione e ogni azione della community richiede un account contributor verificato — le scritture anonime sono rifiutate.",
  safeguardEscalationTitle: "Soglie automatiche e trasparenti",
  safeguardEscalationBody: "Ritiri e ripristini seguono soglie pubblicate con minimi di persone distinte, così un singolo account non può mai decidere da solo.",
  safeguardCredentialsTitle: "Cronologia pubblica e senza attribuzione",
  safeguardCredentialsBody: "Ogni transizione è registrata nella cronologia pubblica del record come evento aggregato. Chi ha confermato o segnalato non viene mai mostrato né collegato a un profilo.",
  safeguardTrainingTitle: "Consumo e limiti giornalieri",
  safeguardTrainingBody: "Le azioni che innescano una transizione vengono consumate, e i limiti giornalieri fermano le azioni automatiche o di massa.",
  safeguardAuditTitle: "Audit interno e cancellazione",
  safeguardAuditBody: "Un registro interno append-only mantiene l'attribuzione completa per la responsabilità, e la cancellazione di un account rimuove le sue azioni della community.",
  notDashboardTitle: "Questa pagina non è la dashboard di moderazione",
  notDashboardBody:
    "La dashboard di moderazione è uno strumento privato, protetto da controllo d'accesso e mai collegato dal sito pubblico, riservato alle emergenze legali e al flusso privato delle correzioni. Questa pagina spiega solo il modello pubblico.",
};
