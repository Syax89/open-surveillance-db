/**
 * Visual-regression baseline check (kanban t_14b1949c).
 *
 * Rende le route chiave esattamente come il worker di produzione (Miniflare
 * sul bundle dist/server) e verifica: HTTP 200, landmark principali, un solo
 * h1, footer unico, sezioni attese. Output pensato per il report QA.
 *
 * Uso: node scripts/check-key-routes.mjs   (richiede `npm run build` prima)
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "dist", "server");

const ROUTES = [
  { route: "/", label: "Home", sections: ["hero", "map-section", "records-section", "report-section", "correction-section"] },
  { route: "/manifesto", label: "Manifesto", sections: ["record-page", "manifesto-list"] },
  { route: "/regole", label: "Rules", sections: ["record-page", "never-title"] },
  { route: "/privacy", label: "Privacy", sections: ["record-page"] },
  { route: "/faq", label: "FAQ", sections: ["record-page", "faq-item"] },
];

async function workerModules() {
  const found = [];
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".js")) found.push({ type: "ESModule", path: full });
    }
  };
  await walk(serverDir);
  const entry = found.find((m) => m.path === path.join(serverDir, "index.js"));
  if (!entry) throw new Error("dist/server/index.js manca — esegui `npm run build`");
  return [entry, ...found.filter((m) => m !== entry)];
}

async function renderRoute(mf, route) {
  const response = await mf.dispatchFetch(`http://localhost${route}`, { headers: { accept: "text/html" } });
  return { response, html: await response.text() };
}

const modules = await workerModules();
const mf = new Miniflare({ modules, compatibilityDate: "2026-01-01", compatibilityFlags: ["nodejs_compat"] });

const results = [];
try {
  for (const { route, label, sections } of ROUTES) {
    const { response, html } = await renderRoute(mf, route);
    const checks = {
      "HTTP 200": response.status === 200,
      "content-type html": /^text\/html\b/i.test(response.headers.get("content-type") ?? ""),
      "main#main-content": /<main[^>]*id="main-content"/.test(html),
      "skip link": /Skip to main content/.test(html),
      "nav-shell": /class="nav-shell"/.test(html),
      "single h1": (html.match(/<h1>/g) ?? []).length === 1,
      "single footer": (html.match(/<footer\b/g) ?? []).length === 1,
      "global SiteFooter": /<footer class="site-footer" aria-label="Site footer">/.test(html),
    };
    for (const section of sections) {
      checks[`section:${section}`] = html.includes(section);
    }
    const failed = Object.entries(checks).filter(([, ok]) => !ok);
    results.push({
      route,
      label,
      status: response.status,
      failed,
      pass: failed.length === 0,
      h1: (html.match(/<h1[^>]*>([^<]+)/)?.[1] ?? "").trim(),
    });
  }
} finally {
  await mf.dispose();
}

for (const r of results) {
  console.log(`\n[${r.pass ? "PASS" : "FAIL"}] ${r.label} ${r.route} (HTTP ${r.status}) — h1: ${r.h1}`);
  if (r.failed.length) for (const f of r.failed) console.log(`   ✗ ${f}`);
  else console.log("   tutti i marker visivi OK");
}
console.log(`\n=== ${results.filter((r) => r.pass).length}/${results.length} route OK ===`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
