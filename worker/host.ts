/** Canonical-host redirect and known hostnames (split from worker/index.ts). */

const CANONICAL_HOST = "opensurveillancedb.org";
const WWW_HOST = "www.opensurveillancedb.org";
export const PREPRODUCTION_HOST = "osdb.syaxhome89.com";

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
