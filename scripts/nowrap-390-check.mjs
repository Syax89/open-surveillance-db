/**
 * Nowrap 390px IT verification (t_e06f5c87, part 2).
 *
 * Checks the six white-space:nowrap rules in globals.css against long Italian
 * text at a 390px viewport. For every rule we assert the hosting element does
 * not overflow its container and does not clip/truncate text unexpectedly:
 *   - document horizontal overflow (scrollWidth > innerWidth) is a FAIL
 *   - per-element scrollWidth > clientWidth where the element is VISIBLE and
 *     has no intentional ellipsis (overflow:hidden + text-overflow:ellipsis)
 *     is a FAIL (clipping); for elements with ellipsis it is EXPECTED.
 * Requires the preview server (scripts/serve-preview.mjs) running on :4173.
 */
import puppeteer from "puppeteer-core";
import { globSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4173";
// Dev-only helper: resolve a local Chromium. Override with CHROME_PATH, or
// let it discover the common dev-box locations (puppeteer/playwright caches).
const CHROME =
  process.env.CHROME_PATH ??
  [
    "/home/simone/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
    "/home/simone/.cache/ms-playwright/chromium-1234/chrome-linux/chrome",
    "/home/simone/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => globSync(p).length > 0);

const RULES = [
  {
    // .sr-only — screen-reader-only helper, clipped to 1px. nowrap here is
    // part of the standard sr-only recipe; nothing is ever visible to clip.
    id: "sr-only",
    selector: ".sr-only",
    page: "/directory",
    expectHidden: true,
    expectClipped: true,
  },
  {
    // .directory-tool-heading .text-button — "Usa invece la mappa" link in the
    // /directory header; flex:none + nowrap keeps the label on one line.
    id: "directory-heading-text-button",
    selector: ".directory-tool-heading .text-button",
    page: "/directory",
  },
  {
    // .photo-file-name — uploaded photo name in /segnala; has INTENTIONAL
    // ellipsis (overflow:hidden + text-overflow:ellipsis + min-width:0).
    id: "photo-file-name",
    selector: ".photo-file-name",
    page: "/segnala",
    intentionalEllipsis: true,
  },
  {
    // .directory-tool .directory-controls > .text-button — "Azzera i filtri"
    // reset button in the directory controls grid.
    id: "directory-controls-reset",
    selector: ".directory-tool .directory-controls > .text-button",
    page: "/directory",
  },
  {
    // .confirm-count — "N verifica/verifiche" counter inside the confirm
    // toggle (only on record pages; demo records are illustrative-only, so
    // this rule is checked statically — no live record exists in preview).
    id: "confirm-count",
    selector: ".confirm-count",
    page: "/records/00000000-0000-0000-0000-000000000001",
    mayBeAbsent: true,
  },
  {
    // .geocode-option-type — "Tipo" label in the geocode suggestions
    // (Nominatim type, e.g. "street" / "via"); text-xs, capitalize.
    id: "geocode-option-type",
    selector: ".geocode-option-type",
    page: "/mappa",
    needsInteraction: "geocode",
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkPage(browser, rule) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.setCookie({
    name: "opensurveillancedb-locale",
    value: "it",
    domain: "127.0.0.1",
    path: "/",
  });
  try {
    await page.goto(`${BASE}${rule.page}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(800);
  } catch (err) {
    await page.close();
    return { rule: rule.id, ok: false, error: `goto: ${err.message}` };
  }

  // Optional interaction: open the geocode dropdown with a search.
  if (rule.needsInteraction === "geocode") {
    try {
      await page.type("#map-list-search", "via");
      await sleep(1200);
    } catch {
      /* selector may vary; the dropdown may not open without JS app state */
    }
  }

  // photo-file-name renders only after a real upload (R2-backed POST); inject
  // the exact ReportForm photo-list DOM (same classes/structure) to exercise
  // the real CSS rule against a long Italian filename.
  if (rule.id === "photo-file-name") {
    await page.evaluate(() => {
      const existing = document.querySelector(".photo-list");
      if (existing) existing.remove();
      const ul = document.createElement("ul");
      ul.className = "photo-list";
      ul.setAttribute("aria-label", "Foto");
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "photo-file-name";
      name.textContent =
        "telecamera-con-sorveglianza-vicino-alla-scuola-elementare-di-via-romagna-2024-07-14_1530.jpg";
      const meta = document.createElement("span");
      meta.className = "search-count";
      meta.textContent = "4032×3024 · image/jpeg";
      li.append(name, meta);
      ul.appendChild(li);
      // Real layout: .photo-list sits inside .report-form (grid, definite
      // width from .report-section container). Constrain the wrapper the
      // same way (min(100% - 32px, 1120px)) so the flex shrink/ellipsis is
      // exercised exactly as in production.
      const wrapper = document.createElement("div");
      wrapper.style.width = "min(100% - 32px, 1120px)";
      wrapper.appendChild(ul);
      (document.querySelector("form") ?? document.body).appendChild(wrapper);
    });
    await sleep(300);
  }

  const result = await page.evaluate(
    (sel) => {
      const doc = {
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      };
      doc.docOverflow = doc.scrollWidth > doc.innerWidth;
      doc.bodyOverflow = doc.bodyScrollWidth > doc.innerWidth;
      const el = document.querySelector(sel);
      if (!el) return { doc, element: null };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        doc,
        element: {
          rect: { x: r.x, width: r.width, right: r.right },
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          clipped: el.scrollWidth > el.clientWidth + 1,
          whiteSpace: cs.whiteSpace,
          overflow: cs.overflow,
          textOverflow: cs.textOverflow,
          display: cs.display,
          visibility: cs.visibility,
          clip: cs.clip,
          fontSize: cs.fontSize,
        },
      };
    },
    rule.selector
  );
  await page.close();
  return { rule: rule.id, result };
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const out = [];
for (const rule of RULES) {
  const res = await checkPage(browser, rule);
  out.push(res);
  console.log(JSON.stringify(res, null, 1));
}
await browser.close();

// Verdict
let fails = 0;
for (const r of out) {
  if (r.error) { fails++; console.log(`FAIL ${r.rule}: ${r.error}`); continue; }
  const doc = r.result?.doc;
  const el = r.result?.element;
  if (!el) {
    const rule = RULES.find((x) => x.id === r.rule);
    if (rule?.mayBeAbsent) { console.log(`ABSENT-OK ${r.rule}: rule element not rendered (expected for this page)`); continue; }
    fails++;
    console.log(`FAIL ${r.rule}: element not found on page`);
    continue;
  }
  const problems = [];
  if (doc?.docOverflow) problems.push(`document overflow (scrollWidth ${doc.scrollWidth} > innerWidth ${doc.innerWidth})`);
  if (el.clipped) {
    const rule = RULES.find((x) => x.id === r.rule);
    if (rule?.intentionalEllipsis) {
      console.log(`OK-ELLIPSIS ${r.rule}: clipping is intentional (text-overflow:${el.textOverflow})`);
    } else if (rule?.expectClipped) {
      console.log(`OK-SR-ONLY ${r.rule}: 1px clip box is the sr-only recipe (nowrap keeps the box at 1px)`);
    } else {
      problems.push(`element clips (scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}) — nowrap text may truncate`);
    }
  }
  if (el.rect.right > doc.innerWidth + 1) problems.push(`element right edge ${el.rect.right} > viewport ${doc.innerWidth}`);
  if (problems.length) { fails++; console.log(`FAIL ${r.rule}: ${problems.join("; ")}`); }
  else console.log(`OK ${r.rule}: no overflow/clip at 390px (scrollWidth==clientWidth==${el.clientWidth})`);
}

console.log(fails === 0 ? "VERDICT: ALL OK" : `VERDICT: ${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
