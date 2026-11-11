import { getD1 } from "../cameras";
import { PBKDF2_HASH, sha256Hex } from "./crypto";

// ---------------------------------------------------------------------------
// Per-IP registration cap (P3-4, QA#3 F4)
// ---------------------------------------------------------------------------

/**
 * Derive the stored key for the per-IP registration cap (QA#3 F4,
 * t_63e0d13c). The register route keys `registrations_ip_log` by this value
 * — never by the raw IP.
 *
 * Plain SHA-256 of the caller key is INVERTIBLE for practical purposes: the
 * IPv4 space is 2^32, so a precomputed table maps any stored hash back to
 * the caller's address (PII at rest, GDPR art. 5(1)(e)). The fix:
 *
 *   - when `REGISTRATION_IP_HMAC_KEY` is configured (production), the value
 *     is HMAC-SHA256(key, callerKey) TRUNCATED to 128 bits — the key is a
 *     server secret, so the stored value is not computable offline and a
 *     database leak cannot be dictionary-attacked;
 *   - without a key (local prototype / tests), the fallback is plain
 *     SHA-256 truncated to 128 bits: still not a raw IP, and the 30-day
 *     retention sweep (R17) bounds the exposure; the QA-accepted "truncate"
 *     option. Production must set the key (deploy checklist).
 *
 * The output is always 32 hex characters (128 bits), independent of which
 * branch ran, so the column/index shape never changes.
 */
export async function registrationIpHash(
  callerKeyValue: string,
  hmacKey: string | undefined,
): Promise<string> {
  if (hmacKey && hmacKey.length > 0) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(hmacKey),
      { name: "HMAC", hash: PBKDF2_HASH },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      keyMaterial,
      new TextEncoder().encode(callerKeyValue),
    );
    return [...new Uint8Array(mac).slice(0, 16)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return (await sha256Hex(callerKeyValue)).slice(0, 32);
}

/**
 * Record one registration attempt and return the reserved row id plus the
 * number of attempts for the caller's IP hash inside the rolling window —
 * atomically, in ONE D1 batch.
 *
 * Per-IP registration cap (P3-4, CEO decision t_0941036b — anti account-farm,
 * docs/COMMUNITY_PLAN.md §3.3): the register route inserts the attempt and
 * counts the window (`created_at >= windowStart`) in the same batch, so two
 * concurrent registrations cannot both read a stale count below the cap. The
 * stored key is `registrationIpHash(callerKey)` — a keyed HMAC (or truncated
 * SHA-256) of the caller key, never the raw IP and never an invertible hash
 * (privacy by design, QA#3 F4; same rule as the abuse-alert `callerHash`).
 * The route answers 429 once the count reaches `registrationIpLimits(env).maxRequests`
 * (so the 5th request in the window is blocked and its row stays — it must
 * keep counting for the 6th to stay blocked too); rows older than the window
 * fall out of the COUNT, so the cap resets automatically without a cleanup
 * job. When registration FAILS (400/409/500 — no account created) the route
 * rolls the row back with `deleteRegistrationAttempt`, so junk attempts never
 * consume the per-IP budget and the malformed-body "no write" contract holds.
 */
export async function recordRegistrationAttempt(input: {
  ipHash: string;
  now: string;
  windowStart: string;
}): Promise<{ id: number; count: number }> {
  const d1 = await getD1();
  const results = (await d1.batch([
    d1
      .prepare("INSERT INTO registrations_ip_log (ip_hash, created_at) VALUES (?, ?) RETURNING id")
      .bind(input.ipHash, input.now),
    d1
      .prepare("SELECT COUNT(*) AS n FROM registrations_ip_log WHERE ip_hash = ? AND created_at >= ?")
      .bind(input.ipHash, input.windowStart),
  ])) as { results: Array<Record<string, unknown>> }[];
  const inserted = results[0]?.results?.[0] as { id?: number } | undefined;
  const counted = results[1]?.results?.[0] as { n?: number } | undefined;
  return { id: Number(inserted?.id ?? 0), count: Number(counted?.n ?? 0) };
}

/**
 * Roll back a reserved registration attempt (see `recordRegistrationAttempt`).
 * Called by the register route on every non-201 exit: no account was created,
 * so the reservation must not consume the per-IP budget. The id is the row
 * returned by the reservation's INSERT ... RETURNING id, so the delete is a
 * point write and can never touch a different attempt.
 */
export async function deleteRegistrationAttempt(id: number): Promise<void> {
  const d1 = await getD1();
  await d1.prepare("DELETE FROM registrations_ip_log WHERE id = ?").bind(id).run();
}
