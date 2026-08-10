// Shared fixtures for the api-keys shard suite (one case per file under
// tests/client-account-api-keys-*.test.mjs). Copied verbatim from the
// original tests/client-account-api-keys.test.mjs — contract: GET
// /api/auth/keys (metadata only), POST /api/auth/keys (201 with raw key
// once), DELETE /api/auth/keys/[id] (soft revoke). Fixtures are fictitious.
import { jsonResponse } from "./dom-harness.mjs";

export const profileFixture = {
  contributor: {
    id: 1,
    email: "contributor@example.test",
    displayName: "Fixture Contributor",
    emailVerifiedAt: "2026-01-15T10:00:00.000Z",
    createdAt: "2026-01-15T10:00:00.000Z",
    updatedAt: "2026-01-15T10:00:00.000Z",
  },
  level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
};

export const contributionsFixture = {
  contributions: [
    { type: "camera", id: 41, title: "Fixture camera report", issueType: null, cameraId: null, status: "verified", createdAt: "2026-02-01T08:00:00.000Z" },
    { type: "camera", id: 42, title: "Another fixture report", issueType: null, cameraId: null, status: "pending", createdAt: "2026-02-02T09:30:00.000Z" },
  ],
  pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1, hasMore: false },
  level: { level: 1, verifiedCount: 1, threshold: 1, nextThreshold: 5 },
};

export const apiKeysFixture = [
  {
    id: 11,
    name: "Nightly sync script",
    keyPrefix: "osdb_AbC1dE",
    scopes: ["submit", "action"],
    createdAt: "2026-01-15T10:00:00.000Z",
    lastUsedAt: "2026-02-20T08:00:00.000Z",
    expiresAt: "2027-01-15T10:00:00.000Z",
    revokedAt: null,
  },
  {
    id: 12,
    name: "Old integration",
    keyPrefix: "osdb_XyZ9qR",
    scopes: ["edit"],
    createdAt: "2025-11-02T09:00:00.000Z",
    lastUsedAt: null,
    expiresAt: "2026-11-02T09:00:00.000Z",
    revokedAt: "2026-03-01T12:00:00.000Z",
  },
];

export function accountHandler({ me = profileFixture, contributions = contributionsFixture, passkeys = [], keys = [] } = {}) {
  return (input, init) => {
    if (input === "/api/auth/me") return jsonResponse(me, { status: me === null ? 401 : 200 });
    if (typeof input === "string" && input.startsWith("/api/auth/me/contributions")) {
      return jsonResponse(contributions);
    }
    if (input === "/api/auth/passkey/credentials") return jsonResponse({ credentials: passkeys });
    if (input === "/api/auth/keys" && (init?.method ?? "GET") === "GET") return jsonResponse({ keys });
    return jsonResponse({ error: "unexpected route" }, { status: 404 });
  };
}
