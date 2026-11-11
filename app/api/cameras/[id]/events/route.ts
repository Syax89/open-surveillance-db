import { env } from "cloudflare:workers";
import { getD1 } from "../../../../../db/cameras";
import { CACHE_TAGS } from "../../../../lib/cache-purge";
import { urlTooLong } from "../../../../lib/input-limits";
import { limitsFor } from "../../../../lib/rate-limit";
import { rateLimitResponse } from "../../../../lib/rate-limit-response";
import { isRecordPageStatus } from "../../../../lib/public-status";
import { withPublicCache } from "../../../../lib/public-cache";

/**
 * Public lifecycle event history (ADR 0021 §7, kanban t_a9f23581 FASE 2):
 *
 *   GET /api/cameras/[id]/events -> { events: [{id, eventType, detail, createdAt}] }
 *
 * Returns the unattributed public event timeline for a camera, ordered
 * created_at ASC. The camera must exist, not be a demo record (ADR 0008
 * fail-closed) and be in the record-page whitelist RECORD_PAGE_STATUSES
 * (active/demo/hidden/removed) — anything else answers 404
 * indistinguishable from a missing id (no existence oracle, same rule as
 * /revisions and /api/cameras/[id]). Hidden and removed records ARE
 * permitted (ADR §6.3: banner + history link on hidden records); pending,
 * needs_review, stale and rejected records are never revealed.
 *
 * Caching: public, s-maxage=300, stale-while-revalidate=600 (ADR §7.1).
 * Cache-Tag per record so moderation invalidates it alongside the record.
 * Worker cache (perf 2026-11): the record page fetches this on every view,
 * so the database work is wrapped in withPublicCache like
 * GET /api/cameras/[id] (only 200s are stored; 404s stay uncached). The
 * stored entry keeps the per-record Cache-Tag, which the moderation route
 * AND the community-action PUT purge (an accepted action appends a public
 * event). Deliberately NO browser max-age: a browser copy cannot be purged
 * and the record page refetches the timeline right after an action.
 * NEVER expose contributor ids, emails or IPs — only the aggregate event
 * stream (eventType + detail JSON).
 */

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

function parseId(request: Request): number | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  const idParam = parts[parts.length - 2] ?? "";
  if (!/^\d+$/.test(idParam) || Number(idParam) < 1) return null;
  return Number(idParam);
}

export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  const limited = await rateLimitResponse(request, {
    bucket: "read",
    route: "/api/cameras/[id]/events",
    env,
    limits: limitsFor("read", env),
    log: "GET /api/cameras/[id]/events rate limited",
  });
  if (limited) return limited;

  const id = parseId(request);
  if (id === null) {
    return Response.json({ error: "Camera not found." }, { status: 404 });
  }

  return withPublicCache(request, 300, async () => {
  try {
    const d1 = await getD1();
    // Existence oracle gate (kanban t_c8c10689, P1): a non-public record
    // must be indistinguishable from a missing id. The events timeline is
    // served only for the record-page whitelist (active/demo/hidden/removed,
    // ADR 0021 §6.3) — pending/needs_review/stale/rejected answer 404 like
    // GET /api/cameras/[id] and /revisions. Demo records stay fail-closed
    // (ADR 0008: prototype-only, never public in production).
    const camera = await d1
      .prepare("SELECT id, status FROM cameras WHERE id = ?")
      .bind(id)
      .first<{ id: number; status: string }>();
    if (!camera || !isRecordPageStatus(camera.status) || camera.status === "demo") {
      return Response.json({ error: "Camera not found." }, { status: 404 });
    }

    // Hidden and removed records are ammessi (ADR §6.3).
    const events = await d1
      .prepare(
        "SELECT id, event_type AS eventType, detail, created_at AS createdAt FROM camera_lifecycle_events WHERE camera_id = ? ORDER BY created_at ASC, id ASC",
      )
      .bind(id)
      .all<{ id: number; eventType: string; detail: string | null; createdAt: string }>();

    return Response.json(
      { events: events.results.map((e) => ({ ...e, detail: e.detail ? JSON.parse(e.detail) : null })) },
      {
        headers: {
          ...CACHE_HEADERS,
          "Cache-Tag": CACHE_TAGS.record(id),
        },
      },
    );
  } catch (error) {
    console.error("GET /api/cameras/[id]/events failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
  });
}
