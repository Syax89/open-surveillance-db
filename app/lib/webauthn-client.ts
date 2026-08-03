/**
 * Browser-side WebAuthn helpers (multi-method auth Fase C + E2 — passkey
 * ceremonies from /login and /account).
 *
 * Deliberately dependency-free: the JSON<->binary conversion the WebAuthn
 * browser API needs is small enough to own, and keeping it local means the
 * client bundle carries no extra library. The JSON shapes produced here are
 * the ones the backend routes expect (RegistrationResponseJSON /
 * AuthenticationResponseJSON in @simplewebauthn/server v13 terms):
 *
 *   - registration (navigator.credentials.create -> register/complete):
 *     { id, rawId, type, response: { clientDataJSON, attestationObject,
 *       transports }, clientExtensionResults }
 *   - authentication (navigator.credentials.get -> login/complete):
 *     { id, rawId, type, response: { clientDataJSON, authenticatorData,
 *       signature, userHandle }, clientExtensionResults }
 *
 * Only runs in the browser (the WebAuthn API is not available in Node or in
 * the jsdom test harness unless a test fakes it).
 */

export type RegistrationResponseJSON = {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports?: string[];
  };
  clientExtensionResults: Record<string, unknown>;
};

export type AuthenticationResponseJSON = {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
  clientExtensionResults: Record<string, unknown>;
};

/** Base64url-encode raw bytes (the wire format for every WebAuthn field). */
export function bytesToBase64Url(bytes: ArrayBuffer | ArrayBufferView): string {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Decode a base64url string back to a Uint8Array (browser binary input). */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 =
    value.replaceAll("-", "+").replaceAll("_", "/") +
    "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  // Allocate a real ArrayBuffer so the result satisfies BufferSource in the
  // strict DOM typings (Uint8Array<ArrayBuffer>, not ArrayBufferLike).
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * The WebAuthn browser API is present when `navigator.credentials` and the
 * `PublicKeyCredential` constructor exist. Call this before starting a
 * ceremony so the UI can explain instead of throwing.
 */
export function browserSupportsWebAuthn(): boolean {
  return (
    typeof navigator !== "undefined"
    && typeof navigator.credentials !== "undefined"
    && typeof PublicKeyCredential !== "undefined"
  );
}

/**
 * Convert the binary `PublicKeyCredential` returned by
 * navigator.credentials.create()/get() into the plain-JSON shape the
 * backend verifies. The conversions mirror @simplewebauthn/browser's
 * credentialToJSON: every ArrayBuffer field becomes base64url, the
 * credential id stays the base64url string the spec already exposes, and
 * `transports` is read through the optional getTransports() extension.
 */
export function credentialToJSON(
  credential: PublicKeyCredential,
  kind: "register" | "login",
): RegistrationResponseJSON | AuthenticationResponseJSON {
  const attestation = credential.response as AuthenticatorAttestationResponse;
  const assertion = credential.response as AuthenticatorAssertionResponse;
  const clientExtensionResults = credential.getClientExtensionResults() as Record<string, unknown>;
  const common = {
    id: credential.id,
    rawId: bytesToBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults,
  };
  if (kind === "register") {
    return {
      ...common,
      response: {
        clientDataJSON: bytesToBase64Url(attestation.clientDataJSON),
        attestationObject: bytesToBase64Url(attestation.attestationObject),
        transports:
          typeof attestation.getTransports === "function" ? attestation.getTransports() : [],
      },
    };
  }
  return {
    ...common,
    response: {
      clientDataJSON: bytesToBase64Url(assertion.clientDataJSON),
      authenticatorData: bytesToBase64Url(assertion.authenticatorData),
      signature: bytesToBase64Url(assertion.signature),
      ...(assertion.userHandle && assertion.userHandle.byteLength > 0
        ? { userHandle: bytesToBase64Url(assertion.userHandle) }
        : {}),
    },
  };
}

/**
 * Start a registration ceremony: the /begin route's
 * PublicKeyCredentialCreationOptionsJSON (base64url strings) is converted
 * to the binary options the browser API needs, then
 * navigator.credentials.create() runs. Rejects with NotAllowedError when
 * the user cancels — callers treat that as a silent abort, not an error.
 */
export async function createCredential(
  options: PublicKeyCredentialCreationOptionsJSON,
): Promise<RegistrationResponseJSON> {
  // The JSON options come from our own /register/begin route (shaped by
  // @simplewebauthn/server), so the fields are valid by construction; the
  // cast bridges the loose JSON strings to the DOM literal-union types
  // without importing the server library on the client.
  const publicKey = {
    ...options,
    challenge: base64UrlToBytes(options.challenge),
    user: {
      ...options.user,
      id: base64UrlToBytes(options.user.id),
    },
    ...(options.excludeCredentials && options.excludeCredentials.length > 0
      ? {
          excludeCredentials: options.excludeCredentials.map((credential) => ({
            type: "public-key" as const,
            id: base64UrlToBytes(credential.id),
            ...(credential.transports ? { transports: credential.transports } : {}),
          })),
        }
      : {}),
  } as unknown as PublicKeyCredentialCreationOptions;
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error("The browser did not return a credential.");
  return credentialToJSON(credential, "register") as RegistrationResponseJSON;
}

/**
 * Start an authentication ceremony: converts the /begin route's
 * PublicKeyCredentialRequestOptionsJSON to binary and runs
 * navigator.credentials.get(). Rejects with NotAllowedError when the user
 * cancels (callers abort silently).
 */
export async function getCredential(
  options: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthenticationResponseJSON> {
  // Same construction-guarantee cast as createCredential: the allowCredentials
  // entries from /login/begin are { id, transports }, the DOM type also wants
  // type:"public-key" — the server never omits it, so pin it here.
  const publicKey = {
    ...options,
    challenge: base64UrlToBytes(options.challenge),
    ...(options.allowCredentials && options.allowCredentials.length > 0
      ? {
          allowCredentials: options.allowCredentials.map((credential) => ({
            type: "public-key" as const,
            id: base64UrlToBytes(credential.id),
            ...(credential.transports ? { transports: credential.transports } : {}),
          })),
        }
      : {}),
  } as PublicKeyCredentialRequestOptions;
  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error("The browser did not return a credential.");
  return credentialToJSON(credential, "login") as AuthenticationResponseJSON;
}

// Minimal local types for the JSON options the backend routes emit. The
// full lib types live in @simplewebauthn/server (server-side only); these
// mirror the fields the client touches, so the module stays free of any
// server dependency.
export type PublicKeyCredentialCreationOptionsJSON = {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: string; alg: number }[];
  timeout?: number;
  attestation?: string;
  authenticatorSelection?: { residentKey?: string; userVerification?: string };
  excludeCredentials?: { id: string; transports?: string[] }[];
};

export type PublicKeyCredentialRequestOptionsJSON = {
  challenge: string;
  timeout?: number;
  rpId?: string;
  userVerification?: string;
  allowCredentials?: { id: string; transports?: string[] }[];
};
