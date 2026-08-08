// Mock of db/auth as seen by the transpiled route handlers.
//
// Pure validation helpers (normalizeEmail, isValidEmail) are real
// implementations so route-level validation runs for real; every function
// that touches the database or crypto goes through makeMock and must be
// stubbed per test (see tests/helpers/mock-state.mjs).

import { makeMock } from "../mock-state.mjs";

export const PBKDF2_ITERATIONS = 210_000;

// Whitelists the contributions route validates against (C2). These are pure
// data constants, mirrored verbatim so the route's whitelist checks run for
// real in route-level tests.
export const CONTRIBUTION_TYPES = ["camera", "correction", "photo"];
export const CONTRIBUTION_STATUSES = [
  "pending",
  "active",
  "verified",
  "needs_review",
  "stale",
  "rejected",
  "removed",
  "reviewed",
  "approved",
];

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

export const {
  createContributor,
  findContributorByEmail,
  getContributorById,
  authenticateContributor,
  createSession,
  findSessionByToken,
  revokeSession,
  listContributorSubmissions,
  countVerifiedCameras,
  listContributorContributions,
  summarizeContributorContributions,
  updateContributorDisplayName,
  eraseContributor,
  hashPassword,
  verifyPassword,
  // QA#3 F1 (t_63e0d13c): constant-cost dummy derivation — the login route
  // pays a full PBKDF2 on unknown-email and locked-account paths so the
  // response TIME cannot enumerate emails. Pure/crypto helper: stubbed per
  // test like verifyPassword.
  verifyPasswordDummy,
  randomBase64Url,
  sha256Hex,
  // QA#3 F4 (t_63e0d13c): keyed-HMAC (or truncated SHA-256) caller-key
  // derivation for the per-IP registration log — never a raw IP, never an
  // invertible hash. Pure/crypto helper: stubbed per test.
  registrationIpHash,
  // Per-IP registration cap (P3-4, t_0941036b): db-touching, stubbed per
  // test like the rest of db/auth.
  recordRegistrationAttempt,
  deleteRegistrationAttempt,
  // Per-email login lockout (ADR 0016): pure helpers run for real, db-touching
  // functions are stubbed per test like the rest of db/auth.
  loginLockoutKey,
  getLoginLockout,
  recordFailedLogin,
  clearLoginAttempts,
  getContributorVerification,
  // Email verification + password reset (multi-method auth Fase B): stubbed
  // like the rest of the db layer; the constants run for real so routes and
  // tests share the same budget/TTL numbers.
  createVerificationToken,
  consumeVerificationToken,
  countVerificationTokensSentSince,
  markContributorEmailVerified,
  resetContributorPassword,
  revokeAllContributorSessions,
  applyPasswordReset,
} = makeMock({
  createContributor: "createContributor",
  findContributorByEmail: "findContributorByEmail",
  getContributorById: "getContributorById",
  authenticateContributor: "authenticateContributor",
  createSession: "createSession",
  findSessionByToken: "findSessionByToken",
  revokeSession: "revokeSession",
  listContributorSubmissions: "listContributorSubmissions",
  countVerifiedCameras: "countVerifiedCameras",
  listContributorContributions: "listContributorContributions",
  summarizeContributorContributions: "summarizeContributorContributions",
  updateContributorDisplayName: "updateContributorDisplayName",
  eraseContributor: "eraseContributor",
  hashPassword: "hashPassword",
  verifyPassword: "verifyPassword",
  verifyPasswordDummy: "verifyPasswordDummy",
  randomBase64Url: "randomBase64Url",
  sha256Hex: "sha256Hex",
  registrationIpHash: "registrationIpHash",
  recordRegistrationAttempt: "recordRegistrationAttempt",
  deleteRegistrationAttempt: "deleteRegistrationAttempt",
  loginLockoutKey: "loginLockoutKey",
  getLoginLockout: "getLoginLockout",
  recordFailedLogin: "recordFailedLogin",
  clearLoginAttempts: "clearLoginAttempts",
  getContributorVerification: "getContributorVerification",
  createVerificationToken: "createVerificationToken",
  consumeVerificationToken: "consumeVerificationToken",
  countVerificationTokensSentSince: "countVerificationTokensSentSince",
  markContributorEmailVerified: "markContributorEmailVerified",
  resetContributorPassword: "resetContributorPassword",
  revokeAllContributorSessions: "revokeAllContributorSessions",
  applyPasswordReset: "applyPasswordReset",
});

export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TOKEN_TTL_MS = 3 * 60 * 60 * 1000;
export const TOKEN_TTL_MS_BY_PURPOSE = {
  verify: VERIFICATION_TOKEN_TTL_MS,
  reset: RESET_TOKEN_TTL_MS,
};
export const VERIFICATION_SEND_LIMIT = 3;
export const VERIFICATION_SEND_WINDOW_MS = 60 * 60 * 1000;
