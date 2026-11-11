"use client";

// The contributor's own contributions list (COMMUNITY_PLAN §2.3, C5): one
// row per contribution with kind icon, linked title, date, status and an
// "Edit" link for the owner only (every row here IS the owner's; the link
// appears on editable camera contributions, pointing at /records/[id]/edit).

import Link from "next/link";
import { useMessages } from "../lib/use-messages";
import { useLocale } from "../components/LocaleProvider";
import { formatPublicDate } from "../lib/format-date";
import type { Contribution } from "../lib/useContributions";
import { ContributionKindIcon } from "./ContributionKindIcon";

/**
 * A camera contribution is editable by its owner when its status is not
 * terminal: pending → direct PATCH, verified/needs_review/stale → moderated
 * edit request (COMMUNITY_PLAN §2.2). removed/rejected are never editable
 * (409 server-side); corrections have no edit page.
 */
function isEditable(contribution: Contribution): boolean {
  return (
    contribution.type === "camera"
    && contribution.status !== "removed"
    && contribution.status !== "rejected"
  );
}

/**
 * Resolve the human label for a contribution status row: the shared record
 * vocabulary first, then the profile-filter vocabulary, then the literal
 * fallback — never the raw status key on screen (rework 2026-08-08 fixed
 * approved/reviewed/stale falling through to the literal "Status").
 */
function contributionStatusLabel(
  status: string,
  statuses: Record<string, string>,
  statusFilters: Record<string, string>,
  fallback: string,
): string {
  return statuses[status] ?? statusFilters[status] ?? fallback;
}

export function ContributionList({ contributions }: { contributions: Contribution[] }) {
  const bundle = useMessages();
  const t = bundle.auth;
  const community = bundle.community;
  const correctionLabels = bundle.correction;
  const statuses = bundle.status;
  const { locale } = useLocale();

  return (
    <ul className="auth-submissions contributions-list" aria-label={community.yourContributions}>
      {contributions.map((contribution) => {
        const statusLabel = contributionStatusLabel(
          contribution.status,
          statuses as unknown as Record<string, string>,
          community.statusFilters as unknown as Record<string, string>,
          t.submissionStatus,
        );
        const kindLabel = community.typeLabels[contribution.type];
        const issueLabel = contribution.issueType
          ? (correctionLabels[contribution.issueType as keyof typeof correctionLabels] as string | undefined)
          : undefined;
        // correction: link the related public record
        // when the camera still exists (cameraId set).
        const relatedHref = contribution.cameraId != null
          ? `/records/${contribution.cameraId}`
          : null;
        const title = contribution.type === "camera"
          ? (contribution.title ?? kindLabel)
          : (issueLabel ? `${kindLabel}: ${issueLabel}` : kindLabel);
        return (
          <li key={`${contribution.type}-${contribution.id}`} className="contribution-row">
            <span className="contribution-kind-icon" aria-hidden="true">
              <ContributionKindIcon kind={contribution.type} />
            </span>
            <span className="contribution-main">
              {contribution.type === "camera" ? (
                <Link href={`/records/${contribution.id}`}>{title}</Link>
              ) : relatedHref ? (
                <Link href={relatedHref}>{title}</Link>
              ) : (
                <span>{title}</span>
              )}
              <span className="contribution-meta">
                {kindLabel}
                {" · "}
                <time dateTime={contribution.createdAt}>
                  {formatPublicDate(contribution.createdAt, locale)}
                </time>
              </span>
            </span>
            <span className="contribution-status">
              <span className={`status-dot ${contribution.status}`} aria-hidden="true" />
              <span>{statusLabel}</span>
            </span>
            {isEditable(contribution) ? (
              <Link className="text-button contributions-edit" href={`/records/${contribution.id}/edit`}>
                {community.editContribution}
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
