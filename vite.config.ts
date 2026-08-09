import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

/**
 * Server-side source disclosure guard (security review 2026-08-08, P0).
 *
 * The vinext dev server serves the whole project root as modules, so a
 * public dev deployment (pre-prod container behind the reverse proxy)
 * exposed the server-only implementation: /worker/index.ts, /db/*.ts,
 * /drizzle/*.sql, /scripts/*.mjs, /app/api/** and config files all
 * answered 200 to anonymous callers, making bypass research trivial.
 *
 * This middleware returns 404 for every path that can never be a client
 * module or a public route. It is intentionally a blacklist of the
 * server-only surface: /app (page/layout components), /node_modules
 * (real npm deps + the .vite pre-bundle) and /api must keep working as
 * dev modules / public routes, so they are NOT blocked.
 *
 * Production is unaffected: the built worker serves only dist/client
 * assets (wrangler.jsonc "assets"), so this guard exists purely for dev /
 * pre-prod servers.
 */
const BLOCKED_SOURCE_PREFIXES = [
  "/worker/",
  "/db/",
  "/drizzle/",
  "/scripts/",
  "/tests/",
  "/docs/",
  "/ops/",
  "/.github/",
  "/.claude/",
  "/.wrangler/",
  "/app/api/", // route handlers are server-only; never client modules
];
const BLOCKED_ROOT_FILES = [
  "/package.json",
  "/package-lock.json",
  "/vite.config.ts",
  "/wrangler.jsonc",
  "/tsconfig.json",
  "/drizzle.config.ts",
  "/worker-configuration.d.ts",
  "/LICENSE",
  "/README.md",
  "/CHANGELOG.md",
  "/GOVERNANCE.md",
  "/SECURITY.md",
  "/CONTRIBUTING.md",
  "/CODE_OF_CONDUCT.md",
  "/AGENTS.md",
  "/CLAUDE.md",
  // Tooling config files (audit ops 2026-08-09): never client modules, and
  // the generic *.config.* / .mjs / .cjs root pattern below covers future ones.
  "/eslint.config.mjs",
  "/postcss.config.mjs",
  "/lighthouserc.cjs",
];
const BLOCKED_EXTENSIONS = [".sql", ".sh", ".yml", ".yaml", ".toml", ".gpg", ".pem", ".key"];

function isBlockedSourcePath(pathname: string): boolean {
  if (BLOCKED_ROOT_FILES.includes(pathname)) return true;
  if (BLOCKED_SOURCE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  // Any root-level file with a server-only extension (e.g. /x.sql).
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1) {
    if (BLOCKED_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return true;
    // Root-level tooling: `*.config.*` (eslint.config.mjs, postcss.config.mjs,
    // drizzle.config.ts) and `.mjs`/`.cjs` (lighthouserc.cjs) are never client
    // modules — audit ops 2026-08-09 found eslint.config.mjs / postcss.config.mjs
    // / lighthouserc.cjs served 200 on the pre-prod dev server.
    if (/\.config\.[a-z0-9]+$/i.test(pathname)) return true;
    if (/\.(mjs|cjs)$/i.test(pathname)) return true;
  }
  return false;
}

function denyServerSource(): Plugin {
  return {
    name: "deny-server-source",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (isBlockedSourcePath(pathname)) {
          res.statusCode = 404;
          res.setHeader("Cache-Control", "no-store");
          res.end("Not found");
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    // External hosts (CEO 2026-08-07, env-driven 2026-08-08): a dev server
    // behind a TLS-terminating reverse proxy sees the public domain in the
    // Host header and Vite's default DNS-rebinding guard would reject it.
    // The served domain is NOT hard-coded: set ALLOWED_HOSTS
    // (comma-separated) to the domain(s) your deployment serves — the
    // cutover to the final domain is a deployment variable, not a code
    // change. The fallback only keeps plain local development working
    // (Vite also allows its own LAN address regardless of this list).
    server: {
      allowedHosts: (process.env.ALLOWED_HOSTS ?? "localhost,127.0.0.1,::1").split(",").map((h) => h.trim()).filter(Boolean),
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
      // Never let a CDN cache the Vite pre-bundle (CEO 2026-08-07): the
      // dev server rewrites node_modules/.vite/deps with fresh hashes on
      // every restart, and Cloudflare was serving the STALE bundle (old
      // ?v= hash) mixed with new modules → two copies of React →
      // "Cannot read properties of null (reading 'useContext')" in Slot.
      // no-store keeps browsers AND edge caches honest.
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    },
    // One React instance, always: some deps (vinext shims, @unpic/react)
    // resolve react through different export paths, which makes Vite
    // pre-bundle two copies → "Cannot read properties of null (reading
    // 'useContext')" in Slot. Dedupe pins them to the same module.
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    plugins: [
      denyServerSource(),
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      }),
    ],
  };
});
