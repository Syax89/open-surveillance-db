/**
 * Short-lived cache for the public `SELECT COUNT(*)` full scans (~270k rows
 * each). Each list/bbox URL has its own response cache entry, but they share a
 * handful of distinct counts, so the same scan ran hundreds of times a week.
 * Staleness is bounded by COUNT_TTL_SECONDS (below the 15 min list cache);
 * fail-open: no Cache API (tests/node) or any cache error runs the query.
 */
const COUNT_TTL_SECONDS = 300;
const ISO_NOW = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;

async function countKey(sql: string, parameters: (string | number)[]): Promise<Request> {
  // Timestamps (now, freshness cutoffs) change every call: key them by hour.
  const stable = parameters.map((p) => (typeof p === "string" && ISO_NOW.test(p) ? p.slice(0, 13) : p));
  const bytes = new TextEncoder().encode(JSON.stringify([sql, stable]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request(`https://count-cache.osdb.invalid/${hex}`);
}

export async function cachedCount(
  sql: string,
  parameters: (string | number)[],
  run: () => Promise<number>,
): Promise<number> {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (!cache) return run();
  let key: Request;
  try {
    key = await countKey(sql, parameters);
    const hit = await cache.match(key);
    if (hit) {
      const { total } = (await hit.json()) as { total: unknown };
      if (typeof total === "number" && Number.isFinite(total)) return total;
    }
  } catch (error) {
    console.error("count-cache read failed (fail-open)", error);
    return run();
  }
  const total = await run();
  try {
    await cache.put(
      key,
      new Response(JSON.stringify({ total }), {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${COUNT_TTL_SECONDS}` },
      }),
    );
  } catch (error) {
    console.error("count-cache write failed (fail-open)", error);
  }
  return total;
}
