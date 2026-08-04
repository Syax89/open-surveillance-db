import type { MetadataRoute } from "next";
import { env } from "cloudflare:workers";
import { publicCameraPredicate } from "../db/cameras";

/**
 * /sitemap.xml — discovery channel for the public record pages (F7 qa#5,
 * t_ab0d4c75). The /records/[id] pages are client-rendered (RecordPageBody)
 * and have no crawlable links to every id, so the sitemap is the cheapest
 * way to get them indexed.
 *
 * Dynamic by design: the record list is queried from D1 at request time
 * through the SAME public predicate as every other public read
 * (publicCameraPredicate — status whitelist + freshness carve-out + the
 * ADR 0008 demo gate). A status change or a demo purge therefore takes
 * effect on the sitemap on the next crawl, exactly like the JSON/GeoJSON
 * exports. Cache-Control is applied by the worker edge (worker/index.ts),
 * and the per-request cost is one indexed COUNT-style SELECT over the
 * public id set (bounded dataset; the /records/:id page already incurs
 * more per visit).
 */
export const dynamic = "force-dynamic";

// Public, indexable static routes (mirror of public/robots.txt allowlist —
// auth/moderation/account/edit routes are excluded there and here).
const STATIC_ROUTES = [
  "",
  "/directory",
  "/mappa",
  "/segnala",
  "/correggi",
  "/guide",
  "/faq",
  "/contatti",
  "/licenze",
  "/manifesto",
  "/privacy",
  "/regole",
  "/termini",
  "/moderazione",
  "/accessibility",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const nowIso = new Date().toISOString();
  const { sql, parameters } = publicCameraPredicate(nowIso);
  // Note: `parameters` includes the `nowIso` freshness boundary plus the
  // status whitelist; the ADR 0008 demo gate is baked into the predicate
  // via demoRecordsPublic() (fail-closed outside ENVIRONMENT=development).
  const { results } = await env.DB.prepare(
    `SELECT id FROM cameras WHERE ${sql} ORDER BY id DESC`,
  )
    .bind(...parameters)
    .all<{ id: number }>();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: route === "" ? "/" : route,
    // Static pages change rarely; records get lastmod from the row.
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" || route === "/directory" ? 0.9 : 0.6,
  }));

  for (const row of results) {
    entries.push({
      url: `/records/${row.id}`,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  return entries;
}
