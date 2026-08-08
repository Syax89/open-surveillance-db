import { env } from "cloudflare:workers";

/**
 * GET /api/auth/oidc/providers — which social providers are actually
 * configured on this deployment?
 *
 * Design review 2026-08-08 (P1): the login/register pages render the
 * "Continue with GitHub/Google" buttons unconditionally, but a deployment
 * without provider secrets fails closed with 503 mid-flow, and the legal
 * copy declares OIDC inactive until the activation gate passes. The UI
 * must not offer a sign-in method the server cannot honour.
 *
 * This endpoint answers with the list of providers whose client id AND
 * secret are present in env (oidcProviderConfig semantics, app/lib/oidc.ts)
 * — it never reveals the secret values, only the names. The client gates
 * the buttons and the "social" method on this list, so the moment the
 * operator provisions credentials (ops/oidc-secrets.sh) the buttons appear
 * without a redeploy of the UI copy.
 */
const OIDC_PROVIDERS = ["github", "google"] as const;

export async function GET() {
  const config = env as unknown as { [key: string]: unknown };
  const read = (key: string): string => {
    const value = config[key];
    return typeof value === "string" && value.length > 0 ? value : "";
  };
  const providers: string[] = [];
  for (const provider of OIDC_PROVIDERS) {
    const clientId = read(provider === "github" ? "OIDC_GITHUB_CLIENT_ID" : "OIDC_GOOGLE_CLIENT_ID");
    const clientSecret = read(provider === "github" ? "OIDC_GITHUB_CLIENT_SECRET" : "OIDC_GOOGLE_CLIENT_SECRET");
    if (clientId && clientSecret) providers.push(provider);
  }
  return Response.json(
    { providers },
    { headers: { "Cache-Control": "no-store" } },
  );
}
