# Processor / sub-processor register

- **Status:** draft for pre-launch review (ADR 0005)
- **Owner:** Rosa (DPO / privacy)
- **Legal basis:** GDPR art. 28 (processors), Cap. V (transfers), art. 30 (records of processing activities)
- **Review:** annually and on any provider change; additions require DPO approval before onboarding.

> **Disclaimer:** this document is product guidance / not legal advice. It is a draft for pre-launch review and requires external counsel review before launch.

---

## 1. Register

| # | Processor | Service | Data processed | Role | DPA / mechanism | Transfer & residency | Sub-processors | Status |
|---|-----------|---------|----------------|------|-----------------|----------------------|----------------|--------|
| PR1 | **Cloudflare, Inc.** | Cloudflare Workers (compute/edge) + D1 (database, binding `DB`) + **R2 (object storage, binding `PHOTOS`)** | All application data: pending/verified records, notes, evidence refs, moderation decisions, correction requests. **Photo evidence bytes** (EXIF/XMP/IPTC-stripped, ≤ 10 MB / 4096 px) in **R2** (`PHOTOS`, bucket `opensurveillancedb-photos`) with **metadata-only in D1** (PR #64). The stale note "No R2 in use (`hosting.json` `r2: null`)" predates PR #64 and is superseded by `wrangler.jsonc` `r2_buckets`. | **Processor** (art. 28) | Cloudflare Data Processing Addendum (**DPA v6.3, June 2025**) incorporating **EU SCCs (2021/914)** (modules 2/3 as applicable) — the DPA covers all Cloudflare services under the account, **including R2** | Transfers EU→US possible via edge; mitigation: D1 configured with EU residency (**`weur` location hint**); **R2 bucket region/jurisdiction: not declared in `wrangler.jsonc` — to be confirmed with the CTO (default Cloudflare R2 is multi-region, no EU residency guarantee; an EU jurisdictional restriction is set at bucket creation and is immutable, see § 4 open item)**; encryption in transit (TLS); supplementary-measures assessment documented in § 2; **Cloudflare participates in the EU–US Data Privacy Framework (DPF-certified)** — DPF is an additional transfer ground alongside the SCCs | Per Cloudflare's published sub-processor list (DPA § list, change-notified) — reviewed at contracting | Onboarded (test) / **pre-launch: execute DPA + region pinning (D1 `weur` + R2 jurisdiction)** |
| PR2 | **OpenAI, LLC** | ChatGPT sign-in (`/signin-with-chatgpt`, headers `oai-authenticated-user-*`) | Moderator identity attributes received: email, display name, full name | **Not a processor of OpenSurveillanceDB data** — OpenAI is an independent controller of its own authentication service (its privacy policy governs the sign-in). No OSDB data is sent to OpenAI; we only *receive* identity attributes. | OpenAI's own terms/privacy policy (controller-to-controller) | Identity attributes originate from OpenAI services (US/EU per OpenAI infrastructure); assessed as a transfer *into* our systems, not an export of our data | n/a (provider side) | Onboarded (scaffold, not yet wired — see H1) / **pre-launch: wire auth + verify with OpenAI** |
| PR3 | **GitHub, Inc.** | Source repository hosting | Source code only; no runtime data, no personal data | Not a processor in practice (no OSDB data processed) | GitHub ToS | n/a | n/a | Informational |
| PR4 | **OpenStreetMap Foundation / tile.openstreetmap.org** | Map tiles (test only) | None (public map tiles) | No personal data | OSM tile usage policy | n/a | n/a | Test only; production provider TBD (review H5) |

## 2. International transfers (Cap. V GDPR) — assessment summary

### Cloudflare (PR1)
- **Transfer instrument:** Cloudflare DPA (**v6.3, June 2025**) with **EU Standard Contractual Clauses (2021/914)** — controller-to-processor and processor-to-processor modules as applicable; DPA executed by the controller (**Simone Rondina (syax89) / OpenSurveillanceDB**) before launch. **EU–US Data Privacy Framework:** Cloudflare is DPF-certified; the DPF is recorded as an additional transfer ground (the SCCs alone are sufficient; DPF strengthens the transfer assessment).
- **Supplementary measures (TIA summary):** data at rest in D1 pinned to `weur` (Western Europe); TLS for all traffic; Workers edge execution minimises data transfer (dynamic app, not bulk data); **R2 photo storage (PR #64): only EXIF/XMP/IPTC-stripped bytes, metadata stays in D1, and the objects follow the record's retention (R6); bucket region/jurisdiction not declared in the repo — default Cloudflare R2 is multi-region without an EU residency guarantee, so an EU jurisdictional restriction must be confirmed/pinned with the CTO (see § 4); no long-term backup export of D1 to R2** (R2 holds active photo objects, not backups — the earlier "R2 null" statement is superseded by `wrangler.jsonc` `r2_buckets`); Cloudflare's published sub-processor list and incident-notification commitments accepted in the DPA.
- **Residual risk:** low for the dataset described (mostly non-personal infrastructure data + pseudonymous contributor metadata). Reassessed annually.

### OpenAI (PR2)
- The sign-in is initiated by the moderator on OpenAI's service; identity attributes are then delivered to us. Our processing of those attributes is EU-side; we do not transfer them onward. The exposure is limited to the authentication moment; mitigated by: never logging emails, session-only use, reviewer pseudonyms in audit logs (M4).

## 3. Safeguards and commitments

- **No email logging:** application logs and audit logs must never contain `oai-authenticated-user-email` values (M4; enforced in code — follow-up for ada with H1).
- **Data residency:** D1 `location_hint = "weur"` before any real data load; **R2 photo bucket: EU jurisdictional restriction to be confirmed/pinned with the CTO (bucket-level, immutable once set — see § 4).**
- **Photo storage hygiene:** R2 (`PHOTOS`) stores only EXIF/XMP/IPTC-stripped bytes; metadata lives in D1; photo objects follow the record's lifecycle (RETENTION_SCHEDULE.md R6) and deletion of a record must delete the R2 objects too (retention job — owner ada, see RETENTION_SCHEDULE.md § 3 open item).
- **Backup retention:** D1 automatic backups (hourly, 24 h) and Time Travel PITR (30 days) are accepted as the technical erasure horizon (RETENTION_SCHEDULE.md R10); **no R2 export backup of D1 is configured** — R2 is used only for active photo objects, not as a backup target (this is unchanged from before; the wording is clarified because R2 itself is now in use for photos).
- **Breach notification:** Cloudflare's DPA commits the processor to notifying us per art. 33(2) without undue delay; our procedure is BREACH_PROCEDURE.md. OpenAI's sign-in incidents are governed by OpenAI's own incident commitments — no OSDB data at risk there.
- **Onboarding rule:** no new processor/sub-processor may be onboarded without a DPA review and DPO sign-off (art. 28(2)).

## 4. Open items before launch

- [ ] Execute Cloudflare DPA (SCC) with the controller (**Simone Rondina (syax89) / OpenSurveillanceDB**); pin D1 region `weur`.
- [ ] **Confirm the R2 photo bucket region/jurisdiction with the CTO (ada):** bucket `opensurveillancedb-photos` — check via `wrangler r2 bucket list` / Cloudflare dashboard. The region is not declared in `wrangler.jsonc`; default Cloudflare R2 is multi-region without an EU residency guarantee. If photo bytes are treated as personal data, pin an **EU jurisdictional restriction** (set at bucket creation, immutable — pinning may require a new bucket + migration; technical decision for ada). Update this register and PRIVACY_NOTICE § 5/§ 6 once confirmed.
- [ ] **Confirm the applicable SCC version at DPA execution:** the Commission has announced a new generation of SCCs (public consultation Q4 2024; adoption announced for 2025) to replace the 2021/914 clauses. The register and the DPA must reference the SCC version in force at signature.
- [ ] Wire ChatGPT auth to `/moderation` (fixes H1) and verify the identity attributes actually received (name fields may be null).
- [ ] Confirm whether Cloudflare's sub-processor list changes require an updated review at contract signature.
- [ ] Choose and assess the production map-tile provider (H5).
- [ ] Revise this register and PRIVACY_NOTICE § 5 per ADR 0012: the pilot runtime is self-hosted (LXC 114, Italy) and Cloudflare returns to a future precondition — to be completed before the pilot hosts real data.
