/**
 * Per-caller sliding-window rate limiter for public endpoints.
 *
 * State lives in the worker isolate's memory, which is the correct scope for a
 * Cloudflare Worker deployment: each isolate only sees its own traffic and the
 * windows are short (default 60 seconds). If a public deployment needs global
 * or long-window limits, replace this module with Cloudflare's rate-limiting
 * product or a Durable Object / KV-backed counter.
 *
 * Every route family gets its own independent limit (see `RouteKind`), so a
 * burst on one endpoint never starves another: read APIs, exports, nearby
 * search, submissions, and moderation are throttled separately.
 */

export type RateLimitDecision =
  | { allowed: true; retryAfterSeconds: 0 }
  | { allowed: false; retryAfterSeconds: number };

export type RateLimitOptions = {
  maxRequests: number;
  windowSeconds: number;
};

/**
 * Route families with independent limits. The environment knobs are named
 * `${PREFIX}_RATE_LIMIT_MAX` / `${PREFIX}_RATE_LIMIT_WINDOW_SECONDS`; the
 * submission prefix stays `POST_*` for backward compatibility with the limits
 * already deployed for POST /api/cameras and POST /api/corrections.
 */
export type RouteKind =
  | "read"
  | "export"
  | "nearby"
  | "revisions"
  | "submit"
  | "moderate"
  | "appeal"
  | "auth"
  | "tiles"
  | "confirm";

const ROUTE_LIMIT_DEFAULTS: Record<RouteKind, RateLimitOptions> = {
  read: { maxRequests: 60, windowSeconds: 60 },
  export: { maxRequests: 10, windowSeconds: 60 },
  nearby: { maxRequests: 30, windowSeconds: 60 },
  revisions: { maxRequests: 30, windowSeconds: 60 },
  submit: { maxRequests: 5, windowSeconds: 60 },
  moderate: { maxRequests: 30, windowSeconds: 60 },
  // Appeals are moderation-adjacent but a distinct caller population
  // (contributors contesting decisions, moderators reviewing them), so the
  // bucket gets its own conservative default and its own env knobs instead
  // of silently inheriting the moderation limits.
  appeal: { maxRequests: 20, windowSeconds: 60 },
  // Auth endpoints (register/login) are credential-guessing surfaces; the
  // deliberate per-caller bucket keeps brute force slow while staying far
  // above the rate of legitimate interactive use.
  auth: { maxRequests: 10, windowSeconds: 60 },
  // Tile proxy: every request that reaches the map edge is metered so a
  // single caller cannot scrape the upstream (the OSMF community tile
  // service) beyond community usage. 60/min is far above what interactive
  // map panning produces per client, and the edge cache absorbs repeats.
  tiles: { maxRequests: 60, windowSeconds: 60 },
  // Community verifications (ADR 0018 §2.6, C1): the toggle PUT/DELETE and
  // the personal GET share one bucket, independent of the read bucket the
  // public record payload uses. The state quota (daily cap) is a D1 COUNT
  // inside the toggle; this bucket only bounds the request rate per caller.
  confirm: { maxRequests: 30, windowSeconds: 60 },
};

const ROUTE_LIMIT_ENV_PREFIX: Record<RouteKind, string> = {
  read: "READ",
  export: "EXPORT",
  nearby: "NEARBY",
  revisions: "REVISIONS",
  submit: "POST",
  moderate: "MODERATION",
  appeal: "APPEAL",
  auth: "AUTH",
  tiles: "TILES",
  confirm: "CONFIRM",
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
  bucket: string,
  key: string,
  options: RateLimitOptions,
  now: number = Date.now(),
): RateLimitDecision {
  const windowStart = now - options.windowSeconds * 1000;
  // The bucket namespaces the counter: the same caller is tracked separately
  // per route family, so a burst on one endpoint never starves another.
  const mapKey = `${bucket}|${key}`;

  // Bound memory: once the map grows beyond a sane size, drop every stale key
  // before evaluating the current one.
  if (attemptsByKey.size > 10_000) {
    for (const candidate of attemptsByKey.keys()) pruneKey(candidate, windowStart);
  }

  const recent = pruneKey(mapKey, windowStart);
  if (recent.length >= options.maxRequests) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((recent[0] + options.windowSeconds * 1000 - now) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  attemptsByKey.set(mapKey, recent);
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
 * Environment knobs for endpoint rate limits.
 *
 * The parameter is `unknown` (cast internally) on purpose: Cloudflare's `Env`
 * interface has no string index signature, so it is not assignable to
 * `Record<string, unknown>`, and this module must stay runnable in plain Node
 * (the boundary tests import its source). Reading an object's properties
 * through a cast is safe here — the values are only ever `Number()`-coerced or
 * string-compared, never trusted as types.
 */
type EnvLike = { [key: string]: unknown };

/** Resolve the effective limits for a route family, honouring env overrides. */
export function limitsFor(kind: RouteKind, env: unknown): RateLimitOptions {
  const config = env as EnvLike;
  const prefix = ROUTE_LIMIT_ENV_PREFIX[kind];
  const maxRequests = Number(config[`${prefix}_RATE_LIMIT_MAX`]);
  const windowSeconds = Number(config[`${prefix}_RATE_LIMIT_WINDOW_SECONDS`]);
  const defaults = ROUTE_LIMIT_DEFAULTS[kind];
  return {
    maxRequests:
      Number.isFinite(maxRequests) && maxRequests > 0
        ? maxRequests
        : defaults.maxRequests,
    windowSeconds:
      Number.isFinite(windowSeconds) && windowSeconds > 0
        ? windowSeconds
        : defaults.windowSeconds,
  };
}

export function submissionLimits(env: unknown): RateLimitOptions {
  return limitsFor("submit", env);
}

export function submissionsDisabled(env: unknown): boolean {
  return (env as EnvLike).POST_SUBMISSIONS_DISABLED === "true";
}

/**
 * Environment knobs for the public search route (GET /api/cameras/search).
 * The default is deliberately modest: every locality query may hit the
 * external geocoder, whose community usage policy is far stricter than our
 * own D1 reads, so the limit protects the geocoder as much as the API.
 */
export function searchLimits(
  env: unknown,
  defaults: RateLimitOptions = { maxRequests: 15, windowSeconds: 60 },
): RateLimitOptions {
  const config = env as EnvLike;
  const maxRequests = Number(config.SEARCH_RATE_LIMIT_MAX);
  const windowSeconds = Number(config.SEARCH_RATE_LIMIT_WINDOW_SECONDS);
  return {
    maxRequests: Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : defaults.maxRequests,
    windowSeconds: Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : defaults.windowSeconds,
  };
}

/**
 * Per-appellant appeal threshold (audit t_2ee58c08, P3 — appeal ownership):
 * bounds how many appeals one contributor account can file within a window,
 * so a single identity cannot flood the senior-moderator queue with appeals
 * on decisions it has no standing to contest (DATA_TRUST.md "Corrections,
 * removals, and appeals").
 *
 * This is a *state* quota (a D1 COUNT over `moderation_appeals`), distinct
 * from the per-IP HTTP bucket on POST /api/appeals: the IP bucket stops a
 * burst from one caller, this caps sustained filing by one identity even
 * when the caller's IP changes. The check runs inside `fileAppeal`, so no
 * route can bypass it.
 *
 *   - APPEAL_APPELLANT_RATE_LIMIT_MAX (default 5): max filed appeals per
 *     appellant inside the window. Failed attempts (unknown/non-final
 *     decisions, duplicates) do not count — only appeals that actually land
 *     on the moderation queue.
 *   - APPEAL_APPELLANT_RATE_LIMIT_WINDOW_SECONDS (default 86400 = 24h).
 */
export function appealAppellantLimits(
  env: unknown,
  defaults: RateLimitOptions = { maxRequests: 5, windowSeconds: 86400 },
): RateLimitOptions {
  const config = env as EnvLike;
  const maxRequests = Number(config.APPEAL_APPELLANT_RATE_LIMIT_MAX);
  const windowSeconds = Number(config.APPEAL_APPELLANT_RATE_LIMIT_WINDOW_SECONDS);
  return {
    maxRequests: Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : defaults.maxRequests,
    windowSeconds: Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : defaults.windowSeconds,
  };
}

/** Test/observability hook: clear all in-memory counters between runs. */
export function resetRateLimitState(): void {
  attemptsByKey.clear();
}
