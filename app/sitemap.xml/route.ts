import { publicUrl } from "../lib/site-url";

/**
 * /sitemap.xml — sitemap INDEX (replaces the single all-records sitemap,
 * t_sitemap_chunks). Google caps a sitemap at 50k URLs: with ~160k public
 * records one file silently truncated at 50k, so the index fans out to
 * /sitemap/static.xml (the static routes) and /sitemap/N.xml (record
 * chunks of CHUNK_SIZE, keyset-free OFFSET pagination on the id index).
 *
 * Same dynamic-by-design behaviour as the old route: the record count is
 * queried from D1 through the SAME public predicate as every other public
 * read (publicCameraPredicate — status whitelist + freshness carve-out +
 * ADR 0008 demo gate), so a status change or a demo purge shrinks the
 * chunk list on the next crawl. Per-request cost is one indexed COUNT.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // Record chunks intentionally omitted (see robots.ts: /records/ is disallowed).
  const locs = [publicUrl("/sitemap/static.xml")];
  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...locs.map((loc) => `  <sitemap>\n    <loc>${loc}</loc>\n  </sitemap>`),
    `</sitemapindex>`,
  ].join("\n");
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
