/**
 * Deep-link locale route — GET /api/locale (ADR 0015, kanban t_9d67605d).
 *
 * The route persists the interface-locale preference server-side (the same
 * `opensurveillancedb-locale` cookie the client toggle writes) and
 * 302-redirects to a same-site path, so a shared URL can force a language
 * for the next viewer with correct SSR (html lang + localized metadata, no
 * EN->IT flash). Covered:
 *   1. sets the cookie with the same attributes as the client-side write
 *      (path=/, 1-year max-age, samesite=lax) and redirects to `next`;
 *   2. defaults to `/` when `next` is missing;
 *   3. rejects open-redirect attempts (absolute URL, protocol-relative,
 *      backslash) and header injection, falling back to `/`;
 *   4. invalid `lang` values fall back to the pilot language (en, ADR 0007);
 *   5. the stub carries X-Robots-Tag: noindex so it never competes with the
 *      canonical content URL in search results.
 *
 * Requires `npm run build` first (npm test already builds before running).
 */
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "dist", "server");

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
  assert.ok(entry, "dist/server/index.js is missing — run `npm run build` first");
  return [entry, ...found.filter((m) => m !== entry)];
}

/** Dispatch a request to the built worker exactly like the deployed one. */
async function dispatch(route) {
  const mf = new Miniflare({
    modules: await workerModules(),
    compatibilityDate: "2026-01-01",
    compatibilityFlags: ["nodejs_compat"],
  });
  try {
    const response = await mf.dispatchFetch(`http://localhost${route}`, {
      headers: { accept: "text/html" },
      redirect: "manual",
    });
    const setCookie = response.headers.getSetCookie();
    return {
      response,
      status: response.status,
      location: response.headers.get("location"),
      setCookie: setCookie.length > 0 ? setCookie[0] : null,
      robots: response.headers.get("x-robots-tag"),
    };
  } finally {
    await mf.dispose();
  }
}

test("locale deep-link sets the preference cookie and redirects to the same-site target", async () => {
  const result = await dispatch("/api/locale?lang=it&next=/guide");

  assert.equal(result.status, 302);
  assert.equal(result.location, "/guide");
  assert.equal(result.robots, "noindex");
  // Same cookie the client writes: interface preference, 1 year, Lax.
  assert.equal(
    result.setCookie,
    "opensurveillancedb-locale=it; path=/; max-age=31536000; samesite=lax",
  );
});

test("locale deep-link defaults to / when next is missing", async () => {
  const result = await dispatch("/api/locale?lang=en");

  assert.equal(result.status, 302);
  assert.equal(result.location, "/");
  assert.match(result.setCookie, /^opensurveillancedb-locale=en;/);
});

test("locale deep-link rejects open-redirect and header-injection targets", async () => {
  // Absolute URL, protocol-relative, backslash trick, CRLF injection.
  for (const next of [
    "https://evil.example/phish",
    "//evil.example/phish",
    "/\\evil.example/phish",
    "/guide%0d%0aX-Evil:%20yes",
  ]) {
    const result = await dispatch(`/api/locale?lang=it&next=${encodeURIComponent(next)}`);
    assert.equal(result.status, 302, `next=${next}`);
    assert.equal(result.location, "/", `next=${next} must fall back to /`);
    assert.ok(!result.location.includes("\r") && !result.location.includes("\n"),
      `next=${next} must not leak CR/LF into the Location header`);
  }
});

test("locale deep-link falls back to the pilot language for unknown lang values", async () => {
  const result = await dispatch("/api/locale?lang=fr&next=/guide");

  assert.equal(result.status, 302);
  assert.equal(result.location, "/guide");
  assert.match(result.setCookie, /^opensurveillancedb-locale=en;/);
});
