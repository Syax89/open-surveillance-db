import { createCorrectionRequest } from "../../../db/corrections";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const rawCameraId = payload.cameraId;
    const cameraId = rawCameraId === "" || rawCameraId === undefined || rawCameraId === null ? null : Number(rawCameraId);
    const issueType = cleanText(payload.issueType, 50);
    const message = cleanText(payload.message, 1500);
    const contact = cleanText(payload.contact, 180);
    if ((cameraId !== null && (!Number.isInteger(cameraId) || cameraId < 1)) || !issueType || !message) return Response.json({ error: "Choose an issue type and provide a short description." }, { status: 400 });
    const correction = await createCorrectionRequest({ cameraId, issueType, message, contact });
    return Response.json({ referenceId: correction.id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to save correction request" }, { status: 500 });
  }
}
