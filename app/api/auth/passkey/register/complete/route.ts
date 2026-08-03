import { env } from "cloudflare:workers";
import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  consumeWebAuthnChallenge,
  createPasskey,
  issueRecoveryCodes,
} from "../../../../../../db/passkeys";
import { resolveOptionalContributor } from "../../../../../lib/auth-session";
import { authLimit } from "../../../../../lib/auth-route-helpers";
import { csrfVerified, sameOrigin } from "../../../../../lib/csrf";
import { isRecord } from "../../../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../../../lib/input-limits";
import { toBase64Url, webauthnRpConfig } from "../../../../../lib/passkey";

/**
 * POST /api/auth/passkey/register/complete — finish a WebAuthn registration
 * ceremony (Fase C, t_36989e06).
 *
 * Verifies the attestation returned by `navigator.credentials.create()`
 * against the challenge issued by /begin (which is consumed single-use
 * HERE, so a ceremony cannot be replayed), stores only the COSE public key
 * in D1, and issues the contributor's fresh set of 10 one-time recovery
 * codes — returned in plaintext exactly once. The client must display them
 * and prompt the user to store them (Fase E2 /account UX).
 *
 * Privacy: `attestationType: "none"` was requested at /begin, so no device
 * attestation is verified or stored — only the credential itself
 * (AUTH_OPTIONS.md §3).
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const blocked = authLimit(request, env, "/api/auth/passkey/register/complete");
  if (blocked) return blocked;

  try {
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ error: "Sign in required to enroll a passkey." }, { status: 401 });
    }
    if (!csrfVerified(request, resolved.session.csrfToken)) {
      return Response.json({ error: "Invalid CSRF token. Refresh the page and try again." }, { status: 403 });
    }

    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload) || !isRecord(payload.response) || typeof payload.challenge !== "string") {
      return Response.json({ error: "Invalid registration response." }, { status: 400 });
    }

    const rp = webauthnRpConfig(env);

    // Single-use consume (anti-replay): hashes the echoed challenge and
    // marks the row used only if it exists, is unexpired and unused.
    const consumed = await consumeWebAuthnChallenge(payload.challenge);
    if (!consumed || consumed.kind !== "register") {
      return Response.json(
        { error: "This enrollment has expired or was already used. Please start again." },
        { status: 400 },
      );
    }

    // P3-2 (review-ada-2): the challenge is bound to the contributor who
    // started the ceremony at /begin — only that session may complete it.
    // Without this check a register challenge started under session A could
    // be completed by session B, enrolling the passkey to B's account. The
    // generic 400 mirrors the consume failure so the response never reveals
    // which layer rejected the ceremony.
    if (consumed.contributorId !== resolved.contributor.id) {
      return Response.json(
        { error: "This enrollment has expired or was already used. Please start again." },
        { status: 400 },
      );
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: payload.response as unknown as RegistrationResponseJSON,
        expectedChallenge: payload.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: false,
      });
    } catch (error) {
      console.warn("POST /api/auth/passkey/register/complete rejected an invalid attestation", error);
      return Response.json({ error: "Passkey verification failed." }, { status: 400 });
    }

    const { registrationInfo } = verification;
    if (!registrationInfo) {
      return Response.json({ error: "Passkey verification failed." }, { status: 400 });
    }
    // SimpleWebAuthn 13 nests the credential under `registrationInfo.credential`
    // (id is already a base64url string; publicKey is the raw COSE bytes).
    const { credential } = registrationInfo;

    const stored = await createPasskey({
      contributorId: resolved.contributor.id,
      credentialId: credential.id,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter,
      transports: Array.isArray(payload.response.transports)
        ? (payload.response.transports as string[])
        : undefined,
    });
    if (!stored) {
      return Response.json(
        { error: "This passkey is already enrolled on your account." },
        { status: 409 },
      );
    }

    // A fresh batch of one-time recovery codes; returned in plaintext ONCE.
    const recoveryCodes = await issueRecoveryCodes(resolved.contributor.id);

    return Response.json({
      credential: { id: stored.credentialId },
      recoveryCodes,
      recoveryCodesRemaining: recoveryCodes.length,
    });
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("POST /api/auth/passkey/register/complete payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/auth/passkey/register/complete failed", error);
    return Response.json({ error: "Unable to complete passkey enrollment" }, { status: 500 });
  }
}
