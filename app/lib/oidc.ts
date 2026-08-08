/**
 * OIDC client helpers for the external-login route family (Fase D).
 *
 * Covers the two providers the board chose (AUTH_OPTIONS.md §4a, t_87f24b2d):
 *   - GitHub: classic OAuth2 authorization-code flow — GitHub has no OIDC
 *     discovery document, so its endpoints are pinned constants. The subject
 *     is the GitHub user id (returned as `id`), and email verification comes
 *     from the `verified` flag on the primary email (user:email scope).
 *   - Google: real OIDC provider with discovery — the authorization, token
 *     and userinfo endpoints are read from the well-known configuration
 *     document at /start time (with a short in-isolate cache), and the
 *     subject is the `sub` claim.
 *
 * Both providers use PKCE (S256): the code_challenge is derived from the
 * verifier the route stored in oidc_states, so an authorization code is
 * useless without the matching verifier (RFC 7636). No access token is ever
 * persisted — it is exchanged and used in the same request, then dropped
 * (privacy by design: no provider credential outlives the callback).
 *
 * The module is dependency-free of `cloudflare:workers` (env is passed in)
 * so the route harness can transpile and import it in plain Node; network
 * calls go through globalThis.fetch, which tests stub.
 */

/**
 * Build the PUBLIC origin for OIDC redirect URIs.
 *
 * The dev/pre-prod server runs behind a reverse proxy that terminates TLS
 * and forwards plain HTTP to the vinext dev server (NPM -> LXC). In that
 * setup `new URL(request.url).origin` yields `http://<host>`, but the
 * provider (Google/GitHub) has registered the HTTPS callback — the
 * mismatch answers `400 redirect_uri_mismatch` (reproduced live on
 * osdb.syaxhome89.com, 2026-08-08). The standard proxy convention is
 * `X-Forwarded-Proto`; when it says `https`, rebuild the origin with the
 * HTTPS scheme and the request host. Fail-closed: anything other than the
 * exact value `https` keeps the request origin (never trust an arbitrary
 * proto string).
 */
export function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("X-Forwarded-Proto");
  if (forwardedProto === "https") {
    return `https://${url.host}`;
  }
  return url.origin;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OidcProvider = "github" | "google";

/** What the callback needs to know about the authenticated provider user. */
export type OidcIdentity = {
  /** Provider subject: GitHub user id (stringified) or Google `sub`. */
  sub: string;
  /** Provider-verified email address, or null when the provider has none. */
  email: string | null;
  /** Provider assertion that the email (if any) is verified. */
  emailVerified: boolean;
  /** Best-effort public display name (login / name / profile name). */
  displayName: string | null;
};

export type OidcProviderConfig = {
  provider: OidcProvider;
  clientId: string;
  clientSecret: string;
  /** Absolute callback URL (origin + path), fixed by the caller. */
  redirectUri: string;
};

type Endpoints = {
  authorize: string;
  token: string;
  userinfo: string;
};

const GITHUB_ENDPOINTS: Endpoints = {
  authorize: "https://github.com/login/oauth/authorize",
  token: "https://github.com/login/oauth/access_token",
  userinfo: "https://api.github.com/user",
};

const GITHUB_SCOPE = "read:user user:email";

/** Google well-known discovery document (RFC 8414). */
const GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration";

const GOOGLE_SCOPE = "openid email profile";

/** In-isolate cache of the Google discovery document (10 minutes). */
let googleDiscoveryCache: { expiresAt: number; endpoints: Endpoints } | null = null;

async function googleEndpoints(): Promise<Endpoints> {
  const now = Date.now();
  if (googleDiscoveryCache && googleDiscoveryCache.expiresAt > now) {
    return googleDiscoveryCache.endpoints;
  }
  const response = await globalThis.fetch(GOOGLE_DISCOVERY_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Google OIDC discovery failed with HTTP ${response.status}`);
  }
  const document = (await response.json()) as {
    authorization_endpoint?: string;
    token_endpoint?: string;
    userinfo_endpoint?: string;
  };
  const endpoints: Endpoints = {
    authorize: document.authorization_endpoint ?? "",
    token: document.token_endpoint ?? "",
    userinfo: document.userinfo_endpoint ?? "",
  };
  if (!endpoints.authorize || !endpoints.token || !endpoints.userinfo) {
    throw new Error("Google OIDC discovery document is missing required endpoints");
  }
  googleDiscoveryCache = { expiresAt: now + 10 * 60 * 1000, endpoints };
  return endpoints;
}

async function endpointsFor(provider: OidcProvider): Promise<Endpoints> {
  return provider === "google" ? googleEndpoints() : GITHUB_ENDPOINTS;
}

/** Provider identity URL — GitHub returns a string id, Google a number sub. */
export function isKnownOidcProvider(value: unknown): value is OidcProvider {
  return value === "github" || value === "google";
}

/**
 * Resolve the runtime client credentials for a provider from the worker env
 * (Cloudflare secrets in production, `.dev.vars` locally — the values
 * themselves live in the GPG vault, see ops/oidc-secrets.sh). Returns null
 * when the pair is missing, which the routes answer with 503: OIDC is
 * opt-in and fails closed until the operator activates a provider.
 */
export function oidcProviderConfig(
  env: unknown,
  provider: OidcProvider,
  redirectUri: string,
): OidcProviderConfig | null {
  const config = env as { [key: string]: unknown };
  const read = (key: string): string => {
    const value = config[key];
    return typeof value === "string" && value.length > 0 ? value : "";
  };
  const clientId = read(
    provider === "github" ? "OIDC_GITHUB_CLIENT_ID" : "OIDC_GOOGLE_CLIENT_ID",
  );
  const clientSecret = read(
    provider === "github" ? "OIDC_GITHUB_CLIENT_SECRET" : "OIDC_GOOGLE_CLIENT_SECRET",
  );
  if (!clientId || !clientSecret) return null;
  return { provider, clientId, clientSecret, redirectUri };
}

/**
 * Validate a client-supplied post-login redirect target. Only relative
 * same-origin paths are accepted (`/account`, `/report/...`); anything with
 * a scheme, `//` prefix or backslash is rejected so a state row can never
 * steer the callback to a phishing URL. Returns the sanitised path or null.
 */
export function safeRedirectTarget(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\s]/.test(value)) return null;
  // Keep the browser inside the app: no scheme-relative or protocol values.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return null;
  return value.slice(0, 300);
}

// ---------------------------------------------------------------------------
// PKCE (RFC 7636)
// ---------------------------------------------------------------------------

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** S256 code challenge for a verifier (base64url of SHA-256). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// Authorization URL (the /start half)
// ---------------------------------------------------------------------------

export async function buildAuthorizeUrl(
  config: OidcProviderConfig,
  input: { state: string; codeChallenge: string },
): Promise<string> {
  const endpoints = await endpointsFor(config.provider);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.provider === "github" ? GITHUB_SCOPE : GOOGLE_SCOPE,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${endpoints.authorize}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange + userinfo (the /callback half)
// ---------------------------------------------------------------------------

/** Exchange the authorization code for an access token (PKCE). */
export async function exchangeCodeForToken(
  config: OidcProviderConfig,
  input: { code: string; codeVerifier: string },
): Promise<string> {
  const endpoints = await endpointsFor(config.provider);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: input.codeVerifier,
  });
  const response = await globalThis.fetch(endpoints.token, {
    method: "POST",
    headers: { Accept: "application/json" },
    body,
  });
  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `OIDC token exchange failed (HTTP ${response.status}${payload.error ? `: ${payload.error}` : ""})`,
    );
  }
  return payload.access_token;
}

function parseName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 60 ? trimmed : null;
}

/** Fetch and normalise the provider identity for the access token. */
export async function fetchOidcIdentity(
  provider: OidcProvider,
  accessToken: string,
): Promise<OidcIdentity> {
  const endpoints = await endpointsFor(provider);
  const response = await globalThis.fetch(endpoints.userinfo, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(provider === "github" ? { "X-GitHub-Api-Version": "2022-11-28" } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`OIDC userinfo failed with HTTP ${response.status}`);
  }
  const payload = (await response.json()) as Record<string, unknown>;

  if (provider === "github") {
    const id = payload.id;
    const sub = typeof id === "number" || typeof id === "string" ? String(id) : "";
    if (!sub) throw new Error("GitHub userinfo is missing the user id");
    // /user only carries a PUBLIC email; private addresses (the GitHub
    // default) come from the /user/emails endpoint, which the user:email
    // scope authorizes. The verified flag is only asserted there, so the
    // endpoint is always probed (best-effort: failure means "cannot assert
    // email", never a hard error).
    const email =
      typeof payload.email === "string" && payload.email.length > 0 ? payload.email : null;
    const displayName = parseName(payload.name) ?? parseName(payload.login);
    let emailVerified = false;
    let identityEmail = email;
    try {
      const emailsResponse = await globalThis.fetch("https://api.github.com/user/emails", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (emailsResponse.ok) {
        const emails = (await emailsResponse.json()) as Array<{
          email?: string;
          verified?: boolean;
          primary?: boolean;
        }>;
        if (email) {
          const match = emails.find((entry) => entry.email === email);
          emailVerified = Boolean(match?.verified);
        } else {
          // Private-email account: fall back to the user's primary address
          // (the address they chose for account recovery), which is the
          // correct merge key when it collides with an existing account.
          const primary = emails.find((entry) => entry.primary) ?? emails[0];
          if (primary?.email) {
            identityEmail = primary.email;
            emailVerified = Boolean(primary.verified);
          }
        }
      }
    } catch {
      // Verification is a best-effort assertion; leave it false.
    }
    return { sub, email: identityEmail, emailVerified, displayName };
  }

  // Google userinfo: sub (string), email, email_verified (boolean/string),
  // name. The identity is taken from the userinfo endpoint, not the id_token,
  // so no JWT/JWKS machinery is needed on the worker.
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) throw new Error("Google userinfo is missing the sub claim");
  const email = typeof payload.email === "string" && payload.email.length > 0 ? payload.email : null;
  const emailVerified =
    payload.email_verified === true || payload.email_verified === "true";
  return { sub, email, emailVerified, displayName: parseName(payload.name) };
}
