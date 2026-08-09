/**
 * Visual-layout source contracts for /segnala and /login.
 *
 * JSDOM covers DOM order and semantic reachability but deliberately does not
 * calculate CSS grids or surfaces. These assertions pin the CSS half of the
 * UX contract; browser QA covers the final computed layout at desktop/390px.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(...parts) {
  return readFile(path.join(root, ...parts), "utf8");
}

/** Extract every `@media (max-width:NNNpx) { ... }` body without a CSS parser. */
function mediaBlocks(css) {
  const blocks = [];
  const re = /@media\s*\(max-width:\s*(\d+)px\)\s*\{/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    let depth = 1;
    let index = re.lastIndex;
    while (depth > 0 && index < css.length) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push({ width: Number(match[1]), body: css.slice(re.lastIndex, index - 1) });
  }
  return blocks;
}

test("/segnala: only the tool variant overrides the reusable desktop report grid", async () => {
  const [css, reportForm, segnalaTool] = await Promise.all([
    source("app", "globals.css"),
    source("app", "components", "home", "ReportForm.tsx"),
    source("app", "components", "tools", "SegnalaTool.tsx"),
  ]);

  // The reusable report section keeps its editorial two-column default.
  assert.match(
    css,
    /\.report-section\s*\{[^}]*grid-template-columns:\s*\.8fr\s+1\.1fr/,
    "legacy/info ReportForm embeddings must keep their default composition",
  );

  // /segnala opts into a more-specific two-class selector, so it wins over
  // the generic tablet grid below 980px without altering other embeddings.
  const toolRule = css.match(/\.report-section\.report-section--tool\s*\{([^}]*)\}/);
  assert.ok(toolRule, "expected the scoped /segnala CSS variant");
  assert.match(
    toolRule[1],
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    "/segnala must resolve to one flexible desktop column",
  );
  assert.match(toolRule[1], /max-width:\s*920px/, "the long form keeps a readable desktop measure");

  const tablet = mediaBlocks(css).find((block) => block.width === 980 && /\.report-section/.test(block.body));
  assert.ok(tablet, "expected the generic tablet breakpoint carrying the report grid");
  assert.match(tablet.body, /\.report-section,\s*\.correction-section\s*\{\s*grid-template-columns:\s*1fr\s+1fr/, "the generic tablet grid remains explicit");
  assert.doesNotMatch(tablet.body, /\.report-section--tool/, "the tool must rely on its scoped higher-specificity selector, not rewrite the breakpoint globally");

  assert.match(reportForm, /layout\s*=\s*"default"/, "ReportForm defaults to the reusable layout");
  assert.match(reportForm, /layout\s*===\s*"tool"\s*\?\s*" report-section--tool"\s*:\s*""/, "only an explicit tool layout adds the modifier");
  assert.match(segnalaTool, /<ReportForm[^>]*layout="tool"/, "only /segnala opts into the one-column variant");
});

test("/login: method disclosures stay visible supporting copy, not nested card surfaces", async () => {
  const [css, loginBody] = await Promise.all([
    source("app", "globals.css"),
    source("app", "login", "LoginPageBody.tsx"),
  ]);

  const flattened = css.match(
    /\.auth-login-card\s+\.auth-method-disclosure\s*,\s*\.auth-login-card\s+\.oidc-disclosure\s*\{([^}]*)\}/,
  );
  assert.ok(flattened, "expected the login-only disclosure flattening rule");
  assert.match(flattened[1], /padding:\s*0/, "inner disclosure must not create a padded tile");
  assert.match(flattened[1], /border:\s*0/, "inner disclosure must not create a bordered tile");
  assert.match(flattened[1], /border-radius:\s*0/, "inner disclosure must not create a rounded tile");
  assert.match(flattened[1], /background:\s*transparent/, "inner disclosure must not create a filled tile");
  assert.match(
    css,
    /\.auth-login-card\s+\.auth-method-disclosure\s*\{\s*color:\s*var\(--muted\)/,
    "risk copy remains styled as readable supporting text",
  );

  assert.match(loginBody, /record-detail auth-card auth-login-card/, "the outer shared auth card remains the single login surface");
  assert.match(loginBody, /auth-method-disclosure/, "password/passkey disclosure content remains rendered");
  assert.match(loginBody, /oidc-disclosure/, "provider disclosure content remains rendered");
});
