// CI diagnostics (scripts/ci-failed-tests.mjs, 2026-11-26): on a failed
// coverage run, ci.yml prints the failing tests from the tee'd TAP output.
// The fixtures below use the exact TAP shape `node --test` emits.

import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_TOTAL_LINES, parseFailures, report, tailBeforeCoverage } from "../scripts/ci-failed-tests.mjs";

const TAP = `TAP version 13
# Subtest: passes
ok 1 - passes
  ---
  duration_ms: 1.2
  type: 'test'
  ...
# Subtest: the map region is a labelled landmark
not ok 2 - the map region is a labelled landmark
  ---
  duration_ms: 14.79
  type: 'test'
  location: '/repo/tests/a11y-interactive.test.mjs:132:1'
  failureType: 'testCodeFailure'
  error: |-
    Unexpected options passed to \`new Miniflare()\` constructor
  code: 'ERR_VALIDATION'
  stack: |-
    validateOptions (/repo/node_modules/miniflare/dist/src/index.js:1:1)
  ...
# Subtest: suite
    # Subtest: inner flaky case
    not ok 1 - inner flaky case
      ---
      duration_ms: 3.1
      type: 'test'
      location: '/repo/tests/client-field-of-view.test.mjs:378:3'
      failureType: 'testCodeFailure'
      error: 'Expected values to be strictly equal: 1 !== 2'
      ...
not ok 3 - suite
  ---
  duration_ms: 5.0
  type: 'suite'
  location: '/repo/tests/client-field-of-view.test.mjs:370:1'
  failureType: 'subtestsFailed'
  error: '1 subtest failed'
  ...
1..3
# tests 3
# pass 1
# fail 2
# start of coverage report
# file | line % |
# end of coverage report
`;

test("parseFailures names every failing test with its location and error, skipping aggregate parents", () => {
  const failures = parseFailures(TAP);
  assert.deepEqual(
    failures.map(({ name, location, error }) => ({ name, location, error })),
    [
      {
        name: "the map region is a labelled landmark",
        location: "/repo/tests/a11y-interactive.test.mjs:132:1",
        error: "Unexpected options passed to `new Miniflare()` constructor",
      },
      {
        name: "inner flaky case",
        location: "/repo/tests/client-field-of-view.test.mjs:378:3",
        error: "Expected values to be strictly equal: 1 !== 2",
      },
    ],
  );
  assert.equal(failures[0].block.at(-1), "  ...", "the diagnostic block ends at its closing marker");
});

test("report emits one ::error annotation per failure and a step-summary list", () => {
  const out = [];
  let summary = "";
  report(TAP, { write: (line) => out.push(line), summary: (markdown) => (summary += markdown) });
  const annotations = out.filter((line) => line.startsWith("::error title=Failing test::"));
  assert.equal(annotations.length, 2);
  assert.match(annotations[0], /the map region is a labelled landmark \(\/repo\/tests\/a11y-interactive\.test\.mjs:132:1\)/);
  assert.match(summary, /### 2 failing test\(s\)/);
  assert.match(summary, /\*\*inner flaky case\*\* — `\/repo\/tests\/client-field-of-view\.test\.mjs:378:3`/);
});

test("a run killed before any `not ok` prints the tail before the coverage report", () => {
  const killed = `TAP version 13\n${Array.from({ length: 100 }, (_, i) => `ok ${i + 1} - t${i}`).join("\n")}\n# Subtest: hangs forever\n`;
  const out = [];
  let summary = "";
  report(killed, { write: (line) => out.push(line), summary: (markdown) => (summary += markdown) });
  assert.match(out[0], /No `not ok` line/);
  assert.ok(out.includes("# Subtest: hangs forever"), "the last started subtest is shown");
  assert.match(summary, /without a `not ok` line/);
  assert.deepEqual(tailBeforeCoverage(TAP).at(-1), "# fail 2", "the tail stops at the coverage report");
});

test("printed output is capped, and annotations escape newlines", () => {
  const many = Array.from({ length: 50 }, (_, i) => `not ok ${i + 1} - case ${i}\n  ---\n  error: |-\n    line one\n${"  stack: x\n".repeat(20)}  ...`).join("\n");
  const out = [];
  report(many, { write: (line) => out.push(line) });
  const blockLines = out.filter((line) => !line.startsWith("::error") && !line.startsWith("50 failing") && !line.startsWith("…"));
  assert.ok(blockLines.length <= MAX_TOTAL_LINES);
  assert.match(out.at(-1), /output capped/);
  assert.equal(out.filter((line) => line.startsWith("::error")).length, 50, "every failure still gets its annotation");
});
