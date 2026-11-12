/** Request analytics, Workers Analytics Engine (split from worker/index.ts). */
import type { Env } from "./env";

/**
 * Request analytics (Workers Analytics Engine, dataset osdb_requests).
 * One datapoint per request, written AFTER the response is produced:
 *   blob1 = path group ("api" | "web")
 *   blob2 = status class ("2xx" | "3xx" | "4xx" | "5xx")
 *   blob3 = API route pattern, query string stripped ("web" for the site;
 *           dynamic segments normalize to the app/api pattern, e.g.
 *           /api/cameras/[id]/edit or /api/tiles/[z]/[x]/[y]; unknown API
 *           paths are "other" — see normalizeApiPath)
 *   blob4 = HTTP method
 *   blob5 = exact HTTP status (low-cardinality, e.g. "200" or "429")
 *   double1 = 1 (event count; the monitor uses SUM(_sample_interval))
 * Deliberately narrow: no IPs, no query strings, no user data, and the
 * website is counted only as "web" without per-page breakdown (privacy —
 * see PRIVACY_AND_SAFETY.md). The binding is optional (absent in local
 * dev / tests): when missing the call is a no-op and can never break the
 * request path.
 */
/**
 * Every API route, written as its app/api directory path (dynamic segments
 * in brackets). tests/worker-edge.test.mjs walks app/api and fails when a
 * route.ts is missing here, so the list cannot silently drift.
 *
 * blob3 records ONLY one of these patterns (or "other"): dynamic segments
 * (record ids, appeal ids, API-key ids, OIDC providers, tile coordinates)
 * are never written raw, and unknown paths — scanners, typos, anything
 * user-chosen — collapse to "other" so the dataset stays low-cardinality
 * and free of identifiers (security audit 2026-11).
 */
export const API_ROUTE_PATTERNS = [
  "/api/appeals",
  "/api/appeals/[id]",
  "/api/auth/account",
  "/api/auth/keys",
  "/api/auth/keys/[id]",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/me/contributions",
  "/api/auth/me/submissions",
  "/api/auth/oidc/[provider]/callback",
  "/api/auth/oidc/[provider]/start",
  "/api/auth/oidc/merge",
  "/api/auth/oidc/providers",
  "/api/auth/passkey/credentials",
  "/api/auth/passkey/login/begin",
  "/api/auth/passkey/login/complete",
  "/api/auth/passkey/register/begin",
  "/api/auth/passkey/register/complete",
  "/api/auth/recovery",
  "/api/auth/register",
  "/api/auth/reset-password/confirm",
  "/api/auth/reset-password/request",
  "/api/auth/verify-email",
  "/api/auth/verify-email/resend",
  "/api/cameras",
  "/api/cameras/[id]",
  "/api/cameras/[id]/actions",
  "/api/cameras/[id]/confirmation",
  "/api/cameras/[id]/edit",
  "/api/cameras/[id]/events",
  "/api/cameras/nearby",
  "/api/cameras/revisions",
  "/api/cameras/search",
  "/api/cameras/suggest",
  "/api/corrections",
  "/api/geocode",
  "/api/geocode/reverse",
  "/api/import-sources",
  "/api/locale",
  "/api/moderation",
  "/api/moderation/corrections",
  "/api/tiles/[z]/[x]/[y]",
] as const;

const isDynamic = (segment: string) => segment.startsWith("[");
const routeSegments = (path: string) => path.split("/").slice(1);

const STATIC_API_ROUTES = new Set<string>(API_ROUTE_PATTERNS.filter((pattern) => !pattern.includes("[")));
const DYNAMIC_API_ROUTES = API_ROUTE_PATTERNS.filter((pattern) => pattern.includes("[")).map((pattern) => ({
  pattern,
  segments: routeSegments(pattern),
}));

// Every static path prefix ("api/cameras/nearby", "api/auth/oidc/merge",
// ...). A dynamic segment never matches a static sibling, so
// /api/cameras/nearby/edit is "other", not /api/cameras/[id]/edit.
const STATIC_PREFIXES = new Set<string>(
  API_ROUTE_PATTERNS.flatMap((pattern) => {
    const segments = routeSegments(pattern);
    return segments.flatMap((segment, index) => (isDynamic(segment) ? [] : [segments.slice(0, index + 1).join("/")]));
  }),
);

/** Map a request path to its route pattern, or "other" for unknown paths. */
export function normalizeApiPath(pathname: string): string {
  // One optional trailing slash is the same route.
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (STATIC_API_ROUTES.has(path)) return path;
  const segments = routeSegments(path);
  for (const route of DYNAMIC_API_ROUTES) {
    if (route.segments.length !== segments.length) continue;
    const matches = route.segments.every((expected, index) => {
      const actual = segments[index];
      if (!isDynamic(expected)) return expected === actual;
      return actual.length > 0 && !STATIC_PREFIXES.has(segments.slice(0, index + 1).join("/"));
    });
    if (matches) return route.pattern;
  }
  return "other";
}

function analyticsEndpoint(pathname: string, isApi: boolean): string {
  if (!isApi) return "web";
  // Tile coordinates, record ids and other dynamic segments are grouped by
  // route pattern so Analytics/Grafana count one series per endpoint.
  return normalizeApiPath(pathname);
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
