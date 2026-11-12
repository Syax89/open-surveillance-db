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
import { decoyCredentialIds, userHandleForContributor, webauthnRpConfig } from "../../../../../lib/passkey";

/**
 * POST /api/auth/passkey/login/begin — start a WebAuthn authentication
 * ceremony (Fase C, t_36989e06). Public: the login wall is open to anyone.
 *
 * The optional `email` narrows the ceremony to that account's passkeys
 * (non-discoverable flow). When it is absent, the options carry an empty
 * `allowCredentials` and the authenticator resolves the credential itself
 * (discoverable / Conditional UI). When an email is given but has NO
 * enrolled passkey (unknown account, or an account without passkeys), the
 * options carry 1-2 deterministic DECOY descriptors (`decoyCredentialIds`,
 * HMAC of the email) instead of an empty list: before this, a non-empty
 * list meant "this account exists and has passkeys" and an empty one
 * meant the opposite (account enumeration). Every email-narrowed response
 * now has the same shape, so this endpoint never reveals whether an email
 * exists or has passkeys enrolled.
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
      const email = normalizeEmail(payload.email);
      const contributor = await findContributorByEmail(email);
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
      if (allowCredentials.length === 0) {
        // Anti-enumeration decoys (see the doc comment above).
        const decoyIds = await decoyCredentialIds(email, env.REGISTRATION_IP_HMAC_KEY);
        allowCredentials = decoyIds.map((id) => ({ id }));
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
