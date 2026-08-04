/**
 * Shared client-side session read for GET /api/auth/me with bounded
 * retry-on-429 (QA#2 F3).
 *
 * The public header (AuthNavLinks) and the write gate (WriteGateWall) call
 * this endpoint on every page view. The server-side session bucket
 * (app/lib/rate-limit.ts, `session`) defaults to 120/min, which is far
 * above interactive navigation — but a burst (fast back/forward clicking,
 * a shared NAT IP) can still trip a 429. Instead of fail-closing the
 * header links or showing the write-gate error wall on the first 429, this
 * helper retries a bounded number of times with a short backoff:
 *
 *   - up to 2 retries (3 attempts total);
 *   - delay honours the server's Retry-After header (capped at 3s), else
 *     a flat 1s;
 *   - after the last attempt the 429 is returned as-is, and the callers
 *     keep their fail-closed semantics (header renders nothing, write gate
 *     shows its honest error wall).
 *
 * Only 429 is retried. 5xx / network errors pass through immediately: the
 * header and write gate must never claim "anonymous" (or anything else) on
 * an error they cannot interpret (privacy by design, fail-closed).
 */

const MAX_RETRIES = 2;
const DEFAULT_DELAY_MS = 1_000;
const MAX_DELAY_MS = 3_000;

export async function fetchSessionMe(signal?: AbortSignal): Promise<Response> {
  let attempts = 0;
  while (true) {
    const response = await fetch("/api/auth/me", { signal });
    if (response.status !== 429 || attempts >= MAX_RETRIES) return response;

    const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
    const delayMs = Math.min(
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : DEFAULT_DELAY_MS,
      MAX_DELAY_MS,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    attempts += 1;
  }
}
