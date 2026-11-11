/** Request analytics, Workers Analytics Engine (split from worker/index.ts). */
import type { Env } from "./env";

/**
 * Request analytics (Workers Analytics Engine, dataset osdb_requests).
 * One datapoint per request, written AFTER the response is produced:
 *   blob1 = path group ("api" | "web")
 *   blob2 = status class ("2xx" | "3xx" | "4xx" | "5xx")
 *   blob3 = API endpoint path, query string stripped ("web" for the site;
 *           tile coordinates normalize to /api/tiles/[z]/[x]/[y])
 *   blob4 = HTTP method
 *   blob5 = exact HTTP status (low-cardinality, e.g. "200" or "429")
 *   double1 = 1 (event count; the monitor uses SUM(_sample_interval))
 * Deliberately narrow: no IPs, no query strings, no user data, and the
 * website is counted only as "web" without per-page breakdown (privacy —
 * see PRIVACY_AND_SAFETY.md). The binding is optional (absent in local
 * dev / tests): when missing the call is a no-op and can never break the
 * request path.
 */
function analyticsEndpoint(pathname: string, isApi: boolean): string {
  if (!isApi) return "web";
  // Tile coordinates are high-cardinality and never contain user data. Group
  // their numeric route shape so Analytics/Grafana can count cache misses and
  // exact 429s as one endpoint instead of one series per tile.
  if (/^\/api\/tiles\/\d+\/\d+\/\d+(?:\.png)?$/.test(pathname)) return "/api/tiles/[z]/[x]/[y]";
  return pathname;
}

export function recordRequestAnalytics(env: Env, url: URL, method: string, status: number): void {
  try {
    const analytics = env.ANALYTICS;
    if (!analytics) return;
    const pathname = url.pathname;
    const isApi = pathname.startsWith("/api/");
    analytics.writeDataPoint({
      blobs: [isApi ? "api" : "web", `${Math.floor(status / 100)}xx`, analyticsEndpoint(pathname, isApi), method, String(status)],
      doubles: [1],
    });
  } catch {
    // Analytics must never break the request path.
  }
}
