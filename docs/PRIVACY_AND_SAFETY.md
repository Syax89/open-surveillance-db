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

Contributor accounts are optional, voluntary, and data-minimising (ADR 0013). Browsing and reporting never require an account: anonymous submissions remain possible by design — `cameras.contributor_id` is NULL unless the submitter was logged in — and nothing ever retro-attributes an anonymous report.

- **Collected data.** Only what login and attribution need: an email (normalised trim + lowercase, stored under a unique index), an optional display name (purely cosmetic), a salted PBKDF2-SHA256 password hash (210,000 iterations, OWASP 2023; the iteration count is embedded in the stored value so it can be raised later without a migration), and timestamps. The password hash never appears in API responses (the db layer strips it). No real names, no location tracking, no third-party identity providers.
- **Sessions.** The browser cookie (`osdb_session`, 32 random bytes) is stored in the database only as its SHA-256, so a database leak cannot replay live sessions. Sessions expire after 30 days (`AUTH_SESSION_TTL_DAYS`) and are revoked on logout. The cookie is `HttpOnly; SameSite=Strict`; the `Secure` flag is enabled with `AUTH_COOKIE_SECURE=true` (HTTPS precondition).
- **CSRF.** Each session carries its own CSRF token, echoed in a non-HttpOnly cookie; every state-changing request with a live session must echo it in `X-CSRF-Token` (constant-time comparison) and be same-origin.
- **Abuse protection.** Login, register, and account deletion share the auth rate-limit bucket (default 10 requests/min per caller). Email verification and password reset do not exist yet — both need an outbound mailer and are tracked as follow-up work.
- **Account erasure with de-attribution (GDPR art. 17; RETENTION_SCHEDULE R7).** Contributors can delete their account from the account page (`/account` → `DELETE /api/auth/account`). Erasure is one atomic batch: every attributed report is de-attributed (`contributor_id = NULL` — the report stays published, only the link to the account is severed), every session is revoked (all devices logged out), and the contributor row is hard-deleted; the response reports how many reports were de-attributed. De-attribution is deliberately explicit in the application layer (`eraseContributor`, `db/auth.ts`) rather than an `ON DELETE` FK action, so every deletion goes through the audited path. Moderation audit entries are untouched: they are append-only and reference reviewers, not contributors.

## User rights and accountability

The public service needs, before launch: a [privacy notice](legal/PRIVACY_NOTICE.md), [lawful-basis analysis](legal/LAWFUL_BASIS.md) for each operating jurisdiction, [retention schedule](legal/RETENTION_SCHEDULE.md), correction/removal path, data-access contact, and [processor/subprocessor register](legal/PROCESSOR_REGISTER.md). Records of moderation decisions must be protected from public exposure while sufficient transparency reporting is published in aggregate. Breach handling is defined in [BREACH_PROCEDURE.md](legal/BREACH_PROCEDURE.md); all pre-launch drafts are collected in the [LEGAL_DELIVERABLES_INDEX.md](legal/LEGAL_DELIVERABLES_INDEX.md).

The correction/removal, erasure, and appeal paths are implemented and exercised as follows:

- **Rectification and removal (GDPR art. 16).** Anyone — with or without an account — can request a correction or removal through the in-app form (`POST /api/corrections`; issue types: inaccurate, outdated, privacy/safety, duplicate, other) or `privacy@opensurveillancedb`. Requests are retained for 2 years as an audit trail (RETENTION_SCHEDULE R4).
- **Erasure (GDPR art. 17).** Contributors have a self-service path from the account page (see "Contributor accounts and privacy" above); anyone else exercises the right through the privacy contact. The retention schedule documents the exceptions (art. 17(3)) and the backup window (R10).
- **Appeals (ADR 0014).** Any authenticated contributor may contest a final moderation decision (`POST /api/appeals`). Appeals are decided by an independent senior moderator (the original decider is excluded), can be escalated to the administrator, and an upheld appeal returns the record to the moderation queue for a fresh review by a different reviewer. Appeal activity is internal workflow: it joins the append-only audit trail but is never published.
- **Accountability.** Moderation decisions and appeals are recorded in an append-only audit log with reviewer pseudonyms (never raw emails) and are published only as aggregate transparency reporting.

Remaining pre-launch items on the rights side: provisioning the monitored privacy mailbox and external counsel review of the notice and terms (LEGAL_DELIVERABLES_INDEX.md).

## Abuse prevention

- Rate-limit submissions and public API use.
- Require reviewed accounts for high-volume contributions.
- Detect duplicates and suspicious patterns without behavioural advertising.
- Maintain emergency hide/remove controls for credible safety reports.
- Never expose unpublished reports through search, API, exports, logs, or analytics.

## Accessibility and inclusion

The map must have an accessible list/search alternative, keyboard operation, non-colour-only status indicators, readable language, and translations. Community reporting must not be the only basis for determining whether a group is subject to surveillance.
