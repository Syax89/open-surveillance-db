/**
 * Lighthouse CI preview server (kanban t_2d2bf33f).
 *
 * Serves the production build (`npm run build` → dist/) exactly like the
 * deployed Cloudflare Worker: same worker bundle (dist/server) for SSR and
 * API routes, same static assets (dist/client) served directly from disk.
 * This is the render engine the jsdom-based a11y suite cannot provide — real
 * CSS + layout, so the layout-dependent axe rules (color-contrast,
 * target-size, link-in-text-block, scrollable-region-focusable) are actually
 * evaluated by Lighthouse.
 *
 * Routing: static-first — a request whose path exists under dist/client is
 * served from disk (hashed assets, icons, robots.txt); everything else goes
 * to the worker via Miniflare dispatchFetch (SSR pages, /api/*). The ASSETS
 * service binding stays wired so any internal env.ASSETS.fetch from the
 * worker also resolves.
 *
 * Usage:
 *   npm run build && npm run preview:serve        # listens on :3000
 *   PORT=4173 npm run preview:serve               # custom port
 *
 * Bindings are intentionally empty (like the SSR test harness): the audited
 * routes are public pages that render without D1/R2. No fixture data, no
 * credentials, public routes only.
 */
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "dist", "server");
const clientDir = path.join(root, "dist", "client");

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

/** Collect every JS module of the built worker, with index.js as the entry. */
async function workerModules() {
  const found = [];
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith(".js")) {
        found.push({ type: "ESModule", path: full });
      }
    }
  };
  await walk(serverDir);
  const entry = found.find((m) => m.path === path.join(serverDir, "index.js"));
  if (!entry) {
    throw new Error("dist/server/index.js is missing — run `npm run build` first");
  }
  return [entry, ...found.filter((m) => m !== entry)];
}

/** Resolve a request pathname to a file under dist/client, or null. */
function assetPathFor(pathname) {
  const relative = pathname.replace(/^\/+/, "");
  if (!relative || relative.includes("..")) {
    return null;
  }
  const filePath = path.normalize(path.join(clientDir, relative));
  if (!filePath.startsWith(clientDir)) {
    return null;
  }
  return filePath;
}

/** Serve a static file from dist/client — backs the ASSETS binding too. */
async function serveAsset(request) {
  const filePath = assetPathFor(new URL(request.url).pathname);
  if (!filePath) {
    return new Response("not found", { status: 404 });
  }
  try {
    const data = await readFile(filePath);
    const type = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    return new Response(data, { headers: { "content-type": type } });
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error(`[preview] asset error: ${filePath}`, err.message);
    }
    return new Response("not found", { status: 404 });
  }
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";

const mf = new Miniflare({
  modules: await workerModules(),
  compatibilityDate: "2026-01-01",
  compatibilityFlags: ["nodejs_compat"],
  bindings: {},
  serviceBindings: {
    ASSETS: serveAsset,
  },
});

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    // Static-first: hashed assets, icons, robots.txt live on disk under
    // dist/client — serve them directly, never through the worker (the
    // built worker 404s /assets/* it does not recognise).
    const staticFile = assetPathFor(url.pathname);
    if (staticFile) {
      const file = await readFile(staticFile).catch(() => null);
      if (file) {
        res.statusCode = 200;
        res.setHeader("content-type", MIME[path.extname(staticFile).toLowerCase()] ?? "application/octet-stream");
        res.end(file);
        return;
      }
    }
    // Everything else: SSR pages and /api/* go to the worker.
    const response = await mf.dispatchFetch(url, {
      method: req.method ?? "GET",
      headers: req.headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
    });
    res.statusCode = response.status;
    for (const [key, value] of response.headers) {
      res.setHeader(key, value);
    }
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error("[preview] request failed:", err);
    res.statusCode = 500;
    res.end("preview server error");
  }
});

server.listen(port, host, () => {
  // "listening" is the ready pattern LHCI waits for (startServerCommand).
  console.log(`[preview] OpenSurveillanceDB preview server listening on http://${host}:${port}`);
});
