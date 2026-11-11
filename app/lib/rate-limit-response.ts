/**
 * Shared "rate limit → 429 response" block for the route handlers.
 *
 * Every rate-limited route used to hand-copy the same sequence:
 * callerKey/callerKeyFor → limits → checkRateLimit → console.warn →
 * recordRateLimitBlock → 429 with Retry-After. This helper is that sequence,
 * parametrised by everything the copies differed in (bucket, abuse-alert
 * route label, limits, log line, body text and format, extra headers,
 * whether the block is reported to the abuse-alert layer), so each route
 * keeps its exact status, body, headers and log line.
 *
 * Kept free of `cloudflare:workers` (env is passed in) so the route test
 * harness can transpile and import it in plain Node, like rate-limit.ts.
 * It lives beside rate-limit.ts rather than inside it because rate-limit.ts
 * deliberately has zero imports, while this helper reports to abuse-alerts.
 */

import { recordRateLimitBlock } from "./abuse-alerts";
import {
  callerKey,
  checkRateLimit,
  checkRateLimitForKeyAuth,
  type CallerKeyGate,
  type RateLimitOptions,
  type RouteKind,
} from "./rate-limit";

export const DEFAULT_RATE_LIMIT_ERROR = "Too many requests. Please try again shortly.";

export type RateLimitResponseOptions = {
  /** Limiter bucket (route family). `search` has its own limits helper. */
  bucket: RouteKind | "search";
  /** Route label reported to the abuse-alert layer (e.g. "/api/cameras"). */
  route: string;
  /** Worker env: limiter bindings, TRUST_XFF for the caller key, alerts. */
  env: unknown;
  /** Effective limits (limitsFor / submissionLimits / geocodeLimits / ...). */
  limits: RateLimitOptions;
  /**
   * The `console.warn` line on a block. A function receives the effective
   * caller key, for routes whose log line names the caller.
   */
  log: string | ((key: string) => string);
  /**
   * Additive per-key mode (EPIC api-keys, D8/T12): run AFTER the write gate.
   * An API-key caller is checked against its own `key:<id>` bucket; session
   * and anonymous callers pass (their per-IP check already ran pre-gate).
   * Omitted: the per-IP check keyed on `callerKey(request, env)`.
   */
  apiKey?: { gate: CallerKeyGate };
  /** Body error text (default DEFAULT_RATE_LIMIT_ERROR). */
  error?: string;
  /** Answer a plain-text body (the `error` text) instead of `{ error }` JSON. */
  plainText?: boolean;
  /** Extra response headers; Retry-After is always set from the decision. */
  headers?: Record<string, string>;
  /** Report the block to the abuse-alert layer (default true). */
  recordBlock?: boolean;
};

/**
 * Check the caller against `options.bucket`; return the 429 response when it
 * is blocked, or `null` when the request may proceed.
 */
export async function rateLimitResponse(
  request: Request,
  options: RateLimitResponseOptions,
): Promise<Response | null> {
  const { bucket, env, limits } = options;
  let key: string;
  let retryAfterSeconds: number;
  if (options.apiKey) {
    const decision = await checkRateLimitForKeyAuth(env, bucket, request, limits, options.apiKey.gate);
    if (decision.allowed) return null;
    key = decision.key;
    retryAfterSeconds = decision.retryAfterSeconds;
  } else {
    // env is mandatory: it carries TRUST_XFF, without which every caller
    // lacking cf-connecting-ip would share a single "unknown" bucket.
    key = callerKey(request, env);
    const decision = await checkRateLimit(env, bucket, key, limits);
    if (decision.allowed) return null;
    retryAfterSeconds = decision.retryAfterSeconds;
  }

  console.warn(typeof options.log === "function" ? options.log(key) : options.log);
  if (options.recordBlock !== false) {
    recordRateLimitBlock(env, {
      route: options.route,
      key,
      windowSeconds: limits.windowSeconds,
    });
  }
  const error = options.error ?? DEFAULT_RATE_LIMIT_ERROR;
  const init: ResponseInit = {
    status: 429,
    headers: { ...options.headers, "Retry-After": String(retryAfterSeconds) },
  };
  return options.plainText ? new Response(error, init) : Response.json({ error }, init);
}
