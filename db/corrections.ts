import { getD1 } from "./cameras";

export type CorrectionRequest = {
  id: number;
  cameraId: number | null;
  issueType: string;
  message: string;
  contact: string | null;
  status: string;
  createdAt: string;
};

const createTable = "CREATE TABLE IF NOT EXISTS correction_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, camera_id INTEGER, issue_type TEXT NOT NULL, message TEXT NOT NULL, contact TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL)";
const createIndex = "CREATE INDEX IF NOT EXISTS correction_requests_status_idx ON correction_requests(status)";

export async function createCorrectionRequest(input: { cameraId: number | null; issueType: string; message: string; contact: string }): Promise<CorrectionRequest> {
  const d1 = await getD1();
  await d1.batch([d1.prepare(createTable), d1.prepare(createIndex)]);
  const createdAt = new Date().toISOString();
  const result = await d1.prepare("INSERT INTO correction_requests (camera_id, issue_type, message, contact, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?) RETURNING id, camera_id AS cameraId, issue_type AS issueType, message, contact, status, created_at AS createdAt").bind(input.cameraId, input.issueType, input.message, input.contact || null, createdAt).first<CorrectionRequest>();
  if (!result) throw new Error("Correction request could not be saved");
  return result;
}
