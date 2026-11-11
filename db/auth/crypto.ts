// ---------------------------------------------------------------------------
// Crypto helpers (WebCrypto — available in Cloudflare Workers and Node 22+)
// ---------------------------------------------------------------------------

// Cloudflare Workers' WebCrypto rejects PBKDF2 iteration counts above 100,000.
// Stored iteration counts above this limit cannot be derived by Cloudflare's
// WebCrypto runtime; those accounts must use password reset to obtain a new
// compatible hash.
export const PBKDF2_ITERATIONS = 100_000;
export const PBKDF2_HASH = "SHA-256";
export const PBKDF2_KEY_LENGTH = 32; // 256 bits
export const SALT_BYTES = 16;
export const TOKEN_BYTES = 32;

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function randomBytes(byteLength: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(byteLength));
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomBase64Url(byteLength: number): string {
  return bytesToBase64Url(randomBytes(byteLength));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(PBKDF2_HASH, new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time byte comparison, mirroring the edge gate in worker/index.ts.
 * Never used for secrets under test assumptions: it only defends against
 * timing side channels on password/session verification.
 */
export function constantTimeEqual(first: string, second: string): boolean {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return difference === 0;
}
