import { env } from "cloudflare:workers";
import { getPublicCameraById } from "../../../../db/cameras";
import { recordRateLimitBlock } from "../../../lib/abuse-alerts";
import { callerKey, checkRateLimit, limitsFor } from "../../../lib/rate-limit";

/**
 * GET /api/cameras/[id] — one public record (FRONTEND_PLAN § 3.2.1).
 *
 * The /records/[id] page used to resolve its record by walking the whole
 * client-side list; with server-side pagination that pattern breaks, so the
 * page fetches this endpoint instead. The lookup shares the exact public
 * predicate and ~10 m coordinate rounding of the directory list, and fails
 * closed with 404 for anything that is not publicly current — a pending,
 * stale, rejected or removed record is indistinguishable from a missing id
 * (no existence leak, same rule as the photo route).
 *
 * The id is parsed from the URL path (works identically under Next.js App
 * Router and the plain-Node route harness, which invokes handlers with a
 * bare Request).
 */
export async function GET(request: Request) {
  const idParam = new URL(request.url).pathname.split("/").pop() ?? "";
  const id = Number(idParam);
  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: "Camera not found." }, { status: 404 });
  }

  // Public read route: metered per caller in the read-family bucket, same as
  // the directory list and the photo bytes. Malformed ids above answered 404
  // without touching the database and are not counted.
  const key = callerKey(request);
  const limitOptions = limitsFor("read", env);
  const limit = checkRateLimit("read", key, limitOptions);
  if (!limit.allowed) {
    console.warn(`GET /api/cameras/[id] rate limited for caller ${key}`);
    recordRateLimitBlock(env, {
      route: "/api/cameras/[id]",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  try {
    const record = await getPublicCameraById(id);
    if (!record) {
      // Fail closed, indistinguishable from "does not exist".
      return Response.json({ error: "Camera not found." }, { status: 404 });
    }
    return Response.json({ record }, {
      // Same bounded edge cache as the list: the record changes through
      // moderation decisions, never live feeds, and revalidation converges
      // after any decision within the window.
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("GET /api/cameras/[id] failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
