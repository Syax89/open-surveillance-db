/**
 * Pending-photo quota (audit t_2ee58c08, P2): a per-caller state quota on
 * pending photo uploads, distinct from the HTTP rate limit.
 *
 * The submit rate limit (app/lib/rate-limit.ts, "submit" bucket) bounds how
 * fast one caller can POST, but nothing bounded how many pending photos (or
 * how many R2 bytes) a caller could accumulate while the moderation queue
 * catches up. A hostile caller could therefore grow unbounded R2 storage and
 * drown the human moderation gate with junk.
 *
 * This module owns the two environment knobs and the caller-bucket key:
 *
 *   - PHOTOS_MAX_PENDING_PER_CALLER (default 20): max pending photos per
 *     caller bucket. Over it, POST /api/photos answers 429.
 *   - PHOTOS_MAX_PENDING_BYTES (default 200 MiB): max pending R2 bytes per
 *     caller bucket, so the volume is capped even when the count is not the
 *     binding constraint (e.g. after operators raise the count, or when a
 *     single pending upload is close to the 10 MiB per-photo cap).
 *
 * The bucket key (`submitterKey`) is derived without storing personal data:
 *   - authenticated uploads: `contributor:<contributor_id>`
 *   - anonymous uploads: `anon:<sha256(caller key)>` — the same hashed caller
 *     key the rate limiter and abuse alerts use, NEVER the raw IP
 *     (docs/PRIVACY_AND_SAFETY.md, app/lib/abuse-alerts.ts).
 *
 * The check itself is a D1 COUNT/SUM over `photos WHERE submitter_key = ?
 * AND status = 'pending'` (db/photos.ts pendingPhotoUsage), backed by the
 * partial index `photos_pending_submitter_idx`. The route enforces it before
 * the R2 store: the count is checked before the body is even read, the byte
 * quota after the sanitised size is known but before any bytes are written.
 */

import { callerKey } from "./rate-limit";
import { sha256Hex } from "./abuse-alerts";

export const DEFAULT_MAX_PENDING_PHOTOS_PER_CALLER = 20;
export const DEFAULT_MAX_PENDING_PHOTO_BYTES = 200 * 1024 * 1024; // 200 MiB

type EnvLike = { [key: string]: unknown };

export type PendingPhotoQuota = {
  maxPendingCount: number;
  maxPendingBytes: number;
};

/**
 * Resolve the pending-photo quota knobs, honouring env overrides. `unknown`
 * parameter on purpose: the Cloudflare `Env` interface has no string index
 * signature, and this module must stay runnable in plain Node.
 */
export function pendingPhotoQuota(env: unknown): PendingPhotoQuota {
  const config = env as EnvLike;
  const maxPendingCount = Number(config.PHOTOS_MAX_PENDING_PER_CALLER);
  const maxPendingBytes = Number(config.PHOTOS_MAX_PENDING_BYTES);
  return {
    maxPendingCount:
      Number.isFinite(maxPendingCount) && maxPendingCount > 0
        ? maxPendingCount
        : DEFAULT_MAX_PENDING_PHOTOS_PER_CALLER,
    maxPendingBytes:
      Number.isFinite(maxPendingBytes) && maxPendingBytes > 0
        ? maxPendingBytes
        : DEFAULT_MAX_PENDING_PHOTO_BYTES,
  };
}

/**
 * Derive the quota bucket key for a request. Authenticated callers are
 * bucketed by contributor id (stable across IP changes); anonymous callers
 * by a SHA-256 hash of the rate-limit caller key — never the raw IP.
 */
export async function submitterKeyFor(
  auth: { contributor: { id: number } } | null,
  request: Request,
): Promise<string> {
  if (auth) return `contributor:${auth.contributor.id}`;
  return `anon:${await sha256Hex(callerKey(request))}`;
}
