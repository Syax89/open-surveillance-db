import { env } from "cloudflare:workers";
import { getPublicCameraById } from "../../../../db/cameras";
import { listPublicCameraRevisions } from "../../../../db/moderation";
import { urlTooLong } from "../../../lib/input-limits";
import { limitsFor } from "../../../lib/rate-limit";
import { rateLimitResponse } from "../../../lib/rate-limit-response";

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
  const limited = await rateLimitResponse(request, {
    bucket: "revisions",
    route: "/api/cameras/revisions",
    env,
    limits: limitsFor("revisions", env),
    log: "GET /api/cameras/revisions rate limited",
  });
  if (limited) return limited;

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
