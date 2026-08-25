/** Cloudflare Worker entry point for OpenSurveillanceDB. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { AnalyticsEngineDataset, D1Database, Fetcher, SendEmail } from "cloudflare:workers";
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
  /**
   * Request analytics (wrangler.jsonc `analytics`, dataset osdb_requests):
   * one datapoint per request — path group (api|web), status class, API
   * endpoint path and HTTP method (see recordRequestAnalytics). Optional:
   * absent in local dev / tests, where logging is a no-op.
   */
  ANALYTICS?: AnalyticsEngineDataset;
  /**
   * Cloudflare Workers Rate Limiting bindings (wrangler.jsonc `ratelimits`,
   * audit #3 MEDIUM, t_dff3dadf): the production enforcement point for the
   * five critical public route families (auth, write, read, tiles, geocode). Optional:
   * when a binding is absent the route layer falls back to the in-memory
   * per-isolate limiter (local dev / tests — never the public API). The
   * routes read them structurally from env; this interface documents the
   * shape for the worker entry itself.
   */
  AUTH_LIMITER?: RateLimiterBinding;
  WRITE_LIMITER?: RateLimiterBinding;
  READ_LIMITER?: RateLimiterBinding;
  TILES_LIMITER?: RateLimiterBinding;
  GEOCODE_LIMITER?: RateLimiterBinding;
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
  /** Recipient override for urgent /correggi report notifications (issue #438; default privacy@opensurveillancedb.org). */
  URGENT_REPORT_TO?: string;
  /**
   * Re-send rate limit for auth emails (issue #440, ADR 0020 decision 2):
   * max sends per contributor per rolling window, enforced ATOMICALLY in D1
   * via email_send_log reservations. Default 1 per 5 minutes
   * (EMAIL_SEND_LIMIT_MAX=1, EMAIL_SEND_LIMIT_WINDOW_SECONDS=300); these
   * two overrides tune the same per-contributor window (e.g. staging or a
   * temporarily raised ceiling) and apply to verification, resend and
   * password-reset sends alike.
   */
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

/**
 * Every-minute keep-warm cron (wrangler.jsonc `triggers.crons`): wakes an
 * isolate so the first visitor request after an idle gap does not pay a
 * ~1s cold start. The tick itself is a deliberate no-op — nothing is swept
 * on this schedule (the retention/OIDC sweeps stay on the 03:00 UTC cron).
 */
const WARMUP_CRON = "*/1 * * * *";

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

/**
 * Scanner / attack-path catch-all (2026-08-12, CEO decision "proteggiamo il
 * sito"). Public probes for sensitive files, configs and admin panels
 * (`.env`, `*.php`, `node_modules`, dotfiles, backup
 * extensions…) are answered with a bare 403 BEFORE the app router, the
 * rate-limit bindings and D1. Previously every probe crossed the full
 * vinext routing pipeline (and API-shaped probes executed D1 queries): on
 * 2026-08-11T22:00Z a scanner started hammering the site with ~500-600
 * req/h (paths like /web/.env, /openapi.json, /.hermes/config.yaml,
 * /configuration.php.bak…), which is what drove the Worker CPU p99 spikes
 * (276-488 ms, cf. Grafana osdb-overview, 2026-08-12). This edge gate
 * reduces the cost of a probe to a single regex test.
 *
 * Deliberately narrow: only unmistakably non-site paths are matched
 * (nothing under /api, /assets, /mappa, /segnala, /correggi, /moderation
 * or /records can ever hit it) so no legitimate route is affected — see
 * tests/worker-edge.test.mjs "anti-scanner" for both sides of the fence.
 *
 * 2026-08-22: `openapi.json` was REMOVED from the blocklist — the file is
 * now served deliberately (public/openapi.json, RFC 9727 API catalog
 * service-desc). The spec answers from the static ASSETS, not the router
 * pipeline, so a probe costs a CDN-cached asset fetch instead of D1 work.
 */
const SCANNER_PATH_PATTERN =
  /(^|\/)(\.env|\.git|\.svn|\.hermes|node_modules|service_account\.json|appsettings\.json|firebase\.json|aws-config|configuration\.php|frontend_latest|telescope|server-info|phpmyadmin|adminer|wp-admin|sa\.json|application\.properties|classwithtostring)|\.(php|bak|sql|log)$/i;


// Identity headers (ADR 0014). The prototype header `x-osdb-user-email` and
// the ChatGPT-plugin headers (`oai-*`) are trusted ONLY when set by this
// edge after a real gate — never when supplied by the caller. The worker is
// the single identity authority: it strips client-supplied values on every
// path and re-injects the server-chosen identity where a gate succeeded.
const PROTOTYPE_IDENTITY_HEADER = "x-osdb-user-email";
const PLATFORM_IDENTITY_HEADER = "oai-authenticated-user-email";
const PLATFORM_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const PLATFORM_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";

const CANONICAL_HOST = "opensurveillancedb.org";
const WWW_HOST = "www.opensurveillancedb.org";
const PREPRODUCTION_HOST = "osdb.syaxhome89.com";

function hostRedirect(request: Request, url: URL): Response | null {
  const hostname = url.hostname.toLowerCase();
  if (hostname !== CANONICAL_HOST && hostname !== WWW_HOST) return null;
  if (hostname === WWW_HOST || url.protocol === "http:") {
    const target = new URL(request.url);
    target.protocol = "https:";
    target.hostname = CANONICAL_HOST;
    return Response.redirect(target.toString(), 308);
  }
  return null;
}

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
 * stricter values (an app route may set a more restrictive policy on its
 * own response): the middleware only
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
 * plain HTTP (local test container). `Strict-Transport-Security` should be enabled
 * at the Cloudflare zone level (or via a CF header rule) once the public
 * domain is active — see task t_6148aa6f.
 */
/**
 * Geolocation unblock for /mappa and /segnala (t_18259daa + CEO 2026-08-09
 * one-tap report location). On /mappa the locate feature is fully
 * client-side (the position never leaves the browser). On /segnala, an
 * explicit one-tap action feeds the selected point into the same report flow
 * as a map click: an explicit user action plus the browser permission gate
 * the lookup, and the UI still exposes map/manual alternatives. `geolocation=(self)` restricts the
 * feature to THIS origin's own document — an embedded iframe can never
 * inherit it. Every other route keeps the fully-denying policy; camera and
 * microphone stay blocked everywhere.
 */
const GEOLOCATION_PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(self)";
const GEOLOCATION_ROUTES = new Set(["/mappa", "/segnala"]);

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
 * OAuth Protected Resource Metadata (RFC 9728, 2026-08-22): describes the
 * resource server's bearer-credential requirements for the write API —
 * the scopes an API key can carry and the header method. Published because
 * the isitagentready authMd check requires the PRM document at
 * /.well-known/oauth-protected-resource; the values are real OSDB facts
 * (scopes from db/api-keys.ts, bearer header from app/lib/write-gate.ts).
 * authorization_servers names this origin because key issuance happens
 * here (account settings), NOT because an OAuth authorization server
 * exists — /auth.md states that explicitly. No AS metadata document is
 * published (there is no OAuth token endpoint to describe).
 */
const OAUTH_PROTECTED_RESOURCE = {
  // `resource` matches the scanned site origin exactly (RFC 9728 allows a
  // string or array; the scanner's validator requires the value to match
  // the target — a path suffix is rejected as a mismatch).
  resource: "https://opensurveillancedb.org",
  resource_name: "OpenSurveillanceDB API",
  authorization_servers: ["https://opensurveillancedb.org"],
  scopes_supported: ["submit", "confirm", "edit", "action"],
  bearer_methods_supported: ["header"],
};

/**
 * OAuth Authorization Server metadata (RFC 8414 shape, 2026-08-22): the
 * authMd check follows authorization_servers from the PRM and requires
 * this document with an `agent_auth` block. All values are real OSDB
 * facts — the registration method is email-verified account registration
 * (register_uri /identity_endpoint) with the email verification link as
 * the claim ceremony (claim_uri), issuing scoped API keys (credentials).
 * Deliberately NO authorization/token/jwks endpoints: OSDB does not run
 * an OAuth token flow, and publishing fake endpoints would be worse than
 * omitting them — /auth.md states the credential model explicitly.
 */
const OAUTH_AUTHORIZATION_SERVER = {
  issuer: "https://opensurveillancedb.org",
  service_documentation: "https://opensurveillancedb.org/api-docs",
  scopes_supported: ["submit", "confirm", "edit", "action"],
  agent_auth: {
    skill: "https://opensurveillancedb.org/auth.md",
    register_uri: "https://opensurveillancedb.org/register",
    identity_endpoint: "https://opensurveillancedb.org/api/auth/register",
    claim_uri: "https://opensurveillancedb.org/api/auth/verify-email",
    identity_types_supported: ["identity_assertion"],
    credential_types_supported: ["api_key"],
    identity_assertion: {
      assertion_types_supported: ["verified_email"],
      credential_types_supported: ["api_key"],
    },
  },
};

/**
 * Agent index document (DNS-AID, draft-mozleywilliams-dnsop-dnsaid):
 * the organization-level registry of agent services, pointed to by the
 * `_index._agents.opensurveillancedb.org` SVCB/HTTPS records. Only real
 * services — every URL below answers 200.
 */
const AGENT_INDEX = {
  index: "https://opensurveillancedb.org/.well-known/agent-index.json",
  organization: "OpenSurveillanceDB",
  description:
    "Open database of publicly visible surveillance cameras: fixed CCTV, traffic cameras, license-plate readers and similar infrastructure that watches public space.",
  agent_services: [
    {
      name: "OpenSurveillanceDB API",
      type: "web-api",
      description: "Read and write access to the camera database. Read endpoints are keyless; write endpoints require a scoped Bearer API key.",
      api_catalog: "https://opensurveillancedb.org/.well-known/api-catalog",
      openapi: "https://opensurveillancedb.org/openapi.json",
      documentation: "https://opensurveillancedb.org/api-docs",
      authentication: "https://opensurveillancedb.org/auth.md",
    },
    {
      name: "Agent registration",
      type: "auth",
      description: "Register a credential for write access: /api/auth/register (email + verification), /api/auth/keys (scoped API key). No OAuth token flow exists.",
      auth_md: "https://opensurveillancedb.org/auth.md",
      oauth_authorization_server: "https://opensurveillancedb.org/.well-known/oauth-authorization-server",
      oauth_protected_resource: "https://opensurveillancedb.org/.well-known/oauth-protected-resource",
    },
    {
      name: "Markdown content",
      type: "content",
      description: "The main public pages are served as Markdown to agents via Accept: text/markdown content negotiation.",
      pages: ["https://opensurveillancedb.org/", "https://opensurveillancedb.org/api-docs", "https://opensurveillancedb.org/guide", "https://opensurveillancedb.org/privacy", "https://opensurveillancedb.org/faq", "https://opensurveillancedb.org/contatti", "https://opensurveillancedb.org/manifesto"],
    },
  ],
};

/**
 * Markdown for Agents (2026-08-22, isitagentready `markdownNegotiation`):
 * curated Markdown renderings of the main public pages, served when the
 * client sends `Accept: text/markdown`. Summaries are honest — titles and
 * section headings verified against the live pages — and link to the HTML
 * originals. `Vary: Accept` keeps edge caches separate per variant; zero
 * D1, zero app-router CPU, edge-cacheable 1h. Pages NOT in the map (and
 * every API route) are never negotiated.
 */
const MARKDOWN_PAGES: Record<string, string> = {
  "/": `# OpenSurveillanceDB

Public data about public surveillance.

OpenSurveillanceDB is an open database of publicly visible surveillance cameras: fixed CCTV, traffic cameras, license-plate readers and similar infrastructure that watches public space. Every record documents the camera — where it is, who appears to operate it, what it captures — and the public evidence for each claim.

## What you can do

- **Explore the map** — https://opensurveillancedb.org/mappa
- **Search the directory** — https://opensurveillancedb.org/directory
- **Report a camera** — https://opensurveillancedb.org/segnala
- **Read the API documentation** — https://opensurveillancedb.org/api-docs
- **Machine-readable discovery**: API catalog (/.well-known/api-catalog), OpenAPI specification (/openapi.json), agent registration (/auth.md).

Visibility without surveillance: the database is public about public infrastructure, and deliberately does not publish live footage, tracking data, or private-home details. Faces and licence plates are stripped before anything is published.

Human page: https://opensurveillancedb.org/
`,
  "/api-docs": `# Public API

OpenSurveillanceDB exposes a documented public API for reading and (with a scoped API key) writing camera records.

- **OpenAPI specification**: https://opensurveillancedb.org/openapi.json (OpenAPI 3.0.3)
- **API catalog (RFC 9727)**: https://opensurveillancedb.org/.well-known/api-catalog
- **Agent registration (Auth.md)**: https://opensurveillancedb.org/auth.md

## Read endpoints (keyless)

List, bbox queries, GeoJSON/CSV exports, per-record detail, search, nearby, revisions, geocoding, raster tiles, import sources — no credentials required.

## Write endpoints (Bearer API key)

Publishing camera reports, corrections, community confirmations, actions and edits require an API key with the matching scope: \`submit\`, \`confirm\`, \`edit\`, \`action\`. Keys are created in the account settings (https://opensurveillancedb.org/account), sent as \`Authorization: Bearer <key>\`, stored hashed, revocable.

Full interactive documentation: https://opensurveillancedb.org/api-docs
`,
  "/guide": `# Guide — A public database, built with care.

How OpenSurveillanceDB works, in one document.

- **Find what you need** — search the directory, browse the map, export CSV/GeoJSON.
- **Visibility without operational surveillance** — the database documents cameras; it is not a surveillance tool.
- **From observation to public record** — contributions are evidence-based: each record cites its public source.
- **The public publication model** — anything published stays public; the site is an archive, not a message board.
- **Each status says what the record can support** — camera statuses reflect the strength of the evidence.
- **Why create an account?** — accounts let you report, correct, confirm and edit; they are never required to read.
- **You can edit your own contributions** — and correct others with evidence.
- **What confirmations mean** — community confirmations verify that a camera is still present and accurate.

Full guide: https://opensurveillancedb.org/guide
`,
  "/privacy": `# Privacy notice

OpenSurveillanceDB's privacy notice (controller: see section 1 of the full notice).

1. Who we are (controller)
2. What the service does
3. What personal data we process
4. What we do NOT collect or publish
5. Recipients and transfers
6. International data transfers
7. Retention
8. Your rights (GDPR Articles 15–22)

The database publishes information about cameras, not about people: faces and licence plates are stripped before publication. Full notice: https://opensurveillancedb.org/privacy
`,
  "/faq": `# FAQ — Clear answers about how the database works.

Frequently asked questions about OpenSurveillanceDB: what the database contains, how cameras are documented, how to contribute, correct or remove a record, and how privacy is protected.

Still have questions? https://opensurveillancedb.org/contatti
`,
  "/contatti": `# Contacts — Who runs this, and how to reach us.

Who runs OpenSurveillanceDB and how to reach the maintainers.

- **Corrections and removal** — how to request a correction or removal of a record.
- **Reporting a security vulnerability** — responsible-disclosure contact for security issues.

Full page: https://opensurveillancedb.org/contatti
`,
  "/manifesto": `# A manifesto for legible public space.

What OpenSurveillanceDB stands for.

- **Transparency is a condition of public space** — people deserve to know the surveillance systems around them.
- **Help people understand the systems around them** — legibility, not fear.
- **Free, open and safe by design** — open data, ODbL licensed, safety by design.
- **What we deliberately do not do** — no live footage, no tracking, no private-home details.
- **Open where it is safe to be open** — openness has limits where safety requires them.

Full manifesto: https://opensurveillancedb.org/manifesto
`,
};

/**
 * Auth.md agent registration discovery (2026-08-22, isitagentready
 * `authMd`): a self-contained Markdown document at /auth.md telling AI
 * agents how to register for WRITE access to the API. OpenSurveillanceDB
 * does NOT run an OAuth authorization server — it issues its own scoped
 * API keys — so the Auth.md spec's fallback path applies (no PRM / OAuth
 * AS metadata is published, and the document explains the credential
 * model itself). Served like the API catalog: before the app router,
 * static, edge-cacheable.
 */
const AUTH_MD = `# auth.md — OpenSurveillanceDB Agent Registration

Not an agent? You might be looking for https://opensurveillancedb.org/api-docs.

You are an agent. This document tells you how to register a credential for the **OpenSurveillanceDB write API** — publishing camera reports, corrections, community confirmations, actions and edits. Read access to the API is keyless and needs no registration. Follow the steps in order; do not skip ahead.

Endpoints live at \`https://opensurveillancedb.org\`. The machine-readable API surface is the API catalog (/.well-known/api-catalog), the OpenAPI specification (/openapi.json) and the human documentation (/api-docs).

## Step 1 — Register an account

\`\`\`http
POST /api/auth/register HTTP/1.1
Host: opensurveillancedb.org
Content-Type: application/json

{"email": "agent@example.com", "password": "<12+ character password>"}
\`\`\`

A verification email is sent to the address (one per five minutes per address). Complete the link inside it before Step 3.

## Step 2 — Sign in to create an API key

\`\`\`http
POST /api/auth/login HTTP/1.1
Host: opensurveillancedb.org
Content-Type: application/json

{"email": "agent@example.com", "password": "<password>"}
\`\`\`

The response sets a session cookie. Keep that cookie for Step 3; it is the proof of the verified account and is never a credential for the data API.

## Step 3 — Create an API key

\`\`\`http
POST /api/auth/keys HTTP/1.1
Host: opensurveillancedb.org
Content-Type: application/json
Cookie: <session cookie from Step 2>

{"name": "my-agent", "scopes": ["submit", "confirm", "edit", "action"], "expiresAt": "2027-01-01T00:00:00.000Z"}
\`\`\`

- \`scopes\`: non-empty subset of \`submit\`, \`confirm\`, \`edit\`, \`action\` — one line each below.
- \`expiresAt\`: ISO-8601 UTC; default one year, explicit null = never.
- The key is shown **exactly once** in the response — store it; it cannot be recovered, only reissued.

Scopes:

- \`submit\` — publish camera reports and corrections.
- \`confirm\` — cast or withdraw community confirmations.
- \`edit\` — update camera details.
- \`action\` — cast or withdraw community actions.

## Step 4 — Use the credential

Send the key as a bearer credential in the Authorization header on every write request:

\`\`\`http
POST /api/cameras HTTP/1.1
Host: opensurveillancedb.org
Content-Type: application/json
Authorization: Bearer <api key from Step 3>

{"title": "Example camera", "latitude": 47.41, "longitude": 8.57, "kind": "Fixed dome"}
\`\`\`

- Credentials in the query string are rejected (HTTP 400) — header only.
- Each endpoint requires the scope shown in its documentation (/api-docs).
- Keys are stored hashed and never logged; revoke a key from the account settings (https://opensurveillancedb.org/account) at any time.

## No OAuth authorization server

OpenSurveillanceDB does not run an OAuth authorization server: it issues its own scoped API keys, so no OAuth Authorization Server metadata is published and this document is self-contained. Token requests against OAuth endpoints are not supported.

## Notes for agents

- Respect the rate limits documented in /api-docs; bulk exports are metered separately.
- The dataset is licensed ODbL 1.0 — see /api-docs for attribution requirements.
- Do not probe account endpoints; create a real test account for integration testing.
`;

/**
 * RFC 8288 discovery links (2026-08-22, isitagentready `linkHeaders`):
 * every 2xx HTML document carries Link headers pointing to the RFC 9727
 * API catalog, the OpenAPI spec (service-desc) and the human docs page
 * (service-doc), so an AI agent that lands on ANY page can discover the
 * machine-readable API. Relative references resolve against the request
 * URI per RFC 8288 §3.2. Never added to API/JSON responses, errors or
 * redirects.
 */
const API_LINK_HEADER = [
  `</.well-known/api-catalog>; rel="api-catalog"`,
  `</openapi.json>; rel="service-desc"; type="application/openapi+json"`,
  `</api-docs>; rel="service-doc"`,
].join(", ");

/**
 * Return a copy of `response` carrying the global security headers. On the
 * /mappa and /segnala routes the Permissions-Policy is relaxed to allow
 * geolocation for the top-level document; every other route keeps the
 * fully-denying policy. The override still respects the "never overwrite"
 * rule: a stricter policy already set by an app handler survives untouched.
 */
function withSecurityHeaders(response: Response, pathname?: string, hostname?: string): Response {
  const headers = new Headers(response.headers);
  // Never overwrite an existing header: app routes may set stricter
  // values that must survive the middleware. The
  // Permissions-Policy is special-cased below, so remember whether an app
  // handler already shipped one BEFORE the defaults below fill it in.
  const appSetPermissionsPolicy = headers.has("Permissions-Policy");
  for (const [name, value] of SECURITY_HEADERS) {
    if (!headers.has(name)) headers.set(name, value);
  }
  // RFC 8288 discovery links on HTML documents only (2xx, text/html), and
  // never clobbering a Link an app route already set.
  if (
    response.status >= 200 &&
    response.status < 300 &&
    (response.headers.get("content-type") ?? "").startsWith("text/html") &&
    !headers.has("Link")
  ) {
    headers.set("Link", API_LINK_HEADER);
  }
  if (pathname && GEOLOCATION_ROUTES.has(pathname) && !appSetPermissionsPolicy) {
    headers.set("Permissions-Policy", GEOLOCATION_PERMISSIONS_POLICY);
  }
  if (hostname?.toLowerCase() === PREPRODUCTION_HOST) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
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

/**
 * Request analytics (Workers Analytics Engine, dataset osdb_requests).
 * One datapoint per request, written AFTER the response is produced:
 *   blob1 = path group ("api" | "web")
 *   blob2 = status class ("2xx" | "3xx" | "4xx" | "5xx")
 *   blob3 = API endpoint path, query string stripped ("web" for the site;
 *           tile coordinates normalize to /api/tiles/[z]/[x]/[y])
 *   blob4 = HTTP method
 *   blob5 = exact HTTP status (low-cardinality, e.g. "200" or "429")
 *   double1 = 1 (event count; the monitor uses SUM(_sample_interval))
 * Deliberately narrow: no IPs, no query strings, no user data, and the
 * website is counted only as "web" without per-page breakdown (privacy —
 * see PRIVACY_AND_SAFETY.md). The binding is optional (absent in local
 * dev / tests): when missing the call is a no-op and can never break the
 * request path.
 */
function analyticsEndpoint(pathname: string, isApi: boolean): string {
  if (!isApi) return "web";
  // Tile coordinates are high-cardinality and never contain user data. Group
  // their numeric route shape so Analytics/Grafana can count cache misses and
  // exact 429s as one endpoint instead of one series per tile.
  if (/^\/api\/tiles\/\d+\/\d+\/\d+(?:\.png)?$/.test(pathname)) return "/api/tiles/[z]/[x]/[y]";
  return pathname;
}

function recordRequestAnalytics(env: Env, url: URL, method: string, status: number): void {
  try {
    const analytics = env.ANALYTICS;
    if (!analytics) return;
    const pathname = url.pathname;
    const isApi = pathname.startsWith("/api/");
    analytics.writeDataPoint({
      blobs: [isApi ? "api" : "web", `${Math.floor(status / 100)}xx`, analyticsEndpoint(pathname, isApi), method, String(status)],
      doubles: [1],
    });
  } catch {
    // Analytics must never break the request path.
  }
}

/**
 * Route one request through the worker pipeline (redirect, identity
 * sanitisation, scanner gate, moderation gate, image optimisation, app
 * router). Split from `fetch` so every response — including 3xx/4xx/5xx
 * and thrown errors — can be recorded once in Analytics Engine.
 */
async function dispatch(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const redirect = hostRedirect(request, url);
  if (redirect) return redirect;

    // Normalise a trailing slash on the pathname BEFORE the edge-gate match
    // (audit 2026-08-09, P2): the identity exception for POST /api/appeals
    // is an exact match on "/api/appeals", so "/api/appeals/" (trailing
    // slash) fell into the gated branch and failed closed with 503 for the
    // very contributors the route exists for. Everything else (image route,
    // security headers) keeps the ORIGINAL pathname.
    const gatedPathname =
      url.pathname.length > 1 && url.pathname.endsWith("/")
        ? url.pathname.slice(0, -1)
        : url.pathname;

    // 1. Identity sanitisation runs on EVERY path before any gate: the edge
    //    is the single identity authority and never trusts the caller.
    let gated = stripIdentityHeaders(request, env);

    // 1b. Scanner catch-all: sensitive-config probes die here with a bare
    //    403, BEFORE the moderation gate, the rate-limit bindings and the
    //    app router. Only unmistakably non-site paths match (see
    //    SCANNER_PATH_PATTERN), so legitimate traffic is untouched.
    if (SCANNER_PATH_PATTERN.test(url.pathname)) {
      return withSecurityHeaders(
        new Response("Forbidden", {
          status: 403,
          headers: { "Cache-Control": "no-store" },
        }),
        url.pathname,
      );
    }

    // 1c. RFC 9727 API catalog (2026-08-22, AI-bot / automated discovery):
    //    /.well-known/api-catalog tells LLM crawlers and API-discovery
    //    tools where the OpenAPI spec (service-desc), the human docs page
    //    (service-doc) and the health probe (status) live. Served BEFORE
    //    the app router: static JSON, no D1, edge-cacheable. Links are
    //    origin-derived so the pre-production host answers with its own
    //    working URLs (the www alias is already 308'd to the apex above).
    //    Matched on the normalised path (gatedPathname) so a trailing slash
    //    variant still answers.
    if (gatedPathname === "/.well-known/api-catalog") {
      const base = `https://${url.hostname}`;
      const catalog = {
        linkset: [
          {
            anchor: `${base}/api/`,
            "service-desc": [
              { href: `${base}/openapi.json`, type: "application/openapi+json" },
            ],
            "service-doc": [{ href: `${base}/api-docs` }],
            status: [{ href: `${base}/api/health` }],
          },
        ],
      };
      return withSecurityHeaders(
        new Response(JSON.stringify(catalog), {
          headers: {
            "Content-Type": "application/linkset+json; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
        url.pathname,
        url.hostname,
      );
    }

    // 1d. Liveness probe (status relation of the API catalog + monitoring):
    //    answers WITHOUT touching D1 or the app router — it reports worker
    //    liveness, not data health, and is deliberately no-store.
    if (gatedPathname === "/api/health") {
      return withSecurityHeaders(
        new Response(JSON.stringify({ status: "ok", service: "opensurveillancedb" }), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }),
        url.pathname,
        url.hostname,
      );
    }

    // 1e. Auth.md agent registration discovery (isitagentready `authMd`):
    //    self-contained Markdown doc for AI agents — see AUTH_MD above.
    if (gatedPathname === "/auth.md") {
      return withSecurityHeaders(
        new Response(AUTH_MD, {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
        url.pathname,
        url.hostname,
      );
    }

    // 1f. OAuth Protected Resource Metadata (RFC 9728): required by the
    //    authMd check alongside /auth.md — see OAUTH_PROTECTED_RESOURCE.
    if (gatedPathname === "/.well-known/oauth-protected-resource") {
      return withSecurityHeaders(
        new Response(JSON.stringify(OAUTH_PROTECTED_RESOURCE), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
        url.pathname,
        url.hostname,
      );
    }

    // 1g. OAuth Authorization Server metadata (RFC 8414 shape): the authMd
    //    check follows PRM.authorization_servers and requires the
    //    agent_auth block — see OAUTH_AUTHORIZATION_SERVER.
    if (gatedPathname === "/.well-known/oauth-authorization-server") {
      return withSecurityHeaders(
        new Response(JSON.stringify(OAUTH_AUTHORIZATION_SERVER), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
        url.pathname,
        url.hostname,
      );
    }

    // 1h. Markdown for Agents: content negotiation — only when the client
    //    explicitly asks for text/markdown AND the path has a curated
    //    Markdown page. Vary: Accept keeps edge cache variants separate.
    const accept = request.headers.get("accept") ?? "";
    if (gatedPathname in MARKDOWN_PAGES && accept.includes("text/markdown")) {
      return withSecurityHeaders(
        new Response(MARKDOWN_PAGES[gatedPathname], {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
            "Vary": "Accept",
          },
        }),
        url.pathname,
        url.hostname,
      );
    }

    // 1i. DNS-AID agent index (draft-mozleywilliams-dnsop-dnsaid): the
    //    organization registry of agent services referenced by the
    //    `_index._agents` SVCB/HTTPS records. Zero D1, cacheable 1h.
    if (gatedPathname === "/.well-known/agent-index.json") {
      return withSecurityHeaders(
        new Response(JSON.stringify(AGENT_INDEX), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
        url.pathname,
        url.hostname,
      );
    }

    if (gatedPath(request.method, gatedPathname)) {
      const gate = requireModerationAuth(gated, env);
      if (gate.denied) return withSecurityHeaders(gate.denied, url.pathname, url.hostname);
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
      return withSecurityHeaders(optimized, url.pathname, url.hostname);
    }

    return withSecurityHeaders(await handler.fetch(gated, env, ctx), url.pathname, url.hostname);
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      const response = await dispatch(request, env, ctx, url);
      recordRequestAnalytics(env, url, request.method, response.status);
      return response;
    } catch (error) {
      recordRequestAnalytics(env, url, request.method, 500);
      throw error;
    }
  },

  /**
   * Scheduled jobs (cron binding in wrangler.jsonc):
   * - 03:00 UTC daily — retention sweep (ADR 0004 §3, ADR 0008 p.3): runs
   *   the retention job from db/retention.ts and the OIDC expiry sweep from
   *   db/oidc.ts against the D1 binding. Both sweeps must never break the
   *   request path: they run inside waitUntil and any failure is caught
   *   and logged so the worker stays healthy (the next run retries).
   * - every minute — keep-warm tick (WARMUP_CRON): deliberate no-op that
   *   keeps an isolate alive between visitors (cold starts were the slow
   *   tail: ~1s on the first request after idle).
   */
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (controller.cron === WARMUP_CRON) {
      return;
    }
    const policy = DEFAULT_RETENTION_POLICY;
    ctx.waitUntil(
      runRetentionSweep(new Date().toISOString(), { policy })
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
