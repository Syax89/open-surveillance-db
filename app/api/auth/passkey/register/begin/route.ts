import { env } from "cloudflare:workers";
import { generateRegistrationOptions, type AuthenticatorTransport } from "@simplewebauthn/server";
import {
  createWebAuthnChallenge,
  listPasskeys,
  sweepExpiredWebAuthnChallenges,
} from "../../../../../../db/passkeys";
import { resolveOptionalContributor } from "../../../../../lib/auth-session";
import { authLimit } from "../../../../../lib/auth-route-helpers";
import { csrfVerified, sameOrigin } from "../../../../../lib/csrf";
import { urlTooLong } from "../../../../../lib/input-limits";
import { emailUnverifiedResponse, userHandleForContributor, webauthnRpConfig } from "../../../../../lib/passkey";

/**
 * POST /api/auth/passkey/register/begin — start a WebAuthn registration
 * ceremony for the CURRENTLY LOGGED-IN contributor (Fase C, t_36989e06).
 *
 * Passkeys are an ADDITIONAL method: enrollment happens after an
 * email+password (or other) login, so this route requires a live session.
 * The returned options are what `navigator.credentials.create()` receives;
 * the challenge is stored (hashed) in D1 with a 10-minute TTL and consumed
 * single-use by the /complete step (anti-replay).
 *
 * `excludeCredentials` lists the contributor's existing passkeys so the
 * authenticator does not re-register the same key. `attestationType: "none"`
 * keeps the ceremony privacy-preserving (no device attestation is
 * collected — AUTH_OPTIONS.md §3: verification is enough).
 *
 * Enrollment REQUIRES A VERIFIED EMAIL (security fix, supersedes the
 * earlier t_f940482b "CEO decision (a)" open enrolment). The old design let
 * the read-only register session of an UNVERIFIED account enroll a passkey
 * (and receive recovery codes), reasoning that the credential stayed inert
 * until verification. That was a pre-registration account takeover: an
 * attacker registers victim@example.org, enrolls a passkey, then waits —
 * when the real mailbox owner later verifies the address or completes a
 * password reset (which also sets `email_verified_at`), the attacker's
 * passkey and recovery codes become live credentials on the victim's
 * account. A credential may now only be bound to an account whose mailbox
 * control has been proven, so begin AND complete answer 403
 * `{ code: "email_unverified" }` for an unverified account (the /account
 * client maps the code to the "verify your email" copy). Defence in depth
 * for legacy rows: the first verification and every password reset purge
 * pre-existing passkeys, recovery codes and API keys (db/auth/email-tokens).
 */
export async function POST(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414 });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const blocked = await authLimit(request, env, "/api/auth/passkey/register/begin");
  if (blocked) return blocked;

  try {
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ error: "Sign in required to enroll a passkey." }, { status: 401 });
    }
    if (!csrfVerified(request, resolved.session.csrfToken)) {
      return Response.json({ error: "Invalid CSRF token. Refresh the page and try again." }, { status: 403 });
    }

    const { contributor } = resolved;
    // Pre-registration takeover guard: no credential enrolment before the
    // mailbox is proven (see the doc comment above).
    if (!contributor.emailVerifiedAt) return emailUnverifiedResponse();
    const rp = webauthnRpConfig(env);

    // Opportunistic expiry sweep (bounded by the 10-minute TTL).
    await sweepExpiredWebAuthnChallenges();

    const existing = await listPasskeys(contributor.id);
    const options = await generateRegistrationOptions({
      rpName: rp.rpName,
      rpID: rp.rpID,
      userName: contributor.email,
      userDisplayName: contributor.displayName ?? contributor.email,
      userID: new TextEncoder().encode(String(contributor.id)),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
      excludeCredentials: existing.map((passkey) => ({
        id: passkey.credentialId,
        ...(passkey.transports
          ? { transports: JSON.parse(passkey.transports) as AuthenticatorTransport[] }
          : {}),
      })),
      timeout: 60_000,
    });

    await createWebAuthnChallenge({
      challenge: options.challenge,
      kind: "register",
      contributorId: contributor.id,
      userHandle: userHandleForContributor(contributor.id),
    });

    return Response.json({ options });
  } catch (error) {
    console.error("POST /api/auth/passkey/register/begin failed", error);
    return Response.json({ error: "Unable to start passkey enrollment" }, { status: 500 });
  }
}
