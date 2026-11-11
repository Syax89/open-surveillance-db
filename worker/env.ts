/** Worker bindings and Cloudflare runtime surfaces (split from worker/index.ts). */
import type { AnalyticsEngineDataset, D1Database, Fetcher, SendEmail } from "cloudflare:workers";


/** Structural surface of a Cloudflare rate-limiter binding (`ratelimits`). */
export interface RateLimiterBinding {
  limit(args: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  /**
   * Request analytics (wrangler.jsonc `analytics`, dataset osdb_requests):
   * one datapoint per request — path group (api|web), status class, API
   * endpoint path and HTTP method (see recordRequestAnalytics). Optional:
   * absent in local dev / tests, where logging is a no-op.
   */
  ANALYTICS?: AnalyticsEngineDataset;
  /**
   * Cloudflare Workers Rate Limiting bindings (wrangler.jsonc `ratelimits`,
   * audit #3 MEDIUM, t_dff3dadf): the production enforcement point for the
   * five critical public route families (auth, write, read, tiles, geocode). Optional:
   * when a binding is absent the route layer falls back to the in-memory
   * per-isolate limiter (local dev / tests — never the public API). The
   * routes read them structurally from env; this interface documents the
   * shape for the worker entry itself.
   */
  AUTH_LIMITER?: RateLimiterBinding;
  WRITE_LIMITER?: RateLimiterBinding;
  READ_LIMITER?: RateLimiterBinding;
  TILES_LIMITER?: RateLimiterBinding;
  GEOCODE_LIMITER?: RateLimiterBinding;
  /** Cloudflare Email Service binding (send_email in wrangler.jsonc). */
  EMAIL?: SendEmail;
  /**
   * Transactional mail (AUTH MULTI-METODO Fase A2, ADR 0020): the public
   * base URL used to build verification / password-reset action links
   * (e.g. https://opensurveillancedb.org). REQUIRED for the mailer to send:
   * without it sendAuthEmail answers missing_config and no email goes out —
   * there is NO fallback to the request origin (the Host header is
   * attacker-controllable and was the P1-1 token-harvesting vector). Routes
   * stay best-effort: register answers 201 with verification.sent=false,
   * resend answers 503, reset-request stays `{sent:true}` (anti-enumeration).
   * Set it in production and in .dev.vars.
   */
  VERIFY_BASE_URL?: string;
  /** Sender address override for the EMAIL binding (default noreply@opensurveillancedb.org). */
  MAILER_FROM?: string;
  /** Recipient override for urgent /correggi report notifications (issue #438; default privacy@opensurveillancedb.org). */
  URGENT_REPORT_TO?: string;
  /**
   * Re-send rate limit for auth emails (issue #440, ADR 0020 decision 2):
   * max sends per contributor per rolling window, enforced ATOMICALLY in D1
   * via email_send_log reservations. Default 1 per 5 minutes
   * (EMAIL_SEND_LIMIT_MAX=1, EMAIL_SEND_LIMIT_WINDOW_SECONDS=300); these
   * two overrides tune the same per-contributor window (e.g. staging or a
   * temporarily raised ceiling) and apply to verification, resend and
   * password-reset sends alike.
   */
  EMAIL_SEND_LIMIT_MAX?: string;
  EMAIL_SEND_LIMIT_WINDOW_SECONDS?: string;
  /** Moderation access control. At least one credential must be configured. */
  MODERATION_USER?: string;
  MODERATION_PASSWORD?: string;
  MODERATION_TOKEN?: string;
  /**
   * Edge-set identity (ADR 0014): after the moderation gate succeeds, the
   * worker injects this `users.email` as `x-osdb-user-email`. The local
   * prototype sets it to the demo admin account (admin@osdb.test); a real
   * deployment maps each gate credential to its own account. Fail-closed:
   * when unset, gated requests pass through with NO identity, so the route
   * layer rejects them (401).
   */
  MODERATION_IDENTITY_EMAIL?: string;
  /**
   * Per-operator moderation credentials (QA#3 F5, t_63e0d13c): a JSON array
   * of `{ user, password, email }` objects. When set, Basic auth validates
   * ONLY against this list and each operator's actions are attributed to
   * their own `email` (the shared MODERATION_USER/PASSWORD pair is ignored
   * in this configuration). Malformed JSON fails closed (503). Secrets live
   * in worker secrets / .dev.vars, never in wrangler.jsonc.
   */
  MODERATION_OPERATORS?: string;
  /**
   * Demo actor selector key (QA#3 F5): the moderation route honours a
   * client-supplied `actorId` ONLY when BOTH this is "true" AND
   * `ENVIRONMENT === "development"` — two keys so a production deploy with
   * ENVIRONMENT accidentally left at development still cannot let an admin
   * forge the audit trail. Unset/absent = the selector is OFF everywhere.
   */
  MODERATION_DEMO_ACTOR_SELECTOR?: string;
  /**
   * Pass through the ChatGPT-platform identity headers (`oai-*`) instead of
   * stripping them. Only set in a real ChatGPT-plugin deployment, where the
   * platform gateway (not arbitrary clients) sits in front of this worker.
   * Default (unset/false): strip — the prototype and direct-Internet deploys
   * must never trust a client-chosen identity (ADR 0014).
   */
  TRUST_PLATFORM_HEADERS?: string;
  /** Contributor auth (ADR 0013): session lifetime and cookie policy. */
  AUTH_SESSION_TTL_DAYS?: string;
  AUTH_COOKIE_SECURE?: string;
  AUTH_RATE_LIMIT_MAX?: string;
  AUTH_RATE_LIMIT_WINDOW_SECONDS?: string;
  /**
   * Edge-cache purge (follow-up F0, t_ae600b90): when set, the moderation
   * write path purges the affected cache tags through the Cloudflare Cache
   * Purge API so a privacy takedown stops being served immediately. Both
   * values are required; absent credentials make the purge a documented
   * no-op (the bounded s-maxage/stale-while-revalidate window still
   * converges). See app/lib/cache-purge.ts and PRIVACY_AND_SAFETY.md.
   */
  CACHE_PURGE_TOKEN?: string;
  CACHE_PURGE_ZONE_ID?: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/** Cloudflare ScheduledController surface used by the cron handler. */
export interface ScheduledController {
  readonly cron: string;
  readonly scheduledTime: Date;
}
