import { env } from "cloudflare:workers";
import { readPublicPhotoBytes } from "../../../../db/photos";
import { recordRateLimitBlock } from "../../../lib/abuse-alerts";
import { callerKey, checkRateLimit, limitsFor } from "../../../lib/rate-limit";

/**
 * GET /api/photos/[id] — serve one approved photo.
 *
 * Strict public boundary: bytes are returned ONLY when the photo is
 * approved, redaction is confirmed, and the linked camera is publicly
 * current. Everything else fails closed with 404 (no existence leak).
 * `storage_key` never appears: the response body is the image itself.
 *
 * The id is parsed from the URL path (works identically under Next.js App
 * Router and the plain-Node route harness, which invokes handlers with a
 * bare Request).
 */
export async function GET(request: Request) {
  const idParam = new URL(request.url).pathname.split("/").pop() ?? "";
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "Photo not found." }, { status: 404 });
  }

  // Public binary route: every hit costs R2 egress, so the read-family
  // bucket metered per caller (default 60/min, READ_RATE_LIMIT_* knobs)
  // protects bandwidth from bulk scraping. Malformed ids above already
  // answered 404 without touching storage and are not counted.
  const key = callerKey(request);
  const limitOptions = limitsFor("read", env);
  const limit = checkRateLimit("read", key, limitOptions);
  if (!limit.allowed) {
    console.warn("GET /api/photos/[id] rate limited");
    recordRateLimitBlock(env, {
      route: "/api/photos/[id]",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const photo = await readPublicPhotoBytes(id);
  if (!photo) {
    // Fail closed, indistinguishable from "does not exist".
    return Response.json({ error: "Photo not found." }, { status: 404 });
  }

  return new Response(
    photo.bytes.buffer.slice(photo.bytes.byteOffset, photo.bytes.byteOffset + photo.bytes.byteLength) as ArrayBuffer,
    {
      headers: {
        "Content-Type": photo.mimeType,
        "Cache-Control": "public, max-age=3600, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    },
  );
}
