import type { MetadataRoute } from "next";

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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/moderation",
          "/account",
          "/records/*/edit",
          "/register",
          "/login",
        ],
      },
    ],
    sitemap: siteUrl ? `${siteUrl}/sitemap.xml` : undefined,
  };
}
