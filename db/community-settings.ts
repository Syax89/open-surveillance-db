import { getD1 } from "./cameras";

/**
 * Tunable community configuration — CODE DEFAULTS (ADR 0021 §5.1, kanban
 * t_4a7469bb FASE 1 DB). Migration 0037 seeds the exact same values into
 * `community_settings`, so config and code agree at first boot; these
 * defaults are the fallback when a row is missing (a deleted setting, a
 * partially provisioned DB) — an evaluation can never fail on a missing
 * row.
 *
 * The seed in drizzle/0037_community_settings.sql and this constant MUST
 * stay in sync (the db-migration-smoke test pins the seed row count; a
 * drift would make the two sources disagree and the operator-tunable knob
 * silently inert). All numbers are verbatim from ADR 0021 decision 4/5:
 * `rateLimit.actionPerMinute` is not fixed by the ADR — the value here (and
 * in the seed) is the operator-tunable default.
 *
 * The 60 s in-process read cache (`getCommunitySettingsCached`) is the
 * only FASE 2 addition to this module so far (ADR 0021 §5.2); the admin
 * settings endpoint is not part of this phase. `getCommunitySettings()`
 * remains uncached for test callers that need fresh data.
 */

export const DEFAULT_COMMUNITY_SETTINGS: Record<string, unknown> = {
  // Trust-level weights (ADR 0021 §4 table): L0 0.25 … L4 5. Never exposed
  // to clients (ADR 0018 §3.4) — only used in threshold math.
  "weights.byLevel": { L0: 0.25, L1: 1, L2: 2, L3: 3, L4: 5 },
  // gone → removed: weighted sum ≥ 3 AND ≥ 3 distinct contributors.
  "thresholds.gone": 3,
  "thresholds.goneMinDistinct": 3,
  // problem → hidden: weighted sum ≥ 3 AND ≥ 2 distinct contributors.
  "thresholds.problem": 3,
  "thresholds.problemMinDistinct": 2,
  // privacy → hidden: 1 action (non-weighted, the deliberately aggressive
  // prudential path the CEO requested).
  "thresholds.privacy": 1,
  // Reversal (contrary consensus): removed → active 3/2 distinct;
  // hidden → active 5/3 distinct (and privacy hides need the cooldown).
  "thresholds.restoreFromRemoved": 3,
  "thresholds.restoreFromHidden": 5,
  "thresholds.restoreMinDistinctFromRemoved": 2,
  "thresholds.restoreMinDistinctFromHidden": 3,
  // Privacy-hide reversal cooldown (days).
  "cooldown.privacyHiddenDays": 7,
  // Daily action quotas per contributor (20 normal, 40 trusted) and the
  // per-record cap (5 actions/day from distinct accounts).
  "quotas.actionsPerDay": 20,
  "quotas.actionsPerDayTrusted": 40,
  "quotas.perRecordPerDay": 5,
  // Per-minute action rate limit (IP-hash burst bucket).
  "rateLimit.actionPerMinute": 10,
};

export type CommunitySettingsRow = {
  key: string;
  value: string;
  updatedAt: string;
};

/**
 * Reads the whole `community_settings` table and merges it over the code
 * defaults (DB wins; unknown DB keys are kept so an admin can introduce a
 * future knob before the code knows it). `value` is JSON text.
 */
export async function getCommunitySettings(): Promise<Record<string, unknown>> {
  const d1 = await getD1();
  const rows = await d1
    .prepare("SELECT key, value AS value, updated_at AS updatedAt FROM community_settings")
    .all<CommunitySettingsRow>();
  const settings: Record<string, unknown> = { ...DEFAULT_COMMUNITY_SETTINGS };
  for (const row of rows.results) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      // A malformed value must never poison an evaluation: keep the code
      // default for that key (fail-open to the fallback, not fail-closed).
      // FASE 2 surfaces the parse error in the admin settings surface.
    }
  }
  return settings;
}

/** In-process read cache (ADR 0021 §5.2): TTL 60 s. */
let cachedSettings: Record<string, unknown> | null = null;
let cacheFetchedAt = 0;
const CACHE_TTL_MS = 60_000;

/**
 * Cached variant of `getCommunitySettings()` with a 60 s TTL. Used by the
 * community action paths to avoid a D1 round-trip on every evaluation.
 * The uncached `getCommunitySettings()` still exists for test callers.
 */
export async function getCommunitySettingsCached(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (cachedSettings && now - cacheFetchedAt < CACHE_TTL_MS) {
    return { ...cachedSettings };
  }
  const settings = await getCommunitySettings();
  cachedSettings = settings;
  cacheFetchedAt = now;
  return { ...settings };
}

/** Drop the in-process cache (test helper). */
export function resetCommunitySettingsCache(): void {
  cachedSettings = null;
  cacheFetchedAt = 0;
}
