"use client";

// API-key list (api-keys epic T18). Presentational: renders the key rows or
// the honest empty state (title + body + primary CTA to open the create
// dialog + secondary link to /api-docs). The section owns loading/error
// states; this component renders only settled content.

import Link from "next/link";
import { useLocale } from "../components/LocaleProvider";
import { useMessages } from "../lib/use-messages";
import { ApiKeyRow } from "./ApiKeyRow";
import type { ApiKey } from "../lib/useApiKeys";

type Props = {
  keys: ApiKey[];
  revokingId: number | null;
  onRevoke: (apiKey: ApiKey) => void;
  onRequestCreate: () => void;
};

export function ApiKeyList({ keys, revokingId, onRevoke, onRequestCreate }: Props) {
  const { locale } = useLocale();
  const t = useMessages().auth;

  if (keys.length === 0) {
    return (
      <div className="api-key-empty">
        <h3>{t.apiKeyEmptyTitle}</h3>
        <p>{t.apiKeyEmptyBody}</p>
        <div className="api-key-empty-actions">
          <button type="button" className="button button-primary" onClick={onRequestCreate}>
            {t.apiKeyCreate}
          </button>
          <Link className="text-button" href="/api-docs">
            {t.apiKeyDocsLink}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ul className="auth-submissions api-key-list" aria-label={t.apiKeysSection}>
      {keys.map((apiKey) => (
        <ApiKeyRow
          key={apiKey.id}
          apiKey={apiKey}
          t={t}
          locale={locale}
          revoking={revokingId === apiKey.id}
          onRevoke={onRevoke}
        />
      ))}
    </ul>
  );
}
