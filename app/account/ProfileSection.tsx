"use client";

// Identity grid (account rework 2026-08-08), extracted from AccountPageBody:
// the profile is a 2-column island — identity + logout on the left, trust
// badge + membership on the right; 1 column on mobile. The session action
// (logout) lives with the identity it ends, not as a stray button before
// the danger zone. Logout itself is page state (it flips the whole page),
// so the handler comes from the parent.

import { useDomainMessages } from "../lib/use-domain-messages";
import { formatPublicDate } from "../lib/format-date";
import { useLocale } from "../components/LocaleProvider";
import { authByLocale } from "../lib/i18n/auth";
import { ModerationShortcutLink } from "../components/moderation/ModerationShortcutLink";
import { DisplayNameField } from "./DisplayNameField";
import type { Contributor } from "./account-types";

type Props = {
  contributor: Contributor;
  /** Coarse users.role: only "moderator"/"admin" unlocks the shortcut. */
  role: string | null;
  onContributorUpdated: (contributor: Contributor) => void;
  onLogout: () => void;
};

export function ProfileSection({ contributor, role, onContributorUpdated, onLogout }: Props) {
  const t = useDomainMessages(authByLocale);
  const { locale } = useLocale();
  // Same long, locale-aware, UTC date as the rest of the site (was the
  // browser default "11/12/2026": US order, ambiguous for Italian readers).
  const memberSince = formatPublicDate(contributor.createdAt, locale);

  return (
    <section aria-labelledby="profile-title" className="account-profile-grid">
      <div className="account-identity">
        <h2 id="profile-title">{t.profileSection}</h2>
        <dl className="record-detail-list">
          <dt>{t.emailLabel}</dt>
          <dd>{contributor.email}</dd>
          <dt>{t.displayNameLabel}</dt>
          <dd>
            <DisplayNameField contributor={contributor} onContributorUpdated={onContributorUpdated} />
          </dd>
          <dt>{t.memberSince}</dt>
          <dd>{memberSince}</dd>
        </dl>
        <button className="button detail-outline account-logout" type="button" onClick={onLogout}>
          {t.logout}
        </button>
        <ModerationShortcutLink role={role} label={t.goToModeration} />
      </div>
    </section>
  );
}
