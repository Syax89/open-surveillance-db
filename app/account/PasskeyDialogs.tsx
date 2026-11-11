"use client";

// Passkey dialogs of /account (Fase E2), extracted from AccountPageBody:
// the removal confirmation (shared ConfirmDialog alertdialog) and the
// once-only recovery codes issued by the /complete route. Rendered by the
// page OUTSIDE the account card, after the erasure confirm, as before the
// split; state comes from usePasskeys.

import { useDomainMessages } from "../lib/use-domain-messages";
import { authByLocale } from "../lib/i18n/auth";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { RecoveryCodesDialog } from "../components/RecoveryCodesDialog";
import type { PasskeysApi } from "../lib/usePasskeys";

export function PasskeyDialogs({ api }: { api: PasskeysApi }) {
  const t = useDomainMessages(authByLocale);
  const { confirmRemove, setConfirmRemove, removingId, onRemovePasskey, recoveryCodes, setRecoveryCodes } = api;

  return (
    <>
      <ConfirmDialog
        open={confirmRemove !== null}
        title={t.passkeyRemoveConfirm}
        body={t.passkeyRemoveConfirmBody}
        confirmLabel={t.passkeyRemove}
        cancelLabel={t.passkeyRemoveCancel}
        busyLabel={t.passkeyRemoveBusy}
        busy={removingId !== null}
        onConfirm={() => { if (confirmRemove) void onRemovePasskey(confirmRemove); }}
        onCancel={() => setConfirmRemove(null)}
      />

      <RecoveryCodesDialog
        open={recoveryCodes !== null}
        codes={recoveryCodes ?? []}
        title={t.recoveryTitle}
        body={t.recoveryBody}
        copyLabel={t.recoveryCopy}
        copiedLabel={t.recoveryCopied}
        savedLabel={t.recoverySaved}
        onClose={() => setRecoveryCodes(null)}
      />
    </>
  );
}
