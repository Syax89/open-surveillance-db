#!/usr/bin/env node
/**
 * Print the failing tests of a `node --test` TAP run (CI diagnostics).
 *
 * Why (2026-11-26): the CI "Build + test suite (with coverage)" step failed
 * intermittently four times (PRs #571, #574, #578 twice) and the failing
 * test could never be named. The job log is ~33,000 lines (TAP plus a
 * ~3,000-line inline coverage table), so the `not ok` lines are buried in
 * the middle and the API only returns the tail. `npm run coverage` already
 * tees the run to `.coverage/coverage.txt`; ci.yml runs this script on
 * failure to surface the names.
 *
 *   node scripts/ci-failed-tests.mjs [file]   # default .coverage/coverage.txt
 *
 * Output:
 *   - stdout: each failing test with its TAP diagnostic block (error,
 *     location, stack), capped in total;
 *   - one `::error title=Failing test::<name> (<location>)` GitHub
 *     annotation per failure, so the names show on the PR checks;
 *   - the same list appended to $GITHUB_STEP_SUMMARY when it is set.
 * When the run has no `not ok` line (the runner killed the process, e.g.
 * out of memory), the last lines before the coverage report are printed
 * instead, to show where it stopped.
 *
 * Diagnostics only: it always exits 0 and never changes the job's outcome.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const NOT_OK = /^(\s*)not ok \d+ - (.*)$/;
export const MAX_BLOCK_LINES = 40;
export const MAX_TOTAL_LINES = 400;
export const TAIL_LINES = 60;

/**
 * Parse TAP text into failing tests: `{ name, depth, location, error, block }`.
 * `block` is the `not ok` line plus its YAML diagnostic (up to the closing
 * `...`), capped at MAX_BLOCK_LINES. A parent whose only problem is failing
 * subtests ("N subtests failed") is dropped when a child already reports it.
 */
export function parseFailures(text) {
  const lines = text.split(/\r?\n/);
  const failures = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = NOT_OK.exec(lines[index]);
    if (!match) continue;
    const [, indent, name] = match;
    const block = [lines[index]];
    let location = null;
    let error = null;
    const yamlIndent = `${indent}  `;
    if ((lines[index + 1] ?? "") === `${yamlIndent}---`) {
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const line = lines[cursor];
        if (block.length < MAX_BLOCK_LINES) block.push(line);
        if (line === `${yamlIndent}...`) break;
        const locationMatch = /^\s*location: '(.*)'$/.exec(line);
        // Repo-relative (the runner's absolute checkout path is noise).
        if (locationMatch && location === null) location = locationMatch[1].replace(`${process.cwd()}/`, "");
        const errorMatch = /^\s*error: (.*)$/.exec(line);
        if (errorMatch && error === null) {
          const value = errorMatch[1].trim();
          // `error: |-` is a YAML block scalar: the message is the next line.
          error = value === "|-" || value === "|" ? (lines[cursor + 1] ?? "").trim() : value.replace(/^'|'$/g, "");
        }
      }
    }
    failures.push({ name, depth: indent.length, location, error, block });
  }
  // Drop parents that only aggregate a child's failure (same or deeper
  // failure already listed): their error reads "N subtests failed".
  return failures.filter((failure) => !(failure.error && /^\d+ subtests? failed$/.test(failure.error) && failures.some((other) => other.depth > failure.depth)));
}

/** The last TAIL_LINES lines before the inline coverage report (or the end). */
export function tailBeforeCoverage(text) {
  const lines = text.split(/\r?\n/);
  const reportStart = lines.findIndex((line) => line.startsWith("# start of coverage report"));
  const end = reportStart === -1 ? lines.length : reportStart;
  return lines.slice(Math.max(0, end - TAIL_LINES), end);
}

const escapeAnnotation = (value) => value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");

export function report(text, { write = (line) => console.log(line), summary = null } = {}) {
  const failures = parseFailures(text);
  if (failures.length === 0) {
    write("No `not ok` line in the test output: the run may have been killed (timeout or out of memory).");
    write(`Last ${TAIL_LINES} lines before the coverage report:`);
    for (const line of tailBeforeCoverage(text)) write(line);
    summary?.("### Test run failed without a `not ok` line\n\nThe process was probably killed (timeout or out of memory). See the job log tail.\n");
    return failures;
  }
  write(`${failures.length} failing test(s):`);
  let printed = 0;
  for (const failure of failures) {
    const where = failure.location ? ` (${failure.location})` : "";
    write(`::error title=Failing test::${escapeAnnotation(`${failure.name}${where}${failure.error ? `: ${failure.error}` : ""}`)}`);
    for (const line of failure.block) {
      if (printed >= MAX_TOTAL_LINES) break;
      write(line);
      printed += 1;
    }
  }
  if (printed >= MAX_TOTAL_LINES) write(`… output capped at ${MAX_TOTAL_LINES} lines; the full run is in the coverage-output artifact.`);
  summary?.(
    `### ${failures.length} failing test(s)\n\n` +
      failures.map((failure) => `- **${failure.name}**${failure.location ? ` — \`${failure.location}\`` : ""}${failure.error ? `: ${failure.error}` : ""}`).join("\n") +
      "\n",
  );
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? ".coverage/coverage.txt";
  if (!existsSync(file)) {
    console.log(`${file} not found: the test step failed before the suite started (see the log above).`);
  } else {
    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    report(readFileSync(file, "utf8"), {
      summary: summaryFile ? (markdown) => appendFileSync(summaryFile, markdown) : null,
    });
  }
}
