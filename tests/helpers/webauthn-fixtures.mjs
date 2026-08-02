// QA Fase G (t_c259759d) — WebAuthn fixture builder.
//
// The phase suites (api-passkey.test.mjs, passkey-d1.test.mjs) exercise the
// passkey routes with mocked db modules and never submit a VALID ceremony:
// the only "verification runs for real" tests feed garbage and assert the
// 400/401 rejection. The happy path — a real attestation through
// register/complete, a real signed assertion through login/complete, ending
// in an actual write — is the Fase G gap this helper closes.
//
// It builds genuine WebAuthn payloads against the test RP identity
// (WEBAUTHN_RP_ID=localhost, WEBAUTHN_ORIGIN=https://osdb.test, the values
// the E2E env mock ships):
//
//   - an EC P-256 keypair (node:crypto, the same algorithm SimpleWebAuthn
//     verifies: COSE alg ES256),
//   - a CBOR encoder for the small set of types an attestationObject needs
//     (uint, negint, bytes, text, map),
//   - attestationObject with fmt "none" (privacy: the app requests
//     attestation:"none", so no device attestation statement is needed) and
//     the COSE EC2 public key embedded in the authenticatorData,
//   - the authentication assertion: authenticatorData + clientDataJSON
//     signed with ECDSA-SHA256 (node:crypto emits DER, which SimpleWebAuthn
//     unwraps to r||s internally).
//
// No personal data, no real network, no real authenticator: the keypair is
// generated per test and discarded.
import { createHash, createSign, generateKeyPairSync } from "node:crypto";

export const RP_ID = "localhost";
export const RP_ORIGIN = "https://osdb.test";

// ---------------------------------------------------------------------------
// Minimal CBOR encoder (RFC 8949 subset: uint, negint, bytes, text, array,
// map). Enough for attestationObject and the COSE EC2 key.
// ---------------------------------------------------------------------------

function cborHead(major, length) {
  const head = [];
  if (length < 24) {
    head.push((major << 5) | length);
  } else if (length < 0x100) {
    head.push((major << 5) | 24, length);
  } else if (length < 0x10000) {
    head.push((major << 5) | 25, length >> 8, length & 0xff);
  } else {
    head.push(
      (major << 5) | 26,
      (length >>> 24) & 0xff,
      (length >>> 16) & 0xff,
      (length >>> 8) & 0xff,
      length & 0xff,
    );
  }
  return head;
}

function cborEncodeInt(value) {
  if (value >= 0) return cborHead(0, value);
  // negative ints are encoded as the unsigned value (-1 - value)
  return cborHead(1, -1 - value);
}

function cborEncodeBytes(bytes) {
  return [...cborHead(2, bytes.length), ...bytes];
}

function cborEncodeText(text) {
  const bytes = [...new TextEncoder().encode(text)];
  return [...cborHead(3, bytes.length), ...bytes];
}

function cborEncodeMap(entries) {
  // entries: array of [key, encodedValueBytes]
  const body = entries.flatMap(([key, value]) => [
    ...(typeof key === "number" ? cborEncodeInt(key) : cborEncodeText(key)),
    ...value,
  ]);
  return [...cborHead(5, entries.length), ...body];
}

// ---------------------------------------------------------------------------
// COSE EC2 public key (kty=2 EC2, alg=-7 ES256, crv=1 P-256)
// ---------------------------------------------------------------------------

export function coseEc2PublicKey(xBytes, yBytes) {
  return cborEncodeMap([
    [1, cborEncodeInt(2)], // kty: EC2
    [3, cborEncodeInt(-7)], // alg: ES256
    [-1, cborEncodeInt(1)], // crv: P-256
    [-2, cborEncodeBytes([...xBytes])],
    [-3, cborEncodeBytes([...yBytes])],
  ]);
}

// ---------------------------------------------------------------------------
// Keypair + helpers
// ---------------------------------------------------------------------------

export function generateKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const jwk = publicKey.export({ format: "jwk" });
  const xBytes = Buffer.from(jwk.x, "base64url");
  const yBytes = Buffer.from(jwk.y, "base64url");
  return { privateKey, xBytes, yBytes, cosePublicKey: coseEc2PublicKey(xBytes, yBytes) };
}

export function rpIdHash() {
  return [...createHash("sha256").update(RP_ID).digest()];
}

const toBase64Url = (bytes) =>
  Buffer.from(bytes).toString("base64url");

const clientDataJsonBytes = (type, challenge, origin = RP_ORIGIN) =>
  new TextEncoder().encode(
    JSON.stringify({
      type,
      challenge,
      origin,
      crossOrigin: false,
    }),
  );

// ---------------------------------------------------------------------------
// Registration payload (attestation fmt "none")
// ---------------------------------------------------------------------------

export function buildRegistrationResponse({ challenge, keypair, credentialId, signCount = 1 }) {
  const credentialIdBytes = Buffer.from(credentialId, "base64url");
  // authenticatorData: rpIdHash(32) || flags(1) || signCount(4) ||
  // aaguid(16) || credentialIdLen(2) || credentialId ||
  // credentialPublicKey(CBOR)
  const flags = 0x41; // UP | AT (no attestation statement, no UV required)
  const aaguid = new Array(16).fill(0);
  const authData = [
    ...rpIdHash(),
    flags,
    (signCount >>> 24) & 0xff,
    (signCount >>> 16) & 0xff,
    (signCount >>> 8) & 0xff,
    signCount & 0xff,
    ...aaguid,
    (credentialIdBytes.length >>> 8) & 0xff,
    credentialIdBytes.length & 0xff,
    ...credentialIdBytes,
    ...keypair.cosePublicKey,
  ];
  const attestationObject = cborEncodeMap([
    ["fmt", cborEncodeText("none")],
    ["attStmt", cborEncodeMap([])],
    ["authData", cborEncodeBytes(authData)],
  ]);
  const clientDataJSON = clientDataJsonBytes("webauthn.create", challenge);
  return {
    id: credentialId,
    rawId: credentialId,
    type: "public-key",
    response: {
      clientDataJSON: toBase64Url(clientDataJSON),
      attestationObject: toBase64Url(attestationObject),
      transports: ["internal"],
    },
  };
}

// ---------------------------------------------------------------------------
// Authentication assertion (signed)
// ---------------------------------------------------------------------------

export function buildAuthenticationResponse({
  challenge,
  credentialId,
  keypair,
  signCount,
  userHandle,
}) {
  // authenticatorData: rpIdHash(32) || flags(1) || signCount(4)
  // login/begin issues userVerification:"preferred", and SimpleWebAuthn
  // treats preferred as required when the assertion omits UV — so the
  // authenticator sets UP|UV (0x05), as a real device with on-device
  // verification would.
  const flags = 0x05; // UP | UV
  const authData = [
    ...rpIdHash(),
    flags,
    (signCount >>> 24) & 0xff,
    (signCount >>> 16) & 0xff,
    (signCount >>> 8) & 0xff,
    signCount & 0xff,
  ];
  const clientDataJSON = clientDataJsonBytes("webauthn.get", challenge);
  const clientDataHash = [...createHash("sha256").update(clientDataJSON).digest()];
  const signingData = Buffer.from([...authData, ...clientDataHash]);
  const signature = createSign("sha256").update(signingData).sign(keypair.privateKey);
  return {
    id: credentialId,
    rawId: credentialId,
    type: "public-key",
    response: {
      clientDataJSON: toBase64Url(clientDataJSON),
      authenticatorData: toBase64Url(authData),
      signature: signature.toString("base64url"),
      userHandle,
    },
  };
}
