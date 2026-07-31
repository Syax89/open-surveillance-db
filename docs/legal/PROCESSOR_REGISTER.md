# Processor and sub-processor register

Status: **DRAFT — pre-launch.** Register under GDPR art. 30(1) (controller's
register). The register must be kept up to date; any new processor (e.g.
evidence storage) must be added before it is brought online.

## Register entries

### P1. Cloudflare, Inc. — hosting, edge compute, database

| Field (art. 30(1)) | Value |
| --- | --- |
| Name and contact | Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, US — see cloudflare.com/trust-hub/ |
| Categories of processing | Hosting of the web app (Cloudflare Workers); database (Cloudflare D1); future: object storage (R2), image optimisation |
| Categories of data subjects | Contributors (report submitters), correction-request submitters, moderators (via application data) |
| Categories of personal data | Submission data: location (lat/lon), optional address, notes, optional manufacturer/observedOn; correction requests incl. optional contact; moderation context. No identity is required for submissions. |
| Transfers to third countries | Cloudflare's global network; EU–US DPF certified; **DPA v6.3 (June 2025) incorporating EU SCCs 2021/914** (cloudflare.com/cloudflare-customer-dpa/); D1 data-location to be pinned to the EU for the primary jurisdiction (location hints / jurisdiction constraints — developers.cloudflare.com/d1/configuration/data-location/) |
| Retention terms | Per RETENTION_SCHEDULE.md (deletion jobs run against D1) |
| Security measures | TLS in transit, least-privilege access, secrets via platform env (never in source), encrypted backups |
| Sub-processors | Per the Cloudflare DPA sub-processor annex — **to be pulled and archived with this register before launch** |

### P2. OpenAI — moderator authentication ("Sign in with ChatGPT")

| Field (art. 30(1)) | Value |
| --- | --- |
| Name and contact | OpenAI (contact per openai.com/policies/data-processing-addendum/) |
| Categories of processing | Identity verification of moderators during sign-in; delivers identity headers `oai-authenticated-user-email`, `oai-authenticated-user-full-name` to the application (`app/chatgpt-auth.ts`) |
| Categories of data subjects | Moderators only |
| Categories of personal data | Email address, full name (transmitted in request headers) |
| Transfers to third countries | OpenAI DPA in place (openai.com/policies/data-processing-addendum/); transfer mechanism (DPF/SCCs) **to be confirmed with counsel before the flow is enabled** |
| Retention terms | Application must **never log or store** these headers; only a pseudonymous moderator ID is stored (finding M4). |
| Security measures | Header values processed in transit only; sign-in flow to be wired only on authenticated routes with rate limiting (H1/H2) |
| Sub-processors | Per OpenAI DPA — to be archived with this register |

**Status note:** the auth scaffold is not connected to any page and the
`/moderation` panel is currently unauthenticated (finding H1). This entry
applies **only if** the ChatGPT-auth flow is completed. Alternative:
server-managed credentials for moderators with no third-party identity
provider.

### P3. OpenStreetMap Foundation — map tiles (independent controller, NOT a processor)

| Field | Value |
| --- | --- |
| Role | Independent controller under its own privacy policy; tiles are fetched by the visitor's browser directly from OSM servers |
| Data | OSMF processes its own server logs under its own policy; the project does not transmit personal data to OSMF |
| Action | State this relationship in the privacy notice; no DPA required; production tile provider must comply with the OSM tile usage policy (see OSM_INTEGRATION.md) |

## Measures of protection (art. 32) — summary

- Encryption in transit (TLS) on all endpoints.
- Least-privilege access: pending records, evidence, and audit data accessible
  only to moderators; public query boundary enforced in code and by tests
  (ADR 0001).
- Secrets stored in the hosting platform, never in source or client bundles.
- Rate limiting and authentication before real public submissions (H2 — to be
  implemented).
- Pseudonymous reviewer identifiers; no emails in logs (M4).
- Audit logging of moderation decisions (2-year retention).
- Encrypted backups with restoration drill (DEPLOYMENT.md).

## Maintenance

- Review and re-archive the sub-processor annexes of P1/P2 **at least
  annually** and whenever a DPA version changes.
- Any new processor (e.g. evidence object storage, monitoring, tile provider)
  must be added to this register **before** going live and assessed under
  Chapter V GDPR (LAWFUL_BASIS.md, Category F).
