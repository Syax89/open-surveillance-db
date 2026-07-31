/**
 * Shared helpers for the contributor-auth route family (/api/auth/*).
 *
 * Deliberately dependency-free of `cloudflare:workers` (the value is passed
 * in), matching input-limits.ts and rate-limit.ts, so the test harness can
 * transpile and import it in plain Node.
 */

import { recordRateLimitBlock } from "./abuse-alerts";
import { callerKey, checkRateLimit, limitsFor } from "./rate-limit";

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;
export const MAX_DISPLAY_NAME_LENGTH = 60;

/**
 * Rate limit the auth endpoints. Register and login are credential-guessing
 * surfaces, so the dedicated `auth` bucket (default 10/min per caller) sits
 * deliberately low; the same bucket also covers the session/profile reads.
 */
export function authLimit(request: Request, env: unknown, route: string): Response | null {
  const key = callerKey(request);
  const limitOptions = limitsFor("auth", env);
  const limit = checkRateLimit("auth", key, limitOptions);
  if (!limit.allowed) {
    console.warn(`${route} rate limited`);
    recordRateLimitBlock(env, {
      route,
      key,
      windowSeconds: limitOptions.windowSeconds,
    });
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }
  return null;
}

/** Password policy: length-bounded only (no composition rules). */
export function isValidPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= MIN_PASSWORD_LENGTH &&
    value.length <= MAX_PASSWORD_LENGTH
  );
}

/**
 * Optional display name: absent/empty → null; otherwise must be a trimmed
 * string of 2..MAX_DISPLAY_NAME_LENGTH characters. Returns undefined for an
 * invalid provided value so the route can distinguish "omitted" from "bad".
 */
export function parseDisplayName(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > MAX_DISPLAY_NAME_LENGTH) return undefined;
  return trimmed;
}

/** Build a multi Set-Cookie header init from cookie strings. */
export function cookieHeaderInit(cookies: string[]): [string, string][] {
  return cookies.map((cookie) => ["Set-Cookie", cookie]);
}
