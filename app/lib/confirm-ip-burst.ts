/**
 * IP-hash burst bucket for the community-verification toggle (ADR 0018 §2.4,
 * anti-gaming layer 5; C1).
 *
 * The daily per-account quota is D1 state (db/confirmations.ts). This module
 * adds the soft burst flag: N accounts (or N toggles) from the same caller
 * key inside a short window trip the bucket and the route answers 429 plus a
 * surge alert. The bucket key is the SHA-256 hash of the rate-limit caller
 * key (`photos.submitter_key` pattern) — NEVER the raw IP, so an alert or a
 * log line cannot be used to track an individual visitor (the route passes
 * the RAW caller key to recordRateLimitBlock, which hashes it again for the
 * alert payload). NAT/CGNAT: soft flag, not ban.
 *
 * This in-memory per-isolate detector is deliberately separate from the daily
 * quota: the quota is a D1 COUNT (the source of truth for sustained volume),
 * while the burst bucket only bounds request rate per isolate (matching the
 * scope of app/lib/rate-limit.ts).
 *
 * Dependency-free of `cloudflare:workers` (the env value is passed in), like
 * photo-quota.ts, so the harness can transpile and unit-test it in Node.
 */

import { sha256Hex } from "./abuse-alerts";

type EnvLike = { [key: string]: unknown };

export type ConfirmIpBurstLimits = {
  maxBurst: number;
  windowSeconds: number;
};

/**
 * Burst-bucket knobs (env-tunable): CONFIRM_IP_BURST_MAX (default 10) toggles
 * per caller inside CONFIRM_IP_BURST_WINDOW_SECONDS (default 60).
 */
export function confirmIpBurstLimits(env: unknown): ConfirmIpBurstLimits {
  const config = env as EnvLike;
  const maxBurst = Number(config.CONFIRM_IP_BURST_MAX);
  const windowSeconds = Number(config.CONFIRM_IP_BURST_WINDOW_SECONDS);
  return {
    maxBurst: Number.isFinite(maxBurst) && maxBurst > 0 ? maxBurst : 10,
    windowSeconds: Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 60,
  };
}

const burstAttempts = new Map<string, number[]>();

function pruneBucket(bucket: string, windowStart: number): number[] {
  const timestamps = (burstAttempts.get(bucket) ?? []).filter(
    (timestamp) => timestamp >= windowStart,
  );
  if (timestamps.length === 0) burstAttempts.delete(bucket);
  else burstAttempts.set(bucket, timestamps);
  return timestamps;
}

/**
 * Check (and record) one toggle against the caller's burst bucket. Keyed by
 * the SHA-256 of the caller key, never the raw IP. `now` is injectable for
 * deterministic tests.
 */
export async function checkConfirmIpBurst(
  env: unknown,
  callerKeyValue: string,
  now: number = Date.now(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const { maxBurst, windowSeconds } = confirmIpBurstLimits(env);
  const windowStart = now - windowSeconds * 1000;
  const bucket = await sha256Hex(callerKeyValue);

  // Bound memory: once the map grows beyond a sane size, drop every stale
  // bucket before evaluating the current one (same shape as rate-limit.ts).
  if (burstAttempts.size > 10_000) {
    for (const candidate of burstAttempts.keys()) pruneBucket(candidate, windowStart);
  }

  const recent = pruneBucket(bucket, windowStart);
  if (recent.length >= maxBurst) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((recent[0] + windowSeconds * 1000 - now) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  burstAttempts.set(bucket, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test/observability hook: clear all in-memory burst buckets. */
export function resetConfirmIpBurstState(): void {
  burstAttempts.clear();
}
