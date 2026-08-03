import { env } from "cloudflare:workers";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import {
  createSession,
  getContributorById,
  type PublicContributor,
} from "../../../../../../db/auth";
import {
  consumeWebAuthnChallenge,
  findPasskeyByCredentialId,
  updatePasskeyCounter,
} from "../../../../../../db/passkeys";
import { sessionCookieHeaders, sessionTtlSeconds } from "../../../../../lib/auth-session";
import { authLimit, cookieHeaderInit } from "../../../../../lib/auth-route-helpers";
import { sameOrigin } from "../../../../../lib/csrf";
import { isRecord } from "../../../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../../../lib/input-limits";
import {
  contributorIdFromUserHandle,
  fromBase64Url,
  isCounterAdvancementOk,
  webauthnRpConfig,
} from "../../../../../lib/passkey";

/**
 * POST /api/auth/passkey/login/complete — finish a WebAuthn authentication
 * ceremony and open a session (Fase C, t_36989e06). Public.
 *
 * Layered checks, in order:
 *  1. single-use challenge consume (anti-replay — a ceremony cannot run
 *     twice, and only a challenge this RP issued can complete);
 *  2. when /begin was email-narrowed, the challenge recorded the target
 *     userHandle and the assertion must echo the SAME handle (the migration
 *     0028 double-check, P3-3; early rejection before the credential lookup);
 *  3. the credential must exist in D1 (credential_id is globally unique);
 *  4. SimpleWebAuthn verifies the assertion (signature, rpIdHash, origin,
 *     clientData challenge) against the stored COSE public key;
 *  5. the assertion userHandle, when present, must decode to the passkey
 *     owner (defence-in-depth binding);
 *  6. signature-counter advancement (anti-replay for cloned authenticators,
 *     spec §6.1): a non-increasing counter with either side non-zero is
 *     rejected — see isCounterAdvancementOk.
 *
 * Every failure answers the same generic 401 so responses never reveal
 * which layer rejected the attempt (anti-enumeration, same as /login).
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const blocked = authLimit(request, env, "/api/auth/passkey/login/complete");
  if (blocked) return blocked;

  try {
    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload) || !isRecord(payload.response) || typeof payload.challenge !== "string") {
      return Response.json({ error: "Invalid passkey response." }, { status: 401 });
    }

    const rp = webauthnRpConfig(env);

    // 1. Single-use consume (anti-replay).
    const consumed = await consumeWebAuthnChallenge(payload.challenge);
    if (!consumed || consumed.kind !== "login") {
      return Response.json(
        { error: "This sign-in has expired or was already used. Please try again." },
        { status: 401 },
      );
    }

    const response = payload.response as unknown as AuthenticationResponseJSON;

    // 2. Challenge userHandle binding (P3-3, review-ada-2): when /begin was
    //    email-narrowed it stored the target userHandle on the challenge;
    //    the assertion must echo the SAME handle — the double-check the 0028
    //    migration promised but nothing enforced. Discoverable ceremonies
    //    record no handle (`consumed.userHandle` stays null) and are bound
    //    by the owner check (5) below instead. Early rejection: runs before
    //    the credential lookup and the crypto verification.
    if (typeof consumed.userHandle === "string" && consumed.userHandle !== response.response.userHandle) {
      console.warn(
        `POST /api/auth/passkey/login/complete rejected: assertion userHandle does not match the challenge's recorded handle (challenge ${consumed.id})`,
      );
      return Response.json({ error: "Passkey verification failed." }, { status: 401 });
    }

    // 3. The credential must be one this relying party issued.
    const passkey = await findPasskeyByCredentialId(response.id);
    if (!passkey) {
      return Response.json({ error: "Passkey verification failed." }, { status: 401 });
    }

    // 4. Cryptographic verification against the stored COSE public key.
    let authenticationInfo;
    try {
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: payload.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        credential: {
          id: passkey.credentialId,
          publicKey: fromBase64Url(passkey.publicKey),
          counter: passkey.counter,
        },
      });
      authenticationInfo = verification.authenticationInfo;
    } catch (error) {
      console.warn("POST /api/auth/passkey/login/complete rejected an invalid assertion", error);
      return Response.json({ error: "Passkey verification failed." }, { status: 401 });
    }

    // 5. userHandle binding: when the authenticator echoes the handle, it
    //    must be the passkey owner's (v13 nests it under `response`).
    const assertedHandle = response.response.userHandle;
    if (typeof assertedHandle === "string" && assertedHandle.length > 0) {
      const handleContributorId = contributorIdFromUserHandle(assertedHandle);
      if (handleContributorId === null || handleContributorId !== String(passkey.contributorId)) {
        console.warn(
          `POST /api/auth/passkey/login/complete rejected: userHandle does not match passkey owner (credential ${passkey.id})`,
        );
        return Response.json({ error: "Passkey verification failed." }, { status: 401 });
      }
    }

    // 6. Signature-counter anti-replay (cloned authenticators).
    if (!isCounterAdvancementOk(authenticationInfo.newCounter, passkey.counter)) {
      console.warn(
        `POST /api/auth/passkey/login/complete rejected: signature counter did not advance (credential ${passkey.id}, stored ${passkey.counter}, new ${authenticationInfo.newCounter}) — possible cloned authenticator`,
      );
      return Response.json({ error: "Passkey verification failed." }, { status: 401 });
    }
    await updatePasskeyCounter(passkey.id, authenticationInfo.newCounter);

    const contributor = (await getContributorById(passkey.contributorId)) as PublicContributor | null;
    if (!contributor) {
      return Response.json({ error: "Passkey verification failed." }, { status: 401 });
    }

    const { rawToken, csrfToken } = await createSession(passkey.contributorId, {
      ttlSeconds: sessionTtlSeconds(env),
    });
    return Response.json(
      { contributor },
      { headers: cookieHeaderInit(sessionCookieHeaders(rawToken, csrfToken, env)) },
    );
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/auth/passkey/login/complete payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/auth/passkey/login/complete failed", error);
    return Response.json({ error: "Unable to log in with passkey" }, { status: 500 });
  }
}
