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

  export interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    /**
     * Deployment environment flag. Only the exact value "development" opens
     * the moderation demo actor selector (admin may pick a client-supplied
     * actorId). Unset or any other value = production: the moderation route
     * ALWAYS derives the acting reviewer server-side, so the append-only
     * audit trail cannot be forged by impersonation (t_6b61fc3f). Set it
     * locally via `.dev.vars` (gitignored) — never in wrangler.jsonc, which
     * is shared with the production deploy.
     */
    ENVIRONMENT?: string;
    /** Email Service binding (wrangler.jsonc `send_email`, name EMAIL). */
    EMAIL?: SendEmail;
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
    PHOTOS: R2Bucket;
    // Multi-method auth — Fase A2 (mailer, ADR 0020): the canonical mailer
    // db/mailer.ts sends through the Cloudflare `send_email` binding (EMAIL)
    // and fails closed. VERIFY_BASE_URL is REQUIRED to build action links —
    // without it sendAuthEmail answers missing_config and no email is sent
    // (no fallback to the request origin; the Host header is never trusted).
    // MAILER_FROM overrides the sender (default noreply@opensurveillancedb.org,
    // which MUST stay in the binding's allowed_sender_addresses).
    VERIFY_BASE_URL?: string;
    MAILER_FROM?: string;
  }
  export const env: Env;
}
