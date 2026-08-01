"use client";

import { badgeKeyForLevel } from "../lib/trust-levels";
import { useMessages } from "./LocaleProvider";

/**
 * Trust-level badge (COMMUNITY_PLAN §6.3 C1 — Vera's design).
 *
 * The UI shows exactly ONE badge at a time, chosen from the three public
 * badge keys (New / Trusted / Experienced contributor) via the frozen
 * L0–L4 mapping in trust-levels.ts. Rendered as the existing `.card-topline`
 * row (small caps label + status dot), so it never depends on colour alone:
 * the badge text is the accessible label.
 *
 * The numeric level and the verified count are NEVER rendered — the badge
 * is public, the weight is private (COMMUNITY_PLAN §3.2). The progress
 * line is textual only ("X verified contributions to reach the next trust
 * level"), never a bar (design C1). At L4 `nextThreshold` is null and the
 * progress line is omitted entirely.
 */
export function LevelBadge({
  level,
  verifiedCount,
  nextThreshold,
}: {
  level: number;
  verifiedCount: number;
  nextThreshold: number | null;
}) {
  const bundle = useMessages();
  const t = bundle.community;
  const badgeKey = badgeKeyForLevel(level);
  const remaining = nextThreshold === null ? 0 : Math.max(nextThreshold - verifiedCount, 0);

  return (
    <div className="level-badge">
      <p className="card-topline">
        <span className="status-dot community-level" aria-hidden="true" />
        {t.badgeLabels[badgeKey]}
      </p>
      {nextThreshold !== null ? (
        <p className="level-progress">{t.progressToNextLevel(remaining)}</p>
      ) : null}
    </div>
  );
}
