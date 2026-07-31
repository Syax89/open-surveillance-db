# ADR 0003: Processors and data residency

- **Status:** proposed (draft, awaiting launch review)
- **Date:** 2026-07-31
- **Author:** Rosa (DPO / privacy)

## Context

The prototype runs on Cloudflare Workers with a D1 database (binding `DB`, per `worker/index.ts` and `.openai/hosting.json`). Moderator authentication is scaffolded via ChatGPT sign-in (`app/chatgpt-auth.ts`, headers `oai-authenticated-user-*`). GDPR art. 28 and Cap. V require documented processor arrangements and transfer assessment (review findings P5, M4).

## Decision

1. **Cloudflare, Inc.** is the sole processor of runtime data (Workers + D1), governed by the Cloudflare DPA incorporating EU SCCs; the D1 database is pinned to EU residency (`weur` location hint) before any real data load; R2 is not used, so no long-term backup export exists.
2. **OpenAI (ChatGPT sign-in)** is **not a processor** of OpenSurveillanceDB data: it is an independent controller of its own authentication service. The project only *receives* identity attributes (email, display name, full name) and must **never log or store them**; audit logs carry reviewer pseudonyms only.
3. GitHub (source hosting) and the test OSM tile server process no personal data and are listed for completeness only.
4. The processor register (`docs/PROCESSOR_REGISTER.md`) is maintained by the DPO; no new processor/sub-processor is onboarded without a DPA review and DPO sign-off.

## Consequences

- The privacy notice discloses both providers and the transfer mechanisms (PRIVACY_NOTICE § 4-5).
- Moderator auth must actually be wired to `/moderation` before the panel is reachable (review H1) — implementation is ada's follow-up.
- Breach notification from the processor flows through the Cloudflare DPA into BREACH_PROCEDURE.md.
- The register is reviewed annually and on provider change.
