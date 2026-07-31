import type { Locale } from "../components/LocaleProvider";

/**
 * Canonical bilingual labels for every record status.
 *
 * Single source of truth for status wording across the public page, the
 * record-detail page, the guide and the local moderation dashboard. Keeping
 * one table here prevents the label drift that Horizon 2 (coherent language)
 * is meant to eliminate:
 * - "pending" is always "In moderation" / "In moderazione";
 * - "needs_review" is always "Needs review" / "Da ricontrollare";
 * - the demo status always reads "Illustrative record" / "Record
 *   illustrativo", matching the seeded titles ("Illustrative record A/B")
 *   and the prototype banners.
 *
 * Labels agree with the record ("Verificato", "Rimosso") rather than with an
 * implied camera ("Verificata"), so a status reads the same on the map, in
 * the directory, on a record page and in the guide.
 */
export type RecordStatus =
  | "verified"
  | "demo"
  | "pending"
  | "needs_review"
  | "removed"
  | "rejected"
  | "hidden"
  | "reviewed";

export const statusLabels: Record<Locale, Record<RecordStatus, string>> = {
  en: {
    verified: "Verified",
    demo: "Illustrative record",
    pending: "In moderation",
    needs_review: "Needs review",
    removed: "Removed",
    rejected: "Rejected",
    hidden: "Hidden",
    reviewed: "Reviewed",
  },
  it: {
    verified: "Verificato",
    demo: "Record illustrativo",
    pending: "In moderazione",
    needs_review: "Da ricontrollare",
    removed: "Rimosso",
    rejected: "Rifiutato",
    hidden: "Nascosto",
    reviewed: "Revisionato",
  },
};

/**
 * Localised label for a status key, falling back to the raw key for
 * statuses that are not part of the canonical set.
 */
export function statusLabel(locale: Locale, status: string): string {
  return statusLabels[locale][status as RecordStatus] ?? status;
}
