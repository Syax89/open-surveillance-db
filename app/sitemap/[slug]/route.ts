import { env } from "cloudflare:workers";
import { publicCameraPredicate } from "../../../db/cameras";
import { publicUrl } from "../../lib/site-url";

/**
 * /sitemap/static.xml + /sitemap/N.xml — the sitemap files the index at
 * /sitemap.xml fans out to (t_sitemap_chunks). static.xml carries the
 * indexable static routes; N.xml carries public record pages CHUNK_SIZE at
 * a time, queried through the same publicCameraPredicate as every other
 * public read. Both stay under Google's 50k-URL-per-sitemap cap.
 */
export const dynamic = "force-dynamic";

const CHUNK_SIZE = 40000;

// Public, indexable static routes. Submission forms, authentication,
// moderation, account and edit surfaces are intentionally excluded even when
// their paths are reachable to a crawler.
const STATIC_ROUTES = [
  "",
  "/directory",
  "/mappa",
  "/guide",
  "/faq",
  "/contatti",
  "/licenze",
  "/fonti",
  "/manifesto",
  "/privacy",
  "/regole",
  "/termini",
  "/accessibility",
  "/api-docs",
  "/contribuisci",
];

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await context.params;
  const slug = rawSlug.endsWith(".xml") ? rawSlug.slice(0, -4) : rawSlug;
  const headers = {
    "content-type": "application/xml; charset=utf-8",
    "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
  };

  if (slug === "static") {
    const entries = STATIC_ROUTES.map((route) => {
      const isHome = route === "";
      return [
        "  <url>",
        `    <loc>${publicUrl(isHome ? "/" : route)}</loc>`,
        `    <changefreq>${isHome ? "daily" : "weekly"}</changefreq>`,
        `    <priority>${isHome || route === "/directory" ? "0.9" : "0.6"}</priority>`,
        "  </url>",
      ].join("\n");
    });
    return new Response(xmlUrlset(entries), { headers });
  }

  const chunk = Number(slug);
  if (!Number.isInteger(chunk) || chunk < 1) {
    return new Response("not found", { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { sql, parameters } = publicCameraPredicate(nowIso);
  // OFFSET pagination over the id index: fine at this scale (160k rows), and
  // the chunk list from the index stays stable between crawls.
  const { results } = await env.DB.prepare(
    `SELECT id, updated FROM cameras WHERE ${sql} ORDER BY id DESC LIMIT ${CHUNK_SIZE} OFFSET ${(chunk - 1) * CHUNK_SIZE}`,
  )
    .bind(...parameters)
    .all<{ id: number; updated: string }>();

  const entries = results.map((row) =>
    [
      "  <url>",
      `    <loc>${publicUrl(`/records/${row.id}`)}</loc>`,
      `    <lastmod>${row.updated}</lastmod>`,
      "    <changefreq>monthly</changefreq>",
      "    <priority>0.7</priority>",
      "  </url>",
    ].join("\n"),
  );
  return new Response(xmlUrlset(entries), { headers });
}

function xmlUrlset(entries: string[]): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...entries,
    `</urlset>`,
  ].join("\n");
}
