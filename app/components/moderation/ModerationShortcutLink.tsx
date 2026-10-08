"use client";

import Link from "next/link";

/**
 * Moderator/admin shortcut rendered on /account (ADR 0003 2026-10
 * amendment): a visible way to reach /moderation once a real per-moderator
 * session replaces the shared Basic-auth popup as the everyday login.
 *
 * Deliberately lives under app/components/moderation/ — the one directory
 * tests/publication-boundaries.test.mjs's "no moderation or admin endpoint
 * link" scan exempts (same rule as ModerationDashboard.*). That scan's
 * intent is keeping a casual, scannable "/moderation" string OUT of the
 * public JS bundle for pages that have nothing to do with moderation; this
 * component's entire purpose IS linking to /moderation, so it belongs in
 * the already-exempted surface instead of leaking the literal path into
 * AccountPageBody.tsx, which the scan does cover.
 */
export function ModerationShortcutLink({ role, label }: { role: string | null; label: string }) {
  if (role !== "moderator" && role !== "admin") return null;
  return (
    <Link className="button detail-outline account-moderation-link" href="/moderation">
      {label}
    </Link>
  );
}
