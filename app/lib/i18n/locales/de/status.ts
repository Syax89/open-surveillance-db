/**
 * status — DE translation. Parity-checked against the English pilot
 * bundle (../../status.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../status";

export const de: Translation<typeof en> = {
  // ADR 0021: after migration 0039 the public domain status is "active"
  // ("verified" remains for legacy moderation flows and profile filters).
  active: "Aktiv",
  verified: "Verifiziert",
  demo: "Beispieleintrag",
  pending: "In Moderation",
  needs_review: "Prüfung nötig",
  removed: "Entfernt",
  rejected: "Abgelehnt",
  // Terminal/lifecycle statuses used by moderation outcomes (2026-08-08):
  // approving a correction sets "reviewed"; a camera that aged out of
  // review is "stale" (kept for historical rows). Without these the
  // account page fell back to the literal label "Status" on approved
  // corrections.
  reviewed: "Erledigt",
  approved: "Genehmigt",
  stale: "Veraltet",
  // ADR 0021 §6.3 (FASE 3 UI): hidden/removed records are reachable by
  // direct link with a banner; the labels feed the banner and the record
  // status line (publicStatusLabel whitelist extended for the record page).
  hidden: "Ausgeblendet",
};
