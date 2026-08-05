// Freshness state for camera records — read-time boundary and informational
// metadata only (ADR 0021 § 2.2 / § 9.2).
//
// After the community-driven pivot, NO record status transition happens on a
// timer: the old freshness sweep (`verified → needs_review → stale`) and the
// pre-pivot 12-month review clock are RETIRED. The remaining pieces here
// serve two non-transitioning purposes:
//   1. the public read boundary — a record is presented as "current" only
//      while it is inside its scheduled review window (mirrored in SQL by
//      publicCameraPredicate in db/cameras.ts);
//   2. the informational badge — `review_due_at` / `review_interval_months`
//      are metadata written on approve/reverify (db/moderation.ts) so the
//      record page can show a neutral "last confirmed X" label, never a
//      state change.

import { PUBLIC_CAMERA_STATUSES } from "../app/lib/public-status";

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
  const totalMonths = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const target = new Date(date.getTime());
  target.setUTCFullYear(Math.floor(totalMonths / 12), totalMonths % 12, 1);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return target.toISOString();
}

/**
 * Informational review schedule (ADR 0021 § 9.2): the next `review_due_at`
 * after a verification, in calendar months. The interval is explicit — the
 * pre-pivot default review clock is retired; the value only feeds the badge
 * metadata, never a state transition.
 */
export function computeReviewDueAt(
  lastVerifiedAt: string,
  intervalMonths: number,
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
  if (record.status === "stale") return "stale";
  // ADR 0021 §12.1: after migration 0039, the domain status is "active"
  // (was "verified"). Both are treated identically for freshness evaluation;
  // the old "verified" path remains for legacy moderation flows.
  if (record.status === "active" || record.status === "verified" || record.status === "needs_review") {
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
 * record? The status must be whitelisted in PUBLIC_CAMERA_STATUSES
 * (app/lib/public-status.ts), and the record must be inside the current
 * freshness phase. `demo` records are always current (illustrative
 * placeholders); any other public status must be current at read time, which
 * for `verified` means inside its review window (or without a schedule, i.e.
 * not provably stale). Everything else (pending, needs_review, rejected,
 * removed, stale, ...) is not public.
 */
export function isPubliclyCurrent(
  record: FreshnessInput,
  nowIso: string = new Date().toISOString(),
): boolean {
  if (!(PUBLIC_CAMERA_STATUSES as readonly string[]).includes(record.status)) {
    return false;
  }
  return evaluateFreshness(record, nowIso) === "current";
}
