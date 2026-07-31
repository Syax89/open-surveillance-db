import { env } from "cloudflare:workers";
import { createCorrectionRequest } from "../../../db/corrections";
import { callerKey, checkRateLimit, submissionLimits, submissionsDisabled } from "../../lib/rate-limit";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  if (submissionsDisabled(env)) {
    console.warn("POST /api/corrections rejected: submissions disabled via POST_SUBMISSIONS_DISABLED");
    return Response.json({ error: "Correction requests are temporarily disabled." }, { status: 503 });
  }

  const key = callerKey(request);
  const limit = checkRateLimit(key, submissionLimits(env));
  if (!limit.allowed) {
    console.warn(`POST /api/corrections rate limited for caller ${key}`);
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

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
    console.error("POST /api/corrections failed", error);
    return Response.json({ error: "Unable to save correction request" }, { status: 500 });
  }
}
