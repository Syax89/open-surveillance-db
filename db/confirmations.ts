import { env } from "cloudflare:workers";
import { getD1 } from "./cameras";
import { PUBLIC_CAMERA_STATUSES } from "../app/lib/public-status";

/**
 * Community verifications (ADR 0018 §2, C1).
 *
 * Toggle semantics, one confirmation type per (record, contributor). The
 * UNIQUE (camera_id, contributor_id) index is the structural anti-gaming
 * layer; this module owns the six anti-gaming layers on top of it:
 *
 *   1. UNIQUE constraint + `ON CONFLICT DO NOTHING RETURNING` (race-safe:
 *      two concurrent PUTs yield exactly one row, the second answers
 *      `duplicate` / 409);
 *   2. level gate (>= 1 verified contribution, never email verification —
 *      no mailer exists, ADR 0013) + self-verify rejection (403);
 *   3. daily per-account quota as D1 state (a COUNT inside the write path,
 *      NOT an in-memory per-isolate limiter — a per-isolate limiter cannot
 *      be the source of truth) -> 429 + Retry-After;
 *   4. per-record cap (max verifications/day from distinct accounts on one
 *      record) -> 429;
 *   5. IP-hash burst bucket lives in app/lib/confirm-ip-burst.ts (route
 *      layer, photos.submitter_key pattern — never the raw IP);
 *   6. decay: confirmations older than the review window
 *      (`created_at >= cameras.last_verified_at`) do not count; a
 *      re-verified record renews them.
 *
 * The daily quota is enforced entirely inside `setConfirmation`, so no route
 * can bypass it. `env` is read at call time from the passed-in value (or the
 * module binding), mirroring appealAppellantLimits.
 */

type EnvLike = { [key: string]: unknown };

export type ConfirmationRecord = {
  id: number;
  cameraId: number;
  contributorId: number;
  createdAt: string;
};

export type SetConfirmationResult =
  | { kind: "ok"; count: number }
  | { kind: "camera_not_public" }
  | { kind: "level_gate" }
  | { kind: "self_verify" }
  | { kind: "duplicate" }
  | { kind: "daily_quota_exceeded"; retryAfterSeconds: number }
  | { kind: "per_record_cap_exceeded"; retryAfterSeconds: number };

function envNumber(envValue: unknown, key: string, fallback: number): number {
  const value = Number((envValue as EnvLike)[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Confirmation quota knobs (env-tunable, appealAppellantLimits pattern).
 * The daily cap is 20 verifications/account/day, 40 for trusted accounts
 * (>= 1 verified contribution); the per-record cap is 5 verifications/day
 * from distinct accounts on one record. All enforced as D1 counts.
 */
export function confirmationQuota(envValue: unknown): {
  maxPerDay: number;
  maxPerDayTrusted: number;
  perRecordPerDay: number;
} {
  return {
    maxPerDay: envNumber(envValue, "CONFIRMATIONS_DAILY_MAX", 20),
    maxPerDayTrusted: envNumber(envValue, "CONFIRMATIONS_DAILY_MAX_TRUSTED", 40),
    perRecordPerDay: envNumber(envValue, "CONFIRMATIONS_PER_RECORD_DAILY_MAX", 5),
  };
}

/** Level-gate threshold (default 1 verified contribution; env-tunable for testability). */
function confirmationLevelGateMin(envValue: unknown): number {
  return envNumber(envValue, "CONFIRMATIONS_LEVEL_GATE_MIN", 1);
}

/**
 * L1 gate helper: how many of the contributor's cameras are currently
 * `verified`. Only verified records count — never pending/rejected/removed
 * (ADR 0018 §3.2, anti-farming rule 1). Backed by the
 * (contributor_id, status) index (migration 0023).
 */
export async function verifiedContributionCount(contributorId: number): Promise<number> {
  const d1 = await getD1();
  const row = await d1
    .prepare("SELECT COUNT(*) AS n FROM cameras WHERE contributor_id = ? AND status = 'verified'")
    .bind(contributorId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * Decayed confirmation counts for a set of cameras in ONE GROUP BY query
 * (no N+1, ADR 0018 §2.3). Decay rule: confirmations older than the review
 * window (`created_at < cameras.last_verified_at`) do not count; a
 * re-verified record renews them (last_verified_at moves forward). Demo
 * records (last_verified_at NULL) count everything.
 */
export async function confirmationCountsFor(cameraIds: number[]): Promise<Map<number, number>> {
  if (cameraIds.length === 0) return new Map();
  const d1 = await getD1();
  const placeholders = cameraIds.map(() => "?").join(", ");
  const result = await d1
    .prepare(
      `SELECT cc.camera_id AS cameraId, COUNT(*) AS count
       FROM camera_confirmations cc JOIN cameras c ON c.id = cc.camera_id
       WHERE cc.camera_id IN (${placeholders}) AND (c.last_verified_at IS NULL OR cc.created_at >= c.last_verified_at)
       GROUP BY cc.camera_id`,
    )
    .bind(...cameraIds)
    .all<{ cameraId: number; count: number }>();
  return new Map(result.results.map((row) => [row.cameraId, row.count]));
}

/** Decayed confirmation count for a single record. */
export async function recordConfirmationCount(cameraId: number): Promise<number> {
  return (await confirmationCountsFor([cameraId])).get(cameraId) ?? 0;
}

/** The caller's own confirmation row (personal state, GET endpoint). */
export async function getConfirmation(
  cameraId: number,
  contributorId: number,
): Promise<ConfirmationRecord | null> {
  const d1 = await getD1();
  return d1
    .prepare(
      "SELECT id, camera_id AS cameraId, contributor_id AS contributorId, created_at AS createdAt FROM camera_confirmations WHERE camera_id = ? AND contributor_id = ?",
    )
    .bind(cameraId, contributorId)
    .first<ConfirmationRecord>();
}

/**
 * Seconds until the current 24 h window closes (Retry-After), minimum 1 so a
 * 429 response always carries a positive value.
 */
function windowRetryAfterSeconds(windowStartMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((windowStartMs + 24 * 60 * 60 * 1000 - nowMs) / 1000));
}

/**
 * Toggle ON for one (record, contributor). All anti-gaming checks live
 * INSIDE this write path so no route can bypass them; `now` is an injectable
 * deterministic clock. `env` is optional for tests (falls back to the module
 * binding) and read at call time.
 */
export async function setConfirmation(input: {
  cameraId: number;
  contributorId: number;
  now: string;
  env?: unknown;
}): Promise<SetConfirmationResult> {
  const d1 = await getD1();
  const effectiveEnv = input.env ?? env;
  const nowMs = Date.parse(input.now);

  // 1. Load the camera and apply the shared public predicate. The IN
  //    whitelist is built from PUBLIC_CAMERA_STATUSES, never hardcoded:
  //    status IN (PUBLIC_CAMERA_STATUSES) AND (status = 'demo' OR
  //    review_due_at IS NULL OR review_due_at >= now).
  const camera = await d1
    .prepare(
      "SELECT id, contributor_id AS contributorId, status, review_due_at AS reviewDueAt, last_verified_at AS lastVerifiedAt FROM cameras WHERE id = ?",
    )
    .bind(input.cameraId)
    .first<{
      id: number;
      contributorId: number | null;
      status: string;
      reviewDueAt: string | null;
      lastVerifiedAt: string | null;
    }>();
  if (!camera) return { kind: "camera_not_public" };
  const placeholders = PUBLIC_CAMERA_STATUSES.map(() => "?").join(", ");
  const publicCheck = await d1
    .prepare(
      `SELECT 1 AS ok FROM cameras WHERE id = ? AND status IN (${placeholders}) AND (status = 'demo' OR review_due_at IS NULL OR review_due_at >= ?)`,
    )
    .bind(input.cameraId, ...PUBLIC_CAMERA_STATUSES, input.now)
    .first<{ ok: number }>();
  if (!publicCheck) return { kind: "camera_not_public" };

  // 2. Self-verification: confirming your own record is a farming vector.
  if (camera.contributorId === input.contributorId) return { kind: "self_verify" };

  // 3. Level gate (fail-closed): at least `gateMin` (default 1) verified
  //    contributions. Never email verification (no mailer, ADR 0013).
  const verifiedCount = await verifiedContributionCount(input.contributorId);
  const gateMin = confirmationLevelGateMin(effectiveEnv);
  if (verifiedCount < gateMin) return { kind: "level_gate" };

  // 4. Daily per-account quota as D1 state inside the write path. Trusted
  //    accounts (>= gateMin verified contributions) get the higher cap.
  const windowStartMs = nowMs - 24 * 60 * 60 * 1000;
  const windowStart = new Date(windowStartMs).toISOString();
  const quota = confirmationQuota(effectiveEnv);
  const dailyLimit = verifiedCount >= gateMin ? quota.maxPerDayTrusted : quota.maxPerDay;
  const daily = await d1
    .prepare("SELECT COUNT(*) AS n FROM camera_confirmations WHERE contributor_id = ? AND created_at >= ?")
    .bind(input.contributorId, windowStart)
    .first<{ n: number }>();
  if ((daily?.n ?? 0) >= dailyLimit) {
    return { kind: "daily_quota_exceeded", retryAfterSeconds: windowRetryAfterSeconds(windowStartMs, nowMs) };
  }

  // 5. Per-record cap: max verifications/day from distinct accounts on one
  //    record; the 6th distinct account answers 429.
  const perRecord = await d1
    .prepare("SELECT COUNT(*) AS n FROM camera_confirmations WHERE camera_id = ? AND created_at >= ?")
    .bind(input.cameraId, windowStart)
    .first<{ n: number }>();
  if ((perRecord?.n ?? 0) >= quota.perRecordPerDay) {
    return { kind: "per_record_cap_exceeded", retryAfterSeconds: windowRetryAfterSeconds(windowStartMs, nowMs) };
  }

  // 6. Race-safe insert: the UNIQUE (camera_id, contributor_id) index with
  //    ON CONFLICT DO NOTHING means two concurrent PUTs yield exactly one
  //    row; no row returned -> duplicate (409).
  const inserted = await d1
    .prepare(
      "INSERT INTO camera_confirmations (camera_id, contributor_id, created_at) VALUES (?, ?, ?) ON CONFLICT (camera_id, contributor_id) DO NOTHING RETURNING id",
    )
    .bind(input.cameraId, input.contributorId, input.now)
    .first<{ id: number }>();
  if (!inserted) return { kind: "duplicate" };

  // 7. Refresh the decayed count (created_at >= last_verified_at) for the
  //    response; the just-inserted confirmation counts when in window.
  const count = await recordConfirmationCount(input.cameraId);
  return { kind: "ok", count };
}

/**
 * Toggle OFF for one (record, contributor). Removing a row that does not
 * exist answers `not_found` (404); otherwise the decayed count is refreshed
 * and returned with `ok`.
 */
export async function removeConfirmation(input: {
  cameraId: number;
  contributorId: number;
}): Promise<{ kind: "ok"; count: number } | { kind: "not_found" }> {
  const d1 = await getD1();
  const deleted = await d1
    .prepare("DELETE FROM camera_confirmations WHERE camera_id = ? AND contributor_id = ? RETURNING id")
    .bind(input.cameraId, input.contributorId)
    .first<{ id: number }>();
  if (!deleted) return { kind: "not_found" };
  const count = await recordConfirmationCount(input.cameraId);
  return { kind: "ok", count };
}
