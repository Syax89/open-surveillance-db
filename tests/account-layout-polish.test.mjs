/**
 * /account layout polish (2026-10-23, A01–A06) — static CSS source contracts.
 *
 * These assertions pin the SCOPED rules that fix six approved layout defects
 * and, just as importantly, reject the broken rules they replaced (auto-fit +
 * unconditional span, the 720px passkey cap, the 48px icon gutter on mobile,
 * the two competing `margin-left:auto` columns). No browser geometry is faked
 * here: jsdom cannot measure layout, so the real 320/360/390px measurements
 * are taken by the controller in a real browser. What this file guarantees is
 * that the declarations which produce that geometry stay in place.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
const body = await readFile(path.join(root, "app", "account", "AccountPageBody.tsx"), "utf8");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Top-level blocks of a stylesheet (rules and @media groups alike). */
function topLevelBlocks(source) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        parts.push(source.slice(start, index + 1));
        start = index + 1;
      }
    }
  }
  parts.push(source.slice(start));
  return parts;
}

/** The stylesheet with every @media group removed (base/desktop declarations). */

/** Return every balanced declaration block for an exact selector. */
function ruleBlocks(source, selector) {
  const matcher = new RegExp(`${escapeRegExp(selector)}\\s*\\{`, "g");
  const blocks = [];
  let match;
  while ((match = matcher.exec(source))) {
    let depth = 1;
    let cursor = matcher.lastIndex;
    const start = cursor;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth === 0) blocks.push(source.slice(start, cursor - 1));
  }
  return blocks;
}

function ruleBlock(source, selector) {
  const block = ruleBlocks(source, selector)[0];
  assert.ok(block, `expected a ${selector} rule`);
  return block;
}

/** Return every balanced @media block whose header contains `query`. */
function mediaBlocks(source, query) {
  const matcher = new RegExp(`@media\\s*${escapeRegExp(query)}\\s*\\{`, "g");
  const blocks = [];
  let match;
  while ((match = matcher.exec(source))) {
    let depth = 1;
    let cursor = matcher.lastIndex;
    const start = cursor;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "{") depth += 1;
      if (source[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    if (depth === 0) blocks.push(source.slice(start, cursor - 1));
  }
  return blocks;
}

function declaration(block, property) {
  const match = block.match(new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*([^;]+)`));
  assert.ok(match, `expected a ${property} declaration in: ${block.slice(0, 120)}`);
  return match[1].trim();
}

/** The LAST value of a property (cascade order inside one block matters). */
function lastDeclaration(block, property) {
  const matches = [...block.matchAll(new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*([^;]+)`, "g"))];
  assert.ok(matches.length > 0, `expected a ${property} declaration in: ${block.slice(0, 120)}`);
  return matches[matches.length - 1][1].trim();
}

function compact(value) {
  return value.replace(/\s+/g, "");
}

/** Strip comments so prose (which may quote a rejected rule) never matches. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The stylesheet with every @media group and comment removed (desktop layer). */
const baseCss = stripComments(topLevelBlocks(css).filter((part) => !/@media\s*\(/.test(part)).join("\n"));

/** Locate a rule by any selector inside a comma-separated selector group. */
function groupRule(source, needle) {
  const at = source.indexOf(needle);
  assert.ok(at >= 0, `expected a rule mentioning ${needle}`);
  const braceAt = source.indexOf("{", at);
  const selectorStart = Math.max(source.lastIndexOf("}", at), source.lastIndexOf(";", at)) + 1;
  let depth = 1;
  let cursor = braceAt + 1;
  const start = cursor;
  while (cursor < source.length && depth > 0) {
    if (source[cursor] === "{") depth += 1;
    if (source[cursor] === "}") depth -= 1;
    cursor += 1;
  }
  return {
    selectors: source.slice(selectorStart, braceAt).split(",").map((part) => part.trim()).filter(Boolean),
    block: source.slice(start, cursor - 1),
  };
}

/** First length of a (possibly shorthand) length list, in px. */
function firstPx(value) {
  const match = value.match(/(\d+(?:\.\d+)?)px/);
  assert.ok(match, `expected a pixel length, got ${value}`);
  return Number(match[1]);
}

test("A01 — three equal summary counters share one desktop row; the odd span is two-column only", () => {
  const stats = ruleBlock(baseCss, ".account-stats");
  assert.equal(compact(declaration(stats, "grid-template-columns")), "repeat(3,minmax(0,1fr))",
    "desktop keeps three EQUAL tracks, so the three counters sit on one row");
  assert.equal(compact(declaration(stats, "gap")), "12px");
  assert.doesNotMatch(baseCss, /\.account-stats\s*\{[^}]*auto-fit/, "auto-fit must not resize the strip into implicit tracks");
  assert.doesNotMatch(baseCss, /\.account-stats\s*>[^}]*:last-child:nth-child\(odd\)/,
    "the full-row span is forbidden in the base layer — it is what forced the third counter onto its own row");

  const twoColumn = mediaBlocks(css, "(max-width:820px)");
  assert.ok(twoColumn.length > 0, "expected the account mobile block");
  const strip = twoColumn.map((block) => ruleBlocks(block, ".account-stats")[0]).find(Boolean);
  assert.ok(strip, "the two-column strip must be declared");
  assert.equal(compact(declaration(strip, "grid-template-columns")), "repeat(2,minmax(0,1fr))",
    "the odd-third span only makes sense in the two-column layout");

  const narrow = mediaBlocks(css, "(max-width:480px)");
  assert.ok(narrow.length > 0, "expected the 320/360 block");
  const narrowStat = narrow.map((block) => ruleBlocks(block, ".account-dashboard .account-stat")[0]).find(Boolean);
  assert.ok(narrowStat, "the compact counter sizing is scoped to .account-dashboard");
  assert.ok(firstPx(declaration(narrowStat, "padding")) <= 10,
    "redundant mobile counter padding is what overflowed the 320px panel");
  const narrowIcon = narrow.map((block) => ruleBlocks(block, ".account-dashboard .account-stat-icon")[0]).find(Boolean);
  assert.ok(narrowIcon, "the icon tile shrinks on narrow screens");
  assert.ok(firstPx(declaration(narrowIcon, "width")) <= 28);
  assert.match(ruleBlock(baseCss, ".account-stat"), /min-width\s*:\s*0/, "grid children may shrink");
  const narrowLabel = narrow.map((block) => ruleBlocks(block, ".account-dashboard .account-stat-label")[0]).find(Boolean);
  assert.ok(narrowLabel, "the 320px label sizing stays scoped to .account-dashboard");
  assert.match(narrowLabel, /hyphens\s*:\s*auto/,
    "hyphenation wins over mid-word breaking: at 320px the IT label split as SEGNALAZIO/NI");
  assert.match(narrowLabel, /letter-spacing\s*:\s*\.02em/, "tighter tracking buys the room for one line");
  assert.match(ruleBlock(baseCss, ".account-stat-label"), /overflow-wrap\s*:\s*anywhere/,
    "the no-overflow safety net is kept on top of it");
});

test("A02 — the pager wraps at 320px and keeps full labels plus its states", () => {
  const pager = ruleBlock(baseCss, ".account-dashboard .contributions-pagination");
  assert.match(pager, /flex-wrap\s*:\s*wrap/, "native wrapping instead of pushing a button out of the panel");
  const narrow = mediaBlocks(css, "(max-width:600px)");
  assert.ok(narrow.length > 0, "expected the narrow pager block");
  const buttons = narrow.map((block) => ruleBlocks(block, ".account-dashboard .contributions-pagination .button")[0]).find(Boolean);
  assert.ok(buttons, "both buttons must be shrinkable on one row");
  assert.match(buttons, /flex\s*:\s*1\s+1\s+0/, "equal, shrinkable tracks keep previous/next inside the panel");
  assert.match(ruleBlock(baseCss, ".account-dashboard .contributions-pagination .button"), /min-width\s*:\s*0/,
    "the buttons may shrink below their intrinsic width");
  const indicator = narrow.map((block) => ruleBlocks(block, ".account-dashboard .contributions-pagination .page-indicator")[0]).find(Boolean);
  assert.ok(indicator, "the page indicator gets its own row");
  assert.match(indicator, /flex\s*:\s*1\s+0\s+100%/, "a long \"Pagina 12 di 12\" takes a full row");
  assert.match(indicator, /order\s*:\s*2/, "…below the two buttons, not between them");
  assert.doesNotMatch(baseCss, /\.page-indicator\s*\{[^}]*(white-space\s*:\s*nowrap|text-overflow)/,
    "no clipped or abbreviated page indicator");
  assert.match(body, /community\.pageOf\(page, pagination\.totalPages\)/, "the indicator stays a full localized label");
  assert.match(css, /"Pagina precedente"/, "the comment cites the real IT label");
  assert.match(css, /"Pagina successiva"/, "…for both directions");
  assert.match(css, /"Previous page"/, "…and the real EN label");
  assert.match(css, /"Next page"/);
  assert.doesNotMatch(css, /"Precedente\/Successiva"|"Previous\/Next"/, "no shortened label is quoted as the UI text");
  assert.match(body, /disabled=\{page <= 1 \|\| contributionsLoading\}/, "previous keeps its disabled state");
  assert.match(body, /disabled=\{!pagination\.hasMore \|\| contributionsLoading\}/, "next keeps its disabled state");
  assert.match(body, /className="page-indicator" aria-current="page"/, "the current page stays announced");
  assert.match(body, /<nav className="contributions-pagination" aria-label=\{community\.contributionsNavigation\}>/,
    "the pager stays a labelled navigation landmark");
});

test("A03 — the phone profile is compacted locally, without touching the shared rhythm", () => {
  const shared = ruleBlock(baseCss, ".record-detail-list");
  assert.equal(compact(declaration(shared, "margin")), "24px034px", "shared record list margin is untouched");
  assert.equal(compact(declaration(shared, "padding")), "24px0");
  assert.equal(compact(declaration(shared, "gap")), "var(--space-5)");

  const phones = mediaBlocks(css, "(max-width:700px)");
  assert.ok(phones.length > 0, "expected the phone block");
  const scoped = phones.map((block) => ruleBlocks(block, ".account-dashboard .record-detail-list")[0]).find(Boolean);
  assert.ok(scoped, "the compaction must be scoped to .account-dashboard");
  assert.ok(firstPx(declaration(scoped, "margin")) < 24, "top margin shrinks");
  assert.ok(firstPx(declaration(scoped, "padding")) < 24, "vertical padding shrinks");
  assert.ok(firstPx(declaration(scoped, "gap")) < 20, "row gap shrinks — it was the biggest contributor");
  assert.equal(compact(declaration(scoped, "grid-template-columns")), "1fr", "the profile stays a single readable column");

  const dtRule = phones.map((block) => ruleBlocks(block, ".account-dashboard .record-detail-list dt")[0]).find(Boolean);
  assert.ok(dtRule, "label spacing is tightened too");
  assert.ok(firstPx(declaration(dtRule, "margin-bottom")) <= 2);
  const logout = phones.map((block) => ruleBlocks(block, ".account-dashboard .account-logout")[0]).find(Boolean);
  assert.ok(logout, "logout spacing is tightened with the same scope");
  assert.equal(firstPx(declaration(logout, "margin-top")), 12);

  // Nothing may hide or reorder the approved profile content.
  assert.match(body, /<dt>\{t\.emailLabel\}<\/dt>/);
  assert.match(body, /<dt>\{t\.memberSince\}<\/dt>/);
  assert.match(body, /className="button detail-outline account-logout"/);
  assert.match(body, /id="profile-title"/);
  assert.doesNotMatch(css, /\.account-dashboard[^{]*\{[^}]*display\s*:\s*none/,
    "the compaction never hides dashboard content");
});

test("A04 — the account keeps its 900px readable width and the passkey cap is gone", () => {
  assert.equal(compact(declaration(ruleBlock(baseCss, ".record-detail"), "width")), "var(--container-readable)",
    "the outer width comes from the shared readable column");
  const token = ruleBlock(baseCss, ":root");
  assert.match(token, /--container-readable\s*:\s*min\(900px,\s*calc\(100%\s*-\s*48px\)\)/,
    "that column is 900px on desktop — unchanged");
  assert.doesNotMatch(css, /passkeys-disclosure\s*\{[^}]*max-width\s*:\s*720px/, "the 720px passkey cap must be removed");
  const dash = ruleBlock(baseCss, ".account-dashboard");
  assert.equal(compact(declaration(dash, "max-width")), "1120px", "no new width choice is introduced");
  assert.match(css, /inert/, "the misleading 1120px rule is documented as inert");
  assert.match(css, /BINDING width of the page/, "the comment names var(--container-readable) as the binding width");
  assert.match(css, /\.account-card \{ max-width:940px \}/, "…and names the nearest inert cap too");
  assert.equal(compact(declaration(ruleBlock(baseCss, ".account-card"), "max-width")), "940px");
});

test("A05 — one explicit heading scale reaches all four dashboard sections, danger zone stays distinct", () => {
  const { selectors, block } = groupRule(baseCss, ".account-dashboard #profile-title");
  assert.deepEqual(selectors.sort(), [
    ".account-dashboard #api-keys-title",
    ".account-dashboard #contributions-title",
    ".account-dashboard #passkeys-title",
    ".account-dashboard #profile-title",
  ], "all four sections share ONE rule, each selector scoped to .account-dashboard");
  assert.equal(compact(declaration(block, "font-size")), "var(--text-3xl)", "heading scale is an existing token");
  assert.equal(compact(declaration(block, "margin")), "0");
  assert.doesNotMatch(baseCss, /(^|\})\s*h2\s*\{/, "no global h2 rule is introduced");
  const danger = ruleBlock(baseCss, ".auth-danger-zone h2");
  assert.equal(compact(declaration(danger, "font-size")), "var(--text-2xl)", "the danger zone keeps its own smaller, danger-inked scale");
  assert.equal(compact(declaration(danger, "color")), "var(--danger-ink)");
});

test("A06 — contribution rows share one status column and stack compactly on mobile", () => {
  const list = ruleBlock(baseCss, ".account-dashboard .contributions-list");
  assert.equal(compact(declaration(list, "grid-template-columns")), "autominmax(0,1fr)max-contentmax-content",
    "icon | title+meta | status | optional edit — one shared set of tracks");
  const row = ruleBlock(baseCss, ".account-dashboard .contribution-row");
  assert.equal(compact(declaration(row, "grid-template-columns")), "autominmax(0,1fr)max-contentmax-content",
    "progressive fallback: engines without subgrid still get the four explicit tracks, declared FIRST");
  assert.equal(compact(lastDeclaration(row, "grid-template-columns")), "subgrid",
    "…and `subgrid` is the LAST declaration of the property, so it wins wherever it is supported");
  assert.equal(compact(declaration(row, "grid-column")), "1/-1");
  assert.equal(compact(declaration(ruleBlock(baseCss, ".account-dashboard .contribution-status"), "margin-left")), "0",
    "the status no longer floats on an auto margin");
  assert.equal(compact(declaration(ruleBlock(baseCss, ".account-dashboard .contributions-edit"), "margin-left")), "0",
    "the edit link no longer competes with the status for the same auto margin");

  const mobile = mediaBlocks(css, "(max-width:820px)");
  const mobileList = mobile.map((block) => ruleBlocks(block, ".account-dashboard .contributions-list")[0]).find(Boolean);
  assert.ok(mobileList, "the mobile list is declared in the account block");
  assert.match(compact(declaration(mobileList, "display")), /^flex$/, "phones keep the flex column");
  assert.match(mobileList, /flex-direction\s*:\s*column/);
  const mobileRow = mobile.map((block) => ruleBlocks(block, ".account-dashboard .contribution-row")[0]).find(Boolean);
  assert.ok(mobileRow, "the mobile row is declared in the account block");
  assert.match(compact(declaration(mobileRow, "display")), /^flex$/, "the mobile row is a flex line, not a grid");
  assert.match(mobileRow, /flex-wrap\s*:\s*wrap/);
  assert.match(mobileRow, /align-items\s*:\s*center/);
  assert.equal(compact(declaration(
    mobile.map((block) => ruleBlocks(block, ".account-dashboard .contribution-status")[0]).find(Boolean),
    "margin-left",
  )), "48px", "the status keeps its compact phone indent");
  assert.equal(compact(declaration(
    mobile.map((block) => ruleBlocks(block, ".account-dashboard .contributions-edit")[0]).find(Boolean),
    "margin-left",
  )), "auto", "the edit action stays pinned to the right edge of the panel");

  // Rejected pattern (P1 regression, 2026-10-23): a three-track mobile grid let
  // the `auto` edit track starve the status track to 0px at 320px.
  assert.doesNotMatch(css, /grid-template-areas\s*:\s*["']icon main main/, "the broken mobile grid areas must stay deleted");
  assert.doesNotMatch(mobileRow, /grid-template-(columns|areas|rows)/, "the phone row declares no grid tracks at all");
  assert.doesNotMatch(css, /\.account-dashboard \.contribution-(status|main|kind-icon|s-edit)\s*\{[^}]*grid-area\s*:/,
    "no leftover grid-area bindings for the removed mobile grid");

  // Workflow contracts: links, status semantics and the edit accessibility.
  assert.match(body, /<span className="contribution-kind-icon" aria-hidden="true">/);
  assert.match(body, /<Link href=\{`\/records\/\$\{contribution\.id\}`\}>\{title\}<\/Link>/, "camera titles stay links");
  assert.match(body, /<Link href=\{relatedHref\}>\{title\}<\/Link>/, "correction titles stay linked to the related record");
  assert.match(body, /<span className=\{`status-dot \$\{contribution\.status\}`\} aria-hidden="true" \/>/);
  assert.match(body, /<Link className="text-button contributions-edit" href=\{`\/records\/\$\{contribution\.id\}\/edit`\}>/,
    "the optional edit action keeps its accessible text link");
  assert.match(body, /<time dateTime=\{contribution\.createdAt\}>/, "metadata keeps its machine-readable date");
});
