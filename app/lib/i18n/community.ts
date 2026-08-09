/**
 * community — community-system interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 *
 * Vocabulary frozen by the copy review (kanban comment #814) and
 * consolidated in docs/COMMUNITY_PLAN.md §6: trust levels / livelli di
 * fiducia, verifications / verifiche (NEVER "stars"), badges
 * New/Trusted/Experienced contributor, abuse reporting, contribution
 * editing and destructive confirmations. Zero gamification jargon.
 */
import type { Translation } from "./types";

export const en = {
  // --- Trust levels (frozen: NEVER "tiers", "rank", "XP", "points") ---
  trustLevels: "Trust levels",
  trustLevel: "Trust level",
  yourTrustLevel: "Your trust level",
  levelReached: "You reached a new trust level.",
  seeYourTrustLevel: "See your trust level",
  badgeLabels: {
    new: "New contributor",
    trusted: "Trusted contributor",
    experienced: "Experienced contributor",
  },
  levelDescriptions: {
    new: "You are a new contributor. Your reports are published immediately, like everyone else's, and your community actions carry less weight until you build a track record.",
    trusted:
      "You are a trusted contributor. Your consistent, live contributions mean your community actions carry more weight in the automatic thresholds.",
    experienced:
      "You are an experienced contributor. Your track record of accurate, live contributions is recognised by the community.",
  },
  progressToNextLevel: (count: number) =>
    `${count} live ${count === 1 ? "contribution" : "contributions"} to reach the next trust level`,

  // --- Verifications (frozen: NEVER "stars", "badges", "upvotes") ---
  verifications: "Verifications",
  verification: "Verification",
  addVerification: "Add a verification",
  verificationCount: (total: number) =>
    `${total} ${total === 1 ? "verification" : "verifications"}`,
  verifiedByCommunity: "Verified by the community",
  recordHasVerifications: (total: number) =>
    `This record has ${total} ${total === 1 ? "verification" : "verifications"}`,
  confirmExists: "Confirm this record exists",
  verifyHelp:
    "You are adding a verification to this record. This means you have personally confirmed the camera is present at the documented location.",
  verificationAdded: "Verification added",
  removeOwnVerificationTitle: "Remove your verification?",
  removeOwnVerificationBody:
    "Your verification will be removed from this record. Other verifications, if any, remain.",
  removeVerification: "Remove verification",
  verificationRemoved: "Verification removed",
  reportVerificationAbuse: "Report verification as abuse",
  reportAbuseHelp:
    "Use this only if the verification appears false, automated, or submitted in bad faith.",
  abuseReportSent: "Abuse report sent",
  abuseReportThanks: "Thank you. Your report has been recorded.",
  noVerificationsYet: "No verifications yet",
  notVerifiedByCommunity:
    "This record has not been independently verified by the community yet.",
  errorAddVerification: "Could not add your verification. Please try again.",
  errorRemoveVerification: "Could not remove your verification. Please try again.",
  errorSelfVerify: "You cannot verify your own record.",
  errorAlreadyVerified: "You have already verified this record.",

  // --- Contributor profile / contributions list (C5) ---
  contributions: "Contributions",
  contribution: "Contribution",
  yourContributions: "Your contributions",
  contributionCount: (total: number) =>
    `${total} ${total === 1 ? "contribution" : "contributions"}`,
  noContributionsYet: "No contributions yet",
  noContributionsBody: "You have not contributed any records yet.",
  noVerificationsBody:
    "You have not added any verifications yet. Visit a record you can confirm to add your first.",
  contributorProfile: "Contributor profile",
  // Contribution status filters: mirror the shared record-status vocabulary
  // (status.ts) deliberately — the profile list keeps its own labels so a
  // page never mixes bundles (same pattern as moderation.ts statusLabels).
  statusFilters: {
    all: "All",
    pending: "In moderation",
    // Post-0039 the published camera status is "active" — the chip label
    // says "Published" so the filter vocabulary matches the domain.
    active: "Published",
    verified: "Verified",
    needs_review: "Needs review",
    removed: "Removed",
    rejected: "Rejected",
    reviewed: "Resolved",
    approved: "Approved",
    stale: "Stale",
  },
  errorLoadContributions: "Could not load your contributions.",
  errorLoadTrustLevel: "Could not load your trust level.",
  gateL1Help: "You can verify records after your first contribution is published.",
  // Contribution kinds (account page rework 2026-08-08): the three types
  // are visually distinct via inline SVG icon + text label (never colour
  // alone — WCAG 1.4.1), so each row and stats card carries these.
  typeLabels: {
    camera: "Camera report",
    correction: "Correction",
  },
  // Type filter chips (same look as the status chips; local state, never
  // in the URL — private page).
  typeFilters: {
    all: "All types",
    camera: "Camera reports",
    correction: "Corrections",
  },
  typeFilterLabel: "Filter by type",
  // Account summary strip: global counts (independent of the active
  // filters) answering "what do I have in the queue?" at a glance.
  stats: {
    camera: "Camera reports",
    correction: "Corrections",
    inModeration: "In moderation",
  },
  statsGroupLabel: "Summary of your contributions",
  // Contribution loop CTA: the page is no longer a dead end — it links
  // back into the reporting tools.
  newReportCta: "Report a camera",
  newCorrectionCta: "Propose a correction",
  // Profile list pagination (F0 canonical contract) + per-filter empty
  // state: the list is the contributor's own, filters are local to the
  // page (never shareable URLs, COMMUNITY_PLAN §2.3).
  noContributionsFiltered: "No contributions match this filter.",
  previousPage: "Previous page",
  nextPage: "Next page",
  pageOf: (page: number, totalPages: number) => `Page ${page} of ${totalPages}`,
  contributionsNavigation: "Contributions navigation",
  contributionStatusFilter: "Filter contributions by status",
  // Anonymous verification gate (C5): the record detail shows the toggle
  // but disables it with this explanatory copy — the server answers 401
  // without a session, so the button never pretends to work.
  loginToVerify: "Log in to verify this record",

  // --- Contribution editing (C6) ---
  edit: "Edit",
  editContribution: "Edit contribution",
  editYourContribution: "Edit your contribution",
  editReviewNotice:
    "Your changes will be reviewed by a moderator before they replace the current record.",
  saveChanges: "Save changes",
  saveSubmitForReview: "Save and submit for review",
  cancel: "Cancel",
  editBlockedRemoved:
    "This contribution cannot be edited: the record was removed or rejected.",
  errorEditNotOwner: "You can only edit your own contributions.",
  errorEditConflict: "An edit request for this record is already under review.",
  errorEditRateLimit: "Too many attempts. Please try again in a minute.",
  editRequestPending: "An edit request for this record is already under review.",
  editSaved: "Changes saved.",
  editSubmitted: "Your edit request has been submitted for review.",
  editNoChanges: "No changes were made.",
  errorEditRace:
    "This record changed since you loaded it. Refresh the page and try again.",
  errorEditNotFound: "This record is not available for editing.",
  errorEditGeneric: "Could not save your changes. Please try again.",
  editBackToRecord: "Back to the record",
  editLoginTitle: "Log in to edit your contribution",
  editLoginBody:
    "You need to be logged in to edit a contribution you submitted.",
  editLoginAction: "Log in",

  // --- Destructive confirmations ---
  removeVerificationConfirmTitle: "Remove your verification from this record?",
  cannotBeUndone: "This cannot be undone.",
  remove: "Remove",
  deleteContributionTitle: "Delete this contribution?",
  deleteContributionBody:
    "The record will be removed from the public directory. This cannot be undone.",
  deleteContribution: "Delete contribution",

  // --- Community actions (ADR 0021 §3, FASE 3 UI): five-action surface on
  // the record detail and the map popup. Vocabulary frozen by the ADR:
  // useful / utile, confirm / confermo ancora presente, no longer there /
  // non c'è più, flag / segnala, privacy / privacy. Counts are aggregates
  // only (never attribution); the anonymous surface shows counts + a
  // register/login call-to-action.
  actions: {
    sectionLabel: "Community actions",
    like: "Useful",
    confirm: "Confirm",
    gone: "No longer there",
    problem: "Flag",
    privacy: "Privacy",
    likeHelp: "Mark this record as useful to the directory.",
    confirmHelp: "I confirm this record is still present at the documented location.",
    goneHelp: "I believe this camera is no longer there.",
    problemHelp: "Something is wrong with this record (details, position, description).",
    privacyHelp: "This record raises a privacy or legal concern.",
    countOf: (label: string, count: number) => `${label}: ${count}`,
    anonymousCta: "Log in or register to take part",
    anonymousCtaAction: "Log in",
    removeYourAction: "Remove your action",
    updating: "Updating…",
    errorDuplicate: "You already set this action.",
    errorSelfAction: "You cannot mark your own report as useful or confirm it.",
    errorSessionEnded: "Your session has ended. Log in again to take part.",
    errorVerifyRequired: "Verify your email to take part in community actions.",
    errorGeneric: "Could not update the action. Try again.",
    // Compact toolbar (map popup, redesign t_b7728ad0): the trigger that
    // opens the disclosure with the remaining three actions, and the
    // explicit-copy privacy confirmation (the only action that asks before
    // sending — a privacy report is the GDPR-friendly fast-hide request).
    // The slash form ("Update/report") is deliberate: the trigger sits in a
    // ~90px grid column next to Utile/Conferma — a long label would wrap to
    // three ragged lines at 300px popup width.
    moreActions: "Update/report",
    moreActionsHelp:
      "More actions for this record: report that it is gone, flag a problem, or raise a privacy concern.",
    moreMenuLabel: "Update or report actions",
    privacyConfirmTitle: "Confirm the privacy report?",
    privacyConfirmBody:
      "A privacy report asks reviewers to hide this record. You cannot undo it.",
    privacyConfirmAction: "Report privacy concern",
    cancel: "Cancel",
  },
} as const;

export const it: Translation<typeof en> = {
  // --- Livelli di fiducia (congelato: MAI "tiers", "rank", "XP", "punti") ---
  trustLevels: "Livelli di fiducia",
  trustLevel: "Livello di fiducia",
  yourTrustLevel: "Il tuo livello di fiducia",
  levelReached: "Hai raggiunto un nuovo livello di fiducia.",
  seeYourTrustLevel: "Vedi il tuo livello di fiducia",
  badgeLabels: {
    new: "Nuovo contributor",
    trusted: "Contributor fidato",
    experienced: "Contributor esperto",
  },
  levelDescriptions: {
    new: "Sei un nuovo contributor. Le tue segnalazioni vengono pubblicate subito, come quelle di tutti, e le tue azioni della community pesano meno finché non costruisci uno storico.",
    trusted:
      "Sei un contributor fidato. I tuoi contributi costanti e attivi fanno sì che le tue azioni della community pesino di più nelle soglie automatiche.",
    experienced:
      "Sei un contributor esperto. Il tuo storico di contributi accurati e attivi è riconosciuto dalla community.",
  },
  progressToNextLevel: (count: number) =>
    `${count} contribut${count === 1 ? "o" : "i"} attiv${count === 1 ? "o" : "i"} per raggiungere il prossimo livello di fiducia`,

  // --- Verifiche (congelato: MAI "stars", "badges", "upvotes") ---
  verifications: "Verifiche",
  verification: "Verifica",
  addVerification: "Aggiungi una verifica",
  verificationCount: (total: number) =>
    `${total} ${total === 1 ? "verifica" : "verifiche"}`,
  verifiedByCommunity: "Verificato dalla community",
  recordHasVerifications: (total: number) =>
    `Questo record ha ${total} ${total === 1 ? "verifica" : "verifiche"}`,
  confirmExists: "Conferma che questo record esiste",
  verifyHelp:
    "Stai aggiungendo una verifica a questo record. Significa che hai confermato personalmente la presenza della telecamera nella posizione documentata.",
  verificationAdded: "Verifica aggiunta",
  removeOwnVerificationTitle: "Rimuovere la tua verifica?",
  removeOwnVerificationBody:
    "La tua verifica verrà rimossa da questo record. Le altre eventuali verifiche restano.",
  removeVerification: "Rimuovi verifica",
  verificationRemoved: "Verifica rimossa",
  reportVerificationAbuse: "Segnala la verifica come abuso",
  reportAbuseHelp:
    "Usalo solo se la verifica appare falsa, automatizzata o inviata in malafede.",
  abuseReportSent: "Segnalazione di abuso inviata",
  abuseReportThanks: "Grazie. La tua segnalazione è stata registrata.",
  noVerificationsYet: "Nessuna verifica",
  notVerifiedByCommunity:
    "Questo record non è ancora stato verificato indipendentemente dalla community.",
  errorAddVerification: "Non è stato possibile aggiungere la verifica. Riprova.",
  errorRemoveVerification: "Non è stato possibile rimuovere la verifica. Riprova.",
  errorSelfVerify: "Non puoi verificare un tuo record.",
  errorAlreadyVerified: "Hai già verificato questo record.",

  // --- Profilo del contributor / elenco contributi (C5) ---
  contributions: "Contributi",
  contribution: "Contributo",
  yourContributions: "I tuoi contributi",
  contributionCount: (total: number) =>
    `${total} ${total === 1 ? "contributo" : "contributi"}`,
  noContributionsYet: "Nessun contributo",
  noContributionsBody: "Non hai ancora contribuito a nessun record.",
  noVerificationsBody:
    "Non hai ancora aggiunto verifiche. Visita un record che puoi confermare per aggiungere la prima.",
  contributorProfile: "Profilo del contributor",
  // Filtri di stato dei contributi: rispecchiano deliberatamente il
  // vocabolario condiviso degli stati record (status.ts) — la lista del
  // profilo tiene le proprie label così una pagina non mescola bundle
  // (stesso pattern di moderation.ts statusLabels).
  statusFilters: {
    all: "Tutti",
    pending: "In moderazione",
    // Post-0039 lo stato pubblico delle telecamere è "active" — il chip
    // dice "Pubblicate" così il vocabolario del filtro combacia col dominio.
    active: "Pubblicate",
    verified: "Verificato",
    needs_review: "Da ricontrollare",
    removed: "Rimosso",
    rejected: "Rifiutate",
    reviewed: "Risolta",
    approved: "Approvata",
    stale: "Obsoleto",
  },
  errorLoadContributions: "Non è stato possibile caricare i tuoi contributi.",
  errorLoadTrustLevel: "Non è stato possibile caricare il tuo livello di fiducia.",
  gateL1Help: "Puoi verificare i record dopo la pubblicazione del tuo primo contributo.",
  // Tipi di contributo (rework pagina account 2026-08-08): i tre tipi si
  // distinguono con icona SVG inline + etichetta testuale (mai solo colore
  // — WCAG 1.4.1), così ogni riga e ogni card delle stats le porta.
  typeLabels: {
    camera: "Segnalazione",
    correction: "Correzione",
  },
  // Chip filtro per tipo (stesso look dei chip di stato; stato locale, mai
  // in URL — pagina privata).
  typeFilters: {
    all: "Tutti i tipi",
    camera: "Segnalazioni",
    correction: "Correzioni",
  },
  typeFilterLabel: "Filtra per tipo",
  // Riga riepilogo account: conteggi globali (indipendenti dai filtri
  // attivi) che rispondono a colpo d'occhio a "cosa ho in coda?".
  stats: {
    camera: "Segnalazioni",
    correction: "Correzioni",
    inModeration: "In moderazione",
  },
  statsGroupLabel: "Riepilogo dei tuoi contributi",
  // CTA del loop contributivo: la pagina non è più un vicolo cieco —
  // riporta agli strumenti di segnalazione.
  newReportCta: "Segnala una telecamera",
  newCorrectionCta: "Proponi una correzione",
  // Paginazione della lista profilo (contratto canonico F0) + empty state
  // per filtro: la lista è del contributor, i filtri sono locali alla
  // pagina (mai URL condivisibili, COMMUNITY_PLAN §2.3).
  noContributionsFiltered: "Nessun contributo corrisponde a questo filtro.",
  previousPage: "Pagina precedente",
  nextPage: "Pagina successiva",
  pageOf: (page: number, totalPages: number) => `Pagina ${page} di ${totalPages}`,
  contributionsNavigation: "Navigazione contributi",
  contributionStatusFilter: "Filtra i contributi per stato",
  // Gate anonimo delle verifiche (C5): il dettaglio record mostra il toggle
  // ma lo disabilita con questo copy esplicativo — il server risponde 401
  // senza sessione, quindi il bottone non finge mai di funzionare.
  loginToVerify: "Accedi per verificare questo record",

  // --- Modifica dei contributi (C6) ---
  edit: "Modifica",
  editContribution: "Modifica contributo",
  editYourContribution: "Modifica il tuo contributo",
  editReviewNotice:
    "Le tue modifiche saranno esaminate da un moderatore prima di sostituire il record attuale.",
  saveChanges: "Salva modifiche",
  saveSubmitForReview: "Salva e invia per revisione",
  cancel: "Annulla",
  editBlockedRemoved:
    "Questo contributo non può essere modificato: il record è stato rimosso o rifiutato.",
  errorEditNotOwner: "Puoi modificare solo i tuoi contributi.",
  errorEditConflict: "Una richiesta di modifica per questo record è già in revisione.",
  errorEditRateLimit: "Troppi tentativi. Riprova tra un minuto.",
  editRequestPending: "Una richiesta di modifica per questo record è già in revisione.",
  editSaved: "Modifiche salvate.",
  editSubmitted: "La tua richiesta di modifica è stata inviata per la revisione.",
  editNoChanges: "Nessuna modifica apportata.",
  errorEditRace:
    "Il record è cambiato da quando l'hai caricato. Ricarica la pagina e riprova.",
  errorEditNotFound: "Questo record non è disponibile per la modifica.",
  errorEditGeneric: "Non è stato possibile salvare le modifiche. Riprova.",
  editBackToRecord: "Torna al record",
  editLoginTitle: "Accedi per modificare il tuo contributo",
  editLoginBody:
    "Devi avere un account per modificare un contributo che hai inviato.",
  editLoginAction: "Accedi",

  // --- Conferme distruttive ---
  removeVerificationConfirmTitle: "Rimuovere la tua verifica da questo record?",
  cannotBeUndone: "Questa azione non può essere annullata.",
  remove: "Rimuovi",
  deleteContributionTitle: "Eliminare questo contributo?",
  deleteContributionBody:
    "Il record verrà rimosso dall'elenco pubblico. Questa azione non può essere annullata.",
  deleteContribution: "Elimina contributo",

  // --- Azioni della community (ADR 0021 §3, FASE 3 UI): superficie a
  // cinque azioni su dettaglio record e popup mappa. Vocabolario congelato
  // dall'ADR: utile, confermo ancora presente, non c'è più, segnala,
  // privacy. I conteggi sono solo aggregati (mai attribuzioni); la
  // superficie anonima mostra i conteggi + una call-to-action di
  // accesso/registrazione.
  actions: {
    sectionLabel: "Azioni della community",
    like: "Utile",
    confirm: "Confermo",
    gone: "Non c'è più",
    problem: "Segnala",
    privacy: "Privacy",
    likeHelp: "Segna questo record come utile per l'elenco.",
    confirmHelp: "Confermo che questo record è ancora presente nella posizione documentata.",
    goneHelp: "Credo che questa telecamera non ci sia più.",
    problemHelp: "C'è qualcosa di sbagliato in questo record (dettagli, posizione, descrizione).",
    privacyHelp: "Questo record solleva un problema di privacy o legale.",
    countOf: (label: string, count: number) => `${label}: ${count}`,
    anonymousCta: "Accedi o registrati per partecipare",
    anonymousCtaAction: "Accedi",
    removeYourAction: "Rimuovi la tua azione",
    updating: "Aggiornamento…",
    errorDuplicate: "Hai già impostato questa azione.",
    errorSelfAction: "Non puoi segnare come utile o confermare una tua segnalazione.",
    errorSessionEnded: "La sessione è terminata. Accedi di nuovo per partecipare.",
    errorVerifyRequired: "Verifica la tua email per partecipare alle azioni della community.",
    errorGeneric: "Impossibile aggiornare l'azione. Riprova.",
    // Toolbar compatta (popup mappa, redesign t_b7728ad0): il trigger che
    // apre il disclosure con le tre azioni rimanenti, e la conferma con
    // copy esplicito per la privacy (l'unica azione che chiede prima di
    // inviare — una segnalazione privacy è la richiesta di hide rapida
    // GDPR-friendly). La forma con la barra ("Aggiorna/segnala") è
    // deliberata: il trigger sta in una colonna di griglia da ~90px accanto
    // a Utile/Conferma — una label lunga andrebbe a capo su righe sfilacciate
    // alla larghezza popup di 300px.
    moreActions: "Aggiorna/segnala",
    moreActionsHelp:
      "Altre azioni per questo record: segnala che non c'è più, un problema o una questione di privacy.",
    moreMenuLabel: "Azioni di aggiornamento o segnalazione",
    privacyConfirmTitle: "Confermi la segnalazione di privacy?",
    privacyConfirmBody:
      "Una segnalazione di privacy chiede ai moderatori di nascondere questo record. Non puoi annullarla.",
    privacyConfirmAction: "Segnala la questione di privacy",
    cancel: "Annulla",
  },
};
