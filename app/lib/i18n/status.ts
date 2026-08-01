/**
 * status — interface strings.
 *
 * English is the pilot language: `en` defines the canonical key set for
 * this domain, `it` is type-checked against it via `Translation<typeof en>`
 * (see `./types.ts`), so a missing or extra key fails `tsc --noEmit`.
 */
import type { Translation } from "./types";

export const en = {
  verified: "Verified",
  demo: "Illustrative record",
  pending: "In moderation",
  needs_review: "Needs review",
  removed: "Removed",
  rejected: "Rejected",
} as const;

export const it: Translation<typeof en> = {
  verified: "Verificato",
  demo: "Record illustrativo",
  pending: "In moderazione",
  needs_review: "Da ricontrollare",
  removed: "Rimosso",
  rejected: "Rifiutato",
};
