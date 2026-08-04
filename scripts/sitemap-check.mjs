// F7 qa#5 (t_ab0d4c75) — end-to-end check of /sitemap.xml with a real
// (local) D1 binding, seeded with the demo cameras. Runs the same built
// worker the preview server uses, but wires d1Databases so the sitemap's
// env.DB query actually executes. ENVIRONMENT=development makes the ADR 0008
// demo gate pass (demo seed is a local-development fixture by design).
import { Miniflare } from "miniflare";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "dist", "server");
const clientDir = path.join(root, "dist", "client");

const MIME = { ".xml": "application/xml", ".txt": "text/plain" };
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
  return [entry, ...found.filter((m) => m !== entry)];
}
async function serveAsset(request) {
  const rel = new URL(request.url).pathname.replace(/^\/+/, "");
  try {
    const data = await readFile(path.join(clientDir, rel));
    return new Response(data, { headers: { "content-type": MIME[path.extname(rel)] ?? "application/octet-stream" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

const mf = new Miniflare({
  modules: await workerModules(),
  compatibilityDate: "2026-01-01",
  compatibilityFlags: ["nodejs_compat"],
  bindings: { ENVIRONMENT: "development" },
  // In-memory D1: schema + demo data are loaded explicitly below via
  // getD1Database().exec(dump) — the wrangler-CLI and miniflare-library
  // persistence layouts hash the database name differently, so pointing at
  // the CLI's .wrangler/state files is unreliable across versions.
  d1Databases: { DB: ":memory:" },
  serviceBindings: { ASSETS: serveAsset },
});

// Load schema + demo data into the in-memory D1: replay the drizzle
// migrations in order, then the demo seed. (The wrangler-CLI and
// miniflare-library persistence layouts hash the database name
// differently, so pointing at the CLI's .wrangler/state files is
// unreliable across versions.)
{
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const migDir = join(root, "drizzle");
  const migs = (await readdir(migDir)).filter((f) => f.endsWith(".sql")).sort();
  const d1 = await mf.getD1Database("DB");
  // D1 dialect quirk in this Miniflare version: multi-line statements fail
  // with "incomplete input" (the line-oriented lexer chokes on newlines
  // inside a statement) AND drizzle's `--> statement-breakpoint` separators
  // AND `--` comment lines would all become one line-comment once newlines
  // are collapsed, swallowing the statements that follow. So: split on the
  // breakpoint marker FIRST, drop comment lines, then collapse each
  // statement to one line (SQL is not whitespace-sensitive) and drop
  // drizzle's backtick quoting.
  const normalizeChunk = (chunk) =>
    chunk
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join(" ")
      .replace(/`/g, "")
      .replace(/\s+/g, " ")
      .trim();
  for (const m of migs) {
    const raw = await readFile(join(migDir, m), "utf8");
    const statements = raw.split(/--> statement-breakpoint/).map(normalizeChunk).filter(Boolean);
    for (const statement of statements) await d1.exec(statement);
  }
  await d1.exec(normalizeChunk(await readFile(join(root, "scripts", "demo-cameras.sql"), "utf8")));
  const counts = await d1
    .prepare("SELECT COUNT(*) AS n FROM cameras")
    .all();
  console.log(`[harness] D1 loaded: ${migs.length} migrations + demo seed, cameras=${counts.results[0].n}`);
}

for (const url of ["http://localhost/sitemap.xml", "http://localhost/robots.txt", "http://localhost/api/cameras?limit=1"]) {
  const res = await mf.dispatchFetch(url);
  const body = await res.text();
  console.log(`--- ${url} -> ${res.status} (${body.length} B)`);
  if (url.includes("sitemap")) {
    const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    console.log(`  entries: ${urls.length}`);
    console.log(`  sample: ${urls.slice(0, 5).join(", ")}`);
    const records = urls.filter((u) => u.includes("/records/"));
    console.log(`  /records entries: ${records.length} (${records.slice(0, 5).join(", ")})`);
  } else {
    console.log(`  body: ${body.slice(0, 200).replace(/\n/g, " ")}`);
  }
}
await mf.dispose();
