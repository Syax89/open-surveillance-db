// QA Fase G (t_c259759d) — E2E integrati: write gate attraversato da ogni
// metodo di autenticazione, con ROUTE REALI e DB reale (D1 in-memory + schema
// reale dalle migrazioni Drizzle). Colma i buchi della matrice lasciati dalle
// suite di fase:
//
//   - auth-verify-e2e  si ferma a /me dopo verify (non scrive);
//   - e2e-journeys      simula il verified con UPDATE SQL diretto, non passa
//                       dall'endpoint verify-email;
//   - write-gate.test   usa db mockati, non il flusso reale;
//   - api-passkey/oidc  mockano i db, non arrivano a POST /api/cameras.
//
// Qui ogni flusso parte dall'endpoint reale e termina con una scrittura
// reale sulla stessa sessione:
//
//   1. register (reale) → sessione read-only → POST /api/cameras → 403
//      → verify-email (reale, token dal dev link) → POST /api/cameras → 201
//      → riuso del link → 410.
//   2. register + verify (reali) → issueRecoveryCodes (db reale) →
//      POST /api/auth/recovery → sessione → POST /api/cameras → 201
//      → riuso del codice → 401 (single-use).
//   3. OIDC GitHub: state row reale (createOidcState), provider HTTP
//      stubato (solo la rete esterna), callback reale → sessione linked
//      (email_verified_at dal provider) → POST /api/cameras → 201.
//
// Nessun dato personale: tutti i fixture sono fittizi. Nessuna rete reale:
// il mailer passa dal binding EMAIL mockato (messaggi catturati in memoria,
// token letto dalla mail — niente devLink nella risposta API, P1-1), il
// provider OIDC è stubato.
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { apiRequest, responseBody } from "./helpers/api-harness.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
} from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import { cleanupE2ETree, e2eEnv, loadE2EModule, loadE2ERoute } from "./helpers/e2e-harness.mjs";
import {
  buildAuthenticationResponse,
  buildRegistrationResponse,
  generateKeypair,
} from "./helpers/webauthn-fixtures.mjs";

let env;
let registerRoute;
let verifyEmailRoute;
let resendRoute;
let camerasRoute;
let recoveryRoute;
let oidcStartRoute;
let oidcCallbackRoute;
let oidcMergeRoute;
let passkeyRegisterBeginRoute;
let passkeyRegisterCompleteRoute;
let passkeyLoginBeginRoute;
let passkeyLoginCompleteRoute;

// Captured outbound messages: the canonical mailer (db/mailer.ts, ADR 0020)
// sends through the EMAIL binding; the harness injects a capture mock and
// tests read the action link from the captured message — the raw token now
// exists ONLY in the mail channel (fail-closed, no devLink echo, P1-1).
let capturedMail = [];

function mailToken() {
  const message = capturedMail.at(-1);
  assert.ok(message, "an auth email must have been captured");
  const match = /token=([^"&<\s]+)/.exec(message.text ?? message.html);
  assert.ok(match, "captured mail carries the action link");
  return decodeURIComponent(match[1]);
}

beforeEach(async () => {
  env = await e2eEnv();
  env.DB = new D1SqliteDatabase();
  await applyDrizzleMigrations(env.DB);
  // Canonical mailer wiring: a working EMAIL binding (capture mock) plus the
  // public link base, so sendAuthEmail renders → rate-limits → sends → logs.
  capturedMail = [];
  env.EMAIL = {
    send: async (message) => {
      capturedMail.push(message);
      return { messageId: `m${capturedMail.length}` };
    },
  };
  env.VERIFY_BASE_URL = "https://osdb.test";
  // Auth endpoints (register, recovery, OIDC, passkey) hanno bucket per-IP:
  // alza il tetto e azzera i contatori in-memory così un test non fa
  // scattare il 429 sul successivo (stesso pattern di auth-verify-e2e).
  env.AUTH_RATE_LIMIT_MAX = "1000000";
  env.AUTH_RATE_LIMIT_WINDOW_SECONDS = "60";
  const rateLimit = await loadE2EModule("app/lib/rate-limit.mjs");
  rateLimit.resetRateLimitState();
  registerRoute = await loadE2ERoute("app/api/auth/register/route.mjs");
  verifyEmailRoute = await loadE2ERoute("app/api/auth/verify-email/route.mjs");
  resendRoute = await loadE2ERoute("app/api/auth/verify-email/resend/route.mjs");
  camerasRoute = await loadE2ERoute("app/api/cameras/route.mjs");
  recoveryRoute = await loadE2ERoute("app/api/auth/recovery/route.mjs");
  oidcStartRoute = await loadE2ERoute("app/api/auth/oidc/[provider]/start/route.mjs");
  oidcCallbackRoute = await loadE2ERoute("app/api/auth/oidc/[provider]/callback/route.mjs");
  oidcMergeRoute = await loadE2ERoute("app/api/auth/oidc/merge/route.mjs");
  passkeyRegisterBeginRoute = await loadE2ERoute("app/api/auth/passkey/register/begin/route.mjs");
  passkeyRegisterCompleteRoute = await loadE2ERoute("app/api/auth/passkey/register/complete/route.mjs");
  passkeyLoginBeginRoute = await loadE2ERoute("app/api/auth/passkey/login/begin/route.mjs");
  passkeyLoginCompleteRoute = await loadE2ERoute("app/api/auth/passkey/login/complete/route.mjs");
});

after(async () => {
  await cleanupE2ETree();
  await cleanupDbRuntime();
});

/** Estrae la coppia cookie (session + CSRF) e l'header CSRF da una response. */
function sessionHeaders(response) {
  const cookies = response.headers.getSetCookie();
  const session = cookies.find((entry) => entry.startsWith("osdb_session="));
  const csrf = cookies.find((entry) => entry.startsWith("osdb_csrf="));
  assert.ok(session, "response must issue a session cookie");
  assert.ok(csrf, "response must issue a csrf cookie");
  const rawToken = /osdb_session=([^;]+)/.exec(session)[1];
  const csrfToken = /osdb_csrf=([^;]+)/.exec(csrf)[1];
  return {
    cookie: `osdb_session=${rawToken}; osdb_csrf=${csrfToken}`,
    csrfToken,
  };
}

function writeWith(headers) {
  return apiRequest("/api/cameras", {
    method: "POST",
    headers: { ...headers, "x-csrf-token": headers.csrfToken },
    body: {
      title: "QA gate camera",
      kind: "Fixed dome",
      manufacturer: "QA Fixtures",
      observedOn: "2026-07-01",
      address: "Via Roma 1",
      notes: "QA fixture — never published",
      latitude: 41.9005,
      longitude: 12.4937,
    },
  });
}

async function registerVerifiedContributor() {
  const email = `qa-write-${crypto.randomUUID()}@example.org`;
  const response = await registerRoute.POST(apiRequest("/api/auth/register", {
    method: "POST",
    body: { email, displayName: "QA Writer", password: "Sup3rsecret!123" },
  }));
  assert.equal(response.status, 201);
  const body = await responseBody(response);
  const headers = sessionHeaders(response);
  assert.equal(body.verification.sent, true, "email delivered through the EMAIL binding");
  const rawToken = mailToken();
  assert.ok(rawToken, "captured mail carries the raw verification token");
  const verify = await verifyEmailRoute.GET(
    apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`),
  );
  assert.equal(verify.status, 200, "verify must succeed through the real endpoint");
  return { email, headers };
}

// ---------------------------------------------------------------------------
// 1. Email+password: register → write 403 → verify → write 201 → riuso 410
// ---------------------------------------------------------------------------

test("email: una sessione fresca NON scrive (403), dopo verify-email scrive (201), il link è single-use (410)", async () => {
  const email = `qa-write-gate-${crypto.randomUUID()}@example.org`;
  const response = await registerRoute.POST(apiRequest("/api/auth/register", {
    method: "POST",
    body: { email, displayName: "QA Writer", password: "Sup3rsecret!123" },
  }));
  assert.equal(response.status, 201);
  const headers = sessionHeaders(response);

  // Sessione read-only: il write gate rifiuta PRIMA della verifica.
  const denied = await camerasRoute.POST(writeWith(headers));
  assert.equal(denied.status, 403, "unverified session must be denied by the write gate");
  assert.equal(denied.headers.get("cache-control"), "no-store", "denials must be no-store");

  // Verifica con l'endpoint reale (token dalla mail catturata, come da
  // mailbox reale — niente devLink nella risposta API, P1-1).
  const rawToken = mailToken();
  assert.ok(rawToken, "captured mail carries the raw verification token");
  const verify = await verifyEmailRoute.GET(
    apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`),
  );
  assert.equal(verify.status, 200);
  assert.equal((await responseBody(verify)).verified, true);

  // STESSA sessione, ora scrive.
  const accepted = await camerasRoute.POST(writeWith(headers));
  assert.equal(accepted.status, 201, "verified session must pass the write gate");
  const { record } = await responseBody(accepted);
  assert.equal(record.status, "active", "ADR 0021 §1: a fresh report publishes immediately");
  // Attribuzione reale: il record è legato al contributor verificato.
  const row = await env.DB.prepare("SELECT contributor_id FROM cameras WHERE id = ?")
    .bind(record.id).first();
  assert.ok(row?.contributor_id, "the stored record must carry a contributor");

  // Single-use: il link consumato non verifica più nulla.
  const reuse = await verifyEmailRoute.GET(
    apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`),
  );
  assert.equal(reuse.status, 410, "reusing the consumed link must be Gone");
});

test("email: anonymous POST /api/cameras answers 401 (write gate, anti-enumeration body)", async () => {
  const denied = await camerasRoute.POST(
    apiRequest("/api/cameras", {
      method: "POST",
      body: { title: "x", kind: "Fixed dome" },
    }),
  );
  assert.equal(denied.status, 401, "anonymous write must be 401");
  const body = await responseBody(denied);
  assert.deepEqual(body, { error: "Authentication required." });
});

// ---------------------------------------------------------------------------
// 2. Passkey fallback: recovery code single-use → sessione → write
// ---------------------------------------------------------------------------

test("recovery: un codice singolo apre una sessione che scrive; riusarlo risponde 401", async () => {
  const { email } = await registerVerifiedContributor();

  // Enrollment passkey reale: emette i 10 codici, solo hash nel DB.
  const dbPasskeys = await loadE2EModule("db/passkeys.mjs");
  const contributorRow = (await env.DB.prepare(
    "SELECT id FROM contributors WHERE email = ?",
  ).bind(email).first());
  const codes = await dbPasskeys.issueRecoveryCodes(contributorRow.id);
  assert.equal(codes.length, 10, "enrollment issues exactly 10 codes");
  const code = codes[0];
  const hashed = await loadE2EModule("db/auth.mjs").then((auth) => auth.sha256Hex(code));
  const stored = (await env.DB.prepare(
    "SELECT used_at FROM recovery_codes WHERE contributor_id = ? AND code_hash = ?",
  ).bind(contributorRow.id, hashed).first());
  assert.equal(stored.used_at, null, "fresh code is unused; only the hash is stored");

  // Riscatto reale: nuova sessione.
  const redeemed = await recoveryRoute.POST(apiRequest("/api/auth/recovery", {
    method: "POST",
    body: { email, code },
  }));
  assert.equal(redeemed.status, 200);
  assert.equal((await responseBody(redeemed)).recoveryUsed, true);
  const recoveryHeaders = sessionHeaders(redeemed);

  // La sessione da recovery scrive (il contributor è già verificato).
  const accepted = await camerasRoute.POST(writeWith(recoveryHeaders));
  assert.equal(accepted.status, 201, "recovery-opened session must pass the write gate");

  // Single-use: il codice consumato non riscatta più (stesso 401 generico).
  const again = await recoveryRoute.POST(apiRequest("/api/auth/recovery", {
    method: "POST",
    body: { email, code },
  }));
  assert.equal(again.status, 401, "a used code must be rejected");
  assert.deepEqual(await responseBody(again), { error: "Invalid recovery code." });
});

// ---------------------------------------------------------------------------
// 2b. Passkey: cerimonia WebAuthn REALE (attestation + assertion firmate) →
//     enroll → login → write; counter anti-replay; token verify scaduto
// ---------------------------------------------------------------------------

test("passkey: enroll reale → login reale → write 201, e il counter replay è rifiutato", async () => {
  const { email, headers: session } = await registerVerifiedContributor();
  const contributorId = (await env.DB.prepare(
    "SELECT id FROM contributors WHERE email = ?",
  ).bind(email).first()).id;
  const keypair = generateKeypair();
  const credentialId = crypto.randomUUID().replaceAll("-", "");

  // --- Cerimonia di enrollment (attestation fmt "none": nessuna firma di
  //     attestazione richiesta, ma la COSE key deve essere valida). ---
  const begin = await passkeyRegisterBeginRoute.POST(
    apiRequest("/api/auth/passkey/register/begin", {
      method: "POST",
      headers: {
        cookie: session.cookie,
        "x-csrf-token": session.csrfToken,
      },
    }),
  );
  assert.equal(begin.status, 200);
  const beginBody = await responseBody(begin);
  assert.equal(beginBody.options.attestation, "none", "privacy: nessuna attestazione del dispositivo");
  assert.equal(beginBody.options.user.id, Buffer.from(String(contributorId)).toString("base64url"));

  const registration = buildRegistrationResponse({
    challenge: beginBody.options.challenge,
    keypair,
    credentialId,
    signCount: 1,
  });
  const complete = await passkeyRegisterCompleteRoute.POST(
    apiRequest("/api/auth/passkey/register/complete", {
      method: "POST",
      headers: {
        cookie: session.cookie,
        "x-csrf-token": session.csrfToken,
      },
      body: { challenge: beginBody.options.challenge, response: registration },
    }),
  );
  assert.equal(complete.status, 200, "attestation valida deve superare verifyRegistrationResponse reale");
  const completeBody = await responseBody(complete);
  assert.equal(completeBody.credential.id, credentialId);
  assert.equal(completeBody.recoveryCodes.length, 10, "enrollment emette esattamente 10 recovery codes");
  assert.equal(completeBody.recoveryCodesRemaining, 10);

  // La COSE key salvata è la nostra (verificabile rileggendo la passkey).
  const stored = await env.DB.prepare(
    "SELECT credential_id, public_key, counter FROM passkeys WHERE contributor_id = ?",
  ).bind(contributorId).first();
  assert.equal(stored.credential_id, credentialId);
  assert.equal(stored.counter, 1, "il counter dell'enrollment è persistito");

  // --- Login passkey reale: challenge fresca, assertion firmata con la
  //     chiave privata → nuova sessione → write. ---
  const loginBegin = await passkeyLoginBeginRoute.POST(
    apiRequest("/api/auth/passkey/login/begin", {
      method: "POST",
      body: { email },
    }),
  );
  assert.equal(loginBegin.status, 200);
  const loginBeginBody = await responseBody(loginBegin);
  assert.deepEqual(loginBeginBody.options.allowCredentials, [{ id: credentialId, type: "public-key" }]);

  const assertion = buildAuthenticationResponse({
    challenge: loginBeginBody.options.challenge,
    credentialId,
    keypair,
    signCount: 2, // avanza 1 → 2
    userHandle: Buffer.from(String(contributorId)).toString("base64url"),
  });
  const loginComplete = await passkeyLoginCompleteRoute.POST(
    apiRequest("/api/auth/passkey/login/complete", {
      method: "POST",
      body: { challenge: loginBeginBody.options.challenge, response: assertion },
    }),
  );
  assert.equal(loginComplete.status, 200, "assertion firmata deve superare verifyAuthenticationResponse reale");
  const passkeySession = sessionHeaders(loginComplete);
  assert.equal(passkeySession.cookie.includes("osdb_session="), true);

  // Il counter nel DB è avanzato.
  const advanced = await env.DB.prepare(
    "SELECT counter FROM passkeys WHERE credential_id = ?",
  ).bind(credentialId).first();
  assert.equal(advanced.counter, 2, "il counter della passkey è aggiornato dopo il login");

  // La sessione da login passkey scrive (contributor già verificato).
  const accepted = await camerasRoute.POST(writeWith(passkeySession));
  assert.equal(accepted.status, 201, "passkey-opened session must pass the write gate");
  assert.equal((await responseBody(accepted)).record.status, "active", "passkey-opened session: immediate publication (ADR 0021 §1)");

  // --- Counter replay: stessa chiave, stesso counter (2), challenge nuova →
  //     rifiuto 401 (isCounterAdvancementOk). ---
  const replayBegin = await passkeyLoginBeginRoute.POST(
    apiRequest("/api/auth/passkey/login/begin", {
      method: "POST",
      body: { email },
    }),
  );
  const replayBody = await responseBody(replayBegin);
  const replayedAssertion = buildAuthenticationResponse({
    challenge: replayBody.options.challenge,
    credentialId,
    keypair,
    signCount: 2, // NON avanza: clonato / riuso
    userHandle: Buffer.from(String(contributorId)).toString("base64url"),
  });
  const replayComplete = await passkeyLoginCompleteRoute.POST(
    apiRequest("/api/auth/passkey/login/complete", {
      method: "POST",
      body: { challenge: replayBody.options.challenge, response: replayedAssertion },
    }),
  );
  assert.equal(replayComplete.status, 401, "counter non avanzato = possibile autenticatore clonato → 401");
  assert.deepEqual(await responseBody(replayComplete), { error: "Passkey verification failed." });
});

// ---------------------------------------------------------------------------
// 2c. Passkey + verification gate (t_f940482b): enroll pre-verifica è
//     permesso (scelta documentata) ma login è bloccato finché l'email non
//     è verificata — CEO decision (a) estesa a TUTTI i metodi di login
// ---------------------------------------------------------------------------

/**
 * register reale (NON verificato) + cerimonia di enrollment passkey reale
 * (attestation firmata) → passkey nel DB, 10 recovery codes emessi, l'account
 * è ancora email_verified_at NULL. Ritorna tutto ciò che il test del gate
 * serve per la seconda metà (verify via mail + login passkey).
 */
async function registerUnverifiedAndEnrollPasskey() {
  const email = `qa-gate-${crypto.randomUUID()}@example.org`;
  const response = await registerRoute.POST(apiRequest("/api/auth/register", {
    method: "POST",
    body: { email, displayName: "QA Gate", password: "Sup3rsecret!123" },
  }));
  assert.equal(response.status, 201);
  const session = sessionHeaders(response);
  const rawVerifyToken = mailToken();
  assert.ok(rawVerifyToken, "captured mail carries the raw verification token");

  const contributorId = (await env.DB.prepare(
    "SELECT id FROM contributors WHERE email = ?",
  ).bind(email).first()).id;
  const keypair = generateKeypair();
  const credentialId = crypto.randomUUID().replaceAll("-", "");

  // Enrollment con account NON verificato: PERMESSO (scelta documentata in
  // register/begin e ADR 0020 decision 2 — la passkey è inerte finché
  // l'email non è verificata).
  const begin = await passkeyRegisterBeginRoute.POST(
    apiRequest("/api/auth/passkey/register/begin", {
      method: "POST",
      headers: { cookie: session.cookie, "x-csrf-token": session.csrfToken },
    }),
  );
  assert.equal(begin.status, 200, "enrollment can start on an unverified account");
  const beginBody = await responseBody(begin);
  const complete = await passkeyRegisterCompleteRoute.POST(
    apiRequest("/api/auth/passkey/register/complete", {
      method: "POST",
      headers: { cookie: session.cookie, "x-csrf-token": session.csrfToken },
      body: {
        challenge: beginBody.options.challenge,
        response: buildRegistrationResponse({
          challenge: beginBody.options.challenge,
          keypair,
          credentialId,
          signCount: 1,
        }),
      },
    }),
  );
  assert.equal(complete.status, 200, "attestation valida deve superare verifyRegistrationResponse reale");
  const completeBody = await responseBody(complete);
  assert.equal(completeBody.recoveryCodes.length, 10, "enrollment emette esattamente 10 recovery codes");

  const stillUnverified = await env.DB.prepare(
    "SELECT email_verified_at FROM contributors WHERE id = ?",
  ).bind(contributorId).first();
  assert.equal(stillUnverified.email_verified_at, null, "the account is still unverified after enrollment");

  return { email, session, rawVerifyToken, contributorId, credentialId, keypair, recoveryCodes: completeBody.recoveryCodes };
}

test("passkey: enroll (unverified) → login 401 → verify → login 200 — lo stesso credenziale (t_f940482b)", async () => {
  const { email, rawVerifyToken, contributorId, credentialId, keypair } =
    await registerUnverifiedAndEnrollPasskey();

  // --- Login passkey PRIMA della verifica: l'asserzione firmata è valida
  //     (tutte le verifiche reali passano), ma il gate risponde lo STESSO
  //     401 generico di ogni altro fallimento — nessuna sessione. ---
  const loginBegin = await passkeyLoginBeginRoute.POST(
    apiRequest("/api/auth/passkey/login/begin", { method: "POST", body: { email } }),
  );
  assert.equal(loginBegin.status, 200);
  const loginBeginBody = await responseBody(loginBegin);
  const assertion = buildAuthenticationResponse({
    challenge: loginBeginBody.options.challenge,
    credentialId,
    keypair,
    signCount: 2, // counter: 1 (enroll) → 2
    userHandle: Buffer.from(String(contributorId)).toString("base64url"),
  });
  const denied = await passkeyLoginCompleteRoute.POST(
    apiRequest("/api/auth/passkey/login/complete", {
      method: "POST",
      body: { challenge: loginBeginBody.options.challenge, response: assertion },
    }),
  );
  assert.equal(denied.status, 401, "a valid assertion for an UNVERIFIED account must NOT open a session");
  assert.deepEqual(await responseBody(denied), { error: "Passkey verification failed." });
  assert.equal(denied.headers.getSetCookie().length, 0, "no session cookie before verification");
  // Il counter è comunque avanzato: l'asserzione era valida (stesso
  // principio del PBKDF2 pagato prima del gate su /login).
  const counterAfterDenied = (await env.DB.prepare(
    "SELECT counter FROM passkeys WHERE credential_id = ?",
  ).bind(credentialId).first()).counter;
  assert.equal(counterAfterDenied, 2, "the counter advances on a valid-but-gated assertion");

  // --- Verifica reale via link email, poi la STESSA passkey apre una
  //     sessione che scrive. ---
  const verify = await verifyEmailRoute.GET(
    apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(rawVerifyToken)}`),
  );
  assert.equal(verify.status, 200);

  const loginBegin2 = await passkeyLoginBeginRoute.POST(
    apiRequest("/api/auth/passkey/login/begin", { method: "POST", body: { email } }),
  );
  const loginBegin2Body = await responseBody(loginBegin2);
  const assertion2 = buildAuthenticationResponse({
    challenge: loginBegin2Body.options.challenge,
    credentialId,
    keypair,
    signCount: 3, // counter: 2 (tentativo gated) → 3 — NON 2, che sarebbe replay
    userHandle: Buffer.from(String(contributorId)).toString("base64url"),
  });
  const allowed = await passkeyLoginCompleteRoute.POST(
    apiRequest("/api/auth/passkey/login/complete", {
      method: "POST",
      body: { challenge: loginBegin2Body.options.challenge, response: assertion2 },
    }),
  );
  assert.equal(allowed.status, 200, "after verification the SAME passkey logs in");
  const passkeySession = sessionHeaders(allowed);
  assert.ok(passkeySession.cookie.includes("osdb_session="), "a session is issued after verification");

  const accepted = await camerasRoute.POST(writeWith(passkeySession));
  assert.equal(accepted.status, 201, "passkey-opened session must pass the write gate after verification");
});

test("recovery: riscatto bloccato su account non verificato (401), dopo verify apre una sessione che scrive (t_f940482b)", async () => {
  const { email, rawVerifyToken, recoveryCodes } = await registerUnverifiedAndEnrollPasskey();

  // Riscatto PRIMA della verifica: lo STESSO 401 generico di un codice
  // errato, nessuna sessione (il codice valido è comunque consumato —
  // single-use, l'account state è ciò che blocca la sessione).
  const denied = await recoveryRoute.POST(apiRequest("/api/auth/recovery", {
    method: "POST",
    body: { email, code: recoveryCodes[0] },
  }));
  assert.equal(denied.status, 401, "a valid code for an UNVERIFIED account must NOT open a session");
  assert.deepEqual(await responseBody(denied), { error: "Invalid recovery code." });
  assert.equal(denied.headers.getSetCookie().length, 0, "no session cookie before verification");

  // Dopo la verifica, un ALTRO codice apre una sessione che scrive.
  const verify = await verifyEmailRoute.GET(
    apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(rawVerifyToken)}`),
  );
  assert.equal(verify.status, 200);

  const redeemed = await recoveryRoute.POST(apiRequest("/api/auth/recovery", {
    method: "POST",
    body: { email, code: recoveryCodes[1] },
  }));
  assert.equal(redeemed.status, 200);
  assert.equal((await responseBody(redeemed)).recoveryUsed, true);
  const recoveryHeaders = sessionHeaders(redeemed);

  const accepted = await camerasRoute.POST(writeWith(recoveryHeaders));
  assert.equal(accepted.status, 201, "recovery-opened session must pass the write gate after verification");
});

test("verify-email: un token oltre il TTL di 24h risponde 410 (link morto)", async () => {
  const email = `qa-expired-${crypto.randomUUID()}@example.org`;
  const response = await registerRoute.POST(apiRequest("/api/auth/register", {
    method: "POST",
    body: { email, displayName: "QA Expired", password: "Sup3rsecret!123" },
  }));
  assert.equal(response.status, 201);
  const rawToken = mailToken();
  assert.ok(rawToken, "captured mail carries the raw verification token");

  // Scade il token forzando expires_at nel passato (stesso effetto del TTL).
  const contributorId = (await env.DB.prepare(
    "SELECT id FROM contributors WHERE email = ?",
  ).bind(email).first()).id;
  await env.DB.prepare(
    "UPDATE email_verification_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE contributor_id = ?",
  ).bind(contributorId).run();

  const verify = await verifyEmailRoute.GET(
    apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`),
  );
  assert.equal(verify.status, 410, "token scaduto deve essere Gone");
  assert.equal((await responseBody(verify)).error, "This verification link has already been used or has expired.");
  // Nessun effetto collaterale: l'account resta non verificato.
  const stillUnverified = await env.DB.prepare(
    "SELECT email_verified_at FROM contributors WHERE id = ?",
  ).bind(contributorId).first();
  assert.equal(stillUnverified.email_verified_at, null);
});

// ---------------------------------------------------------------------------
// 3. OIDC GitHub: stato reale + callback reale → sessione linked → write
// ---------------------------------------------------------------------------

const GITHUB_USER = {
  id: 424242,
  email: "oidc-github-user@example.org",
  name: "OIDC QA User",
  login: "oidc-qa",
};
const GITHUB_EMAILS = [{ email: "oidc-github-user@example.org", verified: true }];

function stubProviderFetch({ user = GITHUB_USER, emails = GITHUB_EMAILS } = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = typeof url === "string" ? url : url.href;
    const json = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (href.includes("login/oauth/access_token")) return json(200, { access_token: "at-qa" });
    if (href.includes("api.github.com/user/emails")) return json(200, emails);
    if (href.includes("api.github.com/user")) return json(200, user);
    throw new Error(`unexpected provider fetch: ${href}`);
  };
  return () => {
    globalThis.fetch = original;
  };
}

test("oidc: callback linked (email del provider verificata) apre una sessione che scrive", async () => {
  const restoreFetch = stubProviderFetch();
  try {
    // OIDC è opt-in: abilita GitHub con credenziali fake.
    env.OIDC_GITHUB_CLIENT_ID = "gh-client-qa";
    env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret-qa";
    env.OIDC_BASE_URL = "https://osdb.test";

    // Lo start reale crea la row di stato (PKCE verifier bound) e reindirizza.
    const start = await oidcStartRoute.GET(
      apiRequest("/api/auth/oidc/github/start?redirect_to=/account"),
    );
    assert.equal(start.status, 302);
    const startUrl = new URL(start.headers.get("location"));
    const state = startUrl.searchParams.get("state");
    assert.ok(state, "start must carry the state param");

    // Il callback reale scambia il codice col provider stubato.
    const callback = await oidcCallbackRoute.GET(
      apiRequest(`/api/auth/oidc/github/callback?code=the-code&state=${state}`),
    );
    assert.equal(callback.status, 302);
    assert.equal(new URL(callback.headers.get("location")).pathname, "/account");
    const headers = sessionHeaders(callback);

    // Il contributor linked è verificato (flag del provider) → scrive.
    const accepted = await camerasRoute.POST(writeWith(headers));
    assert.equal(accepted.status, 201, "OIDC-linked verified session must pass the write gate");
    const { record } = await responseBody(accepted);
    assert.equal(record.status, "active", "OIDC-linked session: immediate publication (ADR 0021 §1)");
    // Privacy (Fase D): la email del provider NON è salvata — solo il
    // placeholder RFC 2606 derivato da (provider, sub) + il flag verified.
    const contributor = await env.DB.prepare(
      "SELECT email, auth_provider, external_sub, email_verified_at FROM contributors WHERE auth_provider = ? AND external_sub = ?",
    ).bind("github", String(GITHUB_USER.id)).first();
    assert.ok(contributor, "the OIDC-linked contributor must exist");
    assert.equal(contributor.auth_provider, "github");
    assert.equal(contributor.external_sub, String(GITHUB_USER.id));
    assert.equal(contributor.email, `oidc.github.${GITHUB_USER.id}@invalid`, "provider email is NOT stored");
    assert.ok(contributor.email_verified_at, "the provider's verified flag gates writes");

    // Lo state è single-use: un secondo callback con lo stesso state fallisce.
    const replayed = await oidcCallbackRoute.GET(
      apiRequest(`/api/auth/oidc/github/callback?code=the-code&state=${state}`),
    );
    assert.equal(replayed.status, 400, "replayed state must be rejected");
  } finally {
    restoreFetch();
  }
});

// ---------------------------------------------------------------------------
// 4. Rate-limit mail 3/h in E2E COMPLETO (review P2-1): register + 2 resend
//    reali → 429 sul 4° invio; il 429 NON consuma il token corrente
//    (pre-flight prima del mint) → verify reale → write 201.
// ---------------------------------------------------------------------------

test("email: budget mail 3/h esaurito con register+2 resend reali → 429 sul 4°, il link corrente resta valido e scrive", async () => {
  const email = `qa-mail-budget-${crypto.randomUUID()}@example.org`;
  const response = await registerRoute.POST(apiRequest("/api/auth/register", {
    method: "POST",
    body: { email, displayName: "QA Mail Budget", password: "Sup3rsecret!123" },
  }));
  assert.equal(response.status, 201); // invio #1
  const body = await responseBody(response);
  const headers = sessionHeaders(response);
  assert.equal(body.verification.sent, true, "register reports the mail was accepted (no devLink, P1-1)");
  const firstToken = mailToken();

  const resendOne = await resendRoute.POST(apiRequest("/api/auth/verify-email/resend", { method: "POST", headers }));
  assert.equal(resendOne.status, 200); // invio #2
  const secondToken = mailToken();
  assert.ok(secondToken && secondToken !== firstToken, "resend mints a fresh token");

  const resendTwo = await resendRoute.POST(apiRequest("/api/auth/verify-email/resend", { method: "POST", headers }));
  assert.equal(resendTwo.status, 200); // invio #3
  const thirdToken = mailToken();
  assert.ok(thirdToken && thirdToken !== secondToken, "resend mints a fresh token every time");

  // 4° invio: il budget 3/h è esaurito → 429 con Retry-After, PRIMA di ogni
  // mint/send (pre-flight): il link corrente non viene né consumato né
  // revocato — il count in tabella resta a 3.
  const blocked = await resendRoute.POST(apiRequest("/api/auth/verify-email/resend", { method: "POST", headers }));
  assert.equal(blocked.status, 429, "the 4th send in the hour is blocked");
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  const contributorRow = await env.DB.prepare("SELECT id FROM contributors WHERE email = ?").bind(email).first();
  const tokenCount = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM email_verification_tokens WHERE contributor_id = ?",
  ).bind(contributorRow.id).first();
  assert.equal(tokenCount.n, 3, "the 429 must not mint a 4th token (pre-flight quota gate)");

  // Il link corrente (terzo) verifica ancora: il 429 non l'ha toccato.
  const verify = await verifyEmailRoute.GET(apiRequest(`/api/auth/verify-email?token=${encodeURIComponent(thirdToken)}`));
  assert.equal(verify.status, 200, "the current token stays valid after the 429");

  // E2E completo: la stessa sessione ora supera il write gate con una
  // scrittura reale — il budget mail esaurito non blocca l'account.
  const accepted = await camerasRoute.POST(writeWith(headers));
  assert.equal(accepted.status, 201, "a verified session writes even after the mail budget is spent");
});

// ---------------------------------------------------------------------------
// 5. Merge OIDC manuale end-to-end REALE (review P2-2): account esistente +
//    callback con la STESSA email (provider verificata) → merge token →
//    POST /api/auth/oidc/merge reale → sessione linked → write 201.
// ---------------------------------------------------------------------------

test("oidc: conflitto email → merge manuale reale → sessione linked → write 201", async () => {
  // Account email+password esistente, NON verificato via mail: sarà il merge
  // a verificarlo sfruttando il verified flag del provider.
  const email = `qa-merge-${crypto.randomUUID()}@example.org`;
  const register = await registerRoute.POST(apiRequest("/api/auth/register", {
    method: "POST",
    body: { email, displayName: "QA Merge Target", password: "Sup3rsecret!123" },
  }));
  assert.equal(register.status, 201);
  const contributorId = (await responseBody(register)).contributor.id;

  // Il provider (solo la rete esterna è stubata) dichiara la STESSA email
  // come verificata: il callback NON deve auto-linkare, ma emettere un merge
  // token single-use (mai una sessione a questo punto).
  const restoreFetch = stubProviderFetch({
    user: { id: 98765, email, name: "OIDC Merging User", login: "oidc-merge" },
    emails: [{ email, verified: true }],
  });
  try {
    env.OIDC_GITHUB_CLIENT_ID = "gh-client-qa";
    env.OIDC_GITHUB_CLIENT_SECRET = "gh-secret-qa";
    env.OIDC_BASE_URL = "https://osdb.test";

    const start = await oidcStartRoute.GET(apiRequest("/api/auth/oidc/github/start?redirect_to=/account"));
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get("location")).searchParams.get("state");
    assert.ok(state, "start must carry the state param");

    const callback = await oidcCallbackRoute.GET(
      apiRequest(`/api/auth/oidc/github/callback?code=the-code&state=${state}`),
    );
    assert.equal(callback.status, 302);
    const callbackUrl = new URL(callback.headers.get("location"));
    assert.equal(callbackUrl.pathname, "/login", "an email conflict never auto-links: it lands on /login");
    const mergeToken = callbackUrl.searchParams.get("merge");
    assert.ok(mergeToken, "the callback issues a single-use merge token");
    assert.equal(callback.headers.getSetCookie().length, 0, "no session is issued before the manual merge");

    // Merge manuale reale: la proprietà dell'account è provata con
    // email+password (stesso path lockout-protetto del login).
    const merge = await oidcMergeRoute.POST(apiRequest("/api/auth/oidc/merge", {
      method: "POST",
      body: { token: mergeToken, email, password: "Sup3rsecret!123" },
    }));
    assert.equal(merge.status, 200);
    const mergedBody = await responseBody(merge);
    assert.equal(mergedBody.contributor.id, contributorId, "the external identity is linked to the EXISTING account");
    const mergedHeaders = sessionHeaders(merge);

    // La sessione post-merge è verificata (flag del provider) → scrive.
    const accepted = await camerasRoute.POST(writeWith(mergedHeaders));
    assert.equal(accepted.status, 201, "the merged session must pass the write gate");

    const linked = await env.DB.prepare(
      "SELECT auth_provider, external_sub, email_verified_at FROM contributors WHERE id = ?",
    ).bind(contributorId).first();
    assert.equal(linked.auth_provider, "github");
    assert.equal(linked.external_sub, "98765");
    assert.ok(linked.email_verified_at, "the merge verifies the account via the provider's verified flag");

    // Single-use: riusare lo stesso token risponde 410 e non apre sessioni.
    const replay = await oidcMergeRoute.POST(apiRequest("/api/auth/oidc/merge", {
      method: "POST",
      body: { token: mergeToken, email, password: "Sup3rsecret!123" },
    }));
    assert.equal(replay.status, 410, "the merge token is single-use");
  } finally {
    restoreFetch();
  }
});
