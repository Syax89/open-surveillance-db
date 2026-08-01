import { env } from "cloudflare:workers";
import { createCorrectionRequest } from "../../../db/corrections";
import { recordRateLimitBlock } from "../../lib/abuse-alerts";
import { isRecord } from "../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../lib/input-limits";
import { callerKey, checkRateLimit, submissionLimits, submissionsDisabled } from "../../lib/rate-limit";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  // Input limits: reject absurdly long URLs before any parsing work.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  if (submissionsDisabled(env)) {
    console.warn("POST /api/corrections rejected: submissions disabled via POST_SUBMISSIONS_DISABLED");
    return Response.json({ error: "Correction requests are temporarily disabled." }, { status: 503 });
  }

  const key = callerKey(request);
  const limitOptions = submissionLimits(env);
  const limit = checkRateLimit("submit", key, limitOptions);
  if (!limit.allowed) {
    console.warn("POST /api/corrections rate limited");
    recordRateLimitBlock(env, {
      route: "/api/corrections",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  try {
    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload)) return Response.json({ error: "Choose an issue type and provide a short description." }, { status: 400 });
    const rawCameraId = payload.cameraId;
    const cameraId = rawCameraId === "" || rawCameraId === undefined || rawCameraId === null ? null : Number(rawCameraId);
    const issueType = cleanText(payload.issueType, 50);
    const message = cleanText(payload.message, 1500);
    const contact = cleanText(payload.contact, 180);
    if ((cameraId !== null && (!Number.isInteger(cameraId) || cameraId < 1)) || !issueType || !message) return Response.json({ error: "Choose an issue type and provide a short description." }, { status: 400 });
    const correction = await createCorrectionRequest({ cameraId, issueType, message, contact });
    return Response.json({ referenceId: correction.id }, { status: 201 });
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/corrections payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/corrections failed", error);
    return Response.json({ error: "Unable to save correction request" }, { status: 500 });
  }
}
