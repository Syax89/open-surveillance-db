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
  hidden: "Nascosto",
};
