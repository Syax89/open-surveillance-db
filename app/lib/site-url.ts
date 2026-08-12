/**
 * Canonical public origin used by metadata and discovery endpoints.
 *
 * The value is injected at build time for the production Worker. Local and
 * test builds deliberately return null so they do not publish localhost or a
 * staging hostname as a canonical public URL.
 */
export function getConfiguredSiteUrl(): URL | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // The setting is an origin, not a path prefix. Discard accidental path,
    // query and fragment components so every route resolves from the domain
    // root and cannot publish a misleading canonical URL.
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

/** Resolve a public route against the configured canonical origin. */
export function publicUrl(pathname: string): string {
  const siteUrl = getConfiguredSiteUrl();
  return siteUrl ? new URL(pathname, siteUrl).toString() : pathname;
}