/** Canonical-host redirect and known hostnames (split from worker/index.ts). */

const CANONICAL_HOST = "opensurveillancedb.org";
const WWW_HOST = "www.opensurveillancedb.org";
export const PREPRODUCTION_HOST = "osdb.syaxhome89.com";

/**
 * The Worker's own `*.workers.dev` address. It stays enabled (wrangler.jsonc
 * `workers_dev`) because ops monitoring (`vars.PROD_URL`,
 * .github/workflows/ops-monitoring.yml) probes it from GitHub runners: on the
 * real domain the zone's Bot Fight Mode challenges those runners at random
 * (HTTP 403, cf-mitigated: challenge — deploy of 2026-11-26), which would
 * raise false alerts. It must never compete with the canonical site in
 * search, so every response on it is noindex (security-headers.ts) and its
 * robots.txt disallows everything (workersDevRobots below).
 */
export function isWorkersDevHost(hostname: string): boolean {
  return hostname.toLowerCase().endsWith(".workers.dev");
}

export const DISALLOW_ALL_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

/** robots.txt for the workers.dev host: disallow everything (see above). */
export function workersDevRobots(url: URL): Response | null {
  if (!isWorkersDevHost(url.hostname) || url.pathname !== "/robots.txt") return null;
  return new Response(DISALLOW_ALL_ROBOTS_TXT, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

export function hostRedirect(request: Request, url: URL): Response | null {
  const hostname = url.hostname.toLowerCase();
  if (hostname !== CANONICAL_HOST && hostname !== WWW_HOST) return null;
  if (hostname === WWW_HOST || url.protocol === "http:") {
    const target = new URL(request.url);
    target.protocol = "https:";
    target.hostname = CANONICAL_HOST;
    return Response.redirect(target.toString(), 308);
  }
  return null;
}
