// SSR snapshot 15 rotte per diff byte-level (task t_30a7eea0).
// Uso: node /tmp/ssr-snap15.mjs <repo-root> <output-dir>
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Miniflare } from "miniflare";

const root = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3]);
const serverDir = path.join(root, "dist", "server");

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
  if (!entry) throw new Error("dist/server/index.js missing — build first");
  return [entry, ...found.filter((m) => m !== entry)];
}

const ROUTES = [
  "/", "/guide", "/login", "/register", "/account", "/moderation",
  "/records/1", "/manifesto", "/regole", "/faq", "/contatti",
  "/privacy", "/termini", "/licenze", "/moderazione",
];

const mf = new Miniflare({
  modules: await workerModules(),
  compatibilityDate: "2026-01-01",
  compatibilityFlags: ["nodejs_compat"],
  bindings: {
    MODERATION_USER: "snapshot",
    MODERATION_PASSWORD: "snapshot-pass",
  },
});

try {
  await mkdir(outDir, { recursive: true });
  for (const route of ROUTES) {
    const response = await mf.dispatchFetch(`http://localhost${route}`, {
      headers: {
        accept: "text/html",
        authorization: `Basic ${Buffer.from("snapshot:snapshot-pass").toString("base64")}`,
      },
    });
    const html = await response.text();
    const name = route === "/" ? "home" : route.slice(1).replaceAll("/", "_");
    await writeFile(path.join(outDir, `${name}.html`), html);
    console.log(`${route} -> ${response.status} (${html.length} bytes)`);
  }
} finally {
  await mf.dispose();
}
