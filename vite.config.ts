import vinext from "vinext";
import { defineConfig } from "vite";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    // External hosts (CEO 2026-08-07): the temporary public domain
    // osdb.syaxhome89.com (and any future *.syaxhome89.com subdomain)
    // hits the dev server through the reverse proxy; Vite's default
    // DNS-rebinding guard rejects it. Wildcard entry keeps future
    // subdomains working without another config edit.
    server: {
      allowedHosts: [".syaxhome89.com"],
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
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      }),
    ],
  };
});
