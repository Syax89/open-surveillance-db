/** Moderation / appeals edge gate and scanner catch-all (split from worker/index.ts). */
import { isOpenRedirectShaped } from "vinext/server/request-pipeline";
import { findSessionByToken } from "../db/auth";
import { getUserByContributorId, roleAtLeast } from "../db/users";
import { SESSION_COOKIE } from "../app/lib/csrf";
import type { Env } from "./env";

// Moderation access control (see docs/decisions/0003-moderation-access-control.md):
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

export const gatedPath = (method: string, pathname: string) =>
  moderationPath(pathname) || identityPath(method, pathname);

// Mirror Vinext request normalization: decode segments, normalize dots/slashes,
// then strip one .rsc suffix. app-rsc-route-matching.js decodes segments again;
// never repeat suffix/dot normalization after that second, tolerant decode.
const GATE_PATH_DELIMITER_PATTERN = /([/#?\\]|%(2f|23|3f|5c))/gi;

export function normalizeGatePath(pathname: string): string {
  // Protocol-relative shapes stay untouched: the router's own guard rejects
  // them (native 404) before routing, and so they must not land in this gate.
  if (isOpenRedirectShaped(pathname)) return pathname;
  const segments: string[] = [];
  // No `new URL(...)`: it decides `%2e` is a dot segment, which would shift a
  // double-encoded path. Malformed percent-encoding throws (dispatch -> 400).
  for (const rawSegment of pathname.split("/")) {
    const segment = decodeURIComponent(rawSegment).replace(GATE_PATH_DELIMITER_PATTERN, (char) => encodeURIComponent(char));
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  let key = `/${segments.join("/")}`;
  if (key.endsWith(".rsc")) key = key.slice(0, -4);
  if (key.length > 1 && key.endsWith("/")) key = key.slice(0, -1);
  return key.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment).replace(GATE_PATH_DELIMITER_PATTERN, (char) => encodeURIComponent(char));
    } catch {
      return segment;
    }
  }).join("/");
}

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
export const SCANNER_PATH_PATTERN =
  /(^|\/)(\.env|\.git|\.svn|\.hermes|node_modules|service_account\.json|appsettings\.json|firebase\.json|aws-config|configuration\.php|frontend_latest|telescope|server-info|phpmyadmin|adminer|wp-admin|sa\.json|application\.properties|classwithtostring)|\.(php|bak|sql|log)$/i;

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
 * Resolve a live `osdb_session` cookie (ADR 0013) to a moderator identity
 * (ADR 0003 amendment 2026-10: real per-moderator login as the primary
 * path, replacing the shared Basic secret). Every failure mode — no cookie,
 * dead/expired/revoked session, no `users` row linked to this contributor
 * (`users.contributor_id`), inactive user, role below moderator, or a D1
 * error — returns null and falls through to the
 * UNCHANGED Basic/bearer gate below. This is deliberate: a missing session
 * is not a denial, it is "try the next credential", so a contributor
 * browsing the site with an ordinary session never sees a 401/503 here —
 * they just don't get the free pass and the legacy gate decides as before.
 *
 * Email equality between `contributors` and `users` is NEVER trusted
 * (spoofable attribution): any visitor can register an arbitrary, unverified
 * email and would otherwise inherit that identity's role.
 */
async function moderatorEmailFromSession(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  let token: string;
  try {
    token = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  } catch {
    return null;
  }
  if (!token) return null;
  try {
    const session = await findSessionByToken(token);
    if (!session) return null;
    const user = await getUserByContributorId(session.contributor.id);
    if (!user || user.active !== 1 || !roleAtLeast(user.role, "moderator")) return null;
    return user.email;
  } catch (error) {
    console.error("Moderation session gate: lookup failed, falling back to Basic/bearer", error);
    return null;
  }
}

/**
 * The moderation gate (ADR 0003 / ADR 0014, QA#3 F5). Returns the denial
 * response when the request must not pass, plus the SERVER-CHOSEN identity
 * email the worker injects as `x-osdb-user-email` after a successful gate.
 *
 * Identity resolution order:
 *   1. Bearer token (`MODERATION_TOKEN`) → `MODERATION_IDENTITY_EMAIL`
 *      (a machine/ops identity, unchanged);
 *   2. A live `osdb_session` cookie whose contributor is linked to a
 *      `users` row via `users.contributor_id` with role moderator+ (ADR 0003
 *      amendment 2026-10; email equality is never used) → that
 *      user's own email, real per-moderator login via the site's existing
 *      Google/password sign-in, no shared secret involved;
 *   3. Basic auth against `MODERATION_OPERATORS` (per-operator list) → the
 *      matched operator's OWN email — each operator is now distinguishable
 *      in the append-only audit trail;
 *   4. legacy single Basic pair (`MODERATION_USER`/`MODERATION_PASSWORD`)
 *      → `MODERATION_IDENTITY_EMAIL` (prototype / single-operator deploys).
 *
 * When `MODERATION_OPERATORS` is configured it is the ONLY Basic source of
 * truth: mixing in the legacy pair would reintroduce a shared identity that
 * all operators could impersonate, so the legacy pair is ignored in that
 * configuration. The session check (2) never participates in that
 * exclusivity rule — it is a separate identity path, not a Basic source.
 * Fail-closed everywhere: no credentials → 503, wrong credential → 401,
 * malformed operator list → 503.
 */
export type ModerationAuthSource = "session" | "edge";

export async function requireModerationAuth(
  request: Request,
  env: Env,
): Promise<{ denied: Response | null; identityEmail: string | null; source?: ModerationAuthSource }> {
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
    return { denied: null, identityEmail: env.MODERATION_IDENTITY_EMAIL ?? null, source: "edge" };
  }
  const sessionEmail = await moderatorEmailFromSession(request);
  if (sessionEmail) {
    return { denied: null, identityEmail: sessionEmail, source: "session" };
  }
  if (operators !== null && operators.length > 0) {
    const operator = matchBasicOperator(authorization, operators);
    if (operator) return { denied: null, identityEmail: operator.email, source: "edge" };
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
      return { denied: null, identityEmail: env.MODERATION_IDENTITY_EMAIL ?? null, source: "edge" };
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
