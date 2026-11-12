import { env } from "cloudflare:workers";
import { createSession, findContributorByEmail } from "../../../../../../db/auth";
import {
  consumeOidcState,
  createOidcContributor,
  createOidcMergeRequest,
  findContributorByExternalIdentity,
} from "../../../../../../db/oidc";
import { cookieSecure, sessionCookieHeaders, sessionTtlSeconds } from "../../../../../lib/auth-session";
import { readCookie } from "../../../../../lib/csrf";
import {
  cookieHeaderInit,
} from "../../../../../lib/auth-route-helpers";
import {
  clearOidcBindingCookie,
  fetchOidcIdentity,
  exchangeCodeForToken,
  isKnownOidcProvider,
  oidcBindingCookieName,
  oidcBindingMatches,
  oidcProviderConfig,
  publicOrigin,
} from "../../../../../lib/oidc";

/**
 * GET /api/auth/oidc/[provider]/callback — the provider redirects the
 * browser here after the user consents (Fase D, ADR 0020 decision 4).
 *
 * Steps:
 *   0. Browser binding (login-CSRF defence): the `state` must be the one
 *      derived from this browser's binding cookie set at /start
 *      (app/lib/oidc.ts, "Browser binding"). A missing or mismatching
 *      cookie redirects to /login?oidc_error=1 WITHOUT consuming the state
 *      row, so a victim's browser can never complete a flow an attacker
 *      started. Every redirect from here on clears the binding cookie.
 *   1. Consume the PKCE state row atomically (single-use, 10-min TTL). A
 *      missing/expired/replayed state answers 400 — the row is hashed, so a
 *      DB leak cannot forge one.
 *   2. Exchange the authorization code for an access token (PKCE verifier
 *      comes from the state row) and fetch the provider identity. No token
 *      is ever persisted; provider failures redirect to /login?oidc_error=1
 *      without leaking provider details.
 *   3. Link: (auth_provider, external_sub) already on a contributor → open a
 *      session and redirect to the state's redirect_to.
 *   4. Email conflict: the provider's VERIFIED email matches an existing
 *      account → issue a single-use merge token and redirect to
 *      /login?merge=<token> (the user proves the existing account with its
 *      password — never a silent takeover). The email is compared in memory
 *      only and is never persisted.
 *   5. Otherwise create a contributor with a deterministic non-routable
 *      placeholder email (`oidc.<provider>.<sub>@invalid`, RFC 2606): the
 *      provider email is never stored, only `external_sub` + the verified
 *      flag (ADR 0020 decision 4).
 *
 * The provider is parsed from the URL path, like the other auth routes.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.pathname.split("/")[4];

  if (!isKnownOidcProvider(provider)) {
    return Response.json({ error: "Unknown OIDC provider." }, { status: 404 });
  }

  const config = oidcProviderConfig(env, provider, `${publicOrigin(request, env)}/api/auth/oidc/${provider}/callback`);
  if (!config) {
    return Response.json(
      { error: "This sign-in method is not available yet." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Provider-side denial/cancel comes back as ?error=... without a code:
  // land the user back on /login (the state row expires on its own).
  if (url.searchParams.has("error")) {
    return redirectClearingBinding(`${publicOrigin(request, env)}/login`, cookieSecure(env));
  }

  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code || !state) {
    return Response.json({ error: "Missing OIDC authorization code." }, { status: 400 });
  }

  const secure = cookieSecure(env);
  const loginError = `${publicOrigin(request, env)}/login?oidc_error=1`;
  if (!(await oidcBindingMatches(readCookie(request, oidcBindingCookieName(secure)), state))) {
    console.warn(`GET /api/auth/oidc/${provider}/callback rejected: state not bound to this browser`);
    return redirectClearingBinding(loginError, secure);
  }

  const stateRow = await consumeOidcState(state, provider);
  if (!stateRow) {
    return Response.json(
      { error: "Invalid or expired OIDC state." },
      { status: 400, headers: { "Cache-Control": "no-store", "Set-Cookie": clearOidcBindingCookie(secure) } },
    );
  }
  const redirectTo = new URL(stateRow.redirectTo, publicOrigin(request, env)).toString();

  let identity;
  try {
    const accessToken = await exchangeCodeForToken(config, {
      code,
      codeVerifier: stateRow.codeVerifier,
    });
    identity = await fetchOidcIdentity(provider, accessToken);
  } catch (error) {
    console.error(`GET /api/auth/oidc/${provider}/callback: provider exchange failed`, error);
    return redirectClearingBinding(loginError, secure);
  }

  try {
    // Fast path: returning external user.
    const existing = await findContributorByExternalIdentity(provider, identity.sub);
    if (existing) {
      return openSessionAndRedirect(redirectTo, existing.id);
    }

    // Email conflict: provider-verified email matching a known account must
    // be proven with the account password before linking (manual merge).
    if (identity.email && identity.emailVerified) {
      const matched = await findContributorByEmail(identity.email);
      if (matched) {
        const { rawToken } = await createOidcMergeRequest({
          provider,
          externalSub: identity.sub,
          contributorId: matched.id,
          emailVerified: identity.emailVerified,
        });
        return redirectClearingBinding(
          `${publicOrigin(request, env)}/login?merge=${encodeURIComponent(rawToken)}`,
          secure,
        );
      }
    }

    // New external account. The provider email is NOT stored — only the
    // subject and the verified flag (ADR 0020 decision 4).
    const created = await createOidcContributor({
      provider,
      externalSub: identity.sub,
      emailVerified: identity.emailVerified,
      displayName: identity.displayName,
    });
    return openSessionAndRedirect(redirectTo, created.id);
  } catch (error) {
    console.error(`GET /api/auth/oidc/${provider}/callback failed`, error);
    return redirectClearingBinding(loginError, secure);
  }
}

/** 302 to `location` that also deletes the single-flow binding cookie. */
function redirectClearingBinding(location: string, secure: boolean): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearOidcBindingCookie(secure));
  return new Response(null, { status: 302, headers });
}

/** Open a contributor session and 302 to the state's redirect target. */
async function openSessionAndRedirect(
  redirectTo: string,
  contributorId: number,
): Promise<Response> {
  const { rawToken, csrfToken } = await createSession(contributorId, {
    // Same TTL source as the cookie (sessionTtlSeconds(env)): the DB
    // expires_at and the cookie Max-Age must never diverge (audit
    // t_5ca60ab2, P2).
    ttlSeconds: sessionTtlSeconds(env),
  });
  // Response.redirect() accepts only (url, status) — the session cookies
  // must ride on a hand-built response instead. A Headers instance keeps
  // BOTH Set-Cookie values (an object spread would collapse them).
  const headers = new Headers({ Location: redirectTo, "Cache-Control": "no-store" });
  for (const [name, value] of cookieHeaderInit(sessionCookieHeaders(rawToken, csrfToken, env))) {
    headers.append(name, value);
  }
  headers.append("Set-Cookie", clearOidcBindingCookie(cookieSecure(env)));
  return new Response(null, { status: 302, headers });
}
