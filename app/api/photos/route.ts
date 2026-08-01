import { env } from "cloudflare:workers";
import {
  createPendingPhoto,
  listApprovedPhotosForCamera,
  pendingPhotoUsage,
} from "../../../db/photos";
import { getPublicCameraById } from "../../../db/cameras";
import {
  PHOTO_MIME_TYPES,
  photoLimits,
  readImageDimensions,
  sniffImageType,
  stripImageMetadata,
  type ImageType,
} from "../../lib/image-metadata";
import { PayloadTooLargeError, urlTooLong } from "../../lib/input-limits";
import { recordRateLimitBlock } from "../../lib/abuse-alerts";
import { callerKey, checkRateLimit, submissionLimits, submissionsDisabled } from "../../lib/rate-limit";
import { csrfVerified, sameOrigin } from "../../lib/csrf";
import { resolveOptionalContributor } from "../../lib/auth-session";
import { pendingPhotoQuota, submitterKeyFor } from "../../lib/photo-quota";

/**
 * Photo intake (STATUS gap #3).
 *
 * POST /api/photos — upload one image as the raw request body. The route:
 *   1. enforces size, MIME and dimension limits (env-tunable, see
 *      app/lib/image-metadata.ts photoLimits);
 *   2. enforces a per-caller pending-photo quota before storage (count and
 *      bytes, env-tunable, see app/lib/photo-quota.ts) so a caller cannot
 *      accumulate unbounded R2 storage or flood the moderation queue;
 *   3. verifies the container from magic bytes, never trusting the caller's
 *      Content-Type;
 *   4. strips EXIF/XMP/IPTC metadata — mandatory, fail closed;
 *   5. stores the sanitised bytes in R2 (`PHOTOS`) and metadata-only in D1.
 * Returns photo metadata (never the storage key, never the bytes back).
 *
 * GET /api/photos?cameraId=N — approved photos of a public camera (record
 * detail gallery). Answers 404 when the camera is not public so a pending
 * or rejected record never leaks its evidence.
 */

const allowedMimeTypes = new Set(Object.values(PHOTO_MIME_TYPES));

function photoError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Read the raw request body up to `maxBytes + 1` bytes. Throws
 * PayloadTooLargeError when the body exceeds the cap, so the route answers
 * 413 before any parsing or storage work happens.
 */
async function readCappedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new PayloadTooLargeError("Photo exceeds the maximum allowed size.");
  }
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      throw new PayloadTooLargeError("Photo exceeds the maximum allowed size.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }
  if (submissionsDisabled(env)) {
    console.warn("POST /api/photos rejected: submissions disabled via POST_SUBMISSIONS_DISABLED");
    return photoError("Submissions are temporarily disabled.", 503);
  }

  const key = callerKey(request);
  const limitOptions = submissionLimits(env);
  const limit = checkRateLimit("submit", key, limitOptions);
  if (!limit.allowed) {
    console.warn("POST /api/photos rate limited");
    recordRateLimitBlock(env, {
      route: "/api/photos",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many submissions. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const { maxBytes, maxDimension } = photoLimits(env);
  const declaredType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

  try {
    // Optional contributor attribution (ADR 0013): uploads may be anonymous,
    // but a request carrying a live session must pass the same-origin + CSRF
    // checks before its photo is attributed (used by the link-time ownership
    // guard in linkPhotosToCamera).
    const auth = await resolveOptionalContributor(request);
    if (auth && (!sameOrigin(request) || !csrfVerified(request, auth.session.csrfToken))) {
      return photoError("Cross-site request rejected. Refresh the page and try again.", 403);
    }

    // Pending-photo quota (audit t_2ee58c08, P2): a caller may accumulate at
    // most PHOTOS_MAX_PENDING_PER_CALLER pending photos (and
    // PHOTOS_MAX_PENDING_BYTES pending R2 bytes) before the moderation queue
    // catches up. The count is checked HERE — before the body is even read —
    // so an over-quota caller is rejected without spending a byte on parsing;
    // the byte quota is enforced after stripping, still before any R2 store.
    // The state quota is separate from the "submit" rate limit: the limiter
    // bounds the request rate, this bounds accumulated pending storage.
    const submitterKey = await submitterKeyFor(auth, request);
    const quota = pendingPhotoQuota(env);
    const pendingUsage = await pendingPhotoUsage(submitterKey);
    if (pendingUsage.count >= quota.maxPendingCount) {
      console.warn("POST /api/photos rejected: pending-photo count quota exceeded", { submitterKey });
      return photoError("Pending photo quota exceeded. Existing uploads must be reviewed before you can add more.", 429);
    }

    // MIME allowlist: reject anything that is not a supported image type
    // before spending a byte on the body.
    if (!allowedMimeTypes.has(declaredType)) {
      return photoError("Only JPEG, PNG and WebP images are accepted.", 415);
    }

    const bytes = await readCappedBody(request, maxBytes);

    // Container verification from magic bytes: the declared Content-Type is
    // only a hint; the sniffed type is authoritative.
    const sniffed = sniffImageType(bytes);
    if (sniffed === null) {
      return photoError("The uploaded file is not a readable JPEG, PNG or WebP image.", 415);
    }
    if (PHOTO_MIME_TYPES[sniffed] !== declaredType) {
      return photoError("The declared Content-Type does not match the file contents.", 415);
    }

    const dimensions = readImageDimensions(bytes, sniffed);
    if (dimensions === null) {
      return photoError("The image dimensions could not be read.", 400);
    }
    if (dimensions.width > maxDimension || dimensions.height > maxDimension) {
      return photoError(`Images larger than ${maxDimension}px per side are not accepted.`, 400);
    }

    // Mandatory metadata strip, fail closed: if the container cannot be
    // walked safely we refuse to store it rather than keep EXIF/GPS data.
    const stripped = stripImageMetadata(bytes, sniffed as ImageType);
    if (stripped === null) {
      return photoError("The image metadata could not be verified; the upload was rejected.", 400);
    }

    // Byte quota: the sanitised size is now known, so the pending R2 volume
    // can be checked exactly. Still before any storage — an over-quota caller
    // costs us parsing but never R2 writes.
    if (pendingUsage.sizeBytes + stripped.length > quota.maxPendingBytes) {
      console.warn("POST /api/photos rejected: pending-photo byte quota exceeded", { submitterKey });
      return photoError("Pending photo storage quota exceeded. Existing uploads must be reviewed before you can add more.", 429);
    }

    const photo = await createPendingPhoto({
      bytes: stripped,
      mimeType: PHOTO_MIME_TYPES[sniffed],
      width: dimensions.width,
      height: dimensions.height,
      contributorId: auth?.contributor.id ?? null,
      submitterKey,
    });
    return Response.json({ photo }, { status: 201 });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      console.warn("POST /api/photos payload rejected: body over the configured byte cap");
      return photoError(error.message, error.status);
    }
    console.error("POST /api/photos failed", error);
    return photoError("Unable to store photo", 500);
  }
}

export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  try {
    const cameraId = Number(new URL(request.url).searchParams.get("cameraId"));
    if (!Number.isInteger(cameraId) || cameraId < 1) {
      return Response.json({ error: "A positive cameraId is required." }, { status: 400 });
    }
    // Public boundary: photos of a non-public camera must not be listed.
    const camera = await getPublicCameraById(cameraId);
    if (!camera) return Response.json({ error: "Record not found." }, { status: 404 });
    const photos = await listApprovedPhotosForCamera(cameraId);
    // Approved-photo list (audit t_2ee58c08, gap #2): the set changes as
    // photos pass moderation, so the list itself is never cached (the photo
    // bytes served by /api/photos/[id] are immutable and cached separately).
    return Response.json({ photos }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/photos failed", error);
    return Response.json({ error: "Unable to list photos" }, { status: 503 });
  }
}
