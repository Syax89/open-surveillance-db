import { getD1 } from "./cameras";

export type CorrectionRequest = {
  id: number;
  cameraId: number | null;
  issueType: string;
  message: string;
  contact: string | null;
  status: string;
  outcome: string | null;
  createdAt: string;
};

/**
 * The `correction_requests` table and its index are applied by the Drizzle
 * migrations in `drizzle/`; this function performs no runtime bootstrap.
 */
export async function createCorrectionRequest(input: { cameraId: number | null; issueType: string; message: string; contact: string }): Promise<CorrectionRequest> {
  const d1 = await getD1();
  const createdAt = new Date().toISOString();
  const result = await d1.prepare("INSERT INTO correction_requests (camera_id, issue_type, message, contact, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?) RETURNING id, camera_id AS cameraId, issue_type AS issueType, message, contact, status, outcome, created_at AS createdAt").bind(input.cameraId, input.issueType, input.message, input.contact || null, createdAt).first<CorrectionRequest>();
  if (!result) throw new Error("Correction request could not be saved");
  return result;
}
