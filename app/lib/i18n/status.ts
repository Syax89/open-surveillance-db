/**
 * status — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  // ADR 0021: after migration 0039 the public domain status is "active"
  // ("verified" remains for legacy moderation flows and profile filters).
  active: "Active",
  verified: "Verified",
  demo: "Illustrative record",
  pending: "In moderation",
  needs_review: "Needs review",
  removed: "Removed",
  rejected: "Rejected",
  // Terminal/lifecycle statuses used by moderation outcomes (2026-08-08):
  // approving a correction sets "reviewed"; approving a photo sets
  // "approved"; a camera that aged out of review is "stale" (kept for
  // historical rows). Without these the account page fell back to the
  // literal label "Status" on approved corrections/photos.
  reviewed: "Resolved",
  approved: "Approved",
  stale: "Stale",
  // ADR 0021 §6.3 (FASE 3 UI): hidden/removed records are reachable by
  // direct link with a banner; the labels feed the banner and the record
  // status line (publicStatusLabel whitelist extended for the record page).
  hidden: "Hidden",
} as const;

export const it: Translation<typeof en> = {
  active: "Attivo",
  verified: "Verificato",
  demo: "Record illustrativo",
  pending: "In moderazione",
  needs_review: "Da ricontrollare",
  removed: "Rimosso",
  rejected: "Rifiutato",
  reviewed: "Risolta",
  approved: "Approvata",
  stale: "Obsoleto",
  hidden: "Nascosto",
};
