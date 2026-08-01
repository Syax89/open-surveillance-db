import { env } from "cloudflare:workers";
import { getPublicCameraById } from "../../../../db/cameras";
import { listPublicCameraRevisions } from "../../../../db/moderation";
import { recordRateLimitBlock } from "../../../lib/abuse-alerts";
import { urlTooLong } from "../../../lib/input-limits";
import { callerKey, checkRateLimit, limitsFor } from "../../../lib/rate-limit";

function parseCameraId(url: URL): number | null {
  const raw = url.searchParams.get("cameraId");
  if (raw === null || raw === "") return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request) {
  // Input limits: reject absurdly long URLs before any query parsing work.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  // Rate limits: the change summary is a public read that can be probed per
  // camera id, so it gets its own bucket independent of the plain read and
  // export buckets.
  const key = callerKey(request);
  const limitOptions = limitsFor("revisions", env);
  const limit = checkRateLimit("revisions", key, limitOptions);
  if (!limit.allowed) {
    console.warn("GET /api/cameras/revisions rate limited");
    recordRateLimitBlock(env, {
      route: "/api/cameras/revisions",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const cameraId = parseCameraId(new URL(request.url));
  if (cameraId === null) {
    return Response.json({ error: "Provide a positive integer cameraId." }, { status: 400 });
  }

  try {
    // Public boundary: the change summary is served only for records that
    // are currently public, so pending/rejected/removed records cannot be
    // probed through this endpoint and their private history never leaks.
    const record = await getPublicCameraById(cameraId);
    if (!record) {
      return Response.json({ error: "Record unavailable" }, { status: 404 });
    }

    const revisions = await listPublicCameraRevisions(cameraId);
    // Public change history (audit t_2ee58c08, gap #2): the summary must
    // reflect the latest moderation decisions, so it is never cached.
    return Response.json({ recordId: record.id, revisions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/cameras/revisions failed", error);
    return Response.json({ error: "Change history unavailable" }, { status: 503 });
  }
}
