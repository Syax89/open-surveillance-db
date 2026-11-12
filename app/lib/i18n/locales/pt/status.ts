/**
 * status — PT translation. Parity-checked against the English pilot
 * bundle (../../status.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../status";

export const pt: Translation<typeof en> = {
  // ADR 0021: after migration 0039 the public domain status is "active"
  // ("verified" remains for legacy moderation flows and profile filters).
  active: "Ativa",
  verified: "Verificada",
  demo: "Ficha ilustrativa",
  pending: "Em moderação",
  needs_review: "Requer revisão",
  removed: "Removida",
  rejected: "Rejeitada",
  // Terminal/lifecycle statuses used by moderation outcomes (2026-08-08):
  // approving a correction sets "reviewed"; a camera that aged out of
  // review is "stale" (kept for historical rows). Without these the
  // account page fell back to the literal label "Status" on approved
  // corrections.
  reviewed: "Resolvida",
  approved: "Aprovada",
  stale: "Desatualizada",
  // ADR 0021 §6.3 (FASE 3 UI): hidden/removed records are reachable by
  // direct link with a banner; the labels feed the banner and the record
  // status line (publicStatusLabel whitelist extended for the record page).
  hidden: "Oculta",
};
