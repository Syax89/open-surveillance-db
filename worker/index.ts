/** Cloudflare Worker entry point for OpenSurveillanceDB. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { DEFAULT_RETENTION_POLICY, runRetentionSweep, type RetentionSummary } from "../db/retention";
import { sweepOidcExpired } from "../db/oidc";
import type { Env, ExecutionContext, ScheduledController } from "./env";
import { gatedPath, normalizeGatePath, requireModerationAuth, SCANNER_PATH_PATTERN } from "./gate";
import { localeFromRequest, renderGateUnavailablePage, wantsHtml } from "./gate-page";
import { injectIdentityAfterGate, stripIdentityHeaders } from "./identity";
import { hostRedirect } from "./host";
import { buildCspWithNonce, generateCspNonce, withSecurityHeaders } from "./security-headers";
import { AGENT_INDEX, AUTH_MD, MARKDOWN_PAGES, OAUTH_AUTHORIZATION_SERVER, OAUTH_PROTECTED_RESOURCE } from "./discovery";
import { recordRequestAnalytics } from "./analytics";

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

/**
 * Route one request through the worker pipeline (redirect, identity
 * sanitisation, scanner gate, moderation gate, image optimisation, app
 * router). Split from `fetch` so every response — including 3xx/4xx/5xx
 * and thrown errors — can be recorded once in Analytics Engine.
 */
async function dispatch(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const redirect = hostRedirect(request, url);
  if (redirect) return redirect;

    // Preserve the discovery routes' trailing-slash key. The auth gate uses
    // full router normalization below, without changing the admitted Request.
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

    // 1j. Moderation / appeals auth gate (ADR 0003 / ADR 0014). Matched on the
    //    path the ROUTER will route to, not the raw one (audit 2026-10-04, P1):
    //    /moderation.rsc, /moderation//, /%6doderation and the /api/* aliases
    //    all reach a gated route, so they must fail closed here too.
    let gateTarget: string;
    try {
      gateTarget = normalizeGatePath(url.pathname);
    } catch {
      // Malformed percent-encoding: the router answers its own plain-text 400
      // ("Bad Request") after decoding; the edge refuses earlier, same way.
      return withSecurityHeaders(
        new Response("Bad Request", { status: 400, headers: { "Cache-Control": "no-store" } }),
        url.pathname,
        url.hostname,
      );
    }
    const routedThroughGate = gatedPath(request.method, gateTarget);
    if (routedThroughGate) {
      const gate = await requireModerationAuth(gated, env);
      if (gate.denied) {
        // Human page navigation (not /api/*, not a redirect/fetch client):
        // style the same denial with the site's existing shell instead of
        // the plain JSON body. Every other gated path/client is untouched.
        if (gateTarget === "/moderation" && wantsHtml(gated)) {
          const headers = new Headers(gate.denied.headers);
          headers.set("Content-Type", "text/html; charset=utf-8");
          return withSecurityHeaders(
            new Response(renderGateUnavailablePage(localeFromRequest(gated), gate.denied.status), {
              status: gate.denied.status,
              headers,
            }),
            url.pathname,
            url.hostname,
          );
        }
        return withSecurityHeaders(gate.denied, url.pathname, url.hostname);
      }
      gated = injectIdentityAfterGate(gated, gate.identityEmail, gate.source);
    }

    // 1k. Multipart POSTs are refused at the edge — on EVERY path. The
    //    vendored vinext router runs its progressive-action pass BEFORE route
    //    matching: it reads the body (actionId + contentType) for a request on
    //    any pathname, and a malformed multipart body makes that parse throw
    //    -> HTTP 500 (this is the defect the earlier /api-scoped gate left
    //    reachable on /api/*). No endpoint in this app accepts a multipart
    //    body: pages AND API routes take JSON only — verified, there is no
    //    `request.formData()` anywhere under app/, no upload route, no
    //    multipart in the client (useReportFlow / CorrectionForm read the DOM
    //    with FormData but POST application/json), and nothing multipart in
    //    the OpenAPI spec / docs. The app also has no server actions
    //    (`"use server"` -> 0 hits), so the old `next-action` exemption
    //    protected nothing real and was a trivial bypass (Next-Action: 1 +
    //    malformed multipart -> 500). Therefore multipart POSTs are refused
    //    here, and this MUST be revisited if a real multipart upload feature
    //    is ever added.
    if (
      request.method === "POST" &&
      (request.headers.get("content-type") ?? "").startsWith("multipart/form-data")
    ) {
      return withSecurityHeaders(
        Response.json(
          { error: "Multipart form data is not accepted." },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        ),
        url.pathname,
        url.hostname,
      );
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

    // CSP nonce (2026-10-15): only this call site renders through vinext's
    // own RSC pipeline, which is the ONLY place in the app that ever emits
    // an inline <script>/<style> tag (grep for "<script" in this file: zero
    // hits — every hand-built page above, incl. the gate-denial HTML, has
    // none). vinext reads the nonce from the REQUEST's own CSP header
    // (verified empirically against a Miniflare build of this worker: every
    // inline <script> it emits came back carrying `nonce=`) and stamps the
    // same nonce on every inline tag it controls (RSC bootstrap scripts,
    // the font-preload `<style data-vinext-fonts>`). Setting the identical
    // nonce on the egress CSP below replaces the static 'unsafe-inline'
    // fallback (still used by every OTHER withSecurityHeaders call site in
    // this file, none of which render through vinext) — withSecurityHeaders
    // never overwrites a CSP that is already present, so this one wins over
    // the static default for this response only. Every HTML page in this
    // app answers `Cache-Control: no-store` (verified live), so a per-request
    // nonce is safe: Cloudflare never caches an HTML response that could
    // later be served to a different visitor with a stale nonce.
    const nonce = generateCspNonce();
    const renderHeaders = new Headers(gated.headers);
    renderHeaders.set("Content-Security-Policy", buildCspWithNonce(nonce));
    const rendered = await handler.fetch(new Request(gated, { headers: renderHeaders }), env, ctx);
    const taggedHeaders = new Headers(rendered.headers);
    // Never overwrite a CSP the app handler set on its own response — same
    // "only add if missing" contract withSecurityHeaders enforces for every
    // other header (see "preserves security headers set by the app handler"
    // in tests/worker-edge.test.mjs).
    if (!taggedHeaders.has("Content-Security-Policy")) {
      taggedHeaders.set("Content-Security-Policy", buildCspWithNonce(nonce));
    }
    const tagged = new Response(rendered.body, { status: rendered.status, statusText: rendered.statusText, headers: taggedHeaders });
    return withSecurityHeaders(tagged, url.pathname, url.hostname, routedThroughGate);
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
