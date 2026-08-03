/**
 * Per-caller sliding-window rate limiter for public endpoints.
 *
 * Two backends, selected per route family at runtime:
 *
 * 1. Cloudflare Workers Rate Limiting binding (`ratelimits` in
 *    wrangler.jsonc) — the PRODUCTION backend for the four critical public
 *    families (auth, submit/write, read, tiles). The binding's counters are
 *    enforced by Cloudflare edge infrastructure shared across worker
 *    isolates, so a caller cannot spread a burst across isolates to bypass
 *    the limit — that per-isolate in-memory bucket was audit finding #3
 *    (MEDIUM, task t_dff3dadf). The binding enforces its own
 *    `simple.limit` / `simple.period` from the configuration: the documented
 *    `limit()` API takes only a `key`, so the `${PREFIX}_RATE_LIMIT_*` env
 *    knobs below are IGNORED for the four bound families in production.
 *    They remain the source of truth for the in-memory fallback and for
 *    every unbound family. Default thresholds are mirrored in the binding
 *    config (pending final sign-off by Ada, audit t_dff3dadf).
 *
 * 2. In-memory sliding window — the LOCAL DEV / TEST fallback, used whenever
 *    the binding is absent from `env` (`npm run dev`, the route test
 *    harness, staging without the binding). Per-isolate by nature: on a
 *    multi-isolate deployment WITHOUT the binding the effective ceiling
 *    scales with the number of isolates, so it is fine for a single-isolate
 *    dev/staging host but must never be the production backend.
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
  | "geocode"
  | "confirm"
  | "edit";

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
  // Geocode autocomplete proxy (GET /api/geocode): every debounced
  // keystroke in the /mappa sidebar may hit the external Nominatim
  // geocoder, whose community usage policy is far stricter than our own
  // reads. The default is deliberately below one request per second on
  // average per caller (the Nominatim hard ceiling), and the proxy's
  // server-side cache absorbs repeat queries, so interactive typing stays
  // comfortably inside the policy while a scraper cannot hammer the
  // upstream through the dropdown.
  geocode: { maxRequests: 30, windowSeconds: 60 },
  // Community verifications (ADR 0018 §2.6, C1): the toggle PUT/DELETE and
  // the personal GET share one bucket, independent of the read bucket the
  // public record payload uses. The state quota (daily cap) is a D1 COUNT
  // inside the toggle; this bucket only bounds the request rate per caller.
  confirm: { maxRequests: 30, windowSeconds: 60 },
  // Community contribution editing (ADR 0018 §4, C3): the two-track PATCH
  // /api/cameras/[id]. Deliberately independent from the confirm bucket so a
  // verification burst never starves legitimate edits; 5/min is far above
  // interactive form use (a record edit is a deliberate, slow action) while
  // still throttling edit-farming attempts.
  edit: { maxRequests: 5, windowSeconds: 60 },
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
  geocode: "GEOCODE",
  confirm: "CONFIRM",
  edit: "EDIT",
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

/**
 * Structural surface of the Cloudflare Workers Rate Limiting binding
 * (wrangler.jsonc `ratelimits`). Kept local on purpose: this module must
 * stay runnable in plain Node (the route test harness transpiles and imports
 * it), so it never imports `cloudflare:workers` — the shape is structural.
 * Per the platform docs the `limit()` call takes only a `key` (any string)
 * and returns `{ success }`; the call itself counts toward the limit.
 */
export interface RateLimitBinding {
  limit(args: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Route families that get a production rate-limiter binding (audit #3,
 * MEDIUM, t_dff3dadf): auth, write (submissions), read and tiles are the
 * public surfaces a determined caller could otherwise spread across
 * isolates. The binding names map to the `ratelimits` entries in
 * wrangler.jsonc; every other family keeps the in-memory fallback (see the
 * module docstring). Keys are namespaced per family (`auth:203.0.113.5`) so
 * counters never collide even if two bindings ever shared a namespace.
 */
const BUCKET_BINDING: Partial<Record<string, string>> = {
  auth: "AUTH_LIMITER",
  submit: "WRITE_LIMITER",
  read: "READ_LIMITER",
  tiles: "TILES_LIMITER",
};

/** Resolve the rate-limiter binding configured for a bucket, if any. */
export function rateLimitBindingFor(
  env: unknown,
  bucket: string,
): RateLimitBinding | undefined {
  const bindingName = BUCKET_BINDING[bucket];
  if (!bindingName) return undefined;
  const candidate = (env as EnvLike)[bindingName] as RateLimitBinding | undefined;
  return candidate && typeof candidate.limit === "function" ? candidate : undefined;
}

/**
 * Check a caller against a rate-limit bucket.
 *
 * Prefers the Cloudflare Rate Limiting binding when the bucket has one and
 * the binding is present in `env` (production); otherwise falls back to the
 * in-memory sliding window (local dev, tests, staging without the binding).
 *
 * `env` is the first parameter on purpose: like `limitsFor`, the module must
 * stay runnable in plain Node, and the binding is read structurally from the
 * env object the route already passes in.
 */
export async function checkRateLimit(
  env: unknown,
  bucket: string,
  key: string,
  options: RateLimitOptions,
  now: number = Date.now(),
): Promise<RateLimitDecision> {
  const binding = rateLimitBindingFor(env, bucket);
  if (binding) {
    const result = await binding.limit({ key: `${bucket}:${key}` });
    if (result.success) return { allowed: true, retryAfterSeconds: 0 };
    // The binding does not expose the counter's reset time; Retry-After is
    // the window upper bound (the platform resets at the end of the period).
    return { allowed: false, retryAfterSeconds: options.windowSeconds };
  }
  return checkRateLimitInMemory(bucket, key, options, now);
}

/**
 * In-memory sliding-window core (local dev / test fallback backend). The
 * original per-isolate implementation: state lives in this module instance
 * and is correct only where one isolate serves all traffic. Exported so the
 * test suites can exercise the window logic directly.
 */
export function checkRateLimitInMemory(
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
 * Environment knobs for the geocode autocomplete proxy (GET /api/geocode).
 * The default is deliberately modest: every debounced keystroke in the
 * /mappa sidebar may hit the external Nominatim geocoder, whose community
 * usage policy is far stricter than our own reads (and caps the rate at
 * ~1 request/second per client). The server-side cache absorbs repeat
 * queries, so 30/min per caller stays far above interactive typing while
 * still throttling any scrape attempt through the dropdown.
 */
export function geocodeLimits(
  env: unknown,
  defaults: RateLimitOptions = { maxRequests: 30, windowSeconds: 60 },
): RateLimitOptions {
  const config = env as EnvLike;
  const maxRequests = Number(config.GEOCODE_RATE_LIMIT_MAX);
  const windowSeconds = Number(config.GEOCODE_RATE_LIMIT_WINDOW_SECONDS);
  return {
    maxRequests: Number.isFinite(maxRequests) && maxRequests > 0 ? maxRequests : defaults.maxRequests,
    windowSeconds: Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : defaults.windowSeconds,
  };
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
