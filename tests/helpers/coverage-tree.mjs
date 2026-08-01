// QA coverage support: keep the transpiled module trees alive inside the
// repo so `node --test --experimental-test-coverage` can attribute lines to
// the production sources they mirror (app/api/*, app/lib/*, db/*, worker).
//
// By default the harnesses build their trees in os.tmpdir() and delete them
// in the after() hook; Node's coverage reporter drops files that no longer
// exist at process exit, so the real code would never show up in the report.
// When OSDB_COVERAGE_TREE=1 (set by `npm run coverage`) the trees are created
// under .coverage/trees/ (gitignored) and left in place until the coverage
// tooling has consumed them.
//
// Test tooling only — never imported by production code.

import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const COVERAGE_TREE_ENV = "OSDB_COVERAGE_TREE";

export const isCoverageTreeMode = () => process.env[COVERAGE_TREE_ENV] === "1";

// Parent directory passed to mkdtemp(). Ensures it exists so mkdtemp can
// create its unique subdirectory.
export function coverageTreeRoot() {
  if (!isCoverageTreeMode()) return os.tmpdir();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dir = path.join(root, ".coverage", "trees");
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Harness cleanup should skip the rm() while a coverage run is in flight so
// the transpiled modules survive until the report is written at exit.
export const coverageTreeCleanupEnabled = () => !isCoverageTreeMode();
