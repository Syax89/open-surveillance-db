/**
 * Unit tests for the shared password policy (CEO feedback 2026-08-03).
 *
 * The composition policy (>= 10 chars + at least one uppercase, lowercase,
 * digit and special character) applies ONLY to NEW passwords; login keeps
 * the shape-only check so accounts created under the old length-only policy
 * keep signing in. Both surfaces are exercised here against the real
 * transpiled modules.
 */
import assert from "node:assert/strict";
import test, { before } from "node:test";
import { loadLibModule } from "./helpers/api-harness.mjs";

let policy;
let helpers;

before(async () => {
  policy = await loadLibModule("password-policy");
  helpers = await loadLibModule("auth-route-helpers");
});

// One password per composition rule: every fixture is 10..200 chars and
// satisfies all the OTHER rules, so exactly one rule fails.
const FAILS_ONE_RULE = [
  { name: "no uppercase", password: "lowercase1!", expected: ["uppercase"] },
  { name: "no lowercase", password: "UPPERCASE1!", expected: ["lowercase"] },
  { name: "no digit", password: "Uppercase!", expected: ["digit"] },
  { name: "no special", password: "Uppercase123", expected: ["special"] },
];

test("passwordRuleFailures returns an empty array for a policy-compliant password", () => {
  assert.deepEqual(policy.passwordRuleFailures("Sup3rsecret!123"), []);
  // Exact boundaries: 10 chars and 200 chars, each with all four classes.
  assert.deepEqual(policy.passwordRuleFailures("Ab1!cdefgh"), [], "10 chars must pass");
  const long = `A${"a".repeat(197)}1!`;
  assert.equal(long.length, 200);
  assert.deepEqual(policy.passwordRuleFailures(long), [], "200 chars must pass");
});

test("passwordRuleFailures reports exactly one failing rule per missing class", async (t) => {
  for (const { name, password, expected } of FAILS_ONE_RULE) {
    await t.test(name, () => {
      assert.deepEqual(policy.passwordRuleFailures(password), expected);
    });
  }
});

test("passwordRuleFailures reports the length rule for too-short and too-long passwords", () => {
  // "Ab1!" has every character class but is only 4 chars.
  assert.deepEqual(policy.passwordRuleFailures("Ab1!"), ["length"]);
  // 201 chars, all classes present, exceeds the 200-char cap.
  const tooLong = `A${"a".repeat(198)}1!`;
  assert.equal(tooLong.length, 201);
  assert.deepEqual(policy.passwordRuleFailures(tooLong), ["length"]);
});

test("isValidNewPassword enforces the full policy on unknown values", () => {
  assert.equal(policy.isValidNewPassword("Sup3rsecret!123"), true);
  for (const { password } of FAILS_ONE_RULE) {
    assert.equal(policy.isValidNewPassword(password), false, password);
  }
  assert.equal(policy.isValidNewPassword(42), false, "non-string values are rejected");
  assert.equal(policy.isValidNewPassword(""), false, "empty string is rejected");
  assert.equal(policy.isValidNewPassword(null), false);
});

test("login keeps the shape-only check so legacy accounts still sign in", () => {
  // Accounts created under the old length-only policy may have passwords like
  // "supersecret123" (13 chars, lowercase + digits, no uppercase, no special).
  assert.equal(helpers.isValidPasswordShape("supersecret123"), true, "legacy password must still log in");
  assert.equal(helpers.isValidPasswordShape("wrong-password-123"), true);
  assert.equal(helpers.isValidPasswordShape("short"), false, "length bound still applies");
  assert.equal(helpers.isValidPasswordShape(1234567890), false, "non-strings are rejected");
});

test("isValidPassword (NEW-password policy) rejects legacy-shaped passwords", () => {
  assert.equal(helpers.isValidPassword("Sup3rsecret!123"), true);
  assert.equal(helpers.isValidPassword("supersecret123"), false, "no uppercase / no special");
  assert.equal(helpers.isValidPassword("brand-new-password1"), false, "no uppercase");
  assert.equal(helpers.isValidPassword("short"), false);
});
