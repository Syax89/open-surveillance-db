/**
 * Per-caller sliding-window rate limiter for public write endpoints.
 *
 * State lives in the worker isolate's memory, which is the correct scope for a
 * Cloudflare Worker deployment: each isolate only sees its own traffic and the
 * windows are short (default 60 seconds). If a public deployment needs global
 * or long-window limits, replace this module with Cloudflare's rate-limiting
 * product or a Durable Object / KV-backed counter.
 */

export type RateLimitDecision =
  | { allowed: true; retryAfterSeconds: 0 }
  | { allowed: false; retryAfterSeconds: number };

export type RateLimitOptions = {
  maxRequests: number;
  windowSeconds: number;
};

const attemptsByKey = new Map<string, number[]>();

function pruneKey(key: string, windowStart: number): number[] {
  const timestamps = (attemptsByKey.get(key) ?? []).filter(
    (timestamp) => timestamp >= windowStart,
  );
  if (timestamps.length === 0) attemptsByKey.delete(key);
  else attemptsByKey.set(key, timestamps);
  return timestamps;
}

export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
  now: number = Date.now(),
): RateLimitDecision {
  const windowStart = now - options.windowSeconds * 1000;

  // Bound memory: once the map grows beyond a sane size, drop every stale key
  // before evaluating the current one.
  if (attemptsByKey.size > 10_000) {
    for (const candidate of attemptsByKey.keys()) pruneKey(candidate, windowStart);
  }

  const recent = pruneKey(key, windowStart);
  if (recent.length >= options.maxRequests) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((recent[0] + options.windowSeconds * 1000 - now) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  attemptsByKey.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Best-effort caller identity: the edge-provided IP, then the first forwarded hop. */
export function callerKey(request: Request): string {
  const direct = request.headers.get("cf-connecting-ip");
  if (direct) return direct;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstHop = forwarded.split(",")[0]?.trim();
    if (firstHop) return firstHop;
  }
  return "unknown";
}

/**
 * Environment knobs for submission endpoints (POST /api/cameras, POST /api/corrections).
 *
 * The parameter is `unknown` (cast internally) on purpose: Cloudflare's `Env`
 * interface has no string index signature, so it is not assignable to
 * `Record<string, unknown>`, and this module must stay runnable in plain Node
 * (the boundary tests import its source). Reading an object's properties
 * through a cast is safe here — the values are only ever `Number()`-coerced or
 * string-compared, never trusted as types.
 */
type EnvLike = { [key: string]: unknown };

export function submissionLimits(
  env: unknown,
  defaults: RateLimitOptions = { maxRequests: 5, windowSeconds: 60 },
): RateLimitOptions {
  const config = env as EnvLike;
  const maxRequests = Number(config.POST_RATE_LIMIT_MAX);
  const windowSeconds = Number(config.POST_RATE_LIMIT_WINDOW_SECONDS);
  return {
    maxRequests: Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : defaults.maxRequests,
    windowSeconds: Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : defaults.windowSeconds,
  };
}

export function submissionsDisabled(env: unknown): boolean {
  return (env as EnvLike).POST_SUBMISSIONS_DISABLED === "true";
}
