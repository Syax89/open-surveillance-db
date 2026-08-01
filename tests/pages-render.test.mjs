// Render tests per le nuove pagine (QA t_cdbaad9e).
//
// transpila le page.tsx reali (e i moduli app/lib + app/components) in ESM,
// mocka `next/link` e `next/navigation` con stub innocui, e renderizza ogni
// pagina con react-dom/server dentro LocaleProvider, verificando:
//   - il render non lancia (nessun crash SSR)
//   - struttura: main#main-content, esattamente un h1, gerarchia heading senza salti
//   - i link in nav/footer risolvono verso route esistenti del repo
//   - nessun dato non pubblico (pending/rejected/hidden/needs_review/email/contributor)
//     nel markup statico pubblico
//   - il toggle lingua EN/IT è presente
//
// La tree temporanea vive dentro il repo (tests/.render-tmp-*) così react e
// react-dom risolvono dai node_modules del repo; il mock `next` nella tree
// shadowa quello reale. Cleanup sempre eseguito.

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderToString } from "react-dom/server";
import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PAGES = [
  { route: "/", source: "app/page.tsx", relative: "app/page.mjs" },
  { route: "/mappa", source: "app/(tools)/mappa/page.tsx", relative: "app/(tools)/mappa/page.mjs", layout: "tools" },
  { route: "/directory", source: "app/(tools)/directory/page.tsx", relative: "app/(tools)/directory/page.mjs", layout: "tools" },
  { route: "/segnala", source: "app/(tools)/segnala/page.tsx", relative: "app/(tools)/segnala/page.mjs", layout: "tools" },
  { route: "/correggi", source: "app/(tools)/correggi/page.tsx", relative: "app/(tools)/correggi/page.mjs", layout: "tools" },
  { route: "/guide", source: "app/guide/page.tsx", relative: "app/guide/page.mjs" },
  { route: "/login", source: "app/login/page.tsx", relative: "app/login/page.mjs" },
  { route: "/register", source: "app/register/page.tsx", relative: "app/register/page.mjs" },
  { route: "/account", source: "app/account/page.tsx", relative: "app/account/page.mjs" },
  { route: "/moderation", source: "app/moderation/page.tsx", relative: "app/moderation/page.mjs" },
  { route: "/records/[id]", source: "app/records/[id]/page.tsx", relative: "app/records/[id]/page.mjs" },
  { route: "/records/[id]/edit", source: "app/records/[id]/edit/page.tsx", relative: "app/records/[id]/edit/page.mjs" },
];

// Le route del repo (pagine + API) note al momento del test: usate per
// verificare che ogni href relativo in nav/footer punti a qualcosa di reale.
const KNOWN_ROUTES = new Set([
  "/", "/guide", "/login", "/register", "/account", "/moderation",
  "/manifesto", "/regole", "/faq", "/contatti", "/privacy", "/termini", "/licenze", "/accessibility",
  // Route tool separate (F1 route group (tools), t_03c0fa15).
  "/mappa", "/directory", "/segnala", "/correggi",
  "/api/cameras", "/api/cameras?format=geojson", "/api/cameras?format=csv",
  "/api/cameras/nearby", "/api/cameras/search", "/api/cameras/revisions",
  "/api/tiles", "/api/auth/me", "/api/auth/me/submissions", "/api/auth/logout",
  "/api/auth/account", "/api/moderation", "/api/appeals", "/api/corrections",
]);

// Pattern di stato non pubblico nel markup statico. `aria-hidden="true"` è un
// attributo a11y legittimo (non un leak): il lookbehind lo esclude.
const LEAK_PATTERNS = [
  /\bpending\b/i, /\brejected\b/i, /\bneeds_review\b/i, /(?<!aria-)hidden\b/i,
  /"email"\s*:/i, /osdb_csrf/i, /x-csrf-token/i,
  /MODERATION_(USER|PASSWORD|TOKEN)/i,
];

// Pagine pubbliche su cui i pattern di leak hanno senso. /guide documenta gli
// stati intenzionalmente (esente); /moderation è una pagina interna gated
// (mostra "Pending camera reports" per design). Le route tool separate (F1)
// mostrano solo dati pubblici / form: /segnala e /correggi sono form privati
// (noindex), /mappa e /directory la stessa directory pubblica della home.
const LEAK_CHECK_ROUTES = new Set(["/", "/mappa", "/directory", "/segnala", "/correggi", "/login", "/register", "/account", "/records/[id]"]);

const transpile = (sourcePath) =>
  ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: sourcePath,
  }).outputText;

function rewriteSpecifiers(code) {
  let out = code.replace(
    /(from\s*["'])(\.\.?\/[^"']+)(["'])/g,
    (match, prefix, specifier, suffix) =>
      specifier.endsWith(".mjs") ? match : `${prefix}${specifier}.mjs${suffix}`,
  );
  // import di directory (i18n) -> index.mjs
  out = out.replace(/from\s*["'](\.[^"']+)\/index\.mjs["']/g, (m, spec) => `from "${spec}/index.mjs"`);
  return out;
}

async function buildRenderTree() {
  const tree = await mkdtemp(path.join(root, "tests", ".render-tmp-"));
  const nodeModules = path.join(tree, "node_modules");
  await mkdir(path.join(nodeModules, "next"), { recursive: true });

  // Mock di next/link e next/navigation (stub innocui, nessun routing reale).
  await writeFile(path.join(nodeModules, "next", "package.json"), JSON.stringify({
    name: "next", version: "0.0.0", type: "module",
    exports: {
      "./link": "./link.mjs", "./link.js": "./link.mjs",
      "./navigation": "./navigation.mjs", "./navigation.js": "./navigation.mjs",
      "./headers": "./headers.mjs", "./headers.js": "./headers.mjs",
      ".": "./link.mjs",
    },
  }));
  await writeFile(path.join(nodeModules, "next", "link.mjs"),
    `import React from "react";
export default function Link({ href, children, ...rest }) {
  return React.createElement("a", { href, ...rest }, children);
}
`);
  await writeFile(path.join(nodeModules, "next", "navigation.mjs"),
    `export const useParams = () => ({ id: "1" });
export const useRouter = () => ({ push: () => {}, refresh: () => {} });
export const useSearchParams = () => new URLSearchParams();
export const usePathname = () => "/";
`);
  // Mock di next/headers: nessun cookie impostato -> le pagine Server
  // Component (server-i18n) risolvono il locale pilota "en", identico al
  // primo render SSR pre-conversione (ADR 0007).
  await writeFile(path.join(nodeModules, "next", "headers.mjs"),
    `export const cookies = async () => ({ get: () => undefined, getAll: () => [], has: () => false });
export const headers = async () => new Headers();
`);

  // Traspila ricorsivamente app/lib e app/components mantenendo la struttura
  // di directory, così gli import relativi risolvono nella tree (i18n è una
  // directory con index.ts).
  const sources = [];
  for (const [baseDir, relOut] of [
    [path.join(root, "app", "lib"), "app/lib"],
    [path.join(root, "app", "components"), "app/components"],
  ]) {
    const walk = async (dir, rel) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(abs, path.join(rel, entry.name));
        } else if (/\.tsx?$/.test(entry.name)) {
          sources.push({ abs, out: path.join(rel, entry.name.replace(/\.tsx?$/, ".mjs")) });
        }
      }
    };
    await walk(baseDir, relOut);
  }

  // Le pagine stesse.
  for (const { source, relative } of PAGES) {
    sources.push({ abs: path.join(root, source), out: relative });
  }

  for (const { abs, out } of sources) {
    const outPath = path.join(tree, out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, rewriteSpecifiers(transpile(abs)));
  }

  // Fixup: gli import di directory (es. ../lib/i18n -> ../lib/i18n.mjs) che
  // puntano a un index.mjs vengono corretti dopo che l'albero è completo.
  const fixup = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await fixup(abs);
      else if (entry.name.endsWith(".mjs")) {
        let code = await readFile(abs, "utf8");
        const original = code;
        code = code.replace(/from\s*["'](\.[^"']+)\.mjs["']/g, (match, spec) => {
          const resolved = path.resolve(path.dirname(abs), spec);
          const asFile = `${resolved}.mjs`;
          const asIndex = path.join(resolved, "index.mjs");
          if (!existsSync(asFile) && existsSync(asIndex)) return `from "${spec}/index.mjs"`;
          return match;
        });
        if (code !== original) await writeFile(abs, code);
      }
    }
  };
  await fixup(tree);

  return tree;
}

async function loadPage(tree, relative) {
  const mod = await import(pathToFileURL(path.join(tree, relative)).href);
  return mod.default;
}

async function loadLocaleProvider(tree) {
  const mod = await import(pathToFileURL(path.join(tree, "app/components/LocaleProvider.mjs")).href);
  return mod.LocaleProvider;
}

async function loadToolLayout(tree) {
  const mod = await import(pathToFileURL(path.join(tree, "app/components/ToolLayout.mjs")).href);
  return mod.ToolLayout;
}

function extractHeadings(html) {
  const out = [];
  const re = /<h([1-6])[^>]*>(.*?)<\/h\1>/gs;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ level: Number(m[1]), text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
  }
  return out;
}

function headingIssues(headings) {
  const issues = [];
  if (headings.length === 0) return ["nessun heading"];
  const h1 = headings.filter((h) => h.level === 1);
  if (h1.length !== 1) issues.push(`attesi esattamente 1 h1, trovati ${h1.length}`);
  let prev = headings[0].level;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > prev + 1) issues.push(`salto h${prev} -> h${headings[i].level}`);
    prev = headings[i].level;
  }
  return issues;
}

function extractHrefs(html) {
  const hrefs = [];
  const re = /href="([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) hrefs.push(m[1]);
  return [...new Set(hrefs)];
}

let treePromise = null;
function getTree() {
  if (!treePromise) treePromise = buildRenderTree();
  return treePromise;
}

for (const page of PAGES) {
  test(`render route ${page.route} (SSR, no crash, struttura e link)`, async () => {
    const tree = await getTree();
    const Page = await loadPage(tree, page.relative);
    const LocaleProvider = await loadLocaleProvider(tree);
    let html;
    try {
      // Le pagine informative sono Server Components (async): si risolvono
      // chiamando la funzione (l'elemento risultante contiene già il bundle
      // i18n del locale pilota). Le pagine client restano funzioni sync.
      const element = Page.constructor.name === "AsyncFunction"
        ? await Page()
        : React.createElement(Page);
      // Le route tool separate (F1) vivono nel route group (tools): il
      // layout condiviso ToolLayout è ciò che emette main#main-content e la
      // nav shell — il render test lo applica come farebbe Next.
      const wrapped = page.layout === "tools"
        ? React.createElement(await loadToolLayout(tree), null, element)
        : element;
      html = renderToString(React.createElement(LocaleProvider, null, wrapped));
    } catch (err) {
      assert.fail(`render di ${page.route} ha lanciato: ${err.message}`);
    }
    assert.ok(html.length > 0, "HTML prodotto");
    assert.ok(html.includes('id="main-content"'), "main#main-content presente");
    assert.ok(html.includes('class="locale-toggle"'), "toggle EN/IT presente");

    const headings = extractHeadings(html);
    if (page.route === "/records/[id]") {
      // Pagina client-rendered: la shell SSR non contiene heading (l'h1 e gli
      // stati arrivano dopo il fetch client-side). Verifichiamo la shell e lo
      // stato di caricamento, come documentato in navigation-pages.test.mjs.
      assert.match(html, /Loading the public record/, "shell con stato di caricamento");
      assert.match(html, /aria-live="polite"/, "annuncio cambiamenti di stato");
    } else {
      const issues = headingIssues(headings);
      assert.deepEqual(issues, [], `heading issues su ${page.route}: ${issues.join(" | ")}`);
    }

    // Link: ogni href relativo/assoluto interno deve puntare a una route nota
    // o essere un'ancora / un file statico servito da /.
    for (const href of extractHrefs(html)) {
      if (href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#") || href === "/favicon.svg" || href === "/og.png") continue;
      if (href.startsWith("/records/")) continue; // route dinamica parametrica
      const pathOnly = href.split("?")[0];
      const withQuery = href.split("#")[0];
      if (KNOWN_ROUTES.has(href) || KNOWN_ROUTES.has(withQuery) || KNOWN_ROUTES.has(pathOnly)) continue;
      // ancora cross-page (/#map) -> la pagina base è nota
      const base = href.split("#")[0];
      if (KNOWN_ROUTES.has(base) || base === "") continue;
      assert.fail(`href non risolto su ${page.route}: ${href}`);
    }

    // Leak check: nessun segnale di stato non pubblico o credenziale nel
    // markup statico. Applicato solo alle pagine pubbliche (la guida spiega
    // gli stati con le parole pending/hidden; la moderation è gated interna).
    if (LEAK_CHECK_ROUTES.has(page.route)) {
      for (const pattern of LEAK_PATTERNS) {
        assert.ok(!pattern.test(html), `leak pattern ${pattern} su ${page.route}`);
      }
    }
  });
}

test("cleanup tree temporanea", async () => {
  if (treePromise) {
    const tree = await treePromise;
    await rm(tree, { recursive: true, force: true });
    treePromise = null;
  }
  assert.ok(true);
});

test("global CSP (worker edge) is compatible with the SSR markup these pages emit", async () => {
  // Coerenza tra il render test e la Content-Security-Policy globale
  // (worker/index.ts, kanban t_6148aa6f): il markup SSR di vinext/Next
  // contiene script inline RSC (self.__VINEXT_RSC_*) e uno style inline
  // <style data-vinext-fonts> — la CSP deve permetterli, altrimenti il
  // browser blocca la pagina pur essendo il render corretto. Guardia
  // statica: se la CSP cambia, questo test forza a rivalutarla insieme.
  const workerSource = readFileSync(path.join(root, "worker", "index.ts"), "utf8");
  const cspMatch = workerSource.match(/Content-Security-Policy[^\n]*\n((?:.*\n)*?)\s*\]/);
  assert.ok(cspMatch, "CSP definita nel worker edge");
  const csp = cspMatch[1];
  // Inline scripts RSC + dynamic import same-origin (nessun eval).
  assert.match(csp, /script-src 'self' 'unsafe-inline'/, "CSP deve permettere gli inline script RSC");
  // <style data-vinext-fonts> inline.
  assert.match(csp, /style-src 'self' 'unsafe-inline'/, "CSP deve permettere lo style inline fonts");
  // Le tile sono servite same-origin (proxy /api/tiles, docs/OSM_INTEGRATION.md).
  assert.match(csp, /img-src 'self'/, "CSP deve permettere risorse img same-origin");
  // Il sito non è iframabile (clickjacking) — coerente con X-Frame-Options: DENY.
  assert.match(csp, /frame-ancestors 'none'/, "CSP frame-ancestors 'none'");
});
