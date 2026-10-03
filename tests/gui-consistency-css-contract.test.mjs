/**
 * GUI-consistency source contracts (CEO 2026-10 follow-up).
 *
 * The whole public surface shares ONE 900px readable column: the auth/record
 * cards AND the write-tool surfaces (/segnala, /correggi). jsdom cannot lay
 * out CSS, so — like the other source-guard suites (report-login-layout,
 * header-mobile-menu, explorer-layout-polish) — these assertions pin the
 * changed rules in app/globals.css. Each assertion targets the fix itself,
 * so reverting the fix fails the test (they do not merely re-read a fixture).
 *
 * Covered here: the shared 900px card/tool alignment, the ≤700px mobile
 * gutter and the viewport-clamped legal-table breakout. The compact footer
 * density is pinned UNCHANGED (it must not move).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Strip CSS comments ONCE before parsing: prose that names a selector/value
// must never satisfy a declaration regex, and the brace-counting below needs
// exact '{'/'}' depth (comments can contain either).
const cssPromise = readFile(path.join(root, "app", "globals.css"), "utf8")
  .then((raw) => raw.replace(/\/\*[\s\S]*?\*\//g, ""));

/** Extract every `@media (bound:NNNpx) { ... }` block as { width, body }. */
function mediaBlocks(css, bound) {
  const blocks = [];
  const re = new RegExp(`@media\\s*\\(${bound}:\\s*(\\d+)px\\)\\s*\\{`, "g");
  let match;
  while ((match = re.exec(css)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      i += 1;
    }
    blocks.push({ width: Number(match[1]), body: css.slice(re.lastIndex, i - 1) });
  }
  return blocks;
}

test("shared readable column: --container-readable stays 900px and cards inherit it", async () => {
  const css = await cssPromise;
  assert.match(
    css,
    /--container-readable:\s*min\(900px,\s*calc\(100%\s*-\s*48px\)\)/,
    "the readable container token must be 900px",
  );
  assert.match(
    css,
    /\.record-detail\s*\{[^}]*width:\s*var\(--container-readable\)/,
    "the shared card width derives from --container-readable",
  );
  // The old 560px cap made the 900px resolution a no-op for /login.
  assert.doesNotMatch(
    css,
    /\.auth-card\s*\{[^}]*max-width/,
    "the auth card must not cap its width below the shared 900px column",
  );
  // Brand accent is green (semantic warning/danger colours stay distinct).
  assert.match(css, /--accent:\s*rgb\(40 125 78\)/, "the brand accent token must be the green rgb(40 125 78)");
  assert.match(css, /--danger-ink:\s*rgb\(138 59 44\)/, "danger keeps its own semantic colour");
});

test("form tools (/segnala, /correggi) share the 900px content column", async () => {
  const css = await cssPromise;
  const desktop = mediaBlocks(css, "min-width").find((b) => b.width === 701);
  assert.ok(desktop, "expected the (min-width:701px) form-tool block");
  assert.match(
    desktop.body,
    /\.tool-section\.report-tool\s*,\s*\.tool-section\.correction-tool\s*\{\s*width:\s*var\(--container-readable\)/,
    "the form tools must adopt the 900px readable wrapper",
  );

  // The wall card fills that wrapper (no 640px cap) …
  assert.doesNotMatch(
    css,
    /\.write-gate-wall\s*\{[^}]*max-width/,
    "the write-gate wall must not cap its width below the tool wrapper",
  );
  // … the authenticated /segnala form fills it too (max-width:920 untouched) …
  assert.match(
    css,
    /\.tool-section\.report-tool\s+\.report-section--tool\s*\{\s*width:\s*100%/,
    "the authenticated /segnala form must fill the wrapper",
  );
  assert.match(
    css,
    /\.report-section\.report-section--tool\s*\{[^}]*max-width:\s*920px/,
    "the scoped one-column max-width:920px contract remains",
  );
  // … and the embedded /correggi section no longer subtracts another 48px.
  assert.match(
    css,
    /\.tool-section\.correction-tool\s+\.correction-section\s*\{\s*width:\s*100%/,
    "the embedded correction section must not re-apply the container inset",
  );
  // The correction grid itself is untouched.
  assert.match(
    css,
    /\.correction-section\s*\{[^}]*grid-template-columns:\s*\.8fr\s+1\.1fr/,
    "the desktop correction grid is not redesigned",
  );
});

test("≤700px: home tool cards share the 16px content gutter via the existing selector", async () => {
  const css = await cssPromise;
  // There are several (max-width:700px) blocks; the shared home-section
  // container selector is the one that lists .founder-declaration.
  const mobile = mediaBlocks(css, "max-width").find(
    (b) => b.width === 700 && b.body.includes(".founder-declaration"),
  );
  assert.ok(mobile, "expected the (max-width:700px) shared-container block (home sections incl. .founder-declaration)");
  assert.match(
    mobile.body,
    /\.tool-cards[^{}]*\{[^}]*min\(100%\s*-\s*32px,\s*1180px\)/,
    ".tool-cards must sit in the shared mobile container selector at 100% - 32px",
  );
  assert.doesNotMatch(
    mobile.body,
    /\.tool-cards\s*\{/,
    "no parallel .tool-cards rule — it joins the existing container selector",
  );
});

test("≤480px: the compact header matches the 16px content gutter (32px, not 24px)", async () => {
  const css = await cssPromise;
  const first480 = mediaBlocks(css, "max-width").find((b) => b.width === 480);
  assert.ok(first480, "expected the first (max-width:480px) block (header)");
  assert.match(
    first480.body,
    /\.nav-shell:has\(\.menu-button\)\s*\{\s*width:\s*min\(100%\s*-\s*32px,\s*1180px\);\s*gap:\s*6px/,
    "the compact header shell must use the 16px content gutter",
  );
  assert.doesNotMatch(
    first480.body,
    /\.nav-shell:has\(\.menu-button\)\s*\{\s*width:\s*min\(100%\s*-\s*24px/,
    "the old 12px-gutter shell is gone",
  );
  assert.match(first480.body, /\.nav-shell\s*\{[^}]*flex-wrap:\s*wrap/, "wrapping stays as the graceful safety net");
});

test("legal table breakout is viewport-clamped, never a fixed negative margin", async () => {
  const css = await cssPromise;
  const wide = mediaBlocks(css, "min-width").find((b) => b.width === 1180);
  assert.ok(wide, "expected the (min-width:1180px) legal-table block");
  assert.match(
    wide.body,
    /\.legal-table-wrap\s*\{[^}]*width:\s*min\(1180px,\s*calc\(100vw\s*-\s*48px\)\)/,
    "the breakout width is clamped to the viewport",
  );
  assert.match(wide.body, /\.legal-table-wrap\s*\{[^}]*left:\s*50%/, "the breakout re-centers via left:50%");
  assert.match(
    wide.body,
    /\.legal-table-wrap\s*\{[^}]*transform:\s*translateX\(-50%\)/,
    "the breakout re-centers via translateX(-50%)",
  );
  assert.doesNotMatch(css, /margin:\s*18px\s*-210px/, "the fixed negative-margin bleed is gone");
});

test("auth plain links keep the focus underline; .button CTAs keep their own colour", async () => {
  const css = await cssPromise;
  // Regression: the unscoped `.auth-switch a { color:var(--focus) }` also
  // recoloured the `.button.button-primary` CTAs — focus green rgb(11 112 92)
  // on the accent background rgb(40 125 78) ≈ 1.18:1. :not(.button) restores
  // the CTA's white-on-accent text while plain links keep the underline.
  assert.match(
    css,
    /\.auth-switch a:not\(\.button\)\s*\{[^}]*color:\s*var\(--focus\)/,
    "plain auth links keep the focus-coloured underline",
  );
  assert.doesNotMatch(
    css,
    /\.auth-switch a\s*\{/,
    "the unscoped .auth-switch a rule (which recoloured the .button CTAs) is gone",
  );
  assert.match(
    css,
    /\.button-primary\s*\{\s*color:\s*var\(--white\)/,
    "the primary CTA keeps its white text on the accent background",
  );
});

test("the base legal-table-wrap is a positioned ancestor so .sr-only spans stay contained", async () => {
  const css = await cssPromise;
  assert.match(
    css,
    /\.legal-table-wrap\s*\{[^}]*position:\s*relative/,
    "the scroll wrapper must establish a containing block for absolute children",
  );
  assert.match(
    css,
    /\.legal-table-wrap\s*\{[^}]*overflow-x:\s*auto/,
    "the keyboard-scroll container is unchanged",
  );
});

test("≤700px sources grid collapses to one column, declared after its base rule", async () => {
  const css = await cssPromise;
  const baseIdx = css.indexOf(".sources-methodology-grid { display:grid");
  assert.ok(baseIdx >= 0, "the two-column base grid rule exists");
  const override = ".sources-methodology-grid { grid-template-columns:1fr }";
  const overrideIdx = css.indexOf(override);
  assert.ok(overrideIdx >= 0, "a single-column override exists");
  assert.equal(
    css.split(override).length - 1,
    1,
    "exactly one collapsed rule — no duplicate parallel CSS",
  );
  assert.ok(
    overrideIdx > baseIdx,
    "the override must follow the base rule so the cascade applies it",
  );
  assert.ok(
    mediaBlocks(css, "max-width").some(
      (b) => b.width === 700 && /\.sources-methodology-grid\s*\{/.test(b.body),
    ),
    "the override lives in a ≤700px block",
  );
});

test("legal prose wraps long tokens inside the card (overflow-wrap:anywhere)", async () => {
  const css = await cssPromise;
  assert.match(
    css,
    /\.legal-section p\s*\{[^}]*overflow-wrap:\s*anywhere/,
    "legal paragraphs wrap long emails/URLs/path tokens",
  );
  assert.match(
    css,
    /\.legal-section li\s*\{[^}]*overflow-wrap:\s*anywhere/,
    "legal list items wrap long tokens",
  );
});

test("font stack and radius tokens reflect the current design system", async () => {
  const css = await cssPromise;
  assert.match(css, /body\s*\{[^}]*font-family:[^}]*system-ui/, "the body font stack leads with system-ui");
  assert.match(css, /--radius-lg:\s*16px/, "--radius-lg is 16px");
  assert.match(css, /--radius-xl:\s*24px/, "--radius-xl is 24px");
  assert.match(css, /--radius-2xl:\s*28px/, "--radius-2xl is 28px");
});

test("compact footer density is unchanged", async () => {
  const css = await cssPromise;
  assert.match(
    css,
    /footer\s*\{\s*padding:\s*30px 0 44px[^}]*grid-template-columns:\s*1fr 1fr 1fr/,
    "the footer keeps its compact padding + 3-column density",
  );
  assert.match(
    css,
    /\.site-footer\s*\{[^}]*grid-template-columns:\s*auto 1fr auto[^}]*gap:\s*28px 32px/,
    "the rich footer keeps its auto 1fr auto grid + 28/32px gaps",
  );
});
