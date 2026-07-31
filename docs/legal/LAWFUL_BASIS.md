# Lawful-basis assessment (outline)

Status: **DRAFT outline — pre-launch.** Framework per processing category under
GDPR art. 6, with the balancing test for the core activity. The outline must be
completed per operating jurisdiction before launch; primary jurisdiction for
this draft is Italy (D.Lgs. 196/2003 "Codice Privacy", as amended by
D.Lgs. 101/2018).

Method: for each processing category we identify (a) a lawful basis under
art. 6(1), (b) necessity of the specific data, (c) a documented balancing of
the controller's interests against the rights and freedoms of data subjects,
following the three-step legitimate-interest test of Article 29 Working Party
Opinion 06/2014 (WP217): legitimate interest → necessity → balancing.

## Category A — Publishing records of visible public surveillance infrastructure

- Basis: **art. 6(1)(f) GDPR — legitimate interest** of the controller and of
  the public in civic transparency about visible surveillance infrastructure
  in shared spaces.
- Interest: informing the public about where cameras are installed in public
  areas; enabling scrutiny, research, and accountability; no commercial
  purpose (README.md: "non-commercial civic database").
- Necessity: publication is the minimum needed for the purpose; the project
  publishes only record metadata (DATA_MODEL.md), never feeds, credentials, or
  operational capability (MODERATION.md exclusions). Per-field publication
  opt-in for `manufacturer`/`observedOn`; coordinate generalisation where a
  precise point adds risk (PRIVACY_AND_SAFETY.md).
- Balancing (impact on data subjects): the records describe **infrastructure,
  not individuals**. Impacts to weigh: (i) misidentification/accuracy —
  mitigated by the review lifecycle and the correction/removal path;
  (ii) location data at building granularity — mitigated by generalisation and
  the exclusion of private premises; (iii) no sensitive data (art. 9) is
  collected by design. Weight in favour: public visibility of the
  infrastructure, civic-transparency purpose, human moderation before
  publication (MODERATION.md), aggregate transparency reporting instead of
  exposing reporters/reviewers.
- Outcome: on the current design, the legitimate interest is compelling and
  the mitigations are sufficient to keep the processing proportionate.
  **Reassessment triggers**: any future inclusion of images of people,
  non-public cameras, or per-address precision requires a new balancing.

## Category B — Public-interest basis (art. 6(1)(e))

- Art. 6(1)(e) (task in the public interest / official authority) is available
  only where the processing has a statutory basis or is carried out by a
  public authority. As a private civic project there is currently **no
  statutory basis** for this specific inventory under Italian law (D.Lgs.
  196/2003 does not grant private parties a specific basis for building
  surveillance-infrastructure databases). Therefore **6(1)(f) is the primary
  basis** for the core activity.
- Revisit if: the project is operated by or commissioned by a public body, or
  a specific legal provision is enacted in an operating jurisdiction.

## Category C — Community reports (pending submissions)

- Basis: art. 6(1)(f) — operating a moderated civic service, preventing abuse
  and spam.
- Necessity: `title`/`kind`/position are the minimum for a useful record;
  `address` optional; `manufacturer`/`observedOn` optional and private until a
  moderator opts in per field; `notes` free text kept as moderation context,
  never published (boundary fix H3 pending). No identity is required to
  submit (pseudonymous contributor reference where possible — DATA_MODEL.md).
- Balancing: low impact (no identity), high protective measures (pending
  status, moderation before publication). Outcome: proportionate.

## Category D — Correction / removal requests

- Basis: art. 6(1)(c) GDPR (compliance with obligations under GDPR arts. 12–22:
  rectification, erasure, restriction, objection) and, for the contact
  management, art. 6(1)(f) (processing the request).
- Necessity: the optional `contact` field (≤ 180 chars) is needed only to
  answer the requester; it is never published. Retention: 2 years (audit),
  see RETENTION_SCHEDULE.md.

## Category E — Moderation and audit logs

- Basis: art. 6(1)(f) + art. 32 GDPR (security, accountability).
- Minimisation: `actor` is a **pseudonymous reviewer identifier**; emails and
  full names are never stored or logged (finding M4). Retention 2 years.

## Category F — International transfers (Chapter V GDPR, arts. 44–49)

- Cloudflare (Workers/D1): transfer mechanism via the Cloudflare DPA
  incorporating EU SCCs 2021/914, plus EU–US DPF certification; D1 data
  location set for the EU (location hints / jurisdiction constraints,
  developers.cloudflare.com/d1/configuration/data-location/) for the primary
  jurisdiction.
- OpenAI (ChatGPT auth, moderators): OpenAI DPA (openai.com/policies/
  data-processing-addendum); transfer mechanism to be confirmed with counsel
  (DPF/SCCs) before the auth flow is enabled.
- Transfer impact assessment (TIA) to be documented for each processor before
  launch (Schrems II / CJEU C-311/18 framework).

## DPIA

A Data Protection Impact Assessment (art. 35 GDPR) is **recommended** before
launch: the service processes location data at scale about a topic of public
sensitivity. Even though the project does not itself conduct systematic
surveillance of individuals (the criterion of art. 35(3)(c) concerns the
controller's own monitoring), the scale and the public-exposure effect justify
a documented DPIA, which also satisfies the accountability principle (art.
5(2)).

## Summary table

| Category | Basis (art. 6) | Necessity | Balancing | DPIA |
| --- | --- | --- | --- | --- |
| A. Publication of visible infra records | 6(1)(f) | Yes — record metadata only | Favourable with current mitigations | Recommended |
| B. Public interest | 6(1)(e) — not applicable (no statutory basis for private project) | n/a | n/a | n/a |
| C. Community reports | 6(1)(f) | Yes — minimum fields | Favourable | Included in DPIA |
| D. Correction requests | 6(1)(c) + 6(1)(f) | Yes — contact optional | Favourable | Included |
| E. Moderation/audit | 6(1)(f) + art. 32 | Yes — pseudonyms | Favourable | Included |
| F. Transfers | Cap. V (SCC 2021/914 + DPF) | Conditional on DPA | To be completed per processor | Included |
