"use client";

// Contributions section of /account (COMMUNITY_PLAN §2.3, C5), extracted
// from AccountPageBody. useContributions owns the paginated list from
// GET /api/auth/me/contributions (canonical F0 contract) with LOCAL
// status/type filters; this component composes the summary strip, the
// filter fieldset, honest empty states, the list and the pager. A session
// loss flips the page to the logged-out state; the list meta keeps the
// trust badge fresh.

import Link from "next/link";
import { useDomainMessages } from "../lib/use-domain-messages";
import { authByLocale } from "../lib/i18n/auth";
import { communityByLocale } from "../lib/i18n/community";
import { useContributions } from "../lib/useContributions";
import type { TrustLevelMeta } from "../lib/trust-levels";
import { ContributionStats } from "./ContributionStats";
import { ContributionFilters } from "./ContributionFilters";
import { ContributionList } from "./ContributionList";

type Props = {
  /** Loaded session profile: the list refetches when it changes. */
  contributor: object;
  /** Must be referentially stable (it is an effect dependency). */
  onSessionLost: () => void;
  /** Must be referentially stable (it is an effect dependency). */
  onLevel: (level: TrustLevelMeta | null) => void;
};

export function ContributionsSection({ contributor, onSessionLost, onLevel }: Props) {
  const t = useDomainMessages(authByLocale);
  const community = useDomainMessages(communityByLocale);
  const {
    contributions, pagination, filter, typeFilter, summary, page,
    contributionsLoading, contributionsError,
    selectFilter, selectTypeFilter, clearContributionFilters, goToPage,
  } = useContributions(contributor, onSessionLost, onLevel);

  return (
    <section aria-labelledby="contributions-title">
      <div className="account-section-header">
        <h2 id="contributions-title">{community.yourContributions}</h2>
        {/* No contributions at all: the empty state below carries the one
            primary action, so the header does not repeat it (2026-11). */}
        {summary?.total === 0 ? null : (
          <div className="account-section-actions">
            <Link className="button detail-outline" href="/segnala">{community.newReportCta}</Link>
            <Link className="button detail-outline" href="/correggi">{community.newCorrectionCta}</Link>
          </div>
        )}
      </div>

      {summary && summary.total > 0 ? <ContributionStats summary={summary} /> : null}

      {summary?.total === 0 ? null : <ContributionFilters
        filter={filter}
        typeFilter={typeFilter}
        summary={summary}
        selectFilter={selectFilter}
        selectTypeFilter={selectTypeFilter}
        clearContributionFilters={clearContributionFilters}
      />}

      {contributionsError ? (
        <p className="auth-error" role="alert">{community.errorLoadContributions}</p>
      ) : null}

      {!contributionsError && pagination !== null && pagination.total === 0 ? (
        <>
          <h3>{community.noContributionsYet}</h3>
          <p className="record-detail-summary">
            {filter === "all" && typeFilter === "all" ? community.noContributionsBody : community.noContributionsFiltered}
          </p>
          {filter === "all" && typeFilter === "all" ? (
            <p className="auth-switch">
              <Link className="button button-primary" href="/segnala">{community.newReportCta}</Link>
            </p>
          ) : null}
        </>
      ) : null}

      {!contributionsError && pagination !== null && pagination.total > 0 ? (
        <>
          {/* Polite total counter: announced on load and after a
              filter/page change without stealing focus. */}
          <p className="contributions-total" role="status">
            {community.contributionCount(pagination.total)}
          </p>
          <ContributionList contributions={contributions} />

          {/* Pagination (F0): previous/next with aria-current on the
              current page indicator. */}
          <nav className="contributions-pagination" aria-label={community.contributionsNavigation}>
            <button
              type="button"
              className="button detail-outline"
              disabled={page <= 1 || contributionsLoading}
              onClick={() => goToPage(page - 1)}
            >
              {community.previousPage}
            </button>
            <span className="page-indicator" aria-current="page">
              {community.pageOf(page, pagination.totalPages)}
            </span>
            <button
              type="button"
              className="button detail-outline"
              disabled={!pagination.hasMore || contributionsLoading}
              onClick={() => goToPage(page + 1)}
            >
              {community.nextPage}
            </button>
          </nav>
        </>
      ) : null}

      {contributionsLoading && !contributionsError && pagination === null ? (
        <p>{t.loading}</p>
      ) : null}
    </section>
  );
}
