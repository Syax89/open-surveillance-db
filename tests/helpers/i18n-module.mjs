/**
 * Import one app/lib/i18n domain file in isolation: transpile it with the
 * project's own TypeScript compiler into a temp dir and import it.
 *
 * Relative VALUE imports between i18n files are followed (e.g. auth.ts
 * spreads the tiny ./auth-nav fragment the header ships on every route):
 * each sibling is transpiled next to the entry as `<name>.mjs` and the
 * specifier rewritten, so the result is the real module graph. Type-only
 * imports (./types) are erased by the transpiler. Data: URLs cannot carry
 * query-string cache busters, hence real temp files.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function transpileInto(dir, tsSourcePath, outName, seen) {
  const source = await readFile(tsSourcePath, "utf8");
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: tsSourcePath,
  }).outputText;
  const deps = [...output.matchAll(/from\s+["'](\.\/[\w-]+)["']/g)].map((m) => m[1]);
  for (const spec of new Set(deps)) {
    const name = spec.slice(2);
    output = output.replaceAll(`"${spec}"`, `"./${name}.mjs"`);
    if (seen.has(name)) continue;
    seen.add(name);
    await transpileInto(dir, path.join(path.dirname(tsSourcePath), `${name}.ts`), `${name}.mjs`, seen);
  }
  await writeFile(path.join(dir, outName), output);
}

export async function importI18nModule(tsSourcePath) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "osdb-i18n-"));
  try {
    await transpileInto(dir, tsSourcePath, "bundle.mjs", new Set());
    return await import(`${pathToFileURL(path.join(dir, "bundle.mjs")).href}?t=${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
