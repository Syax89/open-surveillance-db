# Privacy and safety by design

This project concerns surveillance, so it must hold itself to a high privacy and safety standard. This document is product guidance, not legal advice; local legal review is required before any public launch.

## Data minimisation

- Do not require a real name to browse public data.
- Collect the minimum account and submission data needed to prevent abuse and run moderation.
- Keep evidence private by default and delete it according to a published retention schedule.
- Avoid personal names, faces, plates, private interiors, and precise details that do not serve the public record.

## Location and media rules

- Publish only public-facing, visible infrastructure after review.
- Generalise locations when a precise point introduces unnecessary risk; **default publication precision is ~4 decimal places (~10 m, zone level), with the exact location kept in the private moderation record only** (decision 2026-07-31).
- Do not publish images until a reviewable redaction workflow exists. Photo intake (2026-08): uploads are **never public by default** — they land in a private evidence store, EXIF/GPS metadata is stripped at the boundary before storage, and a photo becomes public only after a moderator approves it *and* explicitly confirms that the subject was redacted (fail-closed gate; the API rejects an approval without that confirmation).
- Strip EXIF/geolocation metadata from any accepted image unless the retained data is deliberately necessary and documented. Enforcement is mandatory at ingestion: magic-byte container sniffing, MIME/size/dimension limits, and metadata stripping happen server-side before bytes are persisted; client-side checks are convenience only.

## Contributor accounts and privacy

Contributor accounts are optional, voluntary, and data-minimising (ADR 0013). **Browsing the public data never requires an account.** Submitting a report or a correction requires a **verified contributor account** (ADR 0020, write gate Fase E1): every state-changing write answers **401** for anonymous callers and **403** for unverified accounts (`app/lib/write-gate.ts`). `cameras.contributor_id` is `NULL` only for records de-attributed through account erasure (R7) — never for new submissions.

- **Collected data.** Only what login and attribution need: an email (normalised trim + lowercase, stored under a unique index), an optional display name (purely cosmetic), a salted PBKDF2-SHA256 password hash (210,000 iterations, OWASP 2023; the iteration count is embedded in the stored value so it can be raised later without a migration), and timestamps. The password hash never appears in API responses (the db layer strips it). No real names, no location tracking. Authentication is **multi-method by choice** (ADR 0020): the email+password baseline is joined by optional **passkeys** (WebAuthn — public-key material only, no secret ever stored server-side) and optional **OIDC via GitHub/Google** (opt-in per account, **no email imported** from the provider — only the provider's subject id and verified flag; the provider is a *third-party identity provider by choice, disclosed, never the default*). See "Authentication methods and their privacy trade-offs" below.
- **Email verification.** Accounts must verify their email before they can write: a single-use, SHA-256-hashed token is emailed through Cloudflare Email Routing (`opensurveillancedb.org`, zero tracking) with a 24 h TTL and a rate-limited re-send (3/h). Sessions from unverified accounts are read-only (`resolveVerifiedContributor` → 401 anonymous / 403 not verified). Password reset uses the same mailer with the same single-use discipline.
- **Passkeys (WebAuthn).** Optional parallel method (enrollment after login + Conditional UI). The site stores only the public key, the credential id and a sign counter (anti-replay); the private key never leaves the user's device. **Synced passkeys** (backed up through the Apple/Google/Microsoft cloud at the user's choice) mean the OS vendor learns that the user has an account on this site — the site shares nothing with them and the user controls sync (one line in the privacy notice). Device loss is covered by 10 single-use recovery codes (hashed) issued at enrollment.
- **OIDC (GitHub/Google) — tracking disclosure.** Choosing this method means GitHub or Google **observes the login and the IP address** at every sign-in, and the account link is subject to the provider's own account security. It is an **opt-in, disclosed** method (risk matrix on `/login`, privacy notice § 3.1/§ 5/§ 6, terms § 3.7), and the processors are registered **only when OIDC is activated** (DPA + EU–US DPF gate — PROCESSOR_REGISTER PR5/PR6, currently conditional/dormant).
- **Sessions.** The browser cookie (`osdb_session`, 32 random bytes) is stored in the database only as its SHA-256, so a database leak cannot replay live sessions. Sessions expire after 30 days (`AUTH_SESSION_TTL_DAYS`) and are revoked on logout. The cookie is `HttpOnly; SameSite=Strict`; the `Secure` flag is enabled with `AUTH_COOKIE_SECURE=true` (HTTPS precondition).
- **CSRF.** Each session carries its own CSRF token, echoed in a non-HttpOnly cookie; every state-changing request with a live session must echo it in `X-CSRF-Token` (constant-time comparison) and be same-origin.
- **Abuse protection.** Login, register, and account deletion share the auth rate-limit bucket (default 10 requests/min per caller). Email verification (single-use token, 24 h, rate-limited re-send 3/h) and password reset run on Cloudflare Email Routing — the mailer gap tracked since ADR 0013 is closed (ADR 0020, AUTH MULTI-METODO Fase A2/B); unverified sessions are read-only, which closes the throwaway-account write vector.
- **Account erasure with de-attribution (GDPR art. 17; RETENTION_SCHEDULE R7).** Contributors can delete their account from the account page (`/account` → `DELETE /api/auth/account`). Erasure is one atomic batch: every attributed report is de-attributed (`contributor_id = NULL` — the report stays published, only the link to the account is severed), every session is revoked (all devices logged out), and the contributor row is hard-deleted; the response reports how many reports were de-attributed. De-attribution is deliberately explicit in the application layer (`eraseContributor`, `db/auth.ts`) rather than an `ON DELETE` FK action, so every deletion goes through the audited path. **Erasure extends to the multi-method auth data (ADR 0020):** email-verification tokens, passkey credentials and recovery codes are hard-deleted and `external_sub` is cleared — nothing survives to link the account to a provider or a device. Moderation audit entries are untouched: they are append-only and reference reviewers, not contributors.

## User rights and accountability

The public service needs, before launch: a [privacy notice](legal/PRIVACY_NOTICE.md), [lawful-basis analysis](legal/LAWFUL_BASIS.md) for each operating jurisdiction, [retention schedule](legal/RETENTION_SCHEDULE.md), correction/removal path, data-access contact, and [processor/subprocessor register](legal/PROCESSOR_REGISTER.md). Records of moderation decisions must be protected from public exposure while sufficient transparency reporting is published in aggregate. Breach handling is defined in [BREACH_PROCEDURE.md](legal/BREACH_PROCEDURE.md); all pre-launch drafts are collected in the [LEGAL_DELIVERABLES_INDEX.md](legal/LEGAL_DELIVERABLES_INDEX.md).

The correction/removal, erasure, and appeal paths are implemented and exercised as follows:

- **Rectification and removal (GDPR art. 16).** Anyone can request a correction or removal by writing to `privacy@opensurveillancedb.org`; verified contributors can also use the in-app form (`POST /api/corrections`; issue types: inaccurate, outdated, privacy/safety, duplicate, other — the endpoint is write-gated, ADR 0020). Requests are retained for 2 years as an audit trail (RETENTION_SCHEDULE R4).
- **Erasure (GDPR art. 17).** Contributors have a self-service path from the account page (see "Contributor accounts and privacy" above); anyone else exercises the right through the privacy contact. The retention schedule documents the exceptions (art. 17(3)) and the backup window (R10).
- **Appeals (ADR 0014).** Any authenticated contributor may contest a final moderation decision (`POST /api/appeals`). Appeals are decided by an independent senior moderator (the original decider is excluded), can be escalated to the administrator, and an upheld appeal returns the record to the moderation queue for a fresh review by a different reviewer. Appeal activity is internal workflow: it joins the append-only audit trail but is never published.
- **Accountability.** Moderation decisions and appeals are recorded in an append-only audit log with reviewer pseudonyms (never raw emails) and are published only as aggregate transparency reporting.

Remaining pre-launch items on the rights side: external counsel review of the notice and terms (LEGAL_DELIVERABLES_INDEX.md).

## Abuse prevention

- Rate-limit submissions and public API use.
- Require reviewed accounts for high-volume contributions.
- Detect duplicates and suspicious patterns without behavioural advertising.
- Maintain emergency hide/remove controls for credible safety reports.
- Never expose unpublished reports through search, API, exports, logs, or analytics.

## Edge caching and moderation

Public read responses carry a **bounded edge cache**: the camera list, bbox
map layer and record detail use `public, s-maxage=300,
stale-while-revalidate=600`; full CSV/GeoJSON exports use `s-maxage=3600`;
approved photo bytes use `public, max-age=3600, immutable`. These windows
keep the directory responsive without serving live feeds, but they mean a
moderation decision (e.g. a privacy/safety removal) could otherwise leave a
taken-down record served from the edge for up to the revalidation window.

To close that gap, every cacheable public response carries a **Cache-Tag**
(`cameras-list`, `cameras-bbox`, `cameras-export`, `camera-<id>`,
`photo-<id>`), and the moderation write path (`PATCH /api/moderation`)
purges the affected tags through the **Cloudflare Cache Purge API** after a
successful camera or correction decision (fail-open: an API failure never
fails the decision, and without `CACHE_PURGE_TOKEN`/`CACHE_PURGE_ZONE_ID`
configured the purge is a documented no-op and the bounded cache window
remains the guarantee).

**Trade-off (documented).** With purge credentials configured, a takedown is
served until the purge completes (typically < 1 s) plus any in-flight
stale-while-revalidate response already handed to a client; without
credentials, the worst case is the revalidation window (up to ~15 min for
list/bbox/record, 1 h for exports). This is a deliberate operational choice:
the cache exists to keep the public directory responsive under load, and the
purge hook exists so privacy decisions can override it. Photo-bytes purge is
deferred to the F2/F3 photo write path (the tag is already emitted).

## Accessibility and inclusion

The map must have an accessible list/search alternative, keyboard operation, non-colour-only status indicators, readable language, and translations. Community reporting must not be the only basis for determining whether a group is subject to surveillance.
