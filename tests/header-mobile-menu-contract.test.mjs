/**
 * Header mobile-menu / viewport contract (kanban t_94b3726d, CEO live
 * feedback 2026-08-02).
 *
 * The jsdom DOM harness cannot lay out CSS, so the "no wrap at
 * 320/390/768px" requirement is pinned here as a STATIC contract on
 * app/globals.css + the component sources, exactly like the other
 * source-guard suites (rendered-html, component-smoke):
 *
 *   1. the hamburger + .nav-links dropdown live in a @media
 *      (max-width:768px) block — the auth entry point (AuthNavLinks) is
 *      the LAST item of .nav-links, so it collapses WITH the menu below
 *      768px and the top bar (brand + menu button + LocaleToggle) can
 *      never contain it → no header wrap at 320/390px;
 *   2. the old @media (max-width:700px) block no longer carries nav rules
 *      (it kept the dropdown out of 701-767px, where the full row
 *      overflowed);
 *   3. desktop (≥768px): .nav-links fills the shell and the auth cluster
 *      is pushed to the right end (margin-left:auto) — visible in the
 *      inline header row, next to the LocaleToggle; the row carries
 *      flex-wrap so the 768-980px tablet range wraps instead of
 *      overflowing the document (design doc §9.1: "inline, wrap");
 *   4. the dropdown rules are scoped with :has(.menu-button) so the
 *      auth/record shells (login/register/account/error — no hamburger)
 *      keep their inline "back home" row;
 *   5. ≤480px: tighter .nav-shell gap to help the compact bar fit 320px;
 *      flex-wrap stays only as a safety net (never clips).
 *
 * The DOM-level half of the contract (auth links inside #main-links, with
 * aria-current) lives in tests/client-auth-nav-links.test.mjs (PublicNav
 * integration test) — this file pins the CSS/viewport side.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Extract every `@media (max-width:NNNpx) { ... }` block as { width, body }. */
function mediaBlocks(css) {
  const blocks = [];
  const re = /@media\s*\(max-width:\s*(\d+)px\)\s*\{/g;
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

let cssSource = null;
async function css() {
  if (cssSource === null) {
    cssSource = await readFile(path.join(root, "app", "globals.css"), "utf8");
  }
  return cssSource;
}

test("header nav: the hamburger + dropdown live in a (max-width:768px) block", async () => {
  const blocks = mediaBlocks(await css());
  // The FIRST 768px block is the nav one (the second is the map sidebar);
  // find it by its .menu-button rule to stay unambiguous.
  const nav768 = blocks.find((b) => b.width === 768 && /\.menu-button/.test(b.body));
  assert.ok(nav768, "expected a @media (max-width:768px) block with the nav rules");

  // Hamburger button becomes visible below 768px.
  assert.match(nav768.body, /\.menu-button\s*\{\s*display:\s*block/, "menu button must show below 768px");

  // .nav-links collapses into the absolute dropdown (closed by default).
  assert.match(
    nav768.body,
    /\.nav-links\s*\{\s*display:\s*none;[^}]*position:\s*absolute/,
    "nav-links must collapse into the dropdown below 768px",
  );
  assert.match(nav768.body, /\.nav-links\.is-open\s*\{\s*display:\s*flex/, "is-open reopens the dropdown");

  // The auth entry point is part of the dropdown (t_94b3726d).
  assert.match(
    nav768.body,
    /\.nav-links\s+\.auth-nav-links\s*\{\s*margin-left:\s*0/,
    "the auth cluster must be styled INSIDE the dropdown below 768px",
  );

  // Scoping: only headers that actually have the hamburger collapse — the
  // auth/record shells (login/register/account/error) keep their inline row.
  assert.match(nav768.body, /:has\(\.menu-button\)\s+\.nav-links/, "dropdown must be scoped to the hamburger header");
});

test("header nav: the old (max-width:700px) block no longer carries nav rules", async () => {
  const blocks = mediaBlocks(await css());
  const b700 = blocks.find((b) => b.width === 700);
  assert.ok(b700, "expected the (max-width:700px) block to still exist (content/hero/footer)");
  assert.doesNotMatch(b700.body, /\.nav-shell/, "nav-shell rules must have moved to the 768px block");
  assert.doesNotMatch(b700.body, /\.menu-button/, "menu button must not be defined at 700px anymore");
  assert.doesNotMatch(b700.body, /\.nav-links/, "nav-links dropdown rules must not be defined at 700px anymore");
  assert.doesNotMatch(b700.body, /\.nav-action\s*\{/, "nav-action centering must not be defined at 700px anymore");
});

test("header nav: desktop (>=768px) keeps the auth cluster visible in the inline row", async () => {
  const source = await css();
  // Outside any media query: the primary links + auth stay in the inline row,
  // auth pushed to the right end (the top-right corner of t_65b778c5).
  assert.match(
    source,
    /\.nav-links\s+\.auth-nav-links\s*\{\s*margin-left:\s*auto/,
    "desktop must push the auth cluster to the right end of the inline row",
  );
  assert.match(
    source,
    /\.nav-shell:has\(\.menu-button\)\s+\.nav-links\s*\{\s*flex:\s*1[^}]*flex-wrap:\s*wrap/,
    "the inline row must wrap (not overflow) in the 768-980px tablet range (design doc §9.1: 'inline, wrap')",
  );
  assert.match(
    source,
    /\.auth-nav-links\s*\{\s*display:\s*inline-flex/,
    "the auth cluster must be visible (inline-flex) by default",
  );
});

test("header nav: ≤480px compacts the top bar (320/390 fit) with wrap only as a safety net", async () => {
  const blocks = mediaBlocks(await css());
  const b480 = blocks.find((b) => b.width === 480);
  assert.ok(b480, "expected the (max-width:480px) block");
  // The hamburger header gets 12px side margins + 6px gaps so brand + menu
  // button + LocaleToggle fit ONE line at 320px (t_94b3726d).
  assert.match(
    b480.body,
    /\.nav-shell:has\(\.menu-button\)\s*\{\s*width:\s*min\(100%\s*-\s*24px[^}]*gap:\s*6px/,
    "≤480px must compact the hamburger header shell (12px margins, 6px gaps)",
  );
  assert.match(b480.body, /\.nav-shell:has\(\.menu-button\)\s*\.brand\s*\{\s*font-size:\s*13px/, "≤480px must shrink the brand text (hamburger header only)");
  assert.match(b480.body, /\.nav-shell:has\(\.menu-button\)\s*\.brand-mark\s*\{\s*width:\s*24px/, "≤480px must shrink the brand mark");
  assert.match(b480.body, /\.nav-shell\s*\{[^}]*flex-wrap:\s*wrap/, "flex-wrap stays as a graceful safety net");
});

test("PublicNav renders AuthNavLinks inside the mobile menu container (#main-links)", async () => {
  const source = await readFile(path.join(root, "app", "components", "PublicNav.tsx"), "utf8");
  const mainLinks = source.indexOf('id="main-links"');
  const publicNavLinks = source.indexOf("<PublicNavLinks />");
  const authNavLinks = source.indexOf("<AuthNavLinks />");
  assert.ok(mainLinks >= 0, "PublicNav must render the #main-links container");
  assert.ok(publicNavLinks >= 0, "PublicNav must render the shared primary links");
  assert.ok(authNavLinks > publicNavLinks, "AuthNavLinks must follow the primary links INSIDE the container");
  assert.ok(authNavLinks > mainLinks, "AuthNavLinks must be inside #main-links (the mobile menu)");
  assert.doesNotMatch(source, /trailing=/, "no top-bar trailing slot anymore");
});

test("SiteHeader no longer exposes the trailing slot (auth moved into the menu)", async () => {
  const source = await readFile(path.join(root, "app", "components", "SiteHeader.tsx"), "utf8");
  assert.doesNotMatch(source, /trailing/, "the trailing slot must be gone — auth lives inside .nav-links");
});
