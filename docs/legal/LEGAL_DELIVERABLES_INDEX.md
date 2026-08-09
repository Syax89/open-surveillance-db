# Legal deliverables — index

- **Status:** in force — personal open-source project, 2026-08-08; all documents reflect the current implemented state; the controller is the project owner Simone Rondina (syax89), not a company.
- **Owner:** Simone Rondina (project owner / privacy contact)
- **Decisions applied:** controller entity **Simone Rondina (syax89) / OpenSurveillanceDB (Italy)** (2026-07-31, ADR 0008); data licence **ODbL 1.0**; publication precision **~4 decimal places (~10 m)** with exact detail private; correction/removal contact **`privacy@opensurveillancedb.org`** (dedicated, monitored mailbox) + private form. **Community-driven model (ADR 0021):** records publish immediately and stay public while the community keeps confirming them (no time-based record retention); residual human moderation = legal-emergency admin actions. **Image evidence removed (2026-08-08):** no image is accepted or stored; existing objects from the retired feature are retained without deletion.
- **Location:** canonical folder for legal deliverables: `docs/legal/` (per ADR 0002).

## Deliverables

| Document | Covers | Status | Owner |
|----------|-------------------|--------|-------|
| [RETENTION_SCHEDULE.md](RETENTION_SCHEDULE.md) | P1, M3 — retention values (community model: no time-based record retention for `active`/`hidden`/`removed`; 2-year audit; backups, operational logs; R14 community actions), legal hold, deletion definition; **enforced by the daily retention cron** | In force | Simone Rondina |
| [PRIVACY_NOTICE.md](PRIVACY_NOTICE.md) | P6, M4 — purposes, bases, rights (arts. 12–22), negative scope, contact, 1-month response, identity verification | In force | Simone Rondina |
| [LAWFUL_BASIS.md](LAWFUL_BASIS.md) | P3 — art. 6(1)(f) + LIA balancing test, 6(1)(e) for official sources, IT jurisdiction (D.Lgs. 196/2003) | In force | Simone Rondina |
| [PROCESSOR_REGISTER.md](PROCESSOR_REGISTER.md) | P5, M4 — Cloudflare (DPA v6.3 + SCC + EU residency + EU–US DPF; **Workers + D1 + Email Routing**), GitHub/Google OIDC (PR4/PR5 — server-gated, no email imported), Nominatim geocoding (PR6), OSM | In force | Simone Rondina |
| [BREACH_PROCEDURE.md](BREACH_PROCEDURE.md) | P2 — arts. 33/34, roles, triage, 72-h notification, data-subject notification, register | In force | Simone Rondina |
| [MODERATION_SLA.md](MODERATION_SLA.md) | M1, M2, M3 — 24 h emergency hide, 48 h first response, 14-day decision, 30-day hide review | In force | Simone Rondina |
| [DPO_EXCLUSION.md](DPO_EXCLUSION.md) | Gap 7, P6 — GDPR art. 37 assessment: art. 37(1) N/A, voluntary DPO declined (art. 37(4)), accountability (arts. 5(2), 24), review triggers | In force | Simone Rondina |
| [US-legal-matrix.md](US-legal-matrix.md) | Working note — legal basis per US state dataset (import licence gate) | In force | Simone Rondina |

## How they map to the policy documents

- PRIVACY_AND_SAFETY.md "User rights and accountability" (privacy notice, lawful-basis analysis, retention schedule, correction/removal path, data-access contact, processor register) → all satisfied by the documents above.
- MODERATION.md "Appeals and corrections" + "Moderator safeguards" → MODERATION_SLA.md.
- SECURITY.md "monitored private disclosure address and a response-time commitment" → BREACH_PROCEDURE.md § 2/5 (mailbox active).

## Still open (tracked, not part of this folder's deliverable state)

- **Terms of use** — delivered and in force: `../TERMS_OF_USE.md` (versioned, canonical; the web adaptation `/termini` mirrors it via `app/lib/legal/`).
- **Software licence confirmation** — the repository carries **AGPL-3.0-or-later** (LICENSE, package.json); the CEO decision note of 2026-07-31 cited "MIT already present", which does not match the repository. Confirmation requested: keep AGPL or switch.
- **ODbL notices in CSV/GeoJSON exports** — implementation (project owner).
- **Acceptance mechanics** (clickwrap on the submission form vs. general browse terms) — tracked in TERMS § 15.

## Related documents (not legal deliverables)

For discoverability only: the
[accessibility statement](../ACCESSIBILITY_STATEMENT.md) and
[ADR 0006 — non-sensitive usability-feedback route](../decisions/0006-non-sensitive-usability-feedback-route.md)
are product/UX deliverables owned by the product workstream, not part of the
legal review.

## Consolidation note

This folder (`docs/legal/`) is the **single canonical location** for legal
deliverables. Earlier working copies at the repository root
(`docs/PRIVACY_NOTICE.md`, `docs/LAWFUL_BASIS.md`, `docs/PROCESSOR_REGISTER.md`,
`docs/RETENTION_SCHEDULE.md`, `docs/BREACH_PROCEDURE.md`,
`docs/MODERATION_SLA.md`, and this index) were removed as part of the
legal-review consolidation (PR #8). The dated review reports of 2026-07-31 /
2026-08-01 were superseded by the current-state alignment of 2026-08-08 and
moved to the project archive (`~/osdb-archive/legal-reviews/`) — their
findings are incorporated in the documents above, and the historical
references they contained (including the retired identity-provider era and
the removed image-evidence feature) no longer reflect the codebase.
