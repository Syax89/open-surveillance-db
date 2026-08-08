# Processor / sub-processor register

- **Status:** in force — personal open-source project, 2026-08-08 (ADR 0005)
- **Owner:** Rosa (Legal & Privacy Officer / privacy contact)
- **Legal basis:** GDPR art. 28 (processors), Cap. V (transfers), art. 30 (records of processing activities)
- **Review:** annually and on any provider change; additions require the privacy/legal owner's approval before onboarding.

> **Disclaimer:** this document is product guidance / not legal advice. The register is in force for the pilot jurisdiction (Italy); per-jurisdiction review remains documented for an EU-wide launch.

---

## 1. Register

| # | Processor | Service | Data processed | Role | DPA / mechanism | Transfer & residency | Sub-processors | Status |
|---|-----------|---------|----------------|------|-----------------|----------------------|----------------|--------|
| PR1 | **Cloudflare, Inc.** | Cloudflare Workers (compute/edge) + D1 (database, binding `DB`) + **Email Routing (transactional email for account verification / password reset — `opensurveillancedb.org`)** | All application data: published/withdrawn records, notes, moderation decisions, correction requests, contributor accounts/sessions. **Transactional email** (verification tokens, password reset): only the recipient address and the tokenised link, **zero tracking pixels/links** (ADR 0020). | **Processor** (art. 28) | Cloudflare Data Processing Addendum (**DPA v6.3, June 2025**) incorporating **EU SCCs (2021/914)** (modules 2/3 as applicable) — the DPA covers all Cloudflare services under the account, **including Email Routing** | Transfers EU→US possible via edge; mitigation: D1 configured with EU residency (**`weur` location hint**); encryption in transit (TLS); supplementary-measures assessment documented in § 2; **Cloudflare participates in the EU–US Data Privacy Framework (DPF-certified)** — DPF is an additional transfer ground alongside the SCCs | Per Cloudflare's published sub-processor list (DPA § list, change-notified) — reviewed at contracting | Onboarded — **Cloudflare DPA v6.3 incorporated in Cloudflare's Terms of Service (accepted at account setup)**; region pinning: D1 `weur` set |
| PR2 | **GitHub, Inc.** | Source repository hosting | Source code only; no runtime data, no personal data | Not a processor in practice (no OSDB data processed) | GitHub ToS | n/a | n/a | Informational |
| PR3 | **OpenStreetMap Foundation / tile.openstreetmap.org** | Map tiles (served through the same-origin tile proxy `/api/tiles/`) | None (public map tiles) | No personal data | OSM tile usage policy | n/a | n/a | Active (tile proxy with server-side cache, UA, docs/OSM_INTEGRATION.md § 8) |
| PR4 | **GitHub, Inc. (OIDC identity provider)** | Contributor sign-in via GitHub OAuth/OIDC | Identity attributes received at login: provider subject id (`external_sub`), display name, verified flag — **no email imported, never logged** | **Processor** (art. 28) of the identity attributes exchanged at login, **only when the operator has configured GitHub credentials** | GitHub's **DPA + EU–US DPF** certification recorded at activation (the provider's own OAuth service is controller-to-controller) | US (GitHub); the login event and the caller's IP are visible to GitHub — disclosed in the UI risk matrix and PRIVACY_NOTICE § 3.1/§ 6; assessed under DPF/SCC | n/a (provider side) | **Conditional** — active only where the operator configures GitHub credentials (`ops/oidc-secrets.sh`); the login page shows the button only then (server-gated). |
| PR5 | **Google LLC (OIDC identity provider)** | Contributor sign-in via Google OIDC | Identity attributes received at login: provider subject id (`external_sub`), display name, verified flag — **no email imported, never logged** | **Processor** (art. 28) of the identity attributes exchanged at login, **active where the operator has configured Google credentials** | Google's **DPA + EU–US DPF** certification recorded at activation (the provider's own OAuth service is controller-to-controller) | US (Google); the login event and the caller's IP are visible to Google — disclosed in the UI risk matrix and PRIVACY_NOTICE § 3.1/§ 6; assessed under DPF/SCC | n/a (provider side) | **Active** — Google OIDC configured on the deployment (2026-08-08); the login page shows the button only when configured (server-gated). |

## 2. International transfers (Cap. V GDPR) — assessment summary

### Cloudflare (PR1)
- **Transfer instrument:** Cloudflare DPA (**v6.3, June 2025**) with **EU Standard Contractual Clauses (2021/914)** — controller-to-processor and processor-to-processor modules as applicable; the DPA is incorporated in Cloudflare's Terms of Service, accepted at account setup by the controller (**Simone Rondina (syax89) / OpenSurveillanceDB**). **EU–US Data Privacy Framework:** Cloudflare is DPF-certified; the DPF is recorded as an additional transfer ground (the SCCs alone are sufficient; DPF strengthens the transfer assessment).
- **Supplementary measures (TIA summary):** data at rest in D1 pinned to `weur` (Western Europe); TLS for all traffic; Workers edge execution minimises data transfer (dynamic app, not bulk data); Cloudflare's published sub-processor list and incident-notification commitments accepted in the DPA.
- **Residual risk:** low for the dataset described (mostly non-personal infrastructure data + pseudonymous contributor metadata). Reassessed annually.

### GitHub / Google as OIDC identity providers (PR4/PR5)
- The exchange is limited to the authentication moment: the provider authenticates the contributor and we receive only the subject id, display name and the verified flag — **no email, no onward transfer of OSDB data**. The transfer assessment: US-based providers, covered by their DPA (SCCs) and by **EU–US Data Privacy Framework certification**; the residual privacy cost is the provider's own observation of the login event and the caller's IP, disclosed in the login UI risk matrix and PRIVACY_NOTICE § 3.1/§ 5/§ 6. The register row is flipped from *conditional* to *active* only after the operator configures the provider's credentials and the DPA + DPF certifications are recorded (activation gate, ADR 0020) — the login page shows the button only when configured (server-gated, `GET /api/auth/oidc/providers`).

## 3. Safeguards and commitments

- **No email logging:** application logs and audit logs must never contain contributor emails (M4; enforced in code). **Same rule for OIDC:** no provider email is ever imported (PR4/PR5 — the email column keeps a deterministic non-routable placeholder, RFC 2606), so there is nothing to log.
- **Onboarding rule:** no new processor/sub-processor may be onboarded without a DPA review and privacy/legal owner sign-off (art. 28(2)).
- **Data residency:** D1 `location_hint = "weur"` before any real data load.
- **Backup retention:** D1 automatic backups (hourly, 24 h) and Time Travel PITR (30 days) are accepted as the technical erasure horizon (RETENTION_SCHEDULE.md R10); no long-term export backups of D1 are configured.
- **Breach notification:** Cloudflare's DPA commits the processor to notifying us per art. 33(2) without undue delay; our procedure is BREACH_PROCEDURE.md. GitHub's / Google's sign-in incidents are governed by their own incident commitments — no OSDB data at risk there (the exchange is limited to identity attributes at the authentication moment, PR4/PR5).
- **Image storage (retired):** the image-evidence feature was removed 2026-08-08 (CEO decision); the retired storage binding is gone from `wrangler.jsonc` and no new writes occur. Existing objects from the retired feature are retained without deletion and are covered by the Cloudflare DPA assessment in § 2 (no new data).

## 4. Review status (ADR 0012 applied)

- [x] **SCC version:** the DPA in force (Cloudflare **v6.3, June 2025**) incorporates **EU SCCs 2021/914** — the version in force at signature (see § 2). If the new-generation SCCs announced by the Commission are adopted, the register and DPA are updated at the next annual review; no pre-launch action is required.
- [x] **Cloudflare sub-processor list:** change-notified under the DPA and reviewed at contracting (PR1); re-checked at the annual review or on provider change (top of this document).
- [x] **Map-tile provider:** OSM served through the same-origin tile proxy (`/api/tiles/`, PR3) — assessed and active (docs/OSM_INTEGRATION.md § 8).
- [x] **ADR 0012 applied:** the pilot runtime is self-hosted (**LXC, Italy**); Cloudflare (PR1) is documented as the future production target with its DPA already in force — the register reflects both, with no open precondition before the pilot hosts real data.
