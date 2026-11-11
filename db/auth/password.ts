import {
  PBKDF2_HASH,
  PBKDF2_ITERATIONS,
  PBKDF2_KEY_LENGTH,
  SALT_BYTES,
  base64UrlToBytes,
  bytesToBase64Url,
  constantTimeEqual,
  randomBytes,
} from "./crypto";

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2-SHA256, ADR 0013)
// ---------------------------------------------------------------------------

/**
 * Derive the PBKDF2-SHA256 key for a password/salt pair at the given
 * iteration count.
 *
 * Hashing always passes the current PBKDF2_ITERATIONS constant. Verification
 * accepts a stored count only when the runtime can support it; counts up to
 * that ceiling are taken from the hash (ADR 0013), while higher counts fail
 * closed and must be replaced through password reset.
 */
async function derivePasswordKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: PBKDF2_HASH,
      salt,
      iterations,
    },
    keyMaterial,
    PBKDF2_KEY_LENGTH * 8,
  );
  return new Uint8Array(derived);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await derivePasswordKey(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts[0] !== "pbkdf2") return false;

  let iterations: number;
  let salt: Uint8Array<ArrayBuffer>;
  let expected: string;

  if (parts.length === 4) {
    // Current format (ADR 0013): `pbkdf2$<iterations>$<saltB64>$<hashB64>`.
    // The embedded count drives the derivation when it is within the
    // Cloudflare-supported ceiling; higher counts are rejected below.
    const parsed = Number(parts[1]);
    if (!Number.isInteger(parsed) || parsed < 1) return false;
    if (parsed > PBKDF2_ITERATIONS) {
      // Legacy hashes created above Cloudflare's WebCrypto ceiling cannot be
      // verified here. Still pay the same dummy cost as an unknown email so
      // the reset-required state does not become a timing oracle.
      try {
        await payDummyPasswordCost(password);
      } catch {
        // A malformed legacy row remains a failed credential either way.
      }
      return false;
    }
    iterations = parsed;
    salt = base64UrlToBytes(parts[2]);
    expected = parts[3];
  } else if (parts.length === 3) {
    // Legacy hashes predate the embedded iteration count
    // (`pbkdf2$<saltB64>$<hashB64>`): fall back to the current constant.
    iterations = PBKDF2_ITERATIONS;
    salt = base64UrlToBytes(parts[1]);
    expected = parts[2];
  } else {
    return false;
  }

  try {
    const derived = await derivePasswordKey(password, salt, iterations);
    return constantTimeEqual(bytesToBase64Url(derived), expected);
  } catch {
    return false;
  }
}

/**
 * A structurally valid PBKDF2 hash the code never verifies against: it exists
 * ONLY to make unknown-email lookups pay the same derivation cost as a real
 * password check. The salt and key are fixed constants — the comparison
 * result is discarded, so neither value carries any secret.
 *
 * QA#3 F1 (t_63e0d13c): the login response body is anti-enumeration (one
 * generic 401), but the response TIME was not — an unknown email returned
 * immediately while a registered email paid the current PBKDF2 cost
 * (~50-150 ms). authenticateContributor and the lockout branch of the login
 * route both call verifyPasswordDummy on the fast paths so the response time
 * no longer reveals whether the email exists.
 */
const DUMMY_PASSWORD_HASH =
  "pbkdf2$100000$WlpaWlpaWlpaWlpaWlpaWg$zU4WhYARxiSZk8T4hHTDxIt0TKfuJ3ZGBFxf6wvNosY";

async function payDummyPasswordCost(password: string): Promise<void> {
  const parts = DUMMY_PASSWORD_HASH.split("$");
  await derivePasswordKey(password, base64UrlToBytes(parts[2]), Number(parts[1]));
}

/**
 * Pay the full PBKDF2 derivation cost against the dummy hash and return
 * false. Callers DISCARD the result — the point is the timing, not the
 * boolean — but returning false keeps the call site honest about the fact
 * that this is a failed verification.
 */
export async function verifyPasswordDummy(password: string): Promise<boolean> {
  try {
    // Derive at the DUMMY hash's own (fixed) iteration count, exactly like a
    // real verify would — the comparison result is discarded on purpose.
    await payDummyPasswordCost(password);
  } catch {
    // Derivation never fails for a string password; swallow so the fast path
    // stays uniform (a throwing caller would reintroduce a timing signal).
  }
  return false;
}
