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
    // Multi-method auth — Fase B/A2 (mailer): the Cloudflare `send_email`
    // binding is optional by design. When absent the mailer falls back to a
    // dev log (registration and reset still succeed — see app/lib/mailer.ts).
    // VERIFY_BASE_URL overrides the link base (defaults to the request
    // origin); MAIL_FROM overrides the sender (default no-reply@opensurveillancedb.org).
    SEND_EMAIL?: {
      send(message: EmailMessage): Promise<void>;
    };
    VERIFY_BASE_URL?: string;
    MAIL_FROM?: string;
  }
  export const env: Env;
}

// Cloudflare Email Workers send_email API (used by app/lib/mailer.ts). The
// binding is optional (dev fallback logs instead), so these globals only
// exist at runtime inside a Worker with the binding configured; the mailer
// constructs them lazily, never at module load.
declare class EmailMessage {
  constructor(from: string, to: string, raw: string | ReadableStream);
  setFrom(address: string): void;
  setTo(addresses: string | string[]): void;
  setSubject(subject: string): void;
  setContent(...parts: EmailContent[]): void;
  setHeader(name: string, value: string): void;
}
type EmailContent = TextPart | HtmlPart;
declare class TextPart {
  constructor(text: string);
}
declare class HtmlPart {
  constructor(html: string);
}
