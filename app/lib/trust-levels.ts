/**
 * Community trust levels (ADR 0018 §3, COMMUNITY_PLAN §3.1).
 *
 * Level = pure function of the contributor's verified contribution count.
 * Thresholds live in ONE const (TRUST_LEVELS): L0=0 / L1=1 / L2=5 / L3=20 /
 * L4=50. Only `status = 'verified'` records count towards the level — the
 * caller (db/auth countVerifiedCameras) applies that predicate; this module
 * never guesses.
 *
 * The level is ALWAYS derived, never denormalised: there is no
 * `contributors.contributor_level` column. A COUNT over the
 * (contributor_id, status) index is an index-only seek, so at D1 volumes the
 * derived read is free, and it can never go stale when a moderation decision
 * flips a record's status (approve/reject/stale/removal/erasure all just
 * change the count).
 *
 * The response shape is intentionally machine-readable (level number +
 * verified count + next threshold): display labels ("New contributor",
 * "Trusted contributor", ...) are a frontend/i18n concern (community.ts
 * bundle), never a backend constant.
 */

/** Single source of truth for the level thresholds (L0..L4). */
export const TRUST_LEVELS = [
  { level: 0, threshold: 0 },
  { level: 1, threshold: 1 },
  { level: 2, threshold: 5 },
  { level: 3, threshold: 20 },
  { level: 4, threshold: 50 },
] as const;

export type TrustLevel = (typeof TRUST_LEVELS)[number]["level"];

/**
 * The machine-readable level payload returned by the profile endpoints.
 * `nextThreshold` is null at the top level (L4) so a client knows there is
 * no further progress line to render.
 */
export type TrustLevelMeta = {
  level: TrustLevel;
  /** Number of the contributor's status='verified' records (the input). */
  verifiedCount: number;
  /** Minimum verified count to hold this level. */
  threshold: number;
  /** Verified count needed for the next level, or null at L4. */
  nextThreshold: number | null;
};

/**
 * Pure level derivation. Monotone non-decreasing in `count`: going up never
 * downgrades, going down never upgrades. count is clamped at 0 (a negative
 * value is treated as no verified contributions).
 */
export function deriveLevel(count: number): TrustLevel {
  const safeCount = Number.isFinite(count) ? Math.max(Math.trunc(count), 0) : 0;
  let level: TrustLevel = 0;
  for (const entry of TRUST_LEVELS) {
    if (safeCount >= entry.threshold) level = entry.level;
  }
  return level;
}

/** Full machine-readable level payload for a verified contribution count. */
export function trustLevelMeta(verifiedCount: number): TrustLevelMeta {
  const level = deriveLevel(verifiedCount);
  const next = TRUST_LEVELS.find((entry) => entry.level === level + 1);
  return {
    level,
    verifiedCount: Math.max(Math.trunc(verifiedCount) || 0, 0),
    threshold: TRUST_LEVELS[level].threshold,
    nextThreshold: next ? next.threshold : null,
  };
}
