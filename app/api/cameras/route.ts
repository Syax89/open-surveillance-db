import { env } from "cloudflare:workers";
import { createPendingCamera, freshnessWindows, listPublicCameras, type FreshnessWindow, type PublicCameraFilters } from "../../../db/cameras";
import { isRecord } from "../../lib/guards";
import { callerKey, checkRateLimit, submissionLimits, submissionsDisabled } from "../../lib/rate-limit";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isValidCalendarDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function cleanObservedOn(value: unknown) {
  const date = cleanText(value, 10);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && isValidCalendarDate(date) ? date : "";
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function toCsv(records: Awaited<ReturnType<typeof listPublicCameras>>) {
  const header = ["id", "title", "kind", "manufacturer", "observed_on", "status", "source", "updated", "description", "address", "latitude", "longitude"];
  const rows = records.map((record) => [record.id, record.title, record.kind, record.manufacturer, record.observedOn, record.status, record.source, record.updated, record.description, record.address, record.latitude, record.longitude].map(csvCell).join(","));
  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const format = params.get("format");
    const kind = cleanText(params.get("kind"), 60);
    const freshness = params.get("freshness");
    if (freshness !== null && !freshnessWindows.includes(freshness as FreshnessWindow)) {
      return Response.json({ error: `Unknown freshness window. Use one of: ${freshnessWindows.join(", ")}.` }, { status: 400 });
    }
    const filters: PublicCameraFilters = {};
    if (kind) filters.kind = kind;
    if (freshness && freshness !== "all") filters.freshness = freshness as FreshnessWindow;
    const records = await listPublicCameras(filters);
    if (format === "geojson") {
      return Response.json({ type: "FeatureCollection", features: records.map((record) => ({ type: "Feature", geometry: { type: "Point", coordinates: [record.longitude, record.latitude] }, properties: { id: record.id, title: record.title, kind: record.kind, manufacturer: record.manufacturer, observedOn: record.observedOn, status: record.status, source: record.source, updated: record.updated, description: record.description } })) }, { headers: { "Content-Disposition": "attachment; filename=opensurveillancedb-cameras.geojson" } });
    }
    if (format === "csv") {
      return new Response(toCsv(records), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=opensurveillancedb-cameras.csv" } });
    }
    return Response.json({ records });
  } catch (error) {
    console.error("GET /api/cameras failed", error);
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (submissionsDisabled(env)) {
    console.warn("POST /api/cameras rejected: submissions disabled via POST_SUBMISSIONS_DISABLED");
    return Response.json({ error: "Submissions are temporarily disabled." }, { status: 503 });
  }

  const key = callerKey(request);
  const limit = checkRateLimit(key, submissionLimits(env));
  if (!limit.allowed) {
    console.warn(`POST /api/cameras rate limited for caller ${key}`);
    return Response.json({ error: "Too many submissions. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  try {
    const payload: unknown = await request.json();
    if (!isRecord(payload)) return Response.json({ error: "A title, type, valid position and (when provided) a valid observation date are required." }, { status: 400 });
    const title = cleanText(payload.title, 90);
    const kind = cleanText(payload.kind, 60);
    const address = cleanText(payload.address, 180);
    const notes = cleanText(payload.notes, 1000);
    const manufacturer = cleanText(payload.manufacturer, 80);
    const observedOn = cleanObservedOn(payload.observedOn);
    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);
    if (!title || !kind || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || (payload.observedOn !== undefined && payload.observedOn !== null && !observedOn)) return Response.json({ error: "A title, type, valid position and (when provided) a valid observation date are required." }, { status: 400 });
    const record = await createPendingCamera({ title, kind, address, notes, manufacturer: manufacturer || null, observedOn: observedOn || null, latitude, longitude });
    return Response.json({ record }, { status: 201 });
  } catch (error) {
    console.error("POST /api/cameras failed", error);
    return Response.json({ error: "Unable to save report" }, { status: 500 });
  }
}
