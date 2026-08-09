"use client";

// API-key management hook for the /account panel (api-keys epic T18).
// Model: useModerationQueue — owns the three key endpoints (list/create/
// revoke), the CSRF echo and the loading/error state. The section consumes
// the returned API; nothing here renders JSX.
//
// Contract (plan §1.3, D1–D9):
//   GET    /api/auth/keys        → metadata only, never hash/raw
//   POST   /api/auth/keys        → 201 { id, name, key, keyPrefix, scopes,
//                                   createdAt, expiresAt } — raw key ONLY here
//   DELETE /api/auth/keys/[id]   → soft revoke (idempotent, 404 non-own)
// Write-only keys (D1): the read API stays keyless, so this UI never
// mentions read scopes.

import { useCallback, useEffect, useRef, useState } from "react";

export type ApiKeyScope = "submit" | "confirm" | "edit" | "action";

export const API_KEY_SCOPES: readonly ApiKeyScope[] = [
  "submit",
  "confirm",
  "edit",
  "action",
];

export type ApiKey = {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type ApiKeyErrorKind = "limit" | "session" | "csrf" | "revoke" | "list" | "create";

/** i18n key per label/grant di ogni scope (D4 family, bundle auth). */
export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  submit: "apiKeyScopeSubmitLabel",
  confirm: "apiKeyScopeConfirmLabel",
  edit: "apiKeyScopeEditLabel",
  action: "apiKeyScopeActionLabel",
};

export const API_KEY_SCOPE_GRANTS: Record<ApiKeyScope, string> = {
  submit: "apiKeyScopeSubmitGrant",
  confirm: "apiKeyScopeConfirmGrant",
  edit: "apiKeyScopeEditGrant",
  action: "apiKeyScopeActionGrant",
};

/** Read the script-readable CSRF cookie so mutations can echo it back. */
function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("osdb_csrf="));
  return match ? decodeURIComponent(match.slice("osdb_csrf=".length)) : null;
}

function parseKeysList(body: unknown): ApiKey[] {
  if (Array.isArray(body)) return body as ApiKey[];
  if (body && typeof body === "object" && Array.isArray((body as { keys?: unknown }).keys)) {
    return (body as { keys: ApiKey[] }).keys;
  }
  return [];
}

export function useApiKeys(onUnauthorized?: () => void) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiKeyErrorKind | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  // Keep the latest callback without re-creating refresh on every render
  // (the section passes an inline setter from the page; the fetch effect
  // must stay stable or the list reloads on every profile re-render).
  const onUnauthorizedRef = useRef(onUnauthorized);
  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);

  const refresh = useCallback(() => {
    const controller = new AbortController();
    Promise.resolve()
      .then(() => { setLoading(true); setError(null); })
      .then(() => fetch("/api/auth/keys", { signal: controller.signal }))
      .then(async (response) => {
        if (response.status === 401) {
          onUnauthorizedRef.current?.();
          return;
        }
        if (!response.ok) {
          setError("list");
          return;
        }
        setKeys(parseKeysList(await response.json()));
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name !== "AbortError") setError("list");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => refresh(), [refresh]);

  async function createKey(
    name: string,
    scopes: ApiKeyScope[],
  ): Promise<{ ok: true; key: string; id: number } | { ok: false; error: ApiKeyErrorKind }> {
    const csrfToken = readCsrfToken();
    try {
      const response = await fetch("/api/auth/keys", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ name, scopes }),
      });
      if (response.status === 401) {
        onUnauthorizedRef.current?.();
        return { ok: false, error: "session" };
      }
      if (response.status === 403) return { ok: false, error: "csrf" };
      if (response.status === 409) return { ok: false, error: "limit" };
      if (!response.ok) return { ok: false, error: "create" };
      const body = (await response.json()) as { id: number; key: string; keyPrefix: string; scopes: string[]; createdAt: string; expiresAt: string | null };
      const created: ApiKey = {
        id: body.id,
        name,
        keyPrefix: body.keyPrefix,
        scopes: body.scopes,
        createdAt: body.createdAt,
        lastUsedAt: null,
        expiresAt: body.expiresAt,
        revokedAt: null,
      };
      setKeys((current) => [...current, created]);
      return { ok: true, key: body.key, id: body.id };
    } catch {
      return { ok: false, error: "create" };
    }
  }

  /** Soft-revoke a key. 404 = already revoked (idempotent); flip locally. */
  async function revokeKey(id: number): Promise<boolean> {
    const csrfToken = readCsrfToken();
    setRevokingId(id);
    try {
      const response = await fetch(`/api/auth/keys/${id}`, {
        method: "DELETE",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (response.status === 401) {
        onUnauthorizedRef.current?.();
        return false;
      }
      if (response.status === 404) {
        // Already revoked (or never existed): flip the row so the UI is
        // truthful without an existence oracle (P1-2 fail-closed).
        setKeys((current) => current.map((key) => (key.id === id ? { ...key, revokedAt: key.revokedAt ?? new Date(0).toISOString() } : key)));
        return true;
      }
      if (!response.ok) {
        setError("revoke");
        return false;
      }
      setKeys((current) => current.map((key) => (key.id === id ? { ...key, revokedAt: key.revokedAt ?? new Date().toISOString() } : key)));
      return true;
    } catch {
      return false;
    } finally {
      setRevokingId(null);
    }
  }

  return { keys, loading, error, refresh, createKey, revokeKey, revokingId };
}
