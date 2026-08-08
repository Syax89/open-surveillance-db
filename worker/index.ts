/** Cloudflare Worker entry point for OpenSurveillanceDB. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { D1Database, Fetcher, R2Bucket, SendEmail } from "cloudflare:workers";
import { DEFAULT_RETENTION_POLICY, runRetentionSweep, type RetentionSummary } from "../db/retention";
import { sweepOidcExpired } from "../db/oidc";

/** Structural surface of a Cloudflare rate-limiter binding (`ratelimits`). */
interface RateLimiterBinding {
  limit(args: { key: string }): Promise<{ success: boolean }>;
}

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
  /**
   * Cloudflare Workers Rate Limiting bindings (wrangler.jsonc `ratelimits`,
   * audit #3 MEDIUM, t_dff3dadf): the production enforcement point for the
   * four critical public route families (auth, write, read, tiles). Optional:
   * when a binding is absent the route layer falls back to the in-memory
   * per-isolate limiter (local dev / tests — never the public API). The
   * routes read them structurally from env; this interface documents the
   * shape for the worker entry itself.
   */
  AUTH_LIMITER?: RateLimiterBinding;
  WRITE_LIMITER?: RateLimiterBinding;
  READ_LIMITER?: RateLimiterBinding;
  TILES_LIMITER?: RateLimiterBinding;
  /** Cloudflare Email Service binding (send_email in wrangler.jsonc). */
  EMAIL?: SendEmail;
  /**
   * Transactional mail (AUTH MULTI-METODO Fase A2, ADR 0020): the public
   * base URL used to build verification / password-reset action links
   * (e.g. https://opensurveillancedb.org). REQUIRED for the mailer to send:
   * without it sendAuthEmail answers missing_config and no email goes out —
   * there is NO fallback to the request origin (the Host header is
   * attacker-controllable and was the P1-1 token-harvesting vector). Routes
   * stay best-effort: register answers 201 with verification.sent=false,
   * resend answers 503, reset-request stays `{sent:true}` (anti-enumeration).
   * Set it in production and in .dev.vars.
   */
  VERIFY_BASE_URL?: string;
  /** Sender address override for the EMAIL binding (default noreply@opensurveillancedb.org). */
  MAILER_FROM?: string;
  /** Re-send rate limit for auth emails: max sends per contributor per window. */
  EMAIL_SEND_LIMIT_MAX?: string;
  EMAIL_SEND_LIMIT_WINDOW_SECONDS?: string;
  /** Moderation access control. At least one credential must be configured. */
  MODERATION_USER?: string;
  MODERATION_PASSWORD?: string;
  MODERATION_TOKEN?: string;
  /**
   * Edge-set identity (ADR 0014): after the moderation gate succeeds, the
   * worker injects this `users.email` as `x-osdb-user-email`. The local
   * prototype sets it to the demo admin account (admin@osdb.test); a real
   * deployment maps each gate credential to its own account. Fail-closed:
   * when unset, gated requests pass through with NO identity, so the route
   * layer rejects them (401).
   */
  MODERATION_IDENTITY_EMAIL?: string;
  /**
   * Per-operator moderation credentials (QA#3 F5, t_63e0d13c): a JSON array
   * of `{ user, password, email }` objects. When set, Basic auth validates
   * ONLY against this list and each operator's actions are attributed to
   * their own `email` (the shared MODERATION_USER/PASSWORD pair is ignored
   * in this configuration). Malformed JSON fails closed (503). Secrets live
   * in worker secrets / .dev.vars, never in wrangler.jsonc.
   */
  MODERATION_OPERATORS?: string;
  /**
   * Demo actor selector key (QA#3 F5): the moderation route honours a
   * client-supplied `actorId` ONLY when BOTH this is "true" AND
   * `ENVIRONMENT === "development"` — two keys so a production deploy with
   * ENVIRONMENT accidentally left at development still cannot let an admin
   * forge the audit trail. Unset/absent = the selector is OFF everywhere.
   */
  MODERATION_DEMO_ACTOR_SELECTOR?: string;
  /**
   * Pass through the ChatGPT-platform identity headers (`oai-*`) instead of
   * stripping them. Only set in a real ChatGPT-plugin deployment, where the
   * platform gateway (not arbitrary clients) sits in front of this worker.
   * Default (unset/false): strip — the prototype and direct-Internet deploys
   * must never trust a client-chosen identity (ADR 0014).
   */
  TRUST_PLATFORM_HEADERS?: string;
  /** Contributor auth (ADR 0013): session lifetime and cookie policy. */
  AUTH_SESSION_TTL_DAYS?: string;
  AUTH_COOKIE_SECURE?: string;
  AUTH_RATE_LIMIT_MAX?: string;
  AUTH_RATE_LIMIT_WINDOW_SECONDS?: string;
  /**
   * Edge-cache purge (follow-up F0, t_ae600b90): when set, the moderation
   * write path purges the affected cache tags through the Cloudflare Cache
   * Purge API so a privacy takedown stops being served immediately. Both
   * values are required; absent credentials make the purge a documented
   * no-op (the bounded s-maxage/stale-while-revalidate window still
   * converges). See app/lib/cache-purge.ts and PRIVACY_AND_SAFETY.md.
   */
  CACHE_PURGE_TOKEN?: string;
  CACHE_PURGE_ZONE_ID?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/** Cloudflare ScheduledController surface used by the cron handler. */
interface ScheduledController {
  readonly cron: string;
  readonly scheduledTime: Date;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), create a
// next.config.ts with `images: { dangerouslyAllowSVG: true }` (vinext
// reads that option at build time) and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

// Moderation access control (see docs/decisions/0002-moderation-access-control.md):
// the moderation dashboard and its API are gated at the worker edge with
// HTTP Basic auth (MODERATION_USER / MODERATION_PASSWORD) and/or a bearer
// token (MODERATION_TOKEN). The gate FAILS CLOSED: without any configured
// credential every moderation request is rejected, so a misconfigured test
// host can never expose the moderation queue by accident.
const moderationPath = (pathname: string) =>
  pathname === "/moderation" || pathname === "/api/moderation" || pathname.startsWith("/api/moderation/");

// Identity-gated paths (ADR 0014, amended by CEO decision 2026-08-02):
// the moderator-facing appeals surface (GET list, PATCH decide) carries
// moderator-grade access and stays behind the same edge gate as the
// moderation queue. POST /api/appeals (filing) is a contributor action that
// authenticates with the contributor session at the route layer (ADR 0013),
// so it must NOT be gated here — gating it made appeals unreachable for the
// very contributors they exist for (audit finding 3.1, HIGH).
const identityPath = (method: string, pathname: string) =>
  (pathname === "/api/appeals" || pathname.startsWith("/api/appeals/")) &&
  !(method === "POST" && pathname === "/api/appeals");

const gatedPath = (method: string, pathname: string) =>
  moderationPath(pathname) || identityPath(method, pathname);

// Identity headers (ADR 0014). The prototype header `x-osdb-user-email` and
// the ChatGPT-plugin headers (`oai-*`) are trusted ONLY when set by this
// edge after a real gate — never when supplied by the caller. The worker is
// the single identity authority: it strips client-supplied values on every
// path and re-injects the server-chosen identity where a gate succeeded.
const PROTOTYPE_IDENTITY_HEADER = "x-osdb-user-email";
const PLATFORM_IDENTITY_HEADER = "oai-authenticated-user-email";
const PLATFORM_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const PLATFORM_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";

function safeEqual(expected: string, actual: string) {
  if (expected.length !== actual.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return difference === 0;
}

function moderationCredentialsConfigured(env: Env) {
  return Boolean(
    (env.MODERATION_USER && env.MODERATION_PASSWORD) ||
      env.MODERATION_TOKEN ||
      (env.MODERATION_OPERATORS !== undefined && env.MODERATION_OPERATORS !== ""),
  );
}

/**
 * A per-operator credential entry (QA#3 F5, t_63e0d13c): one username /
 * password pair mapped SERVER-SIDE to its own identity email. Each operator
 * gets a distinct `x-osdb-user-email` after the gate, so every moderation
 * action is attributable to the operator who performed it (the route layer
 * derives the reviewer from the email) instead of every operator sharing one
 * `MODERATION_IDENTITY_EMAIL`.
 */
type ModerationOperator = { user: string; password: string; email: string };

/**
 * Parse `MODERATION_OPERATORS` (a JSON array of
 * `{ user, password, email }` objects). Returns null when the variable is
 * absent; FAILS CLOSED (null) on malformed JSON or an entry missing any
 * field — a broken operator list must never silently fall back to a shared
 * identity, which would defeat per-operator attribution.
 */
function parseModerationOperators(env: Env): ModerationOperator[] | null {
  const raw = env.MODERATION_OPERATORS;
  if (raw === undefined || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const operators: ModerationOperator[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) return null;
      const candidate = entry as Record<string, unknown>;
      const user = candidate.user;
      const password = candidate.password;
      const email = candidate.email;
      if (
        typeof user !== "string" ||
        user.length === 0 ||
        typeof password !== "string" ||
        password.length === 0 ||
        typeof email !== "string" ||
        email.length === 0
      ) {
        return null;
      }
      operators.push({ user, password, email });
    }
    return operators;
  } catch {
    return null;
  }
}

/**
 * Match an `Authorization` header against the per-operator list. Only the
 * operator's own pair admits; the comparison is constant-time per field so a
 * timing side channel cannot help guess a colleague's password.
 */
function matchBasicOperator(
  authorization: string,
  operators: ModerationOperator[],
): ModerationOperator | null {
  if (!authorization.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = atob(authorization.slice("Basic ".length));
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return null;
  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  for (const operator of operators) {
    if (safeEqual(operator.user, user) && safeEqual(operator.password, password)) {
      return operator;
    }
  }
  return null;
}

/**
 * The moderation gate (ADR 0002 / ADR 0014, QA#3 F5). Returns the denial
 * response when the request must not pass, plus the SERVER-CHOSEN identity
 * email the worker injects as `x-osdb-user-email` after a successful gate.
 *
 * Identity resolution order:
 *   1. Bearer token (`MODERATION_TOKEN`) → `MODERATION_IDENTITY_EMAIL`
 *      (a machine/ops identity, unchanged);
 *   2. Basic auth against `MODERATION_OPERATORS` (per-operator list) → the
 *      matched operator's OWN email — each operator is now distinguishable
 *      in the append-only audit trail;
 *   3. legacy single Basic pair (`MODERATION_USER`/`MODERATION_PASSWORD`)
 *      → `MODERATION_IDENTITY_EMAIL` (prototype / single-operator deploys).
 *
 * When `MODERATION_OPERATORS` is configured it is the ONLY Basic source of
 * truth: mixing in the legacy pair would reintroduce a shared identity that
 * all operators could impersonate, so the legacy pair is ignored in that
 * configuration. Fail-closed everywhere: no credentials → 503, wrong
 * credential → 401, malformed operator list → 503.
 */
function requireModerationAuth(request: Request, env: Env): { denied: Response | null; identityEmail: string | null } {
  const operators = parseModerationOperators(env);
  if (env.MODERATION_OPERATORS !== undefined && env.MODERATION_OPERATORS !== "" && operators === null) {
    console.error("Moderation access control: MODERATION_OPERATORS is not a valid operator list; denying", request.url);
    return {
      denied: Response.json(
        { error: "Moderation is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
      identityEmail: null,
    };
  }
  if (!moderationCredentialsConfigured(env)) {
    console.error("Moderation access control is not configured; denying", request.url);
    return {
      denied: Response.json(
        { error: "Moderation is unavailable." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
      identityEmail: null,
    };
  }

  const authorization = request.headers.get("Authorization") ?? "";
  if (env.MODERATION_TOKEN && safeEqual(`Bearer ${env.MODERATION_TOKEN}`, authorization)) {
    return { denied: null, identityEmail: env.MODERATION_IDENTITY_EMAIL ?? null };
  }
  if (operators !== null && operators.length > 0) {
    const operator = matchBasicOperator(authorization, operators);
    if (operator) return { denied: null, identityEmail: operator.email };
    return {
      denied: new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="moderation", charset="UTF-8"',
          "Cache-Control": "no-store",
        },
      }),
      identityEmail: null,
    };
  }
  if (env.MODERATION_USER && env.MODERATION_PASSWORD) {
    const expected = `Basic ${btoa(`${env.MODERATION_USER}:${env.MODERATION_PASSWORD}`)}`;
    if (safeEqual(expected, authorization)) {
      return { denied: null, identityEmail: env.MODERATION_IDENTITY_EMAIL ?? null };
    }
  }
  return {
    denied: new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="moderation", charset="UTF-8"',
        "Cache-Control": "no-store",
      },
    }),
    identityEmail: null,
  };
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
/**
 * Geolocation unblock for /mappa ONLY (t_18259daa, CEO: floating locate
 * button above the zoom controls). The locate feature is fully client-side
 * (the position never leaves the browser — privacy by design), but the
 * browser refuses to even prompt unless the top-level document is allowed
 * the geolocation feature. `geolocation=(self)` restricts it to THIS
 * origin's own document — an embedded iframe can never inherit it. Every
 * other route keeps the fully-denying policy; camera and microphone stay
 * blocked everywhere, including /mappa.
 */
const MAP_PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(self)";
const MAP_ONLY_ROUTE = "/mappa";

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

/**
 * Return a copy of `response` carrying the global security headers. On the
 * /mappa route the Permissions-Policy is relaxed to allow geolocation for
 * the top-level document (locate button, t_18259daa); every other route
 * keeps the fully-denying policy. The override still respects the
 * "never overwrite" rule: a stricter policy already set by an app handler
 * survives untouched.
 */
function withSecurityHeaders(response: Response, pathname?: string): Response {
  const headers = new Headers(response.headers);
  // Never overwrite an existing header: app routes may set stricter
  // values (photo CSP sandbox) that must survive the middleware. The
  // Permissions-Policy is special-cased below, so remember whether an app
  // handler already shipped one BEFORE the defaults below fill it in.
  const appSetPermissionsPolicy = headers.has("Permissions-Policy");
  for (const [name, value] of SECURITY_HEADERS) {
    if (!headers.has(name)) headers.set(name, value);
  }
  if (pathname === MAP_ONLY_ROUTE && !appSetPermissionsPolicy) {
    headers.set("Permissions-Policy", MAP_PERMISSIONS_POLICY);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Remove every client-supplied identity header from the request (ADR 0014).
 * The caller can never choose their own role: `x-osdb-user-email` is always
 * dropped, and the ChatGPT-platform headers (`oai-*`) are dropped too unless
 * the deployment explicitly trusts the platform gateway
 * (`TRUST_PLATFORM_HEADERS=true`, ChatGPT-plugin public-alpha only).
 */
function stripIdentityHeaders(request: Request, env: Env): Request {
  const headers = new Headers(request.headers);
  headers.delete(PROTOTYPE_IDENTITY_HEADER);
  const trustPlatform =
    env.TRUST_PLATFORM_HEADERS === "1" || env.TRUST_PLATFORM_HEADERS === "true";
  if (!trustPlatform) {
    headers.delete(PLATFORM_IDENTITY_HEADER);
    headers.delete(PLATFORM_FULL_NAME_HEADER);
    headers.delete(PLATFORM_FULL_NAME_ENCODING_HEADER);
  }
  return new Request(request, { headers });
}

/**
 * After the moderation gate succeeds, set the server-chosen identity (the
 * per-operator email resolved by the gate, or `MODERATION_IDENTITY_EMAIL`)
 * as `x-osdb-user-email` (QA#3 F5). Fail-closed: without a resolved identity
 * the request passes through anonymous and the route layer rejects it (401),
 * so a misconfigured host can never accidentally grant a role.
 */
function injectIdentityAfterGate(request: Request, identityEmail: string | null): Request {
  if (!identityEmail) return request;
  const headers = new Headers(request.headers);
  headers.set(PROTOTYPE_IDENTITY_HEADER, identityEmail);
  return new Request(request, { headers });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Identity sanitisation runs on EVERY path before any gate: the edge
    //    is the single identity authority and never trusts the caller.
    let gated = stripIdentityHeaders(request, env);

    if (gatedPath(request.method, url.pathname)) {
      const gate = requireModerationAuth(gated, env);
      if (gate.denied) return withSecurityHeaders(gate.denied, url.pathname);
      gated = injectIdentityAfterGate(gated, gate.identityEmail);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const optimized = await handleImageOptimization(gated, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, gated.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(optimized, url.pathname);
    }

    return withSecurityHeaders(await handler.fetch(gated, env, ctx), url.pathname);
  },

  /**
   * Scheduled retention sweep (ADR 0004 §3, ADR 0008 p.3 — cron binding in
   * wrangler.jsonc, daily at 03:00 UTC). Runs the retention job from
   * db/retention.ts and the OIDC expiry sweep from db/oidc.ts against the D1
   * + PHOTOS bindings. Both sweeps must never break the request path: they
   * run inside waitUntil and any failure is caught and logged so the worker
   * stays healthy (the next run retries).
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const policy = DEFAULT_RETENTION_POLICY;
    ctx.waitUntil(
      runRetentionSweep(new Date().toISOString(), { policy, r2: env.PHOTOS })
        .then((summary: RetentionSummary) => {
          console.log(`Retention sweep ok (${controller.cron}):`, JSON.stringify(summary));
        })
        .catch((error) => {
          console.error("Retention sweep failed:", error);
        }),
    );
    // OIDC rows are single-use and short-lived by design; the expiry sweep
    // (db/oidc.ts) removes lapsed oidc_states / oidc_merge_requests rows so
    // every abandoned /start does not leak a row forever on D1.
    ctx.waitUntil(
      sweepOidcExpired()
        .then((result) => {
          console.log(`OIDC expiry sweep ok (${controller.cron}):`, JSON.stringify(result));
        })
        .catch((error) => {
          console.error("OIDC expiry sweep failed:", error);
        }),
    );
  },
};

export default worker;
