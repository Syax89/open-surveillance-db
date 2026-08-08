# ADR 0020: Multi-method authentication

- **Status:** accepted
- **Date:** 2026-08-02
- **Author:** Ada (CTO / Architecture)
- **Decision owner:** CEO (Simone) — the AUTH MULTI-METODO roadmap (phases A–G)
  was commissioned by the CEO and is recorded here by Ada
- **Updates:** ADR 0013 (contributor accounts and sessions — the single
  email+password method is extended to three methods; the email+password
  baseline and its session/CSRF design are unchanged)
- **Related ADRs:** 0014 (auth roles and appeals — role model unchanged), 0016
  (account lockout — applies to the email+password path), 0018 (community
  verifications and trust levels — the verified-write gate interacts with the
  L1 gate)
- **Related docs:** auth-options research (archived), `docs/PRIVACY_AND_SAFETY.md`,
  `docs/legal/PRIVACY_NOTICE.md`,
  `docs/TERMS_OF_USE.md`, `docs/legal/PROCESSOR_REGISTER.md`,
  `docs/legal/RETENTION_SCHEDULE.md` (R15)

## Context

ADR 0013 (2026-08-01) established email+password as the contributor
authentication mechanism: salted PBKDF2-SHA256 hashes, hashed opaque sessions,
double-submit CSRF, and anonymous submissions remaining possible by design —
a baseline this ADR changes: the write gate (decision 2, Fase E1) now requires
a verified contributor account for every submission.
It explicitly deferred **email verification and password reset** because no
outbound mailer existed.

The auth-options research (Ken, t_530958a2; archived) scored passkeys, third-party
OIDC, self-hosted OIDC, magic links, TOTP and session hardening. Its
recommendation was: harden the session stack and add opt-in TOTP first, add
passkeys next, and treat **third-party OIDC as "not recommended"** because of
the tracking surface and the GDPR/transfer baggage.

The AUTH MULTI-METODO project (2026-08-02, phases A–G) re-opened that
conclusion for three reasons:

1. **One method cannot serve the whole community.** The FIDO Alliance reality
   check quoted in the research (§ 3: ~36 % of accounts passkey-enrolled, ~26 %
   of sign-ins) means a passkey-only path would exclude most contributors, and
   a password-only path keeps the credential-stuffing/account-takeover gap
   open. The civic mission (lightweight, low-friction contribution)
   argues for letting each contributor choose the method whose trade-off they
   accept — with the risks **disclosed**, not paternalistically excluded.
2. **The mailer constraint disappeared.** Transactional email can run on
   **Cloudflare Email Routing** (`opensurveillancedb.org`) — Cloudflare is
   already the processor (PR1, DPA v6.3 + SCC + EU–US DPF), so account
   verification and password reset no longer need a new third party or a new
   DPA. This is the enabler that ADR 0013 and the research both assumed was
   missing.
3. **The abuse gap is real.** Without verification, an account with a
   throwaway email can write unlimited content; the write gate closes it at
   the identity level rather than with ad-hoc rate limits.

## Decision

1. **Three authentication methods, all landing on the same contributor
   identity.** Every method produces a `contributors.id` (ADR 0013 baseline —
   sessions, CSRF, PBKDF2, lockout — unchanged):
   a. **email + password**, now with **email verification** and **password
      reset**;
   b. **passkeys (WebAuthn/FIDO2)** as an optional, parallel method;
   c. **OIDC via GitHub or Google** as an optional, per-account method.
   Anonymous browsing remains possible and unchanged
   (ADR 0013 decision 4): no method is ever required to browse the service.
   **Reporting and every other write now require a verified contributor
   account** (decision 2, write gate Fase E1) — ADR 0013's anonymous-submissions
   rule is superseded for writes.

2. **Email verification is required for write access — and, since the CEO
   feedback 2026-08-03 (t_6dc1c96f), for login itself.** `contributors.email_verified_at`
   is set by a single-use, **SHA-256-hashed** verification token emailed
   through Cloudflare Email Routing (`opensurveillancedb.org`, HTML + plain
   templates, zero tracking), 24 h TTL, rate-limited re-send (3/h per
   contributor). Sessions from unverified accounts are **read-only**: the
   write gate (`resolveVerifiedContributor`) answers **401** for anonymous and
   **403** for not-yet-verified on write routes (Fase E1). Password reset uses
  the same mailer with the same single-use token discipline, but a **shorter
  TTL: reset links die after 3 h** (`RESET_TOKEN_TTL_MS`) — the reset path is
  the higher-stakes target for a stolen link, so its window is intentionally
  tighter than the 24 h verification window. **Login gate
  (t_6dc1c96f, option (a) — "finché non è attivato non è possibile fare
  login"):** `POST /api/auth/login` refuses an account whose
  `email_verified_at` is NULL with the **same generic 401** as unknown email
  / wrong password, so the response never reveals account existence
  (anti-enumeration, ADR 0013). The gate runs **after** the PBKDF2 check
  (no timing oracle) and does **not** touch the lockout counter (a correct
  password is not a failed attempt — no lockout-DoS for the owner, and not
  clearing the counter keeps brute-force protection intact). The read-only
  session opened at register stays the only session an unverified account
  can hold: it powers the `/account` banner and the verification resend, so
  the user is never stranded. Guidance lives as **static copy** on `/login`
  (`auth.loginVerifyHint`, EN/IT, shown to everyone) — never as a
  per-account response.
  **The gate is a single choke-point (`sessionGate`,
  app/lib/auth-route-helpers.ts) enforced by EVERY session-opening method
  (t_f940482b):** `POST /api/auth/login` (password), `POST
  /api/auth/passkey/login/complete` (passkey) and `POST /api/auth/recovery`
  (one-time code) all refuse an unverified account with the same generic
  401 as their other failures, after the full credential verification and
  without touching any lockout counter. **Passkey enrollment is
  deliberately allowed pre-verification** (register/begin): the enrolled
  credential is *inert* until the email is verified — login/complete is
  gated, so no session can be opened with it, and the write gate (403)
  blocks every write — and the user can set up their second factor in the
  same read-only session where they verify. The same applies to the 10
  recovery codes issued at enrollment: redemption on an unverified account
  answers 401 (the valid single-use code is still consumed). OIDC remains
  exempt by construction: linked accounts are born verified from the
  provider flag (decision 4).

3. **Passkeys are an optional parallel method with a mandatory fallback.**
   New D1 table `passkeys` (`credential_id` UNIQUE, COSE public key, sign
   counter), challenge store with expiry, anti-replay `sign_count` tracking.
   Enrollment issues **10 single-use recovery codes (hashed)** for device
   loss; email+password remains the fallback — passkeys are an *addition*,
   never a replacement (research § 3 adoption reality).

4. **OIDC (GitHub/Google) is opt-in, minimal by design, and disclosed.**
   PKCE + OIDC discovery; account linking via `auth_provider` +
   `external_sub`; **no email is imported from the provider** — only the
   subject id and the provider's verified flag. An email conflict between the
   OIDC subject and an existing account triggers a **manual merge**, never a
   silent takeover. Client id/secret live in the GPG vault. The tracking
   surface (the provider observes every login and IP) and the US transfer
   (EU–US DPF) are disclosed in the login UI risk matrix (Fase E2), in the
   privacy notice (§ 3.1/§ 5/§ 6) and in the terms of use.

5. **Schema (multi-auth migration).** New columns on `contributors`:
   `email_verified_at`, `auth_provider`, `external_sub` (unique per provider);
   new tables `email_verification_tokens` (SHA-256 hash, single-use; TTL
   per-purpose: verify 24 h, reset 3 h),
   `passkeys`, `recovery_codes` (10, hashed). The migration takes the next
   free index on main (the phase task named it `0026_multi_auth.sql`, but
   `0026_users_contributor_link` landed first — the actual file will be
   numbered after it). **Erasure extends to all of it** (ADR 0013 update):
   tokens, passkeys and recovery codes are hard-deleted with the account,
   `external_sub` is cleared — the erasure path stays atomic and audited.

6. **UX transparency (Fase E2).** `/login` presents the three methods with an
   explicit per-method risk matrix (phishing resistance, provider tracking,
   device dependence) — no method is hidden and none is pushed. Copy and
   disclosures are bilingual EN/IT (ADR 0007).

## Consequences

- **Processor register:** Cloudflare Email Routing is covered by the existing
  Cloudflare DPA (PR1 — zero new processors, zero new DPA). GitHub and Google
  are registered as **conditional** processors (PR5/PR6): dormant until the
  OIDC activation gate passes (executed DPA + verified EU–US DPF
  certification + register flip from conditional to active) — see
  PROCESSOR_REGISTER.md § 1/§ 4.
- **Privacy notice (v0.10):** new § 3.1 "How you authenticate" (three methods
  and what each implies); new rows in § 3 (verification token, passkeys,
  recovery codes, OIDC attributes — no email); § 5 recipients (GitHub/Google
  conditional, Cloudflare Email Routing); § 6 transfers (OIDC US DPF/SCC,
  passkey-sync vendor note); § 7 retention R15; § 10 open item (OIDC
  activation gate).
- **Terms of use (v0.6):** email verification required for write access;
  passkey vendor note (synced passkeys are backed up through the OS vendor's
  cloud — Apple/Google/Microsoft — the user controls sync, the site shares
  nothing); OIDC tracking disclosure (provider sees login and IP; provider's
  own terms apply at sign-in; opt-in only).
- **Retention (R15):** verification tokens 24 h, reset tokens 3 h (single-use,
  deleted on use); passkeys and recovery codes while the account is active,
  hard-deleted at erasure.
- **Security posture:** token hash at rest (SHA-256), recovery codes hashed,
  anti-replay counters, ADR 0016 lockout applies to the password path. OIDC
  accounts inherit the provider's account security (including the provider's
  own 2FA) — disclosed as such; the site never stores provider passwords.
- **Community plan:** the community plan (§ 1, archived) is amended — third-party OIDC is
  no longer blanket-excluded (opt-in method with disclosure instead); the L1
  confirmation gate stays tied to verified contributions, while *write*
  access is gated on email verification (§ 2); § 5.3 gains the new document
  rows.
- **Tests (Fase G):** `auth-flow-e2e.test.mjs` extends to register→verify→write,
  passkey enroll→login→write, and OIDC login; Fase A adds a Fresh-DB smoke for
  the new tables; erasure covers the new auth rows.
- **Migration naming:** the multi-auth migration file number is decided at
  implementation time against main (next free index), not fixed by this ADR.

## Alternatives

- **Single-method status quo (email+password, no verification):** rejected —
  leaves the no-verification / no-reset / no-2FA gaps open and forces every
  contributor through one method regardless of their threat model.
- **TOTP-only upgrade (research § 6):** still valuable, but deferred —
  passkeys deliver the same local-second-factor story with structural phishing
  resistance; TOTP can be layered later without a new ADR.
- **OIDC as the default or only method:** rejected — tracking surface without
  opt-in contradicts ADR 0013's minimising posture; first-party methods stay
  primary, OIDC is an extra choice.
- **Magic-link login (research § 5):** rejected as a login path
  (phishing, mail-scanner token burning); its real value — email verification
  and password reset — is adopted here via the mailer.
- **Self-hosted IdP (research § 4b):** rejected — a new server/ops surface
  for a single civic app; the project has no SSO need.
