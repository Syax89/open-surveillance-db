"use client";

// Contributions-list hook for the /account dashboard (COMMUNITY_PLAN §2.3,
// C5). Extracted from AccountPageBody: owns the LOCAL status/type filters
// (useState — the private profile is never shareable, so the filter state
// deliberately stays out of the URL), the pagination and the global summary
// strip, and refetches GET /api/auth/me/contributions whenever the filter,
// the page or the loaded contributor changes. Nothing here renders JSX.

import { useCallback, useEffect, useState } from "react";
import { useMessages } from "./use-messages";
import type { TrustLevelMeta } from "./trust-levels";

export type Contribution = {
  type: "camera" | "correction";
  id: number;
  title: string | null;
  issueType: string | null;
  cameraId: number | null;
  status: string;
  createdAt: string;
};

/**
 * Global per-type/per-status counts (account rework 2026-08-08) — always
 * the caller's OWN totals, independent of the active filters, powering the
 * summary strip ("3 in moderation · 12 published …"). Present in every
 * /me/contributions response.
 */
export type ContributionSummary = {
  total: number;
  byType: Record<"camera" | "correction", number>;
  byStatus: Record<string, number>;
};

type ContributionsPage = {
  contributions: Contribution[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  summary?: ContributionSummary;
};

export type ContributionsPagination = { page: number; totalPages: number; hasMore: boolean; total: number };

const PAGE_SIZE = 25;

/** Local filter keys — deliberately NOT in the URL (private page, C6/C5). */
export const STATUS_FILTERS = ["all", "pending", "active", "needs_review", "removed", "rejected"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Local type filter keys — same rule as the status filters (private page). */
export const TYPE_FILTERS = ["all", "camera", "correction"] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

/**
 * @param contributor the loaded session profile (null = no fetch); the list
 *   refetches whenever the profile object changes, as before the split.
 * @param onSessionLost a 401 flips the page to the logged-out state.
 * @param onLevel the list meta carries the freshest trust level.
 */
export function useContributions(
  contributor: object | null,
  onSessionLost: () => void,
  onLevel: (level: TrustLevelMeta | null) => void,
) {
  const t = useMessages().auth;
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [pagination, setPagination] = useState<ContributionsPagination | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  // Global totals (account rework 2026-08-08): loaded with the first
  // contributions response, never re-fetched per filter/page — the strip
  // answers "what do I have in the queue?" regardless of the active list.
  const [summary, setSummary] = useState<ContributionSummary | null>(null);
  const [page, setPage] = useState(1);
  const [contributionsLoading, setContributionsLoading] = useState(false);
  const [contributionsError, setContributionsError] = useState(false);

  // Cache-Control: no-store on the API; the page never shares this URL
  // (filters are local state, §2.3). All setState calls happen in promise
  // continuations — nothing runs synchronously in the effect body
  // (react-hooks/set-state-in-effect), same pattern as VerificationWidget.
  const loadContributions = useCallback((nextFilter: StatusFilter, nextType: TypeFilter, nextPage: number) => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
    if (nextFilter !== "all") query.set("status", nextFilter);
    if (nextType !== "all") query.set("type", nextType);
    Promise.resolve()
      .then(() => { setContributionsLoading(true); setContributionsError(false); })
      .then(() => fetch(`/api/auth/me/contributions?${query.toString()}`, { signal: controller.signal }))
      .then(async (response) => {
        if (response.status === 401) {
          onSessionLost();
          return;
        }
        if (!response.ok) throw new Error(t.errorGeneric);
        const body = (await response.json()) as ContributionsPage;
        setContributions(body.contributions);
        setPagination({
          page: body.pagination.page,
          totalPages: body.pagination.totalPages,
          hasMore: body.pagination.hasMore,
          total: body.pagination.total,
        });
        // Global summary strip: captured from the first (unfiltered) page
        // load; the same response carries it on every filter/page request
        // but the totals never depend on the active list.
        if (body.summary) setSummary(body.summary);
        // The list response also carries the level in its meta; using the
        // freshest value keeps the badge in sync after a moderation change.
        onLevel((body as { level?: TrustLevelMeta }).level ?? null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setContributionsError(true);
      })
      .finally(() => setContributionsLoading(false));
    return () => controller.abort();
  }, [t.errorGeneric, onSessionLost, onLevel]);

  useEffect(() => {
    if (contributor === null) return;
    const cancel = loadContributions(filter, typeFilter, page);
    return cancel;
  }, [contributor, filter, typeFilter, page, loadContributions]);

  function selectFilter(next: StatusFilter) {
    setFilter(next);
    setPage(1);
  }

  function selectTypeFilter(next: TypeFilter) {
    setTypeFilter(next);
    setPage(1);
  }

  function clearContributionFilters() {
    setFilter("all");
    setTypeFilter("all");
    setPage(1);
  }

  function goToPage(next: number) {
    if (pagination && next >= 1 && next <= pagination.totalPages) setPage(next);
  }

  return {
    contributions,
    pagination,
    filter,
    typeFilter,
    summary,
    page,
    contributionsLoading,
    contributionsError,
    selectFilter,
    selectTypeFilter,
    clearContributionFilters,
    goToPage,
  };
}
