import { getD1 } from "../cameras";
import type { ContributorSubmission } from "./types";

// ---------------------------------------------------------------------------
// Contributor's own submissions
// ---------------------------------------------------------------------------

/**
 * The reports a contributor submitted (attributed rows only). Used by the
 * account page; anonymous submissions are never attributable, by design.
 */
export async function listContributorSubmissions(contributorId: number): Promise<ContributorSubmission[]> {
  const d1 = await getD1();
  const result = await d1
    .prepare(
      "SELECT id, title, status, created_at AS createdAt FROM cameras WHERE contributor_id = ? ORDER BY created_at DESC, id DESC LIMIT 50",
    )
    .bind(contributorId)
    .all<ContributorSubmission>();
  return result.results;
}

// ---------------------------------------------------------------------------
// Contributor's own contributions (COMMUNITY_PLAN §2.3, C2)
// ---------------------------------------------------------------------------

/** The two contribution kinds the profile list can filter on. */
export const CONTRIBUTION_TYPES = ["camera", "correction"] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

/** Whitelist of contribution statuses accepted by the profile list filter. */
export const CONTRIBUTION_STATUSES = [
  "pending",
  // Post-migration 0039 the public camera domain status is "active"
  // (verified/needs_review/stale → active, rejected → removed); the legacy
  // "verified" key stays in the whitelist only for historical queries.
  "active",
  "verified",
  "needs_review",
  "stale",
  "rejected",
  "removed",
  "reviewed",
  "approved",
] as const;

/** One row of the paginated profile contributions list (C2). */
export type ContributorContribution = {
  type: ContributionType;
  id: number;
  /** camera: title; correction: null (no public title of their own). */
  title: string | null;
  /** correction: issue_type; camera: null. */
  issueType: string | null;
  /** correction: linked camera; camera: null (it is the camera). */
  cameraId: number | null;
  status: string;
  createdAt: string;
};

export type ContributionsPage = {
  contributions: ContributorContribution[];
  /** Total number of rows matching the filters, independent of the page. */
  total: number;
};

/**
 * Paginated profile contributions list (COMMUNITY_PLAN §2.3, C2).
 *
 * Replaces the old LIMIT-50 `listContributorSubmissions` (kept for backward
 * compatibility) with a bounded, filterable list over the two contribution
 * kinds: attributed camera reports and filed corrections.
 * Only rows attributed to the caller are ever returned; anonymous
 * submissions are not attributable and therefore never listed.
 *
 * `type` (whitelist) restricts to one kind, `status` (whitelist) to one
 * status. `limit` is clamped to [1, 100] and `offset` to >= 0 at the db
 * boundary, so a caller can never request an unbounded page. The ORDER BY
 * (created_at DESC, id DESC) matches the old submissions ordering and is
 * served by the (contributor_id, created_at DESC) index added in migration
 * 0025 for cameras; correction_requests already carries a
 * (contributor_id) index from migration 0022.
 */
export async function listContributorContributions(
  contributorId: number,
  filters: {
    type?: ContributionType;
    status?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<ContributionsPage> {
  const d1 = await getD1();
  // Defensive clamp: the route already validates, but the db boundary never
  // trusts its caller with an unbounded page size.
  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 25) || 25, 1), 100);
  const offset = Math.max(Math.trunc(filters.offset ?? 0) || 0, 0);

  const types: ContributionType[] = filters.type ? [filters.type] : [...CONTRIBUTION_TYPES];
  const status = filters.status ?? null;

  // One UNION ALL over the two contribution tables: each branch projects
  // the shared shape (type, id, title, issue_type, camera_id, status,
  // created_at) with NULLs for the columns the table does not have. The
  // per-branch contributor_id predicate plus the global ORDER BY keep the
  // whole list time-consistent and index-friendly.
  const branches: string[] = [];
  const parameters: (string | number)[] = [];
  for (const type of types) {
    const params: (string | number)[] = [contributorId];
    if (status) params.push(status);
    switch (type) {
      case "camera":
        branches.push(
          `SELECT 'camera' AS type, id, title, NULL AS issueType, NULL AS cameraId, status, created_at AS createdAt FROM cameras WHERE contributor_id = ?${status ? " AND status = ?" : ""}`,
        );
        break;
      case "correction":
        branches.push(
          `SELECT 'correction' AS type, id, NULL AS title, issue_type AS issueType, camera_id AS cameraId, status, created_at AS createdAt FROM correction_requests WHERE contributor_id = ?${status ? " AND status = ?" : ""}`,
        );
        break;
    }
    parameters.push(...params);
  }

  // Total matching rows (same predicate, no page) for the pagination object.
  const countParameters = [...parameters];
  const countResult = await d1
    .prepare(`SELECT COUNT(*) AS n FROM (${branches.join(" UNION ALL ")})`)
    .bind(...countParameters)
    .first<{ n: number }>();
  const total = Number(countResult?.n ?? 0);

  if (total === 0) {
    return { contributions: [], total: 0 };
  }

  const pageParameters = [...parameters, limit, offset];
  const page = await d1
    .prepare(`${branches.join(" UNION ALL ")} ORDER BY createdAt DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...pageParameters)
    .all<ContributorContribution>();
  return { contributions: page.results, total };
}

// ---------------------------------------------------------------------------
// Contribution summary (account page stats, C7 rework 2026-08-08)
// ---------------------------------------------------------------------------

/** Global per-type and per-status counts for the caller's own contributions. */
export type ContributionSummary = {
  total: number;
  byType: Record<ContributionType, number>;
  byStatus: Record<string, number>;
};

/**
 * One grouped query over the two contribution tables — global totals,
 * INDEPENDENT of any list filter, so the account page can render the
 * summary strip ("X in moderation · Y published …") without an extra
 * endpoint. Anonymous rows (contributor_id NULL) never count: the profile
 * list shows only attributed contributions (ADR 0013).
 */
export async function summarizeContributorContributions(contributorId: number): Promise<ContributionSummary> {
  const d1 = await getD1();
  const result = await d1
    .prepare(
      `SELECT type, status, COUNT(*) AS n FROM (
        SELECT 'camera' AS type, status FROM cameras WHERE contributor_id = ?
        UNION ALL
        SELECT 'correction', status FROM correction_requests WHERE contributor_id = ?
      ) GROUP BY type, status`,
    )
    .bind(contributorId, contributorId)
    .all<{ type: ContributionType; status: string; n: number }>();

  const summary: ContributionSummary = {
    total: 0,
    byType: { camera: 0, correction: 0 },
    byStatus: {},
  };
  for (const row of result.results) {
    const n = Number(row.n) || 0;
    summary.total += n;
    summary.byType[row.type] = (summary.byType[row.type] ?? 0) + n;
    summary.byStatus[row.status] = (summary.byStatus[row.status] ?? 0) + n;
  }
  return summary;
}

/**
 * Count the contributor's active camera reports — the ONLY number that
 * feeds the trust level (ADR 0018 §3, ADR 0021 §12.1: after migration 0039
 * the domain status is "active"). The (contributor_id, status) index from
 * migration 0023 makes this an index-only COUNT. Kept as
 * `countVerifiedCameras` for backward compatibility; the name remains the
 * same for existing importers.
 */
export async function countVerifiedCameras(contributorId: number): Promise<number> {
  const d1 = await getD1();
  const result = await d1
    .prepare("SELECT COUNT(*) AS n FROM cameras WHERE contributor_id = ? AND status = 'active'")
    .bind(contributorId)
    .first<{ n: number }>();
  return Number(result?.n ?? 0);
}
