// Mock of db/passkeys as seen by the transpiled route handlers
// (multi-method auth Fase C, t_36989e06 — WebAuthn ceremonies, passkey
// management and one-time recovery codes).
//
// Constants and pure helpers run for real (generateRecoveryCode keeps its
// real shape so route tests can assert on the issued codes' format); every
// function that touches the database goes through makeMock and must be
// stubbed per test (see tests/helpers/mock-state.mjs).
//
// The pure helpers are self-contained (node:crypto) so the copied mock in
// the harness tree has no sibling imports to rewrite — same convention as
// the other mocks, which only import ../mock-state.mjs.

import { createHash, randomBytes } from "node:crypto";
import { makeMock } from "../mock-state.mjs";

export const WEBAUTHN_CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const RECOVERY_CODE_COUNT = 10;

const RECOVERY_CODE_BYTES = 12;

/** Real implementation — the plaintext form issued once at enrollment. */
export function generateRecoveryCode() {
  const raw = randomBytes(RECOVERY_CODE_BYTES).toString("base64url");
  return raw.match(/.{1,4}/g)?.join("-") ?? raw;
}

/** Real implementation — SHA-256 hex, the only form stored in the database. */
export function recoveryCodeHash(code) {
  return createHash("sha256").update(code).digest("hex");
}

export const {
  createWebAuthnChallenge,
  consumeWebAuthnChallenge,
  sweepExpiredWebAuthnChallenges,
  listPasskeys,
  createPasskey,
  findPasskeyByCredentialId,
  updatePasskeyCounter,
  deletePasskey,
  issueRecoveryCodes,
  consumeRecoveryCode,
  countUnusedRecoveryCodes,
} = makeMock({
  createWebAuthnChallenge: "createWebAuthnChallenge",
  consumeWebAuthnChallenge: "consumeWebAuthnChallenge",
  sweepExpiredWebAuthnChallenges: "sweepExpiredWebAuthnChallenges",
  listPasskeys: "listPasskeys",
  createPasskey: "createPasskey",
  findPasskeyByCredentialId: "findPasskeyByCredentialId",
  updatePasskeyCounter: "updatePasskeyCounter",
  deletePasskey: "deletePasskey",
  issueRecoveryCodes: "issueRecoveryCodes",
  consumeRecoveryCode: "consumeRecoveryCode",
  countUnusedRecoveryCodes: "countUnusedRecoveryCodes",
});
