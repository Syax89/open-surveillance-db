// Non-destructive local reset for the D1 dev database.
//
// `npm run db:reset` moves the project-local `.wrangler/state` aside under a
// unique dated name, then applies the Drizzle migrations to a fresh local
// database. Nothing is deleted: the previous state survives as a backup
// directory, exactly like the manual procedure documented in
// docs/DEVELOPMENT_SETUP.md section 6.
//
// The reset is LOCAL ONLY by design: it refuses to run against --remote
// (Cloudflare production) or any shared environment. See the rules in
// docs/LOCAL_PLAYBOOK.md.
//
// After the reset the local database is empty (no demo rows). If you want
// the labelled illustrative pins back, run `npm run db:seed`.

import { execFileSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = path.join(root, ".wrangler", "state");
const wranglerBin = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function runWrangler(args) {
  execFileSync(process.execPath, [wranglerBin, ...args], {
    cwd: root,
    stdio: "inherit",
  });
}

if (!existsSync(stateDir)) {
  console.log("No local state found (.wrangler/state missing) — nothing to reset.");
} else {
  const backupDir = path.join(root, ".wrangler", `state.bak-${stamp()}`);
  renameSync(stateDir, backupDir);
  console.log(`Moved local state aside: .wrangler/state -> ${path.relative(root, backupDir)}`);
}

console.log("Applying Drizzle migrations to a fresh local database…");
runWrangler(["d1", "migrations", "apply", "opensurveillancedb", "--local"]);

console.log("\nReset complete. The local database is empty.");
console.log("Optional: run `npm run db:seed` to add the two labelled demo pins.");
