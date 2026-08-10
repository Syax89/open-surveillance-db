"use client";

// API-key list row (api-keys epic T18). Presentational, receives the auth
// bundle + locale from the section (date formatting is registry-driven via
// LOCALE_BCP47, never a ternary). Contract (plan §3.1):
//  - name + monospace key-prefix chip (the ONLY key material shown — the
//    GET payload is metadata only, D3/P1-2);
//  - Created, "Last used"/"Never used";
//  - Expires — the key's expiry date (or "Never"/"Mai" when it does not
//    expire), shown next to Last used (F2: expiry was invisible in the UI
//    even though the model/API/docs carry expiresAt — default +365d, null
//    = never);
//  - scope badges (one per granted write scope, D4 family);
//  - status dot + label "Active"/"Revoked" — colour never alone (WCAG
//    1.4.1), the label carries the meaning;
//  - revoked rows are muted and expose NO actions; active rows carry the
//    "Revoke" trigger (aria-haspopup="dialog", opens ConfirmDialog).

import type { Locale } from "../lib/i18n";
import { formatPublicDate } from "../lib/format-date";
import { API_KEY_SCOPE_LABELS } from "../lib/useApiKeys";
import type { ApiKey } from "../lib/useApiKeys";

type Props = {
  apiKey: ApiKey;
  t: Record<string, string>;
  locale: Locale;
  revoking: boolean;
  onRevoke: (apiKey: ApiKey) => void;
};

export function ApiKeyRow({ apiKey, t, locale, revoking, onRevoke }: Props) {
  const revoked = apiKey.revokedAt !== null;
  const created = formatPublicDate(apiKey.createdAt, locale);
  const lastUsed = apiKey.lastUsedAt ? formatPublicDate(apiKey.lastUsedAt, locale) : t.apiKeyLastUsedNever;
  const expires = apiKey.expiresAt ? formatPublicDate(apiKey.expiresAt, locale) : t.apiKeyExpiresNever;

  return (
    <li className={`api-key-row${revoked ? " api-key-row-revoked" : ""}`}>
      <div className="api-key-row-main">
        <span className="api-key-name">{apiKey.name}</span>
        <code className="api-key-prefix" aria-label={t.apiKeyNameLabel}>
          {apiKey.keyPrefix}…
        </code>
      </div>
      <dl className="api-key-row-meta">
        <div>
          <dt>{t.apiKeyCreatedLabel}</dt>
          <dd>{created}</dd>
        </div>
        <div>
          <dt>{t.apiKeyLastUsedLabel}</dt>
          <dd>{lastUsed}</dd>
        </div>
        <div>
          <dt>{t.apiKeyExpiresLabel}</dt>
          <dd>{expires}</dd>
        </div>
      </dl>
      <div className="api-key-row-scopes" aria-label={t.apiKeyScopesLabel}>
        {apiKey.scopes.map((scope) => (
          <span key={scope} className="api-key-scope-badge">
            {t[API_KEY_SCOPE_LABELS[scope as keyof typeof API_KEY_SCOPE_LABELS]] ?? scope}
          </span>
        ))}
      </div>
      <span className="api-key-status">
        <span className={`status-dot ${revoked ? "removed" : "verified"}`} aria-hidden="true" />
        {revoked ? t.apiKeyStatusRevoked : t.apiKeyStatusActive}
      </span>
      {!revoked ? (
        <button
          type="button"
          className="text-button"
          disabled={revoking}
          aria-haspopup="dialog"
          onClick={() => onRevoke(apiKey)}
        >
          {t.apiKeyRevoke}
        </button>
      ) : null}
    </li>
  );
}
