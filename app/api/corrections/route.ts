import { env } from "cloudflare:workers";
import {
  CORRECTION_ISSUE_TYPES,
  createCorrectionRequest,
} from "../../../db/corrections";
import { recordRateLimitBlock } from "../../lib/abuse-alerts";
import { resolveOptionalContributor } from "../../lib/auth-session";
import { csrfVerified, sameOrigin } from "../../lib/csrf";
import { isRecord } from "../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../lib/input-limits";
import { callerKey, checkRateLimit, submissionLimits, submissionsDisabled } from "../../lib/rate-limit";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/**
 * POST /api/corrections — private correction/removal intake (C4,
 * COMMUNITY_PLAN §2.4).
 *
 * Breaking change from the historical free-text intake: `issueType` is a
 * whitelist (`inaccurate|missing|removal|abuse|other`) and anything outside
 * it answers 400 — free text is NEVER accepted for `removal`/`abuse`, even
 * when the message body contains the word (A2).
 *
 * Anonymous reports stay possible (reporter privacy, A4): the per-IP
 * `submit` rate bucket (default 5/60s) bounds bursts and the dedupe (A5)
 * lives in db/corrections.ts. A live session is optional; when present the
 * report is attributed to the contributor (nullable contributor_id column,
 * migration 0022) and — because the request then carries cookies — the
 * same-origin + CSRF double-submit guards apply (photos route pattern).
 */
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

  // Optional session: attributes the report to the contributor (null =
  // anonymous). When a session is present the request carries cookies, so
  // the state change must pass same-origin + CSRF (photos route pattern);
  // anonymous callers have nothing to CSRF and stay open.
  let auth: Awaited<ReturnType<typeof resolveOptionalContributor>> = null;
  try {
    auth = await resolveOptionalContributor(request);
  } catch (error) {
    console.error("POST /api/corrections session lookup failed", error);
    return Response.json({ error: "Unable to save correction request" }, { status: 500 });
  }
  if (auth && (!sameOrigin(request) || !csrfVerified(request, auth.session.csrfToken))) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
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
    // A1/A2: the issue type is a whitelist, never free text. Outside the
    // whitelist answers 400 even if the message contains the word
    // (removal/abuse are always moderated, never auto-applied).
    if (!CORRECTION_ISSUE_TYPES.includes(issueType as (typeof CORRECTION_ISSUE_TYPES)[number])) {
      return Response.json({ error: "Unsupported issue type. Choose from: inaccurate, missing, removal, abuse, other." }, { status: 400 });
    }
    const result = await createCorrectionRequest({
      cameraId,
      issueType,
      message,
      contact,
      contributorId: auth?.contributor.id ?? null,
    });
    if (result.kind === "duplicate_open") {
      return Response.json({ error: "A report for this record is already under review." }, { status: 409 });
    }
    if (result.kind === "already_removed") {
      return Response.json({ error: "This record has already been removed following a previous report." }, { status: 409 });
    }
    return Response.json({ referenceId: result.correction.id }, { status: 201 });
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/corrections payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/corrections failed", error);
    return Response.json({ error: "Unable to save correction request" }, { status: 500 });
  }
}
