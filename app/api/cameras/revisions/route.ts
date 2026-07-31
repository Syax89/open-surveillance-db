import { getPublicCameraById } from "../../../../db/cameras";
import { listPublicCameraRevisions } from "../../../../db/moderation";

function parseCameraId(url: URL): number | null {
  const raw = url.searchParams.get("cameraId");
  if (raw === null || raw === "") return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request) {
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
    return Response.json({ recordId: record.id, revisions });
  } catch (error) {
    console.error("GET /api/cameras/revisions failed", error);
    return Response.json({ error: "Change history unavailable" }, { status: 503 });
  }
}
