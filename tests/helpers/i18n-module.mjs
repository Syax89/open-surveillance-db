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
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function transpileInto(dir, tsSourcePath, outRel, seen) {
  const source = await readFile(tsSourcePath, "utf8");
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: tsSourcePath,
  }).outputText;
  // Relative value imports, including the per-locale files under
  // ./locales/<code>/ (2026-11): mirror the source layout under `dir`.
  const deps = [...output.matchAll(/from\s+["'](\.{1,2}\/[\w./-]+)["']/g)].map((m) => m[1]);
  for (const spec of new Set(deps)) {
    output = output.replaceAll(`"${spec}"`, `"${spec}.mjs"`);
    const depSource = path.resolve(path.dirname(tsSourcePath), `${spec}.ts`);
    const depRel = path.join(path.dirname(outRel), `${spec}.mjs`);
    if (seen.has(depSource)) continue;
    seen.add(depSource);
    await transpileInto(dir, depSource, depRel, seen);
  }
  const out = path.join(dir, outRel);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, output);
}

export async function importI18nModule(tsSourcePath) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "osdb-i18n-"));
  try {
    const entry = path.join("i18n", "bundle.mjs");
    await transpileInto(dir, tsSourcePath, entry, new Set());
    return await import(`${pathToFileURL(path.join(dir, entry)).href}?t=${Date.now()}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
