/**
 * Import sources — client-side resolution of the batch provenance
 * (import pipeline FASE C, t_4dbce318).
 *
 * The record list/detail APIs expose `source` as the raw value
 * ('import:<slug>' for imported rows); this module turns that slug into
 * the READABLE attribution (entity name, licence, links) by fetching the
 * committed batches from `GET /api/import-sources` — the SAME data the
 * /fonti page renders server-side (db/import-sources.ts). The map popup
 * and the record page share this mapping; nothing reconstructs
 * attribution text client-side.
 *
 * The fetch result is cached at module level (the batch list changes only
 * when an import lands — far rarer than any map session); the cache is
 * reset by the DOM-test hook `__resetImportSourcesCache`.
 */

export type ImportSourceInfo = {
  slug: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
};

let sourcesCache: Map<string, ImportSourceInfo> | null = null;
let sourcesPromise: Promise<Map<string, ImportSourceInfo>> | null = null;

/** DOM-test hook: drop the module-level cache between tests. */
export function __resetImportSourcesCache() {
  sourcesCache = null;
  sourcesPromise = null;
}

/**
 * Fetch (once) the committed import batches as a slug → info map.
 * Failures return an empty map — the UI falls back to the raw source
 * value, never crashes.
 */
export async function fetchImportSources(): Promise<Map<string, ImportSourceInfo>> {
  if (sourcesCache) return sourcesCache;
  if (!sourcesPromise) {
    sourcesPromise = fetch("/api/import-sources")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("import-sources unavailable"))))
      .then((data: { sources?: ImportSourceInfo[] }) => {
        const map = new Map<string, ImportSourceInfo>();
        for (const source of data.sources ?? []) map.set(source.slug, source);
        sourcesCache = map;
        return map;
      })
      .catch((error) => {
        sourcesPromise = null;
        throw error;
      });
  }
  return sourcesPromise;
}

/**
 * Resolve an imported record's batch from its raw `source` value
 * ('import:<slug>'), or null for community reports / demo seed.
 */
export function importSourceOf(
  camera: { source?: string },
  sources: Map<string, ImportSourceInfo>,
): ImportSourceInfo | null {
  const raw = camera.source ?? "";
  if (!raw.startsWith("import:")) return null;
  return sources.get(raw.slice("import:".length)) ?? null;
}
