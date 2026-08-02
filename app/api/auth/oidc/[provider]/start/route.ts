import { env } from "cloudflare:workers";
import { createOidcState } from "../../../../../../db/oidc";
import {
  buildAuthorizeUrl,
  codeChallenge,
  isKnownOidcProvider,
  oidcProviderConfig,
  safeRedirectTarget,
} from "../../../../../lib/oidc";
import { authLimit } from "../../../../../lib/auth-route-helpers";

/**
 * GET /api/auth/oidc/[provider]/start — begin an external OIDC login
 * (Fase D, ADR 0020 decision 4; GitHub + Google, opt-in).
 *
 * Flow: validate the provider and the post-login target, persist a
 * single-use PKCE state row (10-minute TTL, SHA-256-hashed `state` nonce),
 * then 302 to the provider's authorization endpoint with an S256 code
 * challenge. The code verifier never leaves the state row.
 *
 * Security notes:
 *   - The client id/secret pair is read from the worker env; when the pair
 *     is missing the route answers 503 — OIDC fails closed until the
 *     operator activates a provider (secrets live in the GPG vault, see
 *     ops/oidc-secrets.sh).
 *   - `redirect_to` is restricted to relative same-origin paths
 *     (safeRedirectTarget) so a crafted parameter can never make the
 *     callback land on a phishing origin.
 *   - The `auth` rate-limit bucket metering also covers this route: state
 *     rows are cheap but the bucket stops a caller from flooding the table.
 *
 * The provider is parsed from the URL path (works identically under the
 * Next.js App Router and the plain-Node route harness, which invokes
 * handlers with a bare Request).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = url.pathname.split("/")[4];

  if (!isKnownOidcProvider(provider)) {
    return Response.json({ error: "Unknown OIDC provider." }, { status: 404 });
  }

  const config = oidcProviderConfig(env, provider, `${url.origin}/api/auth/oidc/${provider}/callback`);
  if (!config) {
    return Response.json(
      { error: "This sign-in method is not available yet." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const blocked = authLimit(request, env, `/api/auth/oidc/${provider}/start`);
  if (blocked) return blocked;

  const redirectTo = safeRedirectTarget(url.searchParams.get("redirect_to")) ?? "/account";

  try {
    const { rawState, codeVerifier } = await createOidcState({
      provider,
      redirectTo,
    });
    const challenge = await codeChallenge(codeVerifier);
    const authorizeUrl = await buildAuthorizeUrl(config, {
      state: rawState,
      codeChallenge: challenge,
    });
    return new Response(null, {
      status: 302,
      headers: {
        Location: authorizeUrl,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(`GET /api/auth/oidc/${provider}/start failed`, error);
    return Response.json({ error: "Unable to start sign-in." }, { status: 500 });
  }
}
