# Legal deliverables

Status: **IN FORCE**. These documents are the legal package of OpenSurveillanceDB,
a **personal, open and collaborative project** (ADR 0021): the controller is the
project owner Simone Rondina (syax89), Italy — not a company (see
PRIVACY_NOTICE.md § 1 and the GDPR art. 37 assessment in DPO_EXCLUSION.md).
The package reflects the **current implemented state** of the codebase and is
reviewed at least annually or on any material change (version history in each
document). **They are not legal advice**; per-jurisdiction review for an
EU-wide launch is recorded in the version history (LAWFUL_BASIS.md § 6).

## Scope

This folder is the **single canonical location** for the legal deliverables
(ADR 0002); the full index with coverage is in
[`LEGAL_DELIVERABLES_INDEX.md`](LEGAL_DELIVERABLES_INDEX.md).

## Documents

| Document | Status | Covers |
| --- | --- | --- |
| [RETENTION_SCHEDULE.md](RETENTION_SCHEDULE.md) | In force (implemented — enforced by the daily retention cron) | Storage limitation, deletion terms per data category, operational logs, legal hold, deletion definition |
| [PRIVACY_NOTICE.md](PRIVACY_NOTICE.md) | In force | Art. 13/14 information, rights (12–22), negative scope, contact, response times |
| [LAWFUL_BASIS.md](LAWFUL_BASIS.md) | In force | Art. 6 bases per processing category, balancing test, 6(1)(e) for official sources |
| [PROCESSOR_REGISTER.md](PROCESSOR_REGISTER.md) | In force | Art. 30 register: Cloudflare, GitHub/Google OIDC (PR4/PR5), Nominatim geocoding (PR6), OSM; DPA version, SCC, EU–US DPF |
| [BREACH_PROCEDURE.md](BREACH_PROCEDURE.md) | In force | Art. 33/34 notification procedure, scenario table |
| [MODERATION_SLA.md](MODERATION_SLA.md) | In force (implemented) | Response targets, appeals, audit log, moderator privacy |
| [DPO_EXCLUSION.md](DPO_EXCLUSION.md) | In force | GDPR art. 37 assessment: no mandatory DPO (art. 37(1) N/A), voluntary DPO declined (art. 37(4)), accountability (arts. 5(2), 24), review triggers |
| [US-legal-matrix.md](US-legal-matrix.md) | In force (working note) | Legal basis per US state dataset (import licence gate) |

Decision records: ADR 0002 (legal deliverables), ADR 0004 (retention and
review cycle), ADR 0005 (processors and data residency), ADR 0017 (no DPO
appointed, art. 37) — all under `docs/decisions/`.

Related documents (outside this folder): the
[accessibility statement](../ACCESSIBILITY_STATEMENT.md) and
[ADR 0006 — non-sensitive usability-feedback route](../decisions/0006-non-sensitive-usability-feedback-route.md)
are product/UX deliverables; they are linked here only for discoverability.

## Implementation state (verified 2026-08-08)

- **Retention sweep:** implemented and active — the scheduled handler in
  `worker/index.ts` runs `runRetentionSweep` (db/retention.ts) daily at
  03:00 UTC plus the OIDC expiry sweep (db/oidc.ts); see
  RETENTION_SCHEDULE.md § 3.
- **Multi-method auth (ADR 0020):** implemented — email+password with
  mandatory email verification for write access, optional passkeys
  (WebAuthn), optional OIDC via GitHub/Google (server-gated: buttons are
  shown only when the operator configured the provider; see PRIVACY_NOTICE.md
  § 3.1 and PROCESSOR_REGISTER.md PR4/PR5).
- **Community-driven model (ADR 0021):** implemented — immediate publication
  from verified accounts, community actions with automatic thresholds,
  public per-record history without attribution, private corrections, and the
  legal-emergency admin power as the only human write step (../MODERATION.md).
- **Image evidence:** removed (2026-08-08) — no image is accepted or stored;
  existing objects from the retired feature are retained without deletion.
- **Public pages:** the legal documents are exposed as `/termini`, `/privacy`
  and `/licenze` (footer links, i18n bundle `app/lib/legal/`), plus
  `/api-docs` and `/contribuisci` as public information pages.
