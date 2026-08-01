import { env } from "cloudflare:workers";
import { findNearbyPublicCameras } from "../../../../db/cameras";
import { recordRateLimitBlock } from "../../../lib/abuse-alerts";
import { urlTooLong } from "../../../lib/input-limits";
import { callerKey, checkRateLimit, limitsFor } from "../../../lib/rate-limit";

function readNumber(value: string | null) { if (value === null || value.trim() === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function readText(value: string | null, maxLength: number) { return typeof value === "string" ? value.trim().slice(0, maxLength) : ""; }

export async function GET(request: Request) {
  // Input limits: reject absurdly long URLs before any query parsing work.
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  // Rate limits: nearby search is public and cheap to hammer, so it gets its
  // own bucket independent of the plain read and export buckets.
  const key = callerKey(request);
  const limitOptions = limitsFor("nearby", env);
  const limit = checkRateLimit("nearby", key, limitOptions);
  if (!limit.allowed) {
    console.warn("GET /api/cameras/nearby rate limited");
    recordRateLimitBlock(env, {
      route: "/api/cameras/nearby",
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const query = new URL(request.url).searchParams;
  const latitude = readNumber(query.get("latitude"));
  const longitude = readNumber(query.get("longitude"));
  const radius = query.has("radius") ? readNumber(query.get("radius")) : 75;

  if (latitude === null || longitude === null || radius === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || radius < 10 || radius > 500) {
    return Response.json({ error: "Valid latitude, longitude and a radius between 10 and 500 metres are required." }, { status: 400 });
  }

  try {
    // Optional text hints for the pre-submit duplicate check: when supplied,
    // candidates are ranked by title/address/kind similarity as well as distance.
    const title = readText(query.get("title"), 90);
    const address = readText(query.get("address"), 180);
    const kind = readText(query.get("kind"), 60);
    const records = await findNearbyPublicCameras(latitude, longitude, radius, { title, address, kind });
    // Moderation-derived duplicates list (audit t_2ee58c08, gap #2): the
    // pre-submit warning must never be served stale from a cache after a
    // moderation decision, so the response is never stored.
    return Response.json({ records }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/cameras/nearby failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
