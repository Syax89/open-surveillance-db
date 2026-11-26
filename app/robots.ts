import type { MetadataRoute } from "next";
import { publicUrl } from "./lib/site-url";

/**
 * /robots.txt — crawl policy (F7 qa#5, t_ab0d4c75).
 *
 * Rules moved from public/robots.txt into a metadata file so the Sitemap
 * directive can be emitted ONLY when the public domain is configured
 * (NEXT_PUBLIC_SITE_URL, same convention as metadataBase in app/layout.tsx):
 * without a domain there is no absolute URL to point crawlers at, and a
 * hardcoded/placeholder Sitemap line would be worse than none. Once the
 * domain is live, the Sitemap: line appears automatically with the
 * absolute /sitemap.xml URL.
 *
 * Allowlist rationale (audit t_a07443bd): /api/* are backend endpoints,
 * /moderation is the private moderator queue, /account and the record
 * edit routes are authenticated, /register and /login are auth forms —
 * none indexable. Public info pages and /records stay indexable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/moderation",
          "/account",
          // Crawl budget: 273k near-duplicate record pages kept bots busy for
          // days; only the main pages (home, directory, map, info) are crawled.
          "/records/",
          // Same crawl-budget problem one hop later (Workers Observability,
          // 2026-11-18..25): bots that had already harvested the record pages
          // kept following their "view on map" links, /mappa?focus=<id> — one
          // full map render (~45 ms CPU) per record. SemrushBot alone made
          // ~55% of the worker's total CPU time this way. /mappa itself stays
          // crawlable; only its query-string views (?focus=, ?q=, ?type=,
          // ?freshness=, ?sort=) are near-duplicates of it and are excluded.
          "/mappa?",
          "/register",
          "/login",
        ],
      },
    ],
    sitemap: publicUrl("/sitemap.xml") === "/sitemap.xml" ? undefined : publicUrl("/sitemap.xml"),
  };
}
