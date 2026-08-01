import { getD1 } from "./cameras";

/**
 * Correction/removal intake (COMMUNITY_PLAN §2.4, C4).
 *
 * The intake accepts exactly five issue types; the whitelist lives here so
 * the route and the moderation UI share one source of truth:
 *
 *   inaccurate | missing | removal | abuse | other
 *
 * `removal`/`abuse` never accept free text (A2): a request whose
 * `issueType` is outside the whitelist is rejected by the route even if the
 * message body contains the word. The whitelist is a BREAKING CHANGE from
 * the historical free-text intake (see corrections-intake-contract.test.mjs).
 */
export const CORRECTION_ISSUE_TYPES = [
  "inaccurate",
  "missing",
  "removal",
  "abuse",
  "other",
] as const;

export type CorrectionIssueType = (typeof CORRECTION_ISSUE_TYPES)[number];

export type CorrectionRequest = {
  id: number;
  cameraId: number | null;
  issueType: string;
  message: string;
  contact: string | null;
  contributorId: number | null;
  status: string;
  outcome: string | null;
  createdAt: string;
};

/**
 * Discriminated result of the intake write. The route maps `duplicate_open`
 * and `already_removed` to 409; every other failure mode stays an exception
 * (500).
 */
export type CreateCorrectionResult =
  | { kind: "created"; correction: CorrectionRequest }
  | { kind: "duplicate_open" }
  | { kind: "already_removed" };

/**
 * The `correction_requests` table and its index are applied by the Drizzle
 * migrations in `drizzle/`; this function performs no runtime bootstrap.
 *
 * A5 dedupe (spam-of-reports protection) — one open report per (submitter,
 * target), enforced inside the write path so no route can bypass it:
 *
 *   1. an open (`status = 'pending'`) report for the same (contributor,
 *      camera) answers `duplicate_open` (409). Two partial unique indexes
 *      (migration 0024) make this race-safe at the DB level for both
 *      logged-in reporters (`camera_id, contributor_id`) and anonymous ones
 *      (`camera_id` alone — NULLs are distinct in a plain UNIQUE, so the
 *      predicate disambiguates). Anonymous reporters are keyed only by
 *      "no contributor_id": no IP or other identifier is ever stored.
 *   2. a repeat report by the same submitter on a target that was already
 *      removed following their report (`status='reviewed' AND
 *      outcome='removed'`) answers `already_removed` (409).
 *
 * Targetless reports (`cameraId = null`) cannot be deduped per-target and
 * stay allowed; the per-IP `submit` rate bucket bounds them (A4).
 *
 * `contributorId` is nullable (NULL = anonymous, reporter privacy) and NEVER
 * cascades on contributor deletion — de-attribution is explicit in
 * `eraseContributor`, exactly like `cameras.contributor_id` (ADR 0013/0018).
 */
export async function createCorrectionRequest(input: {
  cameraId: number | null;
  issueType: string;
  message: string;
  contact: string;
  contributorId?: number | null;
}): Promise<CreateCorrectionResult> {
  const d1 = await getD1();
  const contributorId = input.contributorId ?? null;
  const createdAt = new Date().toISOString();

  if (input.cameraId !== null) {
    const open = await d1
      .prepare(
        contributorId === null
          ? "SELECT 1 AS ok FROM correction_requests WHERE camera_id = ? AND contributor_id IS NULL AND status = 'pending'"
          : "SELECT 1 AS ok FROM correction_requests WHERE camera_id = ? AND contributor_id = ? AND status = 'pending'",
      )
      .bind(...(contributorId === null ? [input.cameraId] : [input.cameraId, contributorId]))
      .first<{ ok: number }>();
    if (open) return { kind: "duplicate_open" };

    const priorRemoval = await d1
      .prepare(
        contributorId === null
          ? "SELECT 1 AS ok FROM correction_requests WHERE camera_id = ? AND contributor_id IS NULL AND status = 'reviewed' AND outcome = 'removed'"
          : "SELECT 1 AS ok FROM correction_requests WHERE camera_id = ? AND contributor_id = ? AND status = 'reviewed' AND outcome = 'removed'",
      )
      .bind(...(contributorId === null ? [input.cameraId] : [input.cameraId, contributorId]))
      .first<{ ok: number }>();
    if (priorRemoval) return { kind: "already_removed" };
  }

  // Race-safe insert: the two partial unique indexes from migration 0024
  // make concurrent duplicate reports yield exactly one row; a targetless
  // `ON CONFLICT DO NOTHING` swallows the conflict and returns no row, which
  // the caller maps to `duplicate_open`. Inputs are already validated by the
  // route (whitelist + cleanText bounds), so no other constraint can fire.
  const result = await d1
    .prepare(
      "INSERT INTO correction_requests (camera_id, issue_type, message, contact, contributor_id, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT DO NOTHING RETURNING id, camera_id AS cameraId, issue_type AS issueType, message, contact, contributor_id AS contributorId, status, outcome, created_at AS createdAt",
    )
    .bind(
      input.cameraId,
      input.issueType,
      input.message,
      input.contact || null,
      contributorId,
      createdAt,
    )
    .first<CorrectionRequest>();
  if (!result) return { kind: "duplicate_open" };
  return { kind: "created", correction: result };
}
