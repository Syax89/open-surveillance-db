/**
 * Contributor accounts and sessions (STATUS gap #1, ADR 0013).
 *
 * Security properties:
 *  - Passwords are stored as salted PBKDF2-SHA256 hashes
 *    (`pbkdf2$<iterations>$<saltB64>$<hashB64>`). New hashes use 100,000
 *    iterations, the Cloudflare Workers WebCrypto ceiling. The iteration
 *    count is embedded in the hash so compatible costs can be raised without
 *    a migration; hashes above the runtime ceiling require password reset.
 *  - Only the SHA-256 of the raw session token is stored: a database leak
 *    cannot replay live sessions, and the raw token (32 random bytes,
 *    base64url) is the only thing the browser cookie carries.
 *  - Each session carries its own CSRF token, echoed through a non-HttpOnly
 *    cookie and verified on state-changing requests (app/lib/auth-session).
 *
 * Anonymous submissions remain possible by design: `contributor_id` on a
 * camera is NULL unless the submitter was logged in (see ADR 0013).
 */
//
// This file is a thin barrel: the implementation lives in cohesive modules
// under db/auth/ (crypto, password, types, email, contributors,
// registration, lockout, sessions, email-tokens, contributions, erasure).
// Every importer keeps using "./auth" / "../db/auth" — the public API below
// is exactly the one this module has always exported.

export {
  PBKDF2_ITERATIONS,
  randomBytes,
  randomBase64Url,
  sha256Hex,
} from "./auth/crypto";
export { hashPassword, verifyPassword, verifyPasswordDummy } from "./auth/password";
export type {
  Contributor,
  PublicContributor,
  Session,
  SessionWithContributor,
  ContributorSubmission,
} from "./auth/types";
export { normalizeEmail, isValidEmail } from "./auth/email";
export {
  createContributor,
  findContributorByEmail,
  getContributorById,
  updateContributorDisplayName,
  authenticateContributor,
  getContributorVerification,
} from "./auth/contributors";
export type { ContributorVerification } from "./auth/contributors";
export {
  registrationIpHash,
  recordRegistrationAttempt,
  deleteRegistrationAttempt,
} from "./auth/registration";
export {
  loginLockoutKey,
  getLoginLockout,
  recordFailedLogin,
  clearLoginAttempts,
} from "./auth/lockout";
export type { LoginLockoutPolicy, LoginLockoutState } from "./auth/lockout";
export { createSession, findSessionByToken, revokeSession } from "./auth/sessions";
export type { NewSession } from "./auth/sessions";
export {
  VERIFICATION_TOKEN_TTL_MS,
  RESET_TOKEN_TTL_MS,
  TOKEN_TTL_MS_BY_PURPOSE,
  createVerificationToken,
  consumeVerificationToken,
  countVerificationTokensSentSince,
  markContributorEmailVerified,
  resetContributorPassword,
  revokeAllContributorSessions,
  applyPasswordReset,
} from "./auth/email-tokens";
export type { EmailVerificationPurpose, VerificationConsumeResult } from "./auth/email-tokens";
export {
  listContributorSubmissions,
  CONTRIBUTION_TYPES,
  CONTRIBUTION_STATUSES,
  listContributorContributions,
  summarizeContributorContributions,
  countVerifiedCameras,
} from "./auth/contributions";
export type {
  ContributionType,
  ContributorContribution,
  ContributionsPage,
  ContributionSummary,
} from "./auth/contributions";
export { eraseContributor } from "./auth/erasure";
export type { ErasureResult } from "./auth/erasure";
