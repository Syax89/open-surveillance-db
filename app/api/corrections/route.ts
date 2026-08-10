import { env } from "cloudflare:workers";
import {
  CORRECTION_ISSUE_TYPES,
  createCorrectionRequest,
} from "../../../db/corrections";
import { recordRateLimitBlock } from "../../lib/abuse-alerts";
import { requireWriteAuth } from "../../lib/write-gate";
import { csrfVerified, sameOrigin } from "../../lib/csrf";
import { isRecord } from "../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../lib/input-limits";
import { callerKey, checkRateLimit, checkRateLimitForKeyAuth, submissionLimits, submissionsDisabled } from "../../lib/rate-limit";

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
 * Write gate (multi-method auth Fase E1 + EPIC api-keys T14): every
 * correction/removal request requires a VERIFIED contributor, authenticated
 * EITHER by a verified session cookie OR by a private write API key carrying
 * the `submit` scope (`Authorization: Bearer *** D4). Anonymous (401),
 * unverified (403) and scope-mismatch (403) share ONE single response body
 * (anti-enumeration; see app/lib/write-gate.ts). The per-IP `submit` rate
 * bucket (default 5/60s) bounds bursts and the dedupe (A5) lives in
 * db/corrections.ts. CSRF/same-origin apply ONLY on the session branch (a
 * machine client holding a secret bearer credential carries no ambient
 * browser authority); a key-authenticated request is additionally
 * fail-closed double-counted against its own `key:<id>` bucket (D8/T12).
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

  const key = callerKey(request, env);
  const limitOptions = submissionLimits(env);
  const limit = await checkRateLimit(env, "submit", key, limitOptions);
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

  // Write gate (multi-method auth Fase E1 + EPIC api-keys T14): a
  // correction/removal request requires a VERIFIED contributor,
  // authenticated EITHER by a verified session cookie OR by a private write
  // API key carrying the `submit` scope (`Authorization: Bearer *** D4).
  // Anonymous (401), unverified (403) and scope-mismatch (403) share ONE
  // single response body (anti-enumeration); a session created before email
  // verification is read-only and cannot write.
  const gate = await requireWriteAuth(request, "submit");
  if (!gate.ok) return gate.response;

  // CSRF/same-origin ONLY on the session branch (plan §1.4, T14): a machine
  // client holding a secret bearer credential carries no ambient authority
  // from a browser origin, so the double-submit echo would be dead weight on
  // the key path. Session requests keep the same-origin + X-CSRF-Token echo
  // exactly as before.
  if (gate.authMethod === "session" && (!sameOrigin(request) || !csrfVerified(request, gate.session.csrfToken))) {
    return Response.json(
      { error: "Cross-site request rejected. Refresh the page and try again." },
      { status: 403 },
    );
  }

  // Additive per-key rate limit (D8/T12, plan §1.6): a key-authenticated
  // request is fail-closed double-counted — it must pass BOTH the per-IP
  // bucket above AND its own `key:<apiKeyId>` bucket; a block on either
  // answers 429 (same body as the per-IP block, Retry-After included).
  // Session callers have no per-key bucket (the pre-gate per-IP check is
  // the whole story), so this check is a no-op for them. The recorded block
  // uses the EFFECTIVE key (key:<id>), never the raw IP, for a
  // key-authenticated caller.
  const keyLimit = await checkRateLimitForKeyAuth(env, "submit", request, limitOptions, gate);
  if (!keyLimit.allowed) {
    console.warn("POST /api/corrections rate limited (per-key bucket)");
    recordRateLimitBlock(env, {
      route: "/api/corrections",
      key: keyLimit.key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(keyLimit.retryAfterSeconds) },
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
      contributorId: gate.contributor.id,
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
