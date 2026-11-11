"use client";

// Global summary strip (account rework 2026-08-08): counts are independent
// of the active filters — they answer "what do I have in the queue?"
// without scrolling or filtering. role=status on the in-moderation card: it
// is the one that changes after a moderation action.

import { useDomainMessages } from "../lib/use-domain-messages";
import { communityByLocale } from "../lib/i18n/community";
import type { ContributionSummary } from "../lib/useContributions";
import { ContributionKindIcon } from "./ContributionKindIcon";

export function ContributionStats({ summary }: { summary: ContributionSummary }) {
  const community = useDomainMessages(communityByLocale);
  return (
    <div className="account-stats" role="group" aria-label={community.statsGroupLabel}>
      <div className="account-stat">
        <span className="account-stat-icon"><ContributionKindIcon kind="camera" /></span>
        <span className="account-stat-value" aria-label={`${community.stats.camera}: ${summary.byType.camera}`}>{summary.byType.camera}</span>
        <span className="account-stat-label">{community.stats.camera}</span>
      </div>
      <div className="account-stat">
        <span className="account-stat-icon"><ContributionKindIcon kind="correction" /></span>
        <span className="account-stat-value" aria-label={`${community.stats.correction}: ${summary.byType.correction}`}>{summary.byType.correction}</span>
        <span className="account-stat-label">{community.stats.correction}</span>
      </div>
      <div className="account-stat" role="status">
        <span className="account-stat-icon account-stat-icon-clock">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <span className="account-stat-value" aria-label={`${community.stats.inModeration}: ${summary.byStatus.pending ?? 0}`}>{summary.byStatus.pending ?? 0}</span>
        <span className="account-stat-label">{community.stats.inModeration}</span>
      </div>
    </div>
  );
}
