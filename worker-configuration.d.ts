// Tipi runtime di Cloudflare Workers (vincolati da vinext / wrangler).
// Dichiarazione manuale del modulo virtuale "cloudflare:workers",
// equivalente a quanto genererebbe `wrangler types` per i binding usati.
// I tipi sono strutturali e basati su lib.dom: vinext espone i propri tipi
// con Request/Response DOM standard, quindi non usiamo @cloudflare/workers-types.

// Cloudflare Workers espone la namespace di cache default come `caches.default`,
// proprietà che lib.dom non modella su CacheStorage: la aggiungiamo per
// declaration merging (questo file è uno script, quindi l'interfaccia è globale).
interface CacheStorage {
  default: Cache;
}

declare module "cloudflare:workers" {
  export interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    run(): Promise<unknown>;
    all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    first<T = unknown>(): Promise<T | null>;
  }

  export interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
  }

  export interface Fetcher {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  }

  export interface R2Object {
    arrayBuffer(): Promise<ArrayBuffer>;
    httpMetadata?: { contentType?: string };
  }

  export interface R2Bucket {
    put(key: string, value: ArrayBuffer | Uint8Array | string | ReadableStream, options?: {
      httpMetadata?: { contentType?: string };
    }): Promise<unknown>;
    get(key: string): Promise<R2Object | null>;
    delete(key: string): Promise<void>;
  }

  /**
   * Cloudflare Email Service structured builder (send_email binding).
   * See https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
   * The `send()` method is the only surface the mailer uses; errors carry a
   * `.code` property (E_SENDER_NOT_VERIFIED, E_RATE_LIMIT_EXCEEDED, ...).
   */
  export interface EmailAddress {
    email: string;
    name?: string;
  }

  export interface EmailMessageBuilder {
    to: string | EmailAddress | (string | EmailAddress)[];
    from: string | EmailAddress;
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string | EmailAddress;
  }

  export interface SendEmail {
    send(message: EmailMessageBuilder): Promise<{ messageId: string }>;
  }

  /**
   * Cloudflare Workers Rate Limiting binding (wrangler.jsonc `ratelimits`,
   * audit #3 MEDIUM, t_dff3dadf). The `limit()` call takes only a `key`
   * (any string, namespaced per route family) and returns `{ success }`; the
   * call itself counts toward the binding's `simple.limit` within
   * `simple.period`. Enforced by Cloudflare edge infrastructure shared
   * across worker isolates — a caller cannot spread a burst across isolates
   * to bypass it (the per-isolate in-memory bucket it replaces).
   */
  export interface RateLimit {
    limit(args: { key: string }): Promise<{ success: boolean }>;
  }

  export interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    /**
     * Deployment environment flag (fail-closed). Only the exact value
     * "development" opens the dev-only behaviours: demo records on public
     * surfaces (ADR 0008 demo gate, t_d7a4b99b) and the moderation demo
     * actor selector (admin may pick a client-supplied actorId, t_6b61fc3f).
     * Unset or any other value = production: demo records never cross a
     * public surface and the moderation route ALWAYS derives the acting
     * reviewer server-side, so the append-only audit trail cannot be forged
     * by impersonation. Set it locally via `.dev.vars` (gitignored) — never
     * in wrangler.jsonc, which is shared with the production deploy.
     */
    ENVIRONMENT?: string;
    /** Email Service binding (wrangler.jsonc `send_email`, name EMAIL). */
    EMAIL?: SendEmail;
    /** Rate-limiter bindings for the five critical public route families
     * (auth, write, read, tiles, geocode). Optional: when absent the route layer
     * falls back to the in-memory per-isolate limiter (local dev / tests —
     * never the public API). See app/lib/rate-limit.ts. */
    AUTH_LIMITER?: RateLimit;
    WRITE_LIMITER?: RateLimit;
    READ_LIMITER?: RateLimit;
    TILES_LIMITER?: RateLimit;
    GEOCODE_LIMITER?: RateLimit;
    IMAGES: {
      input(stream: ReadableStream): {
        transform(options: Record<string, unknown>): {
          output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
        };
      };
    };
    /** Tile proxy upstream (see docs/OSM_INTEGRATION.md). Optional: defaults
     * to the canonical community server https://tile.openstreetmap.org. */
    TILE_PROVIDER_URL?: string;
    /** Optional API key appended as `?key=` for providers that require one
     * (e.g. MapTiler, Stadia Maps). Leave unset for the community server. */
    TILE_PROVIDER_KEY?: string;
    /** Upstream fetch timeout in ms (default 5000). A slow or hung provider
     * answers 502 instead of pinning the request until the platform timeout. */
    TILE_UPSTREAM_TIMEOUT_MS?: string;
    /** Max accepted upstream tile body in bytes (default 2 MiB). Bodies over
     * the cap answer 502 and are never cached. */
    TILE_MAX_BYTES?: string;
    /** Geocode upstream base URL (shared by db/geocode.ts and the /api/geocode
     * proxy, see docs/OSM_INTEGRATION.md §8). Optional: defaults to the
     * community Nominatim server https://nominatim.openstreetmap.org. */
    GEOCODER_BASE_URL?: string;
    /** Per-caller geocode autocomplete rate limit (default 30/60s). */
    GEOCODE_RATE_LIMIT_MAX?: string;
    GEOCODE_RATE_LIMIT_WINDOW_SECONDS?: string;
    /** Upstream fetch timeout in ms for the geocode proxy (default 5000). */
    GEOCODE_UPSTREAM_TIMEOUT_MS?: string;
    /** Max accepted upstream geocode body in bytes (default 512 KiB). */
    GEOCODE_MAX_BYTES?: string;
    // Multi-method auth — Fase A2 (mailer, ADR 0020): the canonical mailer
    // db/mailer.ts sends through the Cloudflare `send_email` binding (EMAIL)
    // and fails closed. VERIFY_BASE_URL is REQUIRED to build action links —
    // without it sendAuthEmail answers missing_config and no email is sent
    // (no fallback to the request origin; the Host header is never trusted).
    // MAILER_FROM overrides the sender (default noreply@opensurveillancedb.org,
    // which MUST stay in the binding's allowed_sender_addresses).
    VERIFY_BASE_URL?: string;
    MAILER_FROM?: string;
    // Re-send rate limit for auth emails (issue #440, ADR 0020 decision 2):
    // max sends per contributor inside the rolling window, enforced
    // ATOMICALLY in D1 via email_send_log reservations (INSERT ... SELECT
    // ... WHERE count < limit RETURNING id — no race between concurrent
    // sends). Default 1 per 5 minutes (EMAIL_SEND_LIMIT_MAX=1,
    // EMAIL_SEND_LIMIT_WINDOW_SECONDS=300); the overrides tune the same
    // per-contributor window and apply to verification, resend and
    // password-reset sends alike.
    EMAIL_SEND_LIMIT_MAX?: string;
    EMAIL_SEND_LIMIT_WINDOW_SECONDS?: string;
    // Moderation gate credentials (ADR 0002): HTTP Basic (USER/PASSWORD)
    // and/or bearer token; at least one must be configured (fail-closed).
    MODERATION_USER?: string;
    MODERATION_PASSWORD?: string;
    MODERATION_TOKEN?: string;
    // Per-operator moderation credentials (QA#3 F5): a JSON array of
    // `{ user, password, email }` objects. When set, Basic auth validates
    // ONLY against this list and each operator's actions are attributed to
    // their own `email` (the shared MODERATION_USER/PASSWORD pair is ignored
    // in this configuration). Malformed JSON fails closed (503).
    MODERATION_OPERATORS?: string;
    // Demo actor selector key (QA#3 F5): the moderation route honours a
    // client-supplied `actorId` ONLY when BOTH this is "true" AND
    // `ENVIRONMENT === "development"` — two keys so a production deploy with
    // ENVIRONMENT accidentally left at development still cannot forge the
    // audit trail. Unset/absent = the selector is OFF everywhere.
    MODERATION_DEMO_ACTOR_SELECTOR?: string;
    // Edge-set identity injected after a successful moderation gate (ADR
    // 0014): sent as `x-osdb-user-email`; fail-closed when unset (401).
    MODERATION_IDENTITY_EMAIL?: string;
    // Pass through the ChatGPT-platform identity headers (`oai-*`) instead
    // of stripping them (ADR 0014). Only set behind the platform gateway.
    TRUST_PLATFORM_HEADERS?: string;
    // Contributor auth (ADR 0013): session lifetime and cookie policy.
    AUTH_SESSION_TTL_DAYS?: string;
    AUTH_COOKIE_SECURE?: string;
    // Contributor auth rate limits (per-IP, enforced in-app).
    AUTH_RATE_LIMIT_MAX?: string;
    AUTH_RATE_LIMIT_WINDOW_SECONDS?: string;
    // Edge-cache purge (t_ae600b90): Cloudflare Cache Purge API credentials
    // used by the moderation write path; absent = documented no-op.
    CACHE_PURGE_TOKEN?: string;
    CACHE_PURGE_ZONE_ID?: string;
    /** Per-IP registration cap — P3-4 (t_0941036b, anti account-farm): max
     * registration attempts per caller IP inside a rolling window, enforced
     * as a D1 state quota (`registrations_ip_log`). Defaults 5 / 86400s. */
    REGISTER_IP_RATE_LIMIT_MAX?: string;
    REGISTER_IP_RATE_LIMIT_WINDOW_SECONDS?: string;
    /** Keyed-HMAC secret for the per-IP registration log (QA#3 F4): when set,
     * `registrations_ip_log.ip_hash` is HMAC-SHA256(key, callerKey) truncated
     * to 128 bits instead of plain SHA-256, so a database leak cannot be
     * dictionary-attacked offline (the IPv4 space is 2^32). Unset = the
     * truncated-SHA-256 fallback (local prototype / tests); production must
     * set it (deploy checklist). */
    REGISTRATION_IP_HMAC_KEY?: string;
  }
  export const env: Env;
}
