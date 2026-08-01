/** Cloudflare Worker entry point for OpenSurveillanceDB. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { D1Database, Fetcher, R2Bucket } from "cloudflare:workers";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  /** Photo evidence object storage (D1 stores metadata only). */
  PHOTOS: R2Bucket;
  /** Moderation access control. At least one credential must be configured. */
  MODERATION_USER?: string;
  MODERATION_PASSWORD?: string;
  MODERATION_TOKEN?: string;
  /** Contributor auth (ADR 0013): session lifetime and cookie policy. */
  AUTH_SESSION_TTL_DAYS?: string;
  AUTH_COOKIE_SECURE?: string;
  AUTH_RATE_LIMIT_MAX?: string;
  AUTH_RATE_LIMIT_WINDOW_SECONDS?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

// Moderation access control (see docs/decisions/0002-moderation-access-control.md):
// the moderation dashboard and its API are gated at the worker edge with
// HTTP Basic auth (MODERATION_USER / MODERATION_PASSWORD) and/or a bearer
// token (MODERATION_TOKEN). The gate FAILS CLOSED: without any configured
// credential every moderation request is rejected, so a misconfigured test
// host can never expose the moderation queue by accident.
const moderationPath = (pathname: string) =>
  pathname === "/moderation" || pathname === "/api/moderation" || pathname.startsWith("/api/moderation/");

function safeEqual(expected: string, actual: string) {
  if (expected.length !== actual.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return difference === 0;
}

function moderationCredentialsConfigured(env: Env) {
  return Boolean((env.MODERATION_USER && env.MODERATION_PASSWORD) || env.MODERATION_TOKEN);
}

function requireModerationAuth(request: Request, env: Env): Response | null {
  if (!moderationCredentialsConfigured(env)) {
    console.error("Moderation access control is not configured; denying", request.url);
    return Response.json({ error: "Moderation is unavailable." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const authorization = request.headers.get("Authorization") ?? "";
  if (env.MODERATION_TOKEN && safeEqual(`Bearer ${env.MODERATION_TOKEN}`, authorization)) {
    return null;
  }
  if (env.MODERATION_USER && env.MODERATION_PASSWORD) {
    const expected = `Basic ${btoa(`${env.MODERATION_USER}:${env.MODERATION_PASSWORD}`)}`;
    if (safeEqual(expected, authorization)) return null;
  }

  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="moderation", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Global security headers (audit t_a07443bd, P2 gap).
 *
 * Applied by the worker edge to EVERY response — pages, API JSON, errors,
 * image optimization, the moderation gate. Individual handlers may set
 * stricter values (e.g. the photo routes ship `Content-Security-Policy:
 * default-src 'none'; sandbox` on binary image bodies): the middleware only
 * ADDS headers that are not already present, so a more restrictive policy
 * set by an app route is never weakened.
 *
 * CSP notes (calibrated for the vinext/Next RSC runtime):
 * - `script-src 'unsafe-inline'` is required: the server-rendered HTML
 *   embeds RSC bootstrap inline scripts (`self.__VINEXT_RSC_*`) plus a
 *   same-origin dynamic `import()`. No CDNs, no `unsafe-eval`.
 * - `style-src 'unsafe-inline'` is required for the inline
 *   `<style data-vinext-fonts>` font preloads emitted by vinext.
 * - `img-src 'self' data: blob:` — tiles are served same-origin through the
 *   /api/tiles proxy (docs/OSM_INTEGRATION.md); Leaflet div-icons use HTML.
 * - `frame-ancestors 'none'` + `X-Frame-Options: DENY`: the site must not
 *   be iframable (clickjacking). Kept as headers even though modern
 *   browsers prefer the CSP directive, for legacy coverage.
 * - `default-src 'self'` + `object-src 'none'` + `form-action 'self'` +
 *   `base-uri 'self'`: baseline that blocks most reflected/XSS payloads at
 *   the header level.
 *
 * HSTS is deliberately NOT set here: the site is currently served over
 * plain HTTP (local LXC 114). `Strict-Transport-Security` should be enabled
 * at the Cloudflare zone level (or via a CF header rule) once the public
 * domain is active — see task t_6148aa6f.
 */
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  [
    "Content-Security-Policy",
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; " +
      "font-src 'self'; " +
      "connect-src 'self'; " +
      "media-src 'self'; " +
      "object-src 'none'; " +
      "frame-ancestors 'none'; " +
      "base-uri 'self'; " +
      "form-action 'self'; " +
      "worker-src 'self' blob:",
  ],
];

/** Return a copy of `response` carrying the global security headers. */
function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of SECURITY_HEADERS) {
    // Never overwrite an existing header: app routes may set stricter
    // values (photo CSP sandbox) that must survive the middleware.
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (moderationPath(url.pathname)) {
      const gate = requireModerationAuth(request, env);
      if (gate) return withSecurityHeaders(gate);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const optimized = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(optimized);
    }

    return withSecurityHeaders(await handler.fetch(request, env, ctx));
  },
};

export default worker;
