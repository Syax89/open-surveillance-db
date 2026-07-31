import { env } from "cloudflare:workers";
import { classifyDuplicateMatch, textSimilarity, type MatchStrength } from "../app/lib/duplicate-detection";

export type CameraRecord = {
  id: number;
  title: string;
  kind: string;
  manufacturer: string | null;
  observedOn: string | null;
  publishManufacturer: number;
  publishObservedOn: number;
  address: string | null;
  notes: string;
  latitude: number;
  longitude: number;
  status: string;
  source: string;
  updated: string;
  description: string;
  // Freshness state: last_verified_at is the machine-readable ISO date of the
  // last successful verification; review_due_at is the scheduled recheck date
  // (last_verified_at + review_interval_months). A verified record is only
  // published as current while it is inside this review window.
  lastVerifiedAt: string | null;
  reviewDueAt: string | null;
  reviewIntervalMonths: number;
  createdAt: string;
};

/** Public read boundary: the private `notes` field must never leave this type. */
export type PublicCameraRecord = Omit<CameraRecord, "notes">;

const createTable = "CREATE TABLE IF NOT EXISTS cameras (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, kind TEXT NOT NULL, manufacturer TEXT, observed_on TEXT, publish_manufacturer INTEGER NOT NULL DEFAULT 0, publish_observed_on INTEGER NOT NULL DEFAULT 0, address TEXT, notes TEXT NOT NULL DEFAULT '', latitude REAL NOT NULL, longitude REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending', source TEXT NOT NULL, updated TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', last_verified_at TEXT, review_due_at TEXT, review_interval_months INTEGER NOT NULL DEFAULT 12, created_at TEXT NOT NULL)";
const createIndex = "CREATE INDEX IF NOT EXISTS cameras_status_idx ON cameras(status)";
const cameraMetadataColumns = [
  { name: "manufacturer", statement: "ALTER TABLE cameras ADD COLUMN manufacturer TEXT" },
  { name: "observed_on", statement: "ALTER TABLE cameras ADD COLUMN observed_on TEXT" },
  { name: "publish_manufacturer", statement: "ALTER TABLE cameras ADD COLUMN publish_manufacturer INTEGER NOT NULL DEFAULT 0" },
  { name: "publish_observed_on", statement: "ALTER TABLE cameras ADD COLUMN publish_observed_on INTEGER NOT NULL DEFAULT 0" },
  { name: "last_verified_at", statement: "ALTER TABLE cameras ADD COLUMN last_verified_at TEXT" },
  { name: "review_due_at", statement: "ALTER TABLE cameras ADD COLUMN review_due_at TEXT" },
  { name: "review_interval_months", statement: "ALTER TABLE cameras ADD COLUMN review_interval_months INTEGER NOT NULL DEFAULT 12" },
] as const;
const seedRecords = [["Illustrative record A", "Fixed dome", 41.9004, 12.4936, "Prototype seed", "Demo data", "This marker demonstrates how a verified public record will be presented. It is not a claim about a real camera."], ["Illustrative record B", "Traffic monitoring", 41.9047, 12.5031, "Prototype seed", "Demo data", "The field of view is deliberately approximate and should never be treated as a record of live activity."]] as const;

async function ensureCameraMetadataColumns(d1: NonNullable<typeof env.DB>) {
  const columns = await d1.prepare("PRAGMA table_info(cameras)").all<{ name: string }>();
  const existingColumns = new Set(columns.results.map((column) => column.name));
  const missingColumns = cameraMetadataColumns.filter((column) => !existingColumns.has(column.name));

  if (missingColumns.length > 0) {
    await d1.batch(missingColumns.map((column) => d1.prepare(column.statement)));
  }
}

export async function getD1() {
  if (!env.DB) throw new Error("Database binding unavailable");
  await env.DB.prepare(createTable).run();
  await ensureCameraMetadataColumns(env.DB);
  await env.DB.prepare(createIndex).run();

  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM cameras").first<{ count: number }>();
  if (count?.count === 0) {
    const now = new Date().toISOString();
    await env.DB.batch(seedRecords.map((record) => env.DB.prepare("INSERT INTO cameras (title, kind, latitude, longitude, status, source, updated, description, created_at) VALUES (?, ?, ?, ?, 'demo', ?, ?, ?, ?)").bind(...record, now)));
  }

  return env.DB;
}

export const freshnessWindows = ["7d", "30d", "90d", "all"] as const;
export type FreshnessWindow = (typeof freshnessWindows)[number];
export type PublicCameraFilters = { kind?: string; freshness?: FreshnessWindow };

function freshnessCutoff(freshness: Exclude<FreshnessWindow, "all">): string {
  const days = Number.parseInt(freshness, 10);
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function listPublicCameras(
  nowIsoOrFilters?: string | PublicCameraFilters,
): Promise<PublicCameraRecord[]> {
  const d1 = await getD1();
  // The first argument is either a review-window boundary (ISO string, as used
  // by the freshness-reverification suite) or a filter object (directory UI /
  // public API route). A string selects the boundary at a specific instant;
  // filter objects always evaluate the boundary "now".
  const filters =
    typeof nowIsoOrFilters === "string" ? undefined : nowIsoOrFilters;
  const nowIso =
    typeof nowIsoOrFilters === "string"
      ? nowIsoOrFilters
      : new Date().toISOString();
  const parameters: string[] = [];
  // Public freshness boundary: only `demo` records and `verified` records still
  // inside their review window (or without a schedule, i.e. not provably stale)
  // are presented as current. This mirrors isPubliclyCurrent() in db/freshness.ts.
  let query = "SELECT id, title, kind, CASE WHEN publish_manufacturer = 1 THEN manufacturer ELSE NULL END AS manufacturer, CASE WHEN publish_observed_on = 1 THEN observed_on ELSE NULL END AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, latitude, longitude, status, source, updated, description, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, created_at AS createdAt FROM cameras WHERE status IN ('verified', 'demo') AND (status = 'demo' OR review_due_at IS NULL OR review_due_at >= ?)";
  parameters.push(nowIso);
  if (filters?.kind) {
    query += " AND kind = ?";
    parameters.push(filters.kind);
  }
  if (filters?.freshness && filters.freshness !== "all") {
    query += " AND updated >= ?";
    parameters.push(freshnessCutoff(filters.freshness));
    // A freshness window matches only ISO verification timestamps. Non-ISO
    // labels (illustrative demo placeholders, pre-backfill prose) must never
    // be presented as freshly verified — the UI applies the same rule.
    query += " AND updated GLOB '[0-9][0-9][0-9][0-9]-*'";
  }
  query += " ORDER BY id DESC";
  const result = await d1.prepare(query).bind(...parameters).all<PublicCameraRecord>();
  return result.results;
}
export type NearbyPublicCameraRecord = PublicCameraRecord & { distanceMeters: number };
function distanceInMeters(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) { const earthRadiusMeters = 6_371_000; const toRadians = (degrees: number) => degrees * Math.PI / 180; const latitudeDelta = toRadians(toLatitude - fromLatitude); const longitudeDelta = toRadians(toLongitude - fromLongitude); const latitudeStart = toRadians(fromLatitude); const latitudeEnd = toRadians(toLatitude); const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeStart) * Math.cos(latitudeEnd) * Math.sin(longitudeDelta / 2) ** 2; return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)); }
export type DuplicateCandidateRecord = NearbyPublicCameraRecord & { similarity: number; matchStrength: MatchStrength };
export async function findNearbyPublicCameras(latitude: number, longitude: number, radiusMeters: number, duplicateInput?: { title?: string; address?: string; kind?: string }): Promise<DuplicateCandidateRecord[]> { const records = await listPublicCameras(); const submittedText = [duplicateInput?.title, duplicateInput?.address, duplicateInput?.kind].filter(Boolean).join(" "); const hasTextSignal = submittedText.trim().length > 0; return records.map((record) => { const distanceMeters = distanceInMeters(latitude, longitude, record.latitude, record.longitude); const similarity = hasTextSignal ? textSimilarity(submittedText, [record.title, record.address ?? "", record.kind].join(" ")) : 0; return { ...record, distanceMeters, similarity, matchStrength: classifyDuplicateMatch(distanceMeters, similarity, hasTextSignal) }; }).filter((record) => record.distanceMeters <= radiusMeters).sort((first, second) => first.distanceMeters - second.distanceMeters || second.similarity - first.similarity).slice(0, 8); }
export async function createPendingCamera(input: { title: string; kind: string; manufacturer: string | null; observedOn: string | null; address: string; notes: string; latitude: number; longitude: number }): Promise<CameraRecord> { const d1 = await getD1(); const now = new Date().toISOString(); const result = await d1.prepare("INSERT INTO cameras (title, kind, manufacturer, observed_on, publish_manufacturer, publish_observed_on, address, notes, latitude, longitude, status, source, updated, description, created_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, 'pending', 'Community report', 'Submitted just now', '', ?) RETURNING id, title, kind, manufacturer, observed_on AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, notes, latitude, longitude, status, source, updated, description, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, created_at AS createdAt").bind(input.title, input.kind, input.manufacturer, input.observedOn, input.address || null, input.notes, input.latitude, input.longitude, now).first<CameraRecord>(); if (!result) throw new Error("Report could not be stored"); return result; }
export async function getPublicCameraById(id: number, nowIso: string = new Date().toISOString()): Promise<PublicCameraRecord | null> {
  const d1 = await getD1();
  const result = await d1
    .prepare(
      "SELECT id, title, kind, CASE WHEN publish_manufacturer = 1 THEN manufacturer ELSE NULL END AS manufacturer, CASE WHEN publish_observed_on = 1 THEN observed_on ELSE NULL END AS observedOn, publish_manufacturer AS publishManufacturer, publish_observed_on AS publishObservedOn, address, latitude, longitude, status, source, updated, description, last_verified_at AS lastVerifiedAt, review_due_at AS reviewDueAt, review_interval_months AS reviewIntervalMonths, created_at AS createdAt FROM cameras WHERE id = ? AND status IN ('verified', 'demo') AND (status = 'demo' OR review_due_at IS NULL OR review_due_at >= ?)",
    )
    .bind(id, nowIso)
    .first<PublicCameraRecord>();
  return result ?? null;
}
