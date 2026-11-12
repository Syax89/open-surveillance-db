import { env } from "cloudflare:workers";
import { deletePasskey, listPasskeys } from "../../../../../db/passkeys";
import { resolveOptionalContributor } from "../../../../lib/auth-session";
import { authLimit } from "../../../../lib/auth-route-helpers";
import { csrfVerified, sameOrigin } from "../../../../lib/csrf";
import { isRecord } from "../../../../lib/guards";
import { BodyReadError, readJsonBody, urlTooLong } from "../../../../lib/input-limits";

/**
 * GET /api/auth/passkey/credentials — list the signed-in contributor's
 * enrolled passkeys (Fase C, t_36989e06). Session required.
 *
 * The response carries only the public descriptor of each credential
 * (id, transports, enrollment date) — never the COSE key, which stays in
 * the db layer.
 *
 * DELETE /api/auth/passkey/credentials — remove one of the contributor's
 * own passkeys. Session + CSRF required. Used by the /account page to
 * manage methods; the removed credential can no longer authenticate.
 *
 * Every response is `Cache-Control: no-store` (same contract as
 * /api/auth/me): the list is personal data and must never be cached by an
 * edge or the browser.
 */
export async function GET(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const blocked = await authLimit(request, env, "/api/auth/passkey/credentials");
  if (blocked) return blocked;

  try {
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ error: "Sign in required." }, { status: 401, headers: NO_STORE_HEADERS });
    }
    const credentials = await listPasskeys(resolved.contributor.id);
    return Response.json({ credentials }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("GET /api/auth/passkey/credentials failed", error);
    return Response.json({ error: "Unable to list passkeys" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function DELETE(request: Request) {
  if (urlTooLong(request)) {
    return Response.json({ error: "Request URI too long." }, { status: 414, headers: NO_STORE_HEADERS });
  }

  if (!sameOrigin(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403, headers: NO_STORE_HEADERS });
  }

  const blocked = await authLimit(request, env, "/api/auth/passkey/credentials");
  if (blocked) return blocked;

  try {
    const resolved = await resolveOptionalContributor(request);
    if (!resolved) {
      return Response.json({ error: "Sign in required." }, { status: 401, headers: NO_STORE_HEADERS });
    }
    if (!csrfVerified(request, resolved.session.csrfToken)) {
      return Response.json({ error: "Invalid CSRF token. Refresh the page and try again." }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const payload: unknown = await readJsonBody(request, env);
    if (!isRecord(payload) || typeof payload.credentialId !== "string") {
      return Response.json({ error: "Missing credentialId." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const removed = await deletePasskey(resolved.contributor.id, payload.credentialId);
    if (!removed) {
      return Response.json({ error: "Passkey not found." }, { status: 404, headers: NO_STORE_HEADERS });
    }
    return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof BodyReadError) {
      console.warn("DELETE /api/auth/passkey/credentials payload rejected: body too large or not valid JSON");
      return Response.json({ error: error.message }, { status: error.status, headers: NO_STORE_HEADERS });
    }
    console.error("DELETE /api/auth/passkey/credentials failed", error);
    return Response.json({ error: "Unable to remove passkey" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
