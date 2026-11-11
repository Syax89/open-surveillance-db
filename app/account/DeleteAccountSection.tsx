"use client";

// Erasure danger zone of /account, extracted from AccountPageBody. The
// accessible destructive confirmation (ConfirmDialog alertdialog — C6
// replaced window.confirm) and the DELETE itself stay page state: a
// successful erasure flips the whole page, so this section only opens it.

import { useDomainMessages } from "../lib/use-domain-messages";
import { authByLocale } from "../lib/i18n/auth";

export function DeleteAccountSection({ onRequestDelete }: { onRequestDelete: () => void }) {
  const t = useDomainMessages(authByLocale);
  return (
    <section aria-labelledby="delete-account-title" className="auth-danger-zone">
      <h2 id="delete-account-title">{t.deleteAccountSection}</h2>
      <p className="record-detail-summary">{t.deleteAccountHint}</p>
      <button
        className="button detail-outline"
        type="button"
        onClick={onRequestDelete}
        aria-haspopup="dialog"
      >
        {t.deleteAccount}
      </button>
    </section>
  );
}
