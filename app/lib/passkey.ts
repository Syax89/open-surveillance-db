/**
 * WebAuthn relying-party configuration and ceremony helpers (multi-method
 * auth Fase C, t_36989e06 — passkeys).
 *
 * The RP identity (rpID, rpName, origin) is read from env so the same code
 * runs against the local prototype (http://localhost, RP `localhost`) and
 * production (https://opensurveillancedb.org). The env values default to
 * the production identity; the test harness overrides them explicitly.
 *
 * Security note on the user handle: the registration `userID` is the
 * contributor id itself (ASCII, base64url-encoded). It is not a secret —
 * it is exposed to the relying party and embedded in assertions — and the
 * credential binding (credential_id → contributor) is what authenticates.
 * Using the stable id avoids a user_handle → contributor mapping table.
 */

export type PasskeyRpConfig = {
  /** Effective domain of the relying party (WebAuthn rpID). */
  rpID: string;
  /** Human-readable RP name shown in the authenticator prompt. */
  rpName: string;
  /** Origin the ceremonies are expected to run from (verification). */
  origin: string;
};

export const DEFAULT_WEBAUTHN_RP_ID = "opensurveillancedb.org";
export const DEFAULT_WEBAUTHN_RP_NAME = "OpenSurveillanceDB";
export const DEFAULT_WEBAUTHN_ORIGIN = "https://opensurveillancedb.org";

/** Resolve the RP identity, honouring WEBAUTHN_* env overrides. */
export function webauthnRpConfig(env: unknown): PasskeyRpConfig {
  const config = env as { [key: string]: unknown };
  const read = (key: string, fallback: string): string => {
    const value = config[key];
    return typeof value === "string" && value.length > 0 ? value : fallback;
  };
  return {
    rpID: read("WEBAUTHN_RP_ID", DEFAULT_WEBAUTHN_RP_ID),
    rpName: read("WEBAUTHN_RP_NAME", DEFAULT_WEBAUTHN_RP_NAME),
    origin: read("WEBAUTHN_ORIGIN", DEFAULT_WEBAUTHN_ORIGIN),
  };
}

// ---------------------------------------------------------------------------
// User handle (the WebAuthn `user.id`)
// ---------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Base64url-encode raw bytes (COSE public keys, credential ids). */
export function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64Url(bytes);
}

/** Base64url-decode a stored value back to raw bytes (login verification). */
export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 =
    value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * The registration `userID` for a contributor: the stable numeric id as
 * ASCII, base64url-encoded (see module comment). The same handle is echoed
 * back in assertion `userHandle`s, letting the login route double-check the
 * asserted identity against the passkey owner.
 */
export function userHandleForContributor(contributorId: number): string {
  return bytesToBase64Url(new TextEncoder().encode(String(contributorId)));
}

/**
 * Decode an assertion `userHandle` back to a contributor id string, or null
 * when the handle is not a valid base64url of ASCII digits (a foreign or
 * malformed handle must fail the ceremony, not crash it).
 */
export function contributorIdFromUserHandle(userHandle: string): string | null {
  try {
    const base64 =
      userHandle.replaceAll("-", "+").replaceAll("_", "/") +
      "=".repeat((4 - (userHandle.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    return /^\d+$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Signature-counter policy (anti-replay for cloned authenticators)
// ---------------------------------------------------------------------------

/**
 * WebAuthn signature-counter advancement policy (spec §6.1, and the Fase C
 * anti-replay requirement: "login con anti-replay counter").
 *
 * The signature counter detects cloned authenticators: after a clone, the
 * counter no longer advances, so a non-increasing counter signals a copy.
 * Per the spec, a pair of zeroes is tolerated — some authenticators never
 * implement the counter and always report 0; rejecting those would brick
 * every login on that hardware. Every OTHER non-increase (equal or lower,
 * with either side non-zero) is rejected.
 */
export function isCounterAdvancementOk(newCounter: number, storedCounter: number): boolean {
  if (newCounter === 0 && storedCounter === 0) return true;
  return newCounter > storedCounter;
}

/**
 * Machine-readable marker for the "email not verified" refusal of the
 * passkey enrolment routes (register/begin + register/complete). A 403 like
 * the CSRF rejection, so the client must read `code` to tell them apart.
 */
export const EMAIL_UNVERIFIED_CODE = "email_unverified";

/**
 * 403 answered by passkey enrolment while the account's email is
 * unverified (pre-registration account-takeover guard): a credential is only
 * ever bound to an account whose mailbox control has been proven.
 */
export function emailUnverifiedResponse(): Response {
  return Response.json(
    { error: "Verify your email address before adding a passkey.", code: EMAIL_UNVERIFIED_CODE },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}

// ---------------------------------------------------------------------------
// Decoy credential descriptors (passkey login/begin anti-enumeration)
// ---------------------------------------------------------------------------

/** Constant pepper used when no server secret is configured (local / tests). */
const DECOY_CREDENTIAL_PEPPER = "osdb-passkey-decoy-v1";
/** Raw byte lengths of real-world credential ids (platform + roaming keys). */
const DECOY_CREDENTIAL_LENGTHS = [16, 20, 32] as const;

/**
 * Deterministic FAKE `allowCredentials` ids for an email that has no
 * enrolled passkey (unknown account, or a known account without passkeys).
 *
 * Without decoys, POST /api/auth/passkey/login/begin returned a non-empty
 * `allowCredentials` only for an existing account with passkeys, so the
 * response shape was an account-enumeration oracle. The decoys are
 * HMAC-SHA256(secret, email) derived: stable across calls for the same
 * email (a repeated probe cannot spot randomness) and not computable without
 * the server secret. The secret is `secret` when configured (production
 * reuses REGISTRATION_IP_HMAC_KEY, domain-separated by the message prefix),
 * else a constant pepper. One or two entries, base64url ids of 16/20/32
 * bytes, no transports: the same shapes real descriptors take. No
 * authenticator holds them, so the ceremony simply finds no credential.
 */
export async function decoyCredentialIds(email: string, secret: string | undefined): Promise<string[]> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret && secret.length > 0 ? secret : DECOY_CREDENTIAL_PEPPER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sign = async (label: string) =>
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("osdb-passkey-decoy:" + label + ":" + email)),
    );
  const seed = await sign("seed");
  const count = 1 + (seed[0] % 2);
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const length = DECOY_CREDENTIAL_LENGTHS[seed[index + 1] % DECOY_CREDENTIAL_LENGTHS.length];
    ids.push(bytesToBase64Url((await sign("id" + index)).slice(0, length)));
  }
  return ids;
}
