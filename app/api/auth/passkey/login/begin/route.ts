import { env } from "cloudflare:workers";
import {
  generateAuthenticationOptions,
  type AuthenticatorTransport,
} from "@simplewebauthn/server";
import { findContributorByEmail, isValidEmail, normalizeEmail } from "../../../../../../db/auth";
import {
  createWebAuthnChallenge,
  listPasskeys,
  sweepExpiredWebAuthnChallenges,
} from "../../../../../../db/passkeys";
import { authLimit } from "../../../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../../../lib/csrf";
import { isRecord } from "../../../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../../../lib/input-limits";
import { userHandleForContributor, webauthnRpConfig } from "../../../../../lib/passkey";

/**
 * POST /api/auth/passkey/login/begin — start a WebAuthn authentication
 * ceremony (Fase C, t_36989e06). Public: the login wall is open to anyone.
 *
 * The optional `email` narrows the ceremony to that account's passkeys
 * (non-discoverable flow). When it is absent or unknown, the options carry
 * an empty `allowCredentials` and the authenticator resolves the credential
 * itself (discoverable / Conditional UI). The response shape is identical in
 * every case, so this endpoint never reveals whether an email exists or has
 * passkeys enrolled (anti-enumeration).
 *
 * The challenge is stored hashed in D1 with a 10-minute TTL and consumed
 * single-use by /complete (anti-replay).
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const blocked = await authLimit(request, env, "/api/auth/passkey/login/begin");
  if (blocked) return blocked;

  try {
    const rp = webauthnRpConfig(env);

    // Opportunistic expiry sweep (bounded by the 10-minute TTL).
    await sweepExpiredWebAuthnChallenges();

    let allowCredentials: { id: string; transports?: AuthenticatorTransport[] }[] = [];
    let userHandle: string | null = null;

    const payload: unknown = await readJsonBody(request, env).catch(() => null);
    if (isRecord(payload) && typeof payload.email === "string" && isValidEmail(payload.email)) {
      const contributor = await findContributorByEmail(normalizeEmail(payload.email));
      if (contributor) {
        const passkeys = await listPasskeys(contributor.id);
        allowCredentials = passkeys.map((passkey) => ({
          id: passkey.credentialId,
          ...(passkey.transports
            ? { transports: JSON.parse(passkey.transports) as AuthenticatorTransport[] }
            : {}),
        }));
        userHandle = userHandleForContributor(contributor.id);
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      allowCredentials,
      userVerification: "preferred",
      timeout: 60_000,
    });

    await createWebAuthnChallenge({
      challenge: options.challenge,
      kind: "login",
      userHandle,
    });

    return Response.json({ options });
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/auth/passkey/login/begin payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/auth/passkey/login/begin failed", error);
    return Response.json({ error: "Unable to start passkey login" }, { status: 500 });
  }
}
