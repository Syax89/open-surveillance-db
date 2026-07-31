// Tipi runtime di Cloudflare Workers (vincolati da vinext / wrangler).
// Dichiarazione manuale del modulo virtuale "cloudflare:workers",
// equivalente a quanto genererebbe `wrangler types` per i binding usati.
// I tipi sono strutturali e basati su lib.dom: vinext espone i propri tipi
// con Request/Response DOM standard, quindi non usiamo @cloudflare/workers-types.

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
  }

  export const env: Env;
}
