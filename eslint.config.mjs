import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // QA test harness temp trees (tests/.render-tmp-*, tests/.dbg-tmp-*):
    // generated at runtime by tests/pages-render.test.mjs; must never be
    // linted even if a crashed run leaves one behind.
    "tests/.render-tmp-*/**",
    "tests/.dbg-tmp-*/**",
    // DOM harness transpile tree (tests/helpers/dom-harness.mjs): esbuild
    // output written to tests/.dom-tmp-*/ at runtime by the jsdom tests
    // (client-*.test.mjs). The transpiled code trips the React purity/refs
    // rules that the handwritten sources satisfy, so it must never be
    // linted even if a crashed run leaves the tree behind.
    "tests/.dom-tmp-*/**",
  ]),
]);

export default eslintConfig;
