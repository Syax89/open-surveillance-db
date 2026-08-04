import { env } from "cloudflare:workers";
import { getD1 } from "../../../../../db/cameras";
import { CACHE_TAGS } from "../../../../lib/cache-purge";
import { urlTooLong } from "../../../../lib/input-limits";
import { callerKey, checkRateLimit, limitsFor } from "../../../../lib/rate-limit";
import { recordRateLimitBlock } from "../../../../lib/abuse-alerts";

/**
 * Public lifecycle event history (ADR 0021 §7, kanban t_a9f23581 FASE 2):
 *
 *   GET /api/cameras/[id]/events -> { events: [{id, eventType, detail, createdAt}] }
 *
 * Returns the unattributed public event timeline for a camera, ordered
 * created_at ASC. The camera must exist and not be a demo record
 * (fail-closed 404). Hidden and removed records ARE permitted (ADR §6.3:
 * banner + history link on hidden records).
 *
 * Caching: public, s-maxage=300, stale-while-revalidate=600 (ADR §7.1).
 * Cache-Tag per record so moderation invalidates it alongside the record.
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

  const key = callerKey(request, env);
  const limitOptions = limitsFor("read", env);
  const limit = await checkRateLimit(env, "read", key, limitOptions);
  if (!limit.allowed) {
    console.warn("GET /api/cameras/[id]/events rate limited");
    recordRateLimitBlock(env, {
      route: "/api/cameras/[id]/events",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const id = parseId(request);
  if (id === null) {
    return Response.json({ error: "Camera not found." }, { status: 404 });
  }

  try {
    const d1 = await getD1();
    // Camera must exist and not be a demo record (fail-closed).
    const camera = await d1
      .prepare("SELECT id, status FROM cameras WHERE id = ?")
      .bind(id)
      .first<{ id: number; status: string }>();
    if (!camera || camera.status === "demo") {
      return Response.json({ error: "Camera not found." }, { status: 404 });
    }

    // Hidden and removed records are AMMESSI (ADR §6.3).
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
}
