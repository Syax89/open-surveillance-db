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
    PHOTOS: R2Bucket;
  }
  export const env: Env;
}
