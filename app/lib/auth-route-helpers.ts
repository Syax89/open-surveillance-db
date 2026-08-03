/**
 * Shared helpers for the contributor-auth route family (/api/auth/*).
 *
 * Deliberately dependency-free of `cloudflare:workers` (the value is passed
 * in), matching input-limits.ts and rate-limit.ts, so the test harness can
 * transpile and import it in plain Node.
 */

import { recordRateLimitBlock } from "./abuse-alerts";
import { callerKey, checkRateLimit, limitsFor } from "./rate-limit";
import {
  isValidNewPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "./password-policy";
import type { LoginLockoutPolicy } from "../../db/auth";

export { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH };
export const MAX_DISPLAY_NAME_LENGTH = 60;

/**
 * Default per-email lockout policy (ADR 0016): 5 failed logins inside a
 * 15-minute window lock the account for 15 minutes; consecutive lockouts
 * double the duration up to a 2-hour cap. The counting window re-anchors at
 * the moment the lockout trips, so an attacker who resumes right after the
 * lock expires escalates the backoff instead of starting over.
 */
export const LOGIN_LOCKOUT_DEFAULTS: LoginLockoutPolicy = {
  maxAttempts: 5,
  windowSeconds: 15 * 60,
  durationSeconds: 15 * 60,
  maxDurationSeconds: 2 * 60 * 60,
};

/**
 * Resolve the per-email lockout policy, honouring env overrides. The
 * parameter is `unknown` (cast internally) for the same reason as
 * `limitsFor` in rate-limit.ts: Cloudflare's `Env` has no string index
 * signature, and this module must stay runnable in plain Node.
 */
export function loginLockoutPolicy(env: unknown): LoginLockoutPolicy {
  const config = env as { [key: string]: unknown };
  const read = (key: string, fallback: number): number => {
    const value = Number(config[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    maxAttempts: read("AUTH_LOCKOUT_MAX_ATTEMPTS", LOGIN_LOCKOUT_DEFAULTS.maxAttempts),
    windowSeconds: read("AUTH_LOCKOUT_WINDOW_SECONDS", LOGIN_LOCKOUT_DEFAULTS.windowSeconds),
    durationSeconds: read("AUTH_LOCKOUT_DURATION_SECONDS", LOGIN_LOCKOUT_DEFAULTS.durationSeconds),
    maxDurationSeconds: read(
      "AUTH_LOCKOUT_MAX_DURATION_SECONDS",
      LOGIN_LOCKOUT_DEFAULTS.maxDurationSeconds,
    ),
  };
}

/**
 * Rate limit the auth endpoints. Register and login are credential-guessing
 * surfaces, so the dedicated `auth` bucket (default 10/min per caller) sits
 * deliberately low; the same bucket also covers the session/profile reads.
 * In production the bucket is enforced by the AUTH_LIMITER binding
 * (wrangler.jsonc `ratelimits`); without the binding (local dev, tests) the
 * in-memory fallback applies — see app/lib/rate-limit.ts.
 */
export async function authLimit(
  request: Request,
  env: unknown,
  route: string,
): Promise<Response | null> {
  const key = callerKey(request);
  const limitOptions = limitsFor("auth", env);
  const limit = await checkRateLimit(env, "auth", key, limitOptions);
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

/**
 * Password policy for NEW passwords (register, password reset): 10..200
 * chars with at least one uppercase, one lowercase, one digit and one
 * special character (CEO feedback 2026-08-03). The rules live in
 * ./password-policy so the client forms validate with the same policy.
 */
export function isValidPassword(value: unknown): value is string {
  return isValidNewPassword(value);
}

/**
 * Shape-only check for LOGIN (and the OIDC merge proof-of-ownership):
 * a string of 10..200 chars with NO composition rules. Accounts created
 * under the old length-only policy keep signing in — the composition policy
 * applies only to NEW passwords (register, reset).
 */
export function isValidPasswordShape(value: unknown): value is string {
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
