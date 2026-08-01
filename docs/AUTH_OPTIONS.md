# AUTH_OPTIONS.md — Authentication options for contributor accounts

- **Status:** research / decision support — nothing in this document is implemented yet
- **Date:** 2026-08-01
- **Author:** Ken (Security / DevOps)
- **Scope:** optional secure login upgrades for the existing contributor-account system (ADR 0013)
- **Related:** `docs/PRIVACY_AND_SAFETY.md`, `docs/SECURITY.md`, ADR 0013 (contributor accounts and sessions), ADR 0016 (account lockout), ADR 0014 (auth roles and appeals)

## 1. What exists today (baseline)

The current implementation is already a solid, conventional email+password stack:

| Area | Implementation |
|---|---|
| Password storage | Salted PBKDF2-HMAC-SHA256, 210,000 iterations (OWASP 2023), format `pbkdf2$<iter>$<saltB64>$<hashB64>` (iteration count is embedded, so it can be raised without a migration) |
| Sessions | Opaque 32-byte random token, stored in D1 **only as SHA-256** (a DB leak cannot replay live sessions); 30-day TTL (`AUTH_SESSION_TTL_DAYS`); revoked on logout |
| Cookies | `HttpOnly; SameSite=Strict; Path=/`; `Secure` behind `AUTH_COOKIE_SECURE=true` (HTTPS precondition) |
| CSRF | Double-submit: per-session token in a non-HttpOnly cookie echoed via `X-CSRF-Token` (constant-time compare) + same-origin check |
| Abuse protection | Login lockout (ADR 0016: 5 fails / 15 min → exponential backoff up to 2 h) + auth rate limit (default 10 req/min) |
| GDPR | Data-minimising accounts, self-service erasure with de-attribution (art. 17), no third-party identity providers |

Known gaps (relevant to every option below):

1. **No email infrastructure.** Email verification and password reset do not exist yet (both need an outbound mailer — explicitly deferred in ADR 0013 and `PRIVACY_AND_SAFETY.md`). This is the single biggest constraint for magic-link/OTP-by-email options.
2. **No 2FA of any kind.** A leaked password = full account takeover.
3. **Session lifetime is a single absolute TTL** — no idle timeout, no mid-session rotation, no rotation on privilege change.
4. **PBKDF2 iteration count is below the current OWASP recommendation** (210 k vs 600 k — see §8).
5. **Passwords are not phishing-resistant.** Everything that relies on typing a secret into a lookalike page can be phished; passkeys (§3) are the only option here that structurally prevents that.

Platform context: the app is a Next.js App Router app deployed on **Cloudflare Workers** (`nodejs_compat`), with **D1** (SQLite, no TTL support), **R2**, **Images** and **Assets** bindings. There is currently **no KV binding**. Any option that needs short-lived server state (WebAuthn challenges, magic-link tokens) must add KV or manage expiry in D1.

## 2. Evaluation criteria

Every option below is scored on:

- **Security** — threat model fit (phishing resistance, account-takeover resistance, credential-stuffing resistance).
- **Openness** — is it an open standard / open-source implementation? No proprietary lock-in?
- **Cost** — licence, hosting, per-user fees.
- **Implementation complexity** — effort in this codebase (Workers + D1), given the existing auth plumbing.
- **GDPR / privacy impact** — new data collected, third parties involved, transfers outside the EU.
- **UX** — friction for contributors, device dependence, fallback needs.

## 3. Option 1 — Passkeys / WebAuthn (FIDO2)

**What it is.** An open W3C standard (WebAuthn, part of FIDO2). The browser asks the OS authenticator (biometrics, PIN, security key) to sign a per-origin challenge. The private key never leaves the user's device (or the OS vendor's sync cloud); the site stores only a public key.

**Security — very high.** The only option here that is *structurally phishing-resistant*: credentials are bound to the site origin, so a credential typed into a lookalike domain is useless. Also resists credential stuffing, keyloggers, and leaked-hash replay. Device theft is mitigated by biometrics/PIN. Main residual risk is device loss (mitigated by recovery — see UX).

**Openness — fully open.** W3C WebAuthn + FIDO2 Alliance standard; server-side library `@simplewebauthn/server` (MIT) ships an ESM build that runs on Workers, Deno and Bun.

**Cost — zero.** Open standard, free library, no provider. Credentials live in D1 (new table); challenges need short-TTL storage — a KV binding (free tier) with 5–10 min TTL is the clean fit, since D1 has no TTL.

**Implementation complexity — moderate.** Two new endpoints (registration ceremony: challenge → attestation; authentication ceremony: challenge → assertion), one new D1 table (`passkeys`: credential_id, COSE public key, sign_count, transports, created_at), challenge store in KV, `navigator.credentials.create()/get()` on the client with **Conditional UI (autofill)**. Attestation (device provenance) can be skipped — verification is enough. Track `signCount` to detect cloned authenticators.

**GDPR / privacy — minimal.** No third-party identity provider, no new PII. One nuance: *synced* passkeys (Apple/Google/Microsoft) are backed up through the OS vendor's cloud — the vendor learns that the user has an account on this site, but the site shares nothing with them, and the user controls sync. Worth one line in the privacy notice. EU hosting is unaffected (credentials are public keys, not secrets).

**UX — good for most, needs a fallback.** One-tap on phones/laptops with biometrics; no password memory. **Reality check (FIDO Alliance Passkey Index, Oct 2025): ~36 % of accounts are passkey-enrolled and ~26 % of sign-ins use a passkey.** Most users still authenticate another way → passkeys must be an *addition* to email+password, not a replacement, at least initially. Device loss needs a recovery path: keep password fallback and/or issue one-time recovery codes at enrollment.

## 4. Option 2 — OIDC / OAuth2 (GitHub, Google, or self-hosted Authentik / Keycloak / Hanko)

**What it is.** Delegated login: the identity provider (IdP) authenticates the user and hands the site an ID token (OIDC) or access token (OAuth2). "Open" refers to the protocol (OAuth2/OIDC are open standards) — the provider and the IdP software vary widely.

### 4a. Third-party providers (GitHub, Google, …)

- **Security — good, with caveats.** The provider handles password hashing, 2FA, lockout — done right at scale. But the site's security now depends on the provider's account security, and on the provider's OAuth consent flow (consent-phishing remains possible). No structural phishing resistance for the site itself (the provider, not the site, is the phishing target).
- **Openness — protocol open, provider proprietary.** The OIDC protocol is an open standard; the provider itself is a proprietary black box.
- **Cost — zero** for both GitHub and Google OAuth (rate limits apply).
- **Complexity — low to moderate.** OIDC discovery + PKCE flow; adds a provider client ID/secret to secrets; account linking (provider subject → contributor) needs a new table.
- **GDPR / privacy — the deciding factor here.** ADR 0013 explicitly chose *not* to add third-party identity providers: they introduce a **new tracking surface** (the provider sees every login and IP), data sharing with a US company (EU–US Data Privacy Framework in force since 2023, but a new legal dependency and processor registration), and a third-party consent screen that conflicts with the project's "privacy and safety by design" posture. The privacy notice and processor register would both need updates.
- **UX — mixed.** One click if the user has a session with the provider; a confusing consent screen otherwise; users without an account at the provider are stuck; email from the provider may be a private relay (cannot be used for contact).

**Verdict: not recommended** for this project. The tracking surface and the GDPR/transfer baggage directly contradict ADR 0013 and `PRIVACY_AND_SAFETY.md` ("no third-party identity providers").

### 4b. Self-hosted IdP (Authentik, Keycloak, Hanko)

- **Security — high**, comparable to the current stack plus centralised policy (MFA, SSO, session policies).
- **Openness — fully open source:** Keycloak (Apache-2.0, Red Hat), Authentik (MPL-2.0), Hanko (AGPL-3.0, passkey-first, FIDO2-certified).
- **Cost — free software, but real infra cost.** These are server applications (Keycloak needs a JVM + Postgres; Authentik needs Postgres + Redis; Hanko self-hosted needs Postgres + a small container set). They **cannot run on Cloudflare Workers** — they need a VM (Hetzner ~ €4–10/mo) plus the operational burden of updates, backups, TLS, and uptime. Hanko Cloud has a free tier (10,000 MAU, then $0.01/MAU), but that is a hosted third party again.
- **Complexity — high for this codebase.** A second service to run and secure, plus an OIDC client integration. It replaces the existing, already-working session/CSRF plumbing with a proxied identity layer.
- **GDPR — good if self-hosted in the EU** (data stays under the project's control; Hanko is GDPR-oriented by design).
- **UX — good**, especially Hanko's passkey-first flows.

**Verdict: overkill for a single civic site.** Self-hosted IdPs pay off when an organisation needs SSO across many applications or tenant/role-heavy identity. OpenSurveillanceDB is one app with one contributor role; the existing first-party auth already covers it. If it is ever considered, Hanko is the most aligned (passkey-first, EU, AGPL, FIDO2-certified), but it is a new operational surface the project currently does not have.

## 5. Option 3 — Magic link / email OTP

**What it is.** The user enters their email; the site sends a single-use link (or a numeric code) that grants a session. No password to remember.

- **Security — medium.** Single-use tokens with short expiry (10–15 min) are the hard requirements; rate-limited sending prevents brute force. But: **not phishing-resistant** (an attacker can request a link to their own mailbox for a victim address only if they control it — the real risk is the victim's mailbox being compromised, which is exactly the account-takeover scenario passwords mitigate), and mail scanners that pre-fetch links can burn a magic link (numeric OTPs are slightly more robust for that reason). Link theft = session theft.
- **Openness — open practice, not a formal standard** (magic links are a convention; email OTP is just a bearer secret).
- **Cost — small but non-zero, and new.** Requires an outbound mailer, which **does not exist today**. Transactional email providers (Resend, Postmark, MailChannels-on-CF) have free tiers (~3 k emails/mo) then low per-email fees; a Cloudflare Email Worker route is another option. Either way: new dependency, new processor (DPA + processor-register entry).
- **Complexity — moderate.** Token generation + single-use + expiry + send-rate limiting, plus the mailer integration; the token table needs expiry handling in D1 (or KV).
- **GDPR — medium impact.** The email address is already stored; the new part is the *email provider* as a data processor (DPA needed) and the fact that each login generates an email containing a bearer token (a new handling of personal data in transit). EU-based providers are available.
- **UX — good for occasional logins** (nothing to remember), **bad for frequent ones** (email round-trip every time). Password reset (already missing) would be the natural companion use case.

**Verdict: not recommended as a login path.** It would be the first consumer of mail infrastructure and adds a processor without solving phishing. Its real value is the *companion feature it forces*: **password reset and email verification**, which the project genuinely needs — but those can be added with the same mailer later without making magic links the login method.

## 6. Option 4 — TOTP 2FA (RFC 6238)

**What it is.** A second factor: the user's authenticator app shows a 6-digit code from a shared secret, rotating every 30 s. An addition to the existing password login, not a replacement.

- **Security — high, with one caveat.** Defeats credential stuffing, leaked-hash replay, and most remote attacks; the shared secret lives only on the user's device and in the DB. **Caveat: TOTP is NOT phishing-resistant** (a code typed into a fake page can be relayed in real time). Still the de-facto standard second factor and a massive improvement over password-only.
- **Openness — fully open.** RFC 6238 (and RFC 4226/HOTP); libraries `otplib` (MIT) and `speakeasy` (MIT) are the reference implementations; verification can also be done with Web Crypto (HMAC-SHA1) directly — no new runtime dependency.
- **Cost — zero.** No provider, no infra, no per-user fee.
- **Complexity — low to moderate, fits the stack.** Enrollment endpoint (generate 160-bit random secret → `otpauth://` provisioning URI → QR code), verify endpoint (`valid_window = 1`: accept current ± 1 step, constant-time compare, one secret per account), and **10 one-time recovery codes** at enrollment. The secret is a shared secret, so **encrypt it at rest** (AES-GCM with a Workers secret) — a plaintext D1 leak would otherwise clone the TOTP. Time source: `Date.now()` on Workers is fine.
- **GDPR — negligible.** No new personal data, no third party.
- **UX — good for security-conscious contributors, friction for others.** Which is why it should be **opt-in**: offer it on the account page; never force it (the site's mission is anonymous/lightweight contribution — ADR 0013).

**Verdict: recommended as the tactical upgrade** — cheap, local, open, and it closes the "no 2FA" gap today, independently of the passkey roadmap.

## 7. Option 5 — Harden the current sessions (cheap wins, no new features)

Against the OWASP Session Management Cheat Sheet, the current implementation is already strong (opaque hashed tokens, HttpOnly/SameSite=Strict, server-side revocation, CSRF). The remaining gaps, in increasing effort:

1. **Enforce `Secure` in production.** `AUTH_COOKIE_SECURE=true` must be a release precondition; consider making the worker refuse to set session cookies over plain HTTP in production (fail-closed) rather than relying on an env flag.
2. **Add an idle timeout** (e.g. 14 days) alongside the 30-day absolute TTL — OWASP recommends both; today a stolen cookie is valid for up to 30 days of continuous use.
3. **Rotate the session token mid-life and on privilege change.** Today a new session is minted at login only. Add rotation when a contributor's role escalates (ADR 0014) and, optionally, a periodic renewal (e.g. every 7 days) so a long-lived cookie is periodically invalidated. Rotation = mint new token, revoke old, keep the session row.
4. **Raise PBKDF2 iterations to 600,000** (OWASP Password Storage Cheat Sheet, current recommendation; the stored hash format already carries the iteration count, so existing hashes re-verify and new ones are stored with the higher count — no migration beyond a constant bump + rehash-on-login).
5. **`__Host-` cookie prefix** (`__Host-osdb_session`): requires `Secure`, no `Domain`, `Path=/` — all true in production; it makes the cookie immune to subdomain shadowing. Small rename with test impact.
6. **Password change + reset** (needs the mailer from §5 for reset) — without it, a compromised account can only be escaped by deletion.
7. **Logout-all-devices** (revoke every session for the contributor) — the erasure path already does this; expose it as a normal account action.

## 8. Comparison matrix

| Criterion | Passkeys (WebAuthn) | OIDC 3rd-party | OIDC self-hosted | Magic link / email OTP | TOTP 2FA | Session hardening |
|---|---|---|---|---|---|---|
| Phishing-resistant | **Yes** | No (shifts target) | No | No | No | No (but reduces window) |
| Open standard / OSS | **W3C / FIDO2, MIT libs** | Protocol only | Keycloak/Authentik/Hanko OSS | Convention / RFC 6238-ish | **RFC 6238, MIT libs** | OWASP guidance |
| Cost | **€0** | €0 (free tiers) | €4–10/mo VM + ops | mailer ~€0–20/mo | **€0** | **€0** |
| New infra on CF | KV (free) + D1 table | Provider account | VM outside CF | Mailer + token store | D1 table only | none |
| Impl. complexity | moderate | low–moderate | high (new service) | moderate | low–moderate | **low** |
| GDPR / privacy impact | minimal | **high (tracking + US transfer)** | good if EU-hosted | medium (new processor) | negligible | none |
| UX | great, needs fallback | mixed (consent screen) | good | bad for frequent use | good for opt-in | invisible |
| Fits ADR 0013 / privacy posture | **yes** | **no** | no (ops weight) | partial | **yes** | **yes** |

## 9. Recommendation

**Recommended path (two options, staged):**

1. **Tactical, now: harden the existing password stack (§7) and add opt-in TOTP 2FA (§6).** Both are free, open, fully local, GDPR-invisible, and fit the Workers+D1 model with no new third parties. They close the two real gaps today: "no 2FA" and "sessions with only an absolute TTL". Cheap, low-risk, high value.
2. **Strategic, next: add passkeys/WebAuthn (§3) as an optional, parallel login method, keeping email+password as fallback.** It is the only option that is structurally phishing-resistant, is an open W3C/FIDO2 standard, costs nothing, runs on Workers (SimpleWebAuthn + KV + D1), and preserves the project's no-third-party privacy posture. Roll it out as *enrollment after login* + Conditional UI at the login screen; keep password and (later) TOTP for the ~two-thirds of users not yet passkey-enrolled.

**Explicitly not recommended at this stage:** third-party OIDC (tracking surface + GDPR/transfer baggage contradict ADR 0013), self-hosted IdPs (new server/ops surface for a single-app site), and magic-link login (needs a mailer that does not exist, adds a processor, and does not solve phishing — its real value, *password reset + email verification*, should ride along with the mailer later).

**Suggested sequencing:** §7 session hardening → §6 TOTP → §3 passkeys; each step is independently shippable and each keeps the login working for everyone while it rolls out.

---

*Cost and adoption figures (FIDO Alliance Passkey Index, Hanko pricing, OWASP cheat sheets) are as of 2026-08 and may drift; re-verify before a final ADR. This document is a research deliverable, not a decision — a follow-up ADR should record the chosen option and its consequences.*
