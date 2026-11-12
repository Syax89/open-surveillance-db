/**
 * community — DE translation. Parity-checked against the English pilot
 * bundle (../../community.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../community";

export const de: Translation<typeof en> = {
  // --- Trust levels (frozen: NEVER "tiers", "rank", "XP", "points") ---
  trustLevels: "Vertrauensstufen",
  trustLevel: "Vertrauensstufe",
  yourTrustLevel: "Deine Vertrauensstufe",
  levelReached: "Du hast eine neue Vertrauensstufe erreicht.",
  seeYourTrustLevel: "Deine Vertrauensstufe ansehen",
  badgeLabels: {
    new: "Neu dabei",
    trusted: "Vertrauenswürdig",
    experienced: "Erfahren",
  },
  levelDescriptions: {
    new: "Du bist neu dabei. Deine Meldungen werden wie die aller anderen sofort veröffentlicht; deine Community-Aktionen haben weniger Gewicht, bis du dir eine Erfolgsbilanz aufgebaut hast.",
    trusted:
      "Du giltst als vertrauenswürdig. Dank deiner beständigen, aktiven Beiträge haben deine Community-Aktionen mehr Gewicht bei den automatischen Schwellenwerten.",
    experienced:
      "Du bist erfahren. Deine Bilanz an genauen, aktiven Beiträgen wird von der Community anerkannt.",
  },
  progressToNextLevel: (count: number) =>
    `Noch ${count} aktive${count === 1 ? "r Beitrag" : " Beiträge"} bis zur nächsten Vertrauensstufe`,

  // --- Verifications (frozen: NEVER "stars", "badges", "upvotes") ---
  verifications: "Verifizierungen",
  verification: "Verifizierung",
  addVerification: "Verifizierung hinzufügen",
  verificationCount: (total: number) =>
    `${total} ${total === 1 ? "Verifizierung" : "Verifizierungen"}`,
  verifiedByCommunity: "Von der Community verifiziert",
  recordHasVerifications: (total: number) =>
    `Dieser Eintrag hat ${total} ${total === 1 ? "Verifizierung" : "Verifizierungen"}`,
  confirmExists: "Bestätigen, dass dieser Eintrag existiert",
  verifyHelp:
    "Du fügst diesem Eintrag eine Verifizierung hinzu. Damit bestätigst du, dass du selbst gesehen hast, dass die Kamera am angegebenen Standort vorhanden ist.",
  verificationAdded: "Verifizierung hinzugefügt",
  removeOwnVerificationTitle: "Deine Verifizierung entfernen?",
  removeOwnVerificationBody:
    "Deine Verifizierung wird von diesem Eintrag entfernt. Andere Verifizierungen bleiben bestehen.",
  removeVerification: "Verifizierung entfernen",
  verificationRemoved: "Verifizierung entfernt",
  reportVerificationAbuse: "Verifizierung als Missbrauch melden",
  reportAbuseHelp:
    "Nutze dies nur, wenn die Verifizierung falsch, automatisiert oder böswillig erscheint.",
  abuseReportSent: "Missbrauchsmeldung gesendet",
  abuseReportThanks: "Danke. Deine Meldung wurde erfasst.",
  noVerificationsYet: "Noch keine Verifizierungen",
  notVerifiedByCommunity:
    "Dieser Eintrag wurde noch nicht unabhängig von der Community verifiziert.",
  errorAddVerification: "Deine Verifizierung konnte nicht hinzugefügt werden. Bitte versuche es erneut.",
  errorRemoveVerification: "Deine Verifizierung konnte nicht entfernt werden. Bitte versuche es erneut.",
  errorSelfVerify: "Du kannst deinen eigenen Eintrag nicht verifizieren.",
  errorAlreadyVerified: "Du hast diesen Eintrag bereits verifiziert.",

  // --- Contributor profile / contributions list (C5) ---
  contributions: "Beiträge",
  contribution: "Beitrag",
  yourContributions: "Deine Beiträge",
  contributionCount: (total: number) =>
    `${total} ${total === 1 ? "Beitrag" : "Beiträge"}`,
  noContributionsYet: "Noch keine Beiträge",
  noContributionsBody: "Du hast noch keine Einträge beigetragen.",
  noVerificationsBody:
    "Du hast noch keine Verifizierungen hinzugefügt. Öffne einen Eintrag, den du bestätigen kannst, um deine erste hinzuzufügen.",
  contributorProfile: "Profil",
  // Contribution status filters: mirror the shared record-status vocabulary
  // (status.ts) deliberately — the profile list keeps its own labels so a
  // page never mixes bundles (same pattern as moderation.ts statusLabels).
  statusFilters: {
    all: "Alle",
    pending: "In Moderation",
    // Post-0039 the published camera status is "active" — the chip label
    // says "Published" so the filter vocabulary matches the domain.
    active: "Veröffentlicht",
    verified: "Verifiziert",
    needs_review: "Zu prüfen",
    removed: "Entfernt",
    rejected: "Abgelehnt",
    reviewed: "Erledigt",
    approved: "Genehmigt",
    stale: "Veraltet",
  },
  errorLoadContributions: "Deine Beiträge konnten nicht geladen werden.",
  errorLoadTrustLevel: "Deine Vertrauensstufe konnte nicht geladen werden.",
  gateL1Help: "Du kannst Einträge verifizieren, sobald dein erster Beitrag veröffentlicht ist.",
  // Contribution kinds (account page rework 2026-08-08): the three types
  // are visually distinct via inline SVG icon + text label (never colour
  // alone — WCAG 1.4.1), so each row and stats card carries these.
  typeLabels: {
    camera: "Kamerameldung",
    correction: "Korrektur",
  },
  // Type filter chips (same look as the status chips; local state, never
  // in the URL — private page).
  typeFilters: {
    all: "Alle Typen",
    camera: "Kamerameldungen",
    correction: "Korrekturen",
  },
  typeFilterLabel: "Nach Typ filtern",
  // Account summary strip: global counts (independent of the active
  // filters) answering "what do I have in the queue?" at a glance.
  stats: {
    camera: "Kamerameldungen",
    correction: "Korrekturen",
    inModeration: "In Moderation",
  },
  statsGroupLabel: "Übersicht deiner Beiträge",
  // Contribution loop CTA: the page is no longer a dead end — it links
  // back into the reporting tools.
  newReportCta: "Kamera melden",
  newCorrectionCta: "Korrektur vorschlagen",
  // Profile list pagination (F0 canonical contract) + per-filter empty
  // state: the list is the contributor's own, filters are local to the
  // page (never shareable URLs, COMMUNITY_PLAN §2.3).
  noContributionsFiltered: "Keine Beiträge passen zu diesem Filter.",
  previousPage: "Vorherige Seite",
  nextPage: "Nächste Seite",
  pageOf: (page: number, totalPages: number) => `Seite ${page} von ${totalPages}`,
  contributionsNavigation: "Navigation der Beiträge",
  contributionStatusFilter: "Beiträge nach Status filtern",
  contributionFilters: "Beiträge filtern",
  clearContributionFilters: "Filter zurücksetzen",
  // Anonymous verification gate (C5): the record detail shows the toggle
  // but disables it with this explanatory copy — the server answers 401
  // without a session, so the button never pretends to work.
  loginToVerify: "Melde dich an, um diesen Eintrag zu verifizieren",

  // --- Contribution editing (C6) ---
  edit: "Bearbeiten",
  editContribution: "Beitrag bearbeiten",
  editYourContribution: "Deinen Beitrag bearbeiten",
  editReviewNotice:
    "Deine Änderungen werden von einem Moderationsteam-Mitglied geprüft, bevor sie den aktuellen Eintrag ersetzen.",
  saveChanges: "Änderungen speichern",
  saveSubmitForReview: "Speichern und zur Prüfung senden",
  cancel: "Abbrechen",
  editBlockedRemoved:
    "Dieser Beitrag kann nicht bearbeitet werden: Der Eintrag wurde entfernt oder abgelehnt.",
  errorEditNotOwner: "Du kannst nur deine eigenen Beiträge bearbeiten.",
  errorEditConflict: "Für diesen Eintrag wird bereits eine Änderungsanfrage geprüft.",
  errorEditRateLimit: "Zu viele Versuche. Bitte versuche es in einer Minute erneut.",
  editRequestPending: "Für diesen Eintrag wird bereits eine Änderungsanfrage geprüft.",
  editSaved: "Änderungen gespeichert.",
  editSubmitted: "Deine Änderungsanfrage wurde zur Prüfung eingereicht.",
  editNoChanges: "Es wurden keine Änderungen vorgenommen.",
  errorEditRace:
    "Dieser Eintrag hat sich seit dem Laden geändert. Lade die Seite neu und versuche es erneut.",
  errorEditNotFound: "Dieser Eintrag kann nicht bearbeitet werden.",
  errorEditGeneric: "Deine Änderungen konnten nicht gespeichert werden. Bitte versuche es erneut.",
  editBackToRecord: "Zurück zum Eintrag",
  editLoginTitle: "Melde dich an, um deinen Beitrag zu bearbeiten",
  editLoginBody:
    "Du musst angemeldet sein, um einen von dir eingereichten Beitrag zu bearbeiten.",
  editLoginAction: "Anmelden",

  // --- Destructive confirmations ---
  removeVerificationConfirmTitle: "Deine Verifizierung von diesem Eintrag entfernen?",
  cannotBeUndone: "Das lässt sich nicht rückgängig machen.",
  remove: "Entfernen",
  deleteContributionTitle: "Diesen Beitrag löschen?",
  deleteContributionBody:
    "Der Eintrag wird aus dem öffentlichen Verzeichnis entfernt. Das lässt sich nicht rückgängig machen.",
  deleteContribution: "Beitrag löschen",

  // --- Community actions (ADR 0021 §3, FASE 3 UI): five-action surface on
  // the record detail and the map popup. Vocabulary frozen by the ADR:
  // useful / utile, confirm / confermo ancora presente, no longer there /
  // non c'è più, flag / segnala, privacy / privacy. Counts are aggregates
  // only (never attribution); the anonymous surface shows counts + a
  // register/login call-to-action.
  actions: {
    sectionLabel: "Community-Aktionen",
    like: "Nützlich",
    confirm: "Bestätigen",
    gone: "Nicht mehr da",
    problem: "Problem",
    privacy: "Datenschutz",
    likeHelp: "Diesen Eintrag als nützlich für das Verzeichnis markieren.",
    confirmHelp: "Ich bestätige, dass dieser Eintrag am angegebenen Standort noch vorhanden ist.",
    goneHelp: "Ich glaube, diese Kamera ist nicht mehr da.",
    problemHelp: "Mit diesem Eintrag stimmt etwas nicht (Details, Position, Beschreibung).",
    privacyHelp: "Dieser Eintrag wirft datenschutzrechtliche oder rechtliche Bedenken auf.",
    countOf: (label: string, count: number) => `${label}: ${count}`,
    anonymousCta: "Melde dich an oder registriere dich, um mitzumachen",
    anonymousCtaAction: "Anmelden",
    removeYourAction: "Deine Aktion entfernen",
    updating: "Wird aktualisiert…",
    errorDuplicate: "Du hast diese Aktion bereits gesetzt.",
    errorSelfAction: "Du kannst deine eigene Meldung nicht als nützlich markieren oder bestätigen.",
    errorSessionEnded: "Deine Sitzung ist beendet. Melde dich erneut an, um mitzumachen.",
    errorVerifyRequired: "Bestätige deine E-Mail-Adresse, um an Community-Aktionen teilzunehmen.",
    errorGeneric: "Die Aktion konnte nicht aktualisiert werden. Versuche es erneut.",
    // Privacy flags (ADR 0021 §6.4): the per-account daily cap, and a flag
    // stored but sent to a moderator instead of hiding the record.
    errorPrivacyLimit: "Du hast das Tageslimit für Datenschutzmeldungen erreicht. Versuche es morgen erneut oder nutze für dringende Anliegen das Korrekturformular.",
    privacyQueued: "Meldung erhalten. Ein Moderator prüft sie, bevor sich an diesem Eintrag etwas ändert.",
    // Compact toolbar (map popup, redesign t_b7728ad0): the trigger that
    // opens the disclosure with the remaining three actions, and the
    // explicit-copy privacy confirmation (the only action that asks before
    // sending — a privacy report is the GDPR-friendly fast-hide request).
    // The slash form ("Update/report") is deliberate: the trigger sits in a
    // ~90px grid column next to Utile/Conferma — a long label would wrap to
    // three ragged lines at 300px popup width.
    moreActions: "Ändern/melden",
    moreActionsHelp:
      "Weitere Aktionen für diesen Eintrag: melden, dass die Kamera weg ist, ein Problem melden oder Datenschutzbedenken äußern.",
    moreMenuLabel: "Aktionen zum Ändern oder Melden",
    privacyConfirmTitle: "Datenschutzmeldung bestätigen?",
    privacyConfirmBody:
      "Eine Datenschutzmeldung bittet das Prüfteam, diesen Eintrag auszublenden. Du kannst sie nicht rückgängig machen.",
    privacyConfirmAction: "Datenschutzbedenken melden",
    cancel: "Abbrechen",
  },
};
