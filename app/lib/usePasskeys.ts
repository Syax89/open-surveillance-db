"use client";

// Passkey management hook for the /account dashboard (Fase E2). Extracted
// from AccountPageBody: owns the enrolled list, the enrollment ceremony
// state, the removal confirmation and the once-only recovery codes issued
// by the /complete route. The page calls it (the removal ConfirmDialog and
// the RecoveryCodesDialog render outside the account card, as before the
// split); PasskeysSection and PasskeyDialogs consume the returned API.

import { useCallback, useEffect, useState } from "react";
import { useMessages } from "./use-messages";
import { readCsrfToken } from "./csrf";
import { browserSupportsWebAuthn, createCredential } from "./webauthn-client";

/** Public descriptor of an enrolled passkey (GET /api/auth/passkey/credentials). */
export type Passkey = {
  id: number;
  credentialId: string;
  transports: string | null;
  createdAt: string;
};

export type PasskeysApi = ReturnType<typeof usePasskeys>;

/**
 * @param contributor the loaded session profile (null = no fetch); the list
 *   refetches whenever the profile object changes, as before the split.
 * @param onSessionLost a 401 flips the page to the logged-out state.
 */
export function usePasskeys(contributor: object | null, onSessionLost: () => void) {
  const t = useMessages().auth;
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [passkeysError, setPasskeysError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [passkeyAdded, setPasskeyAdded] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Passkey | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Passkey list: refreshed after every enrollment/removal so the section
  // always mirrors the server. A failure renders an honest inline error
  // and keeps the rest of the page usable.
  const loadPasskeys = useCallback(() => {
    const controller = new AbortController();
    Promise.resolve()
      .then(() => { setPasskeysLoading(true); setPasskeysError(null); })
      .then(() => fetch("/api/auth/passkey/credentials", { signal: controller.signal }))
      .then(async (response) => {
        if (response.status === 401) {
          onSessionLost();
          return;
        }
        if (!response.ok) {
          setPasskeysError(t.passkeysError);
          return;
        }
        const body = (await response.json()) as { credentials?: Passkey[] };
        setPasskeys(body.credentials ?? []);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setPasskeysError(t.passkeysError);
      })
      .finally(() => setPasskeysLoading(false));
    return () => controller.abort();
  }, [t.passkeysError, onSessionLost]);

  useEffect(() => {
    if (contributor === null) return;
    const cancel = loadPasskeys();
    return cancel;
  }, [contributor, loadPasskeys]);

  async function onEnrollPasskey() {
    const csrfToken = readCsrfToken();
    setEnrollError(null);
    setPasskeyAdded(false);
    if (!browserSupportsWebAuthn()) {
      setEnrollError(t.passkeyUnsupported);
      return;
    }
    setEnrolling(true);
    try {
      const beginResponse = await fetch("/api/auth/passkey/register/begin", {
        method: "POST",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (beginResponse.status === 401 || beginResponse.status === 403) {
        // Same-origin fetch: a 403 here is the expired/mismatched CSRF
        // token (backend: "Invalid CSRF token"), never a real cross-site
        // request — surface the actionable message, not errorCrossOrigin.
        setEnrollError(beginResponse.status === 403 ? t.passkeyCsrfExpired : t.passkeySessionLost);
        return;
      }
      if (!beginResponse.ok) {
        setEnrollError(t.passkeyEnrollError);
        return;
      }
      const { options } = await beginResponse.json() as { options: Parameters<typeof createCredential>[0] };

      // The ceremony itself: throws NotAllowedError when the user cancels
      // the device prompt — a silent abort, never an error message.
      const credential = await createCredential(options);

      const completeResponse = await fetch("/api/auth/passkey/register/complete", {
        method: "POST",
        headers: { "content-type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) },
        body: JSON.stringify({ challenge: options.challenge, response: credential }),
      });
      if (completeResponse.status === 409) {
        setEnrollError(t.passkeyAlreadyEnrolled);
        return;
      }
      if (completeResponse.status === 401) {
        setEnrollError(t.passkeySessionLost);
        return;
      }
      if (completeResponse.status === 403) {
        // Same-origin fetch: 403 = CSRF token expired/mismatched.
        setEnrollError(t.passkeyCsrfExpired);
        return;
      }
      if (!completeResponse.ok) {
        setEnrollError(t.passkeyEnrollError);
        return;
      }
      const body = await completeResponse.json() as { credential?: { id: string }; recoveryCodes?: string[] };
      setRecoveryCodes(body.recoveryCodes ?? []);
      setPasskeyAdded(true);
      // Reload the list (the new credential is on the server now); the
      // returned abort function is the effect-cleanup contract, not
      // something to call here.
      void loadPasskeys();
    } catch (reason) {
      if (reason instanceof Error && reason.name === "NotAllowedError") return;
      setEnrollError(t.passkeyEnrollError);
    } finally {
      setEnrolling(false);
    }
  }

  async function onRemovePasskey(passkey: Passkey) {
    const csrfToken = readCsrfToken();
    setPasskeysError(null);
    setRemovingId(passkey.id);
    try {
      const response = await fetch("/api/auth/passkey/credentials", {
        method: "DELETE",
        headers: { "content-type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) },
        body: JSON.stringify({ credentialId: passkey.credentialId }),
      });
      if (!response.ok) {
        if (response.status === 404) setPasskeysError(t.passkeyNotFound);
        else if (response.status === 403) setPasskeysError(t.passkeyCsrfExpired);
        else setPasskeysError(t.passkeyRemoveError);
        return;
      }
      setConfirmRemove(null);
      setPasskeys((current) => current.filter((item) => item.id !== passkey.id));
    } catch {
      setPasskeysError(t.passkeyRemoveError);
    } finally {
      setRemovingId(null);
    }
  }

  return {
    passkeys,
    passkeysLoading,
    passkeysError,
    enrolling,
    enrollError,
    passkeyAdded,
    confirmRemove,
    setConfirmRemove,
    removingId,
    recoveryCodes,
    setRecoveryCodes,
    onEnrollPasskey,
    onRemovePasskey,
  };
}
