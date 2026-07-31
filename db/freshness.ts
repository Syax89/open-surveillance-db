// Freshness state for camera records.
//
// A verified record is presented as "current" only while it is inside its
// scheduled review window. Once the review date passes, the record must not
// be represented as current: the public read boundary excludes it and the
// moderation sweep moves it to `needs_review` for re-verification. Records
// still unconfirmed 90 days after their scheduled review date are labelled
// stale in the moderation queue.
//
// The clocks follow docs/workstreams/DATA_TRUST.md:
//   - default recheck every 12 months (standard confidence);
//   - records not re-confirmed within 90 days of the scheduled review become
//     stale and must never be silently represented as current.

export const DEFAULT_REVIEW_INTERVAL_MONTHS = 12;
export const STALE_GRACE_DAYS = 90;

export type FreshnessPhase =
  | "current"
  | "review_due"
  | "stale"
  | "not_applicable";

export type FreshnessInput = {
  status: string;
  reviewDueAt: string | null;
};

export function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ISO date: ${iso}`);
  const result = new Date(date.getTime() + days * 86_400_000);
  return result.toISOString();
}

export function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ISO date: ${iso}`);
  const day = date.getUTCDate();
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return target.toISOString();
}

export function computeReviewDueAt(
  lastVerifiedAt: string,
  intervalMonths: number = DEFAULT_REVIEW_INTERVAL_MONTHS,
): string {
  if (!Number.isInteger(intervalMonths) || intervalMonths < 1) {
    throw new Error(`Invalid review interval: ${intervalMonths}`);
  }
  return addMonths(lastVerifiedAt, intervalMonths);
}

/** Moment after which a record past its review date is considered stale. */
export function staleAfter(reviewDueAt: string): string {
  return addDays(reviewDueAt, STALE_GRACE_DAYS);
}

export function evaluateFreshness(
  record: FreshnessInput,
  nowIso: string = new Date().toISOString(),
): FreshnessPhase {
  if (record.status === "demo") return "current";
  if (record.status === "verified" || record.status === "needs_review") {
    if (!record.reviewDueAt) {
      // Legacy record without a schedule: not provably stale, and for
      // `verified` still eligible for public output.
      return "current";
    }
    if (nowIso <= record.reviewDueAt) return "current";
    if (nowIso <= staleAfter(record.reviewDueAt)) return "review_due";
    return "stale";
  }
  return "not_applicable";
}

/**
 * Public-read test: may this record be presented as a currently verified
 * record? Only `verified` records inside their review window and clearly
 * labelled `demo` records pass. Everything else (pending, needs_review,
 * rejected, removed, or verified but past the review date) is not public.
 */
export function isPubliclyCurrent(
  record: FreshnessInput,
  nowIso: string = new Date().toISOString(),
): boolean {
  if (record.status === "demo") return true;
  if (record.status === "verified") {
    return evaluateFreshness(record, nowIso) === "current";
  }
  return false;
}
