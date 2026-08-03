/**
 * Password policy shared by the server validation and the client forms.
 *
 * CEO feedback 2026-08-03: the previous policy (length only, >= 10 chars)
 * is replaced by a composition policy — at least one uppercase letter, one
 * lowercase letter, one digit and one special character, on top of the
 * existing 10..200 length bounds.
 *
 * This module is deliberately dependency-free (no `cloudflare:workers`, no
 * React): the route helpers transpile and import it in plain Node, and the
 * client forms import the same rules so the two surfaces can never drift.
 *
 * IMPORTANT: the composition rules apply ONLY to NEW passwords (register,
 * password reset). Login must keep the shape-only check
 * (isValidPasswordShape in auth-route-helpers.ts) so accounts created under
 * the old length-only policy can still sign in.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

export type PasswordRule = "length" | "uppercase" | "lowercase" | "digit" | "special";

/** One regex per composition rule; each matches at least one allowed char. */
const COMPOSITION_RULES: Record<Exclude<PasswordRule, "length">, RegExp> = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  digit: /[0-9]/,
  special: /[^A-Za-z0-9]/,
};

/**
 * Return the rules a candidate password violates, in a stable order
 * (length first, then uppercase, lowercase, digit, special). An empty array
 * means the password satisfies the full policy.
 */
export function passwordRuleFailures(value: string): PasswordRule[] {
  const failures: PasswordRule[] = [];
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    failures.push("length");
  }
  for (const rule of ["uppercase", "lowercase", "digit", "special"] as const) {
    if (!COMPOSITION_RULES[rule].test(value)) failures.push(rule);
  }
  return failures;
}

/**
 * Full password policy for NEW passwords: string of 10..200 chars with at
 * least one uppercase, one lowercase, one digit and one special character.
 */
export function isValidNewPassword(value: unknown): value is string {
  return typeof value === "string" && passwordRuleFailures(value).length === 0;
}
