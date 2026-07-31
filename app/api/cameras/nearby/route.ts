import { findNearbyPublicCameras } from "../../../../db/cameras";

function readNumber(value: string | null) { if (value === null || value.trim() === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function readText(value: string | null, maxLength: number) { return typeof value === "string" ? value.trim().slice(0, maxLength) : ""; }

export async function GET(request: Request) {
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
    return Response.json({ records });
  } catch (error) {
    console.error("GET /api/cameras/nearby failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}
