# ADR 0005: Processors and data residency

- **Status:** proposed (draft, awaiting launch review)
- **Date:** 2026-07-31
- **Author:** Simone Rondina (project owner)
- **Updates:** ADR 0002-legal-pre-launch-deliverables, processors section (DPA version and EU–US DPF recorded here). **2026-08-08:** the identity-provider choice was updated — GitHub/Google OIDC (research recorded in ADR 0020) replaced the ChatGPT sign-in scaffold; the register and PRIVACY_NOTICE were re-synced (PRIVACY_NOTICE § 3/§ 5/§ 6, PROCESSOR_REGISTER PR2 retired, PR5/PR6).

## Context

The project runs on Cloudflare Workers with a D1 database (binding `DB`, per `worker/index.ts`). Contributor authentication is multi-method (ADR 0020): email + password, passkeys, and **OIDC via GitHub or Google** (opt-in, server-gated on configured credentials; `app/lib/oidc.ts`). GDPR art. 28 and Cap. V require documented processor arrangements and transfer assessment (review findings P5, M4).

## Decision

1. **Cloudflare, Inc.** is the sole processor of runtime data (Workers + D1), governed by the Cloudflare Data Processing Addendum (**DPA v6.3, June 2025**) incorporating **EU SCCs (2021/914)**; Cloudflare is certified under the **EU–US Data Privacy Framework** (recorded as an additional transfer ground). The D1 database is pinned to EU residency (`weur` location hint) before any real data load; R2 is not used, so no long-term backup export exists.
2. **GitHub, Inc. / Google LLC (OIDC identity providers)** are **not processors** of OpenSurveillanceDB data while dormant (no login data flows). When the operator activates a provider (credentials configured, PROCESSOR_REGISTER PR5/PR6), the provider authenticates the contributor and we only *receive* identity attributes: **provider subject id (`external_sub`) + verified flag — never the email** (the email column keeps a deterministic non-routable RFC 2606 placeholder). The provider's own service is an independent controller; no OSDB data is sent to it. Identity attributes are never logged.
3. GitHub (source hosting) and the test OSM tile server process no personal data and are listed for completeness only.
4. The processor register (`docs/legal/PROCESSOR_REGISTER.md`) is maintained by the DPO; no new processor/sub-processor is onboarded without a DPA review and DPO sign-off.
5. Open item before launch: **confirm the applicable SCC version at DPA execution** — the Commission has announced a new generation of SCCs (public consultation Q4 2024; adoption announced for 2025) that will replace the 2021/914 clauses; the register and the DPA must reference the version in force at signature.

## Consequences

- The privacy notice discloses both providers and the transfer mechanisms (PRIVACY_NOTICE.md § 5-6).
- Moderators authenticate as verified contributors (roles `moderator`/`admin`, db/users.ts) with the same methods as any contributor — no separate moderator identity or provider (the ChatGPT scaffold was removed 2026-08-08).
- Breach notification from the processor flows through the Cloudflare DPA into BREACH_PROCEDURE.md.
- The register is reviewed annually and on provider change.
