/**
 * Abuse alerting for OpenSurveillanceDB.
 *
 * Tracks rate-limit blocks and oversized payloads per caller and per route,
 * and emits a structured alert when a caller (or an aggregate surge on a
 * route) crosses a configurable threshold. Alerts are delivered to an
 * optional webhook; without a webhook configured they degrade to a structured
 * server-side log line (visible via `wrangler tail` / the hosting log sink).
 *
 * Privacy by design (see docs/workstreams/OPS_OPEN.md §Observability):
 * - alerts never carry the raw caller IP; the caller is identified only by a
 *   SHA-256 hash of the rate-limit key, so an alert cannot be used to track
 *   an individual visitor over time;
 * - no request bodies, submission contents, or query strings are ever
 *   included in an alert.
 *
 * State is in-memory per isolate, matching the scope of the rate limiter
 * itself; long-window alerting for a public deployment belongs in the hosting
 * platform's analytics, not in worker memory.
 */

type EnvLike = { [key: string]: unknown };

export type AbuseEventKind = "rate_limited" | "payload_too_large";

export type AbuseAlertPayload = {
  source: "open-surveillance-db";
  event: AbuseEventKind;
  route: string;
  /** SHA-256 of the rate-limit key (never the raw IP). */
  callerHash: string;
  /** How many events of this kind were counted inside the window. */
  count: number;
  windowSeconds: number;
  detail: string;
  at: string;
};

const blockCounters = new Map<string, number[]>();
const surgeCounters = new Map<string, number[]>();
const lastAlertAt = new Map<string, number>();
const lastSurgeAt = new Map<string, number>();

const MAX_TRACKED_KEYS = 10_000;

function envNumber(env: unknown, key: string, fallback: number): number {
  const value = Number((env as EnvLike)[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function pruneCounter(map: Map<string, number[]>, key: string, windowStart: number): number[] {
  const recent = (map.get(key) ?? []).filter((timestamp) => timestamp >= windowStart);
  if (recent.length === 0) map.delete(key);
  else map.set(key, recent);
  return recent;
}

/** Bound memory: drop every stale counter once the map grows too large. */
function boundMemory(map: Map<string, number[]>, windowStart: number): void {
  if (map.size > MAX_TRACKED_KEYS) {
    for (const candidate of map.keys()) pruneCounter(map, candidate, windowStart);
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export type AbuseEventInput = {
  event: AbuseEventKind;
  route: string;
  key: string;
  windowSeconds: number;
  detail?: string;
};

/**
 * Count an abuse signal and fire an alert when the caller-specific or
 * route-wide threshold is crossed. Synchronous bookkeeping; the alert
 * delivery is scheduled fire-and-forget so a blocked client is never slowed
 * down by webhook latency, and a delivery failure can never fail the request.
 */
export function recordAbuseEvent(env: unknown, input: AbuseEventInput): void {
  const now = Date.now();
  const windowStart = now - input.windowSeconds * 1000;
  const counterKey = `${input.route}|${input.key}`;

  boundMemory(blockCounters, windowStart);
  boundMemory(surgeCounters, windowStart);

  const threshold = envNumber(env, "ABUSE_ALERT_THRESHOLD", 10);
  const surgeThreshold = envNumber(env, "ABUSE_ALERT_SURGE_THRESHOLD", 50);
  const cooldownMs = envNumber(env, "ABUSE_ALERT_COOLDOWN_SECONDS", 300) * 1000;

  const recent = pruneCounter(blockCounters, counterKey, windowStart);
  recent.push(now);
  blockCounters.set(counterKey, recent);

  const surge = pruneCounter(surgeCounters, input.route, windowStart);
  surge.push(now);
  surgeCounters.set(input.route, surge);

  const eventLabel = input.event.replaceAll("_", " ");

  if (recent.length >= threshold && now - (lastAlertAt.get(counterKey) ?? 0) > cooldownMs) {
    lastAlertAt.set(counterKey, now);
    void deliverAbuseAlert(env, input.key, {
      source: "open-surveillance-db",
      event: input.event,
      route: input.route,
      count: recent.length,
      windowSeconds: input.windowSeconds,
      detail: input.detail ?? `${recent.length} ${eventLabel} event(s) from one caller in ${input.windowSeconds}s`,
      at: new Date(now).toISOString(),
    }).catch((error) => {
      console.error("[abuse-alert] delivery failed", error);
    });
  }

  if (surge.length >= surgeThreshold && now - (lastSurgeAt.get(input.route) ?? 0) > cooldownMs) {
    lastSurgeAt.set(input.route, now);
    void deliverAbuseAlert(env, "aggregate", {
      source: "open-surveillance-db",
      event: input.event,
      route: input.route,
      count: surge.length,
      windowSeconds: input.windowSeconds,
      detail: `${surge.length} ${eventLabel} event(s) on ${input.route} in ${input.windowSeconds}s across all callers`,
      at: new Date(now).toISOString(),
    }).catch((error) => {
      console.error("[abuse-alert] delivery failed", error);
    });
  }
}

/** Convenience wrapper used by the rate-limited routes. */
export function recordRateLimitBlock(
  env: unknown,
  input: Omit<AbuseEventInput, "event">,
): void {
  recordAbuseEvent(env, { ...input, event: "rate_limited" });
}

/**
 * Deliver one alert. With `ABUSE_ALERT_WEBHOOK_URL` configured the alert is
 * POSTed as JSON; otherwise it is logged server-side. The payload contains
 * only the hashed caller identity plus aggregate counters.
 */
export async function deliverAbuseAlert(
  env: unknown,
  callerKeyValue: string,
  alert: Omit<AbuseAlertPayload, "callerHash">,
): Promise<void> {
  const callerHash = await sha256Hex(callerKeyValue);
  const payload: AbuseAlertPayload = { ...alert, callerHash };
  const webhook = (env as EnvLike).ABUSE_ALERT_WEBHOOK_URL;
  if (typeof webhook === "string" && webhook.length > 0) {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) {
      console.error(
        "[abuse-alert] webhook returned",
        response.status,
        await response.text().catch(() => ""),
      );
    }
    return;
  }
  console.error("[abuse-alert]", JSON.stringify(payload));
}

/** Test/observability hooks. */
export function getAbuseAlertState(): {
  trackedCallers: number;
  trackedRoutes: number;
  lastAlertCount: number;
} {
  return {
    trackedCallers: blockCounters.size,
    trackedRoutes: surgeCounters.size,
    lastAlertCount: lastAlertAt.size + lastSurgeAt.size,
  };
}

export function resetAbuseAlertState(): void {
  blockCounters.clear();
  surgeCounters.clear();
  lastAlertAt.clear();
  lastSurgeAt.clear();
}
