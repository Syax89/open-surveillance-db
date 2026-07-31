# Execution board

This board turns the development plan into an ordered, open programme of work.
It is intentionally a plan, not a promise of a launch date. Real public data
must not be accepted until the public-alpha gate is met.

## Workstream ownership

| Workstream | Responsible role | Detailed plan | Main dependency |
| --- | --- | --- | --- |
| Product, UX, accessibility | Product lead | [PRODUCT_UX.md](workstreams/PRODUCT_UX.md) | Pilot scope and public data boundary |
| Data, moderation, privacy, safety | Data & trust lead | [DATA_TRUST.md](workstreams/DATA_TRUST.md) | Jurisdictional review and trained reviewers |
| Operations, infrastructure, open source | Operations lead | [OPS_OPEN.md](workstreams/OPS_OPEN.md) | Named service owners and sustainable budget |
| Coordination | Maintainers | This board and [development plan](DEVELOPMENT_PLAN.md) | Public decision log |

One person may initially hold several roles, but each responsibility must have
a named, reachable owner before it becomes a production dependency.

## Sequence

### Wave A — establish the pilot boundary

**Decision owners:** maintainers, with input from data & trust lead.

1. Select one pilot jurisdiction and working languages.
2. Confirm which public infrastructure is eligible and which places/details are excluded.
3. Choose the data licence, publication precision, retention approach, and correction/removal contact. — **Decided 2026-07-31: ODbL 1.0 for the database and exports; coordinates rounded to ~4 decimal places (~10 m) by default; 12-month retention with re-verification renewal; `privacy@opensurveillancedb` as the correction/removal contact.** [ADR 0007](decisions/0007-data-licence-precision-retention-contact.md)
4. Name the initial maintainers, operations owner, data steward, security contact, and moderation contact.
5. Create a public organisation/repository and an accessible private route for security and privacy reports.

**Gate:** the decisions are documented in `docs/decisions/`; there is no ambiguity about what data may enter the pilot. (Items 1–3 are decided in ADR 0006 and ADR 0007; items 4–5 remain open.)

### Wave B — build the safe public-alpha foundation

**Product & UX:** accessible record pages; map-equivalent list and search; clear status/provenance/freshness; responsive browse and submit flows.

**Data & trust:** canonical record/submission/evidence/decision separation; moderator queue; reasons and audit trail; correction/removal and urgent-hide workflow; no media until redaction/retention controls work.

**Operations:** separate development, staging, and production environments; migration process; secrets/access controls; rate limits; backups and restore runbook; map-tile provider decision.

**Gate:** fictional-data end-to-end test proves a submission cannot surface in map, API, search, or export before approval.

### Wave C — verify the pilot

1. Test the four public journeys: browse, search, submit, correct/remove.
2. Run keyboard, screen-reader, mobile, and translated-content checks.
3. Exercise duplicate, spam, prohibited-content, urgent-hide, appeal, and stale-record scenarios.
4. Run a security review, migration rehearsal, backup restoration drill, and incident exercise.
5. Publish the privacy notice, moderation policy, data dictionary, accessibility statement, release notes, and transparent cost information.

**Gate:** every item in the relevant [product acceptance criteria](workstreams/PRODUCT_UX.md#acceptance-criteria), [data go/no-go gate](workstreams/DATA_TRUST.md), and [operations launch checklist](workstreams/OPS_OPEN.md#public-alpha-launch-checklist) is evidenced.

### Wave D — limited public alpha

Open only the selected pilot area, with a deliberately small contributor group and enough trained reviewers. Publish reviewed records, regular dataset exports, aggregate transparency metrics, and a correction route. Pause expansion if review turnaround, privacy incidents, or operating cost exceeds agreed capacity.

## First implementation tickets

These are the next technical tickets once Wave A has named owners and approved the pilot policy.

| Priority | Ticket | Owner | Depends on |
| --- | --- | --- | --- |
| P0 | Replace demo seeding in deployed environments with controlled migrations | Operations | Environment policy |
| P0 | Prevent every non-public status from UI/API/GeoJSON, with automated tests | Data & trust | Target status model |
| P0 | Add an accessible public list and record-detail view | Product | Public-field decision |
| P0 | Add locality/address/coordinate search and truthful empty states | Product | Pilot dataset boundary |
| P0 | Create private correction/removal and urgent-hide intake | Data & trust | Contact and retention policy |
| P0 | Implement reviewer roles, queue, decision reasons, and audit events | Data & trust | Named moderators and role policy |
| P0 | Add route-level rate limits, input limits, and abuse alerts | Operations | Hosting choice |
| P0 | Configure staging, secrets, backups, restore rehearsal, and monitoring | Operations | Hosting choice |
| P1 | Create separate private evidence/media pipeline with scanning, EXIF removal, and redaction | Data & trust | Approved retention and review policy |
| P1 | Internationalise safety-critical UI strings | Product | Pilot language decision |
| P1 | Publish versioned data exports, data dictionary, and changelog | Data & trust + Operations | Final data licence |
| P1 | Add privacy-preserving aggregate service metrics and transparency reporting | Operations + Product | Privacy review |

## Progress log

- **2026-07-31 — Product foundation started:** an accessible, searchable
  directory and a public-record detail route now complement the map in the
  local prototype. They consume only the existing public/demo API response;
  `pending` records remain excluded. This completes neither pilot search nor
  public-alpha accessibility verification, which still require the policy and
  test gates above.
- **2026-07-31 — Accountability foundation started:** a private correction and
  request-for-review intake now writes to a separate `correction_requests`
  table and returns a private reference ID. It has no public read endpoint and
  does not alter a record automatically. Reviewer roles, access control, audit
  events, retention, and an urgent-hide process remain public-alpha work.
- **2026-07-31 — Local moderation workflow started:** `/moderation` can list
  pending camera reports and correction requests, then approve, reject, or
  hide them with prepared server-side updates. It is deliberately unlinked from
  the public interface and has no authentication because it is for local
  prototyping only. Four automated contract tests now guard the public-list,
  GeoJSON, correction-write, and public-navigation boundaries.
- **2026-07-31 — Auditable local moderation added:** every dashboard decision
  now requires a controlled reason and can include a note. The resulting local
  audit event records actor, action, reason, prior status, new status, and time;
  recent events are shown only on `/moderation`. The migration and six boundary
  tests pass, and a fictional rejection was exercised without exposing the
  record through the public map/API/export.
- **2026-07-31 — Local data-quality tools added:** the public directory and
  map share type/order filters, while an optional proximity check warns a
  contributor about reviewed/demo records within 75 metres. It never queries
  pending data and never blocks a submission. A [local playbook](LOCAL_PLAYBOOK.md)
  now documents repeatable fictional-data checks; the boundary suite has seven
  passing tests.
- **2026-07-31 — Local record lifecycle added:** verified records can be
  marked `needs_review`, removing them from public results until a moderator
  reverifies or removes them. The dashboard keeps each decision reasoned and
  audited. A synthetic end-to-end exercise passed all four transitions
  (`pending → verified → needs_review → verified → removed`) while the public
  boundary stayed intact; the automated suite now has ten passing checks.
- **2026-07-31 — Bilingual interface added:** the public application, record
  details, and local moderation dashboard now switch between English and
  Italian. The preference stays in the current device only; the database and
  API remain language-neutral. Translation review and formal accessibility
  testing are still future work.
- **2026-07-31 — In-app guide and accessibility pass added:** `/guide` now
  explains the project purpose, data states, workflow, OSM use, exports, and
  prototype boundaries in both supported languages. All app surfaces provide a
  skip link and main-content target; visible keyboard focus, reduced-motion
  support, and a map-directory alternative are now part of the local UI.
- **2026-07-31 — CSV export added:** the public record API now provides CSV as
  well as JSON and GeoJSON. All three formats derive from the same filtered
  record list, and CSV values are escaped to reduce spreadsheet formula risk.
- **2026-07-31 — Coordinate-entry fallback added:** a contributor may choose a
  report location by clicking the map or by entering valid geographic
  coordinates. Both paths select the same location, centre the local map, and
  run the same non-blocking nearby check against reviewed/demo public records
  only; no pending report can be revealed through this convenience feature.
- **2026-07-31 — Independent metadata publication added:** approving a camera
  no longer implies publication of its optional manufacturer or observation
  date. Local moderators choose each field separately, defaulting to private;
  the public data boundary suppresses raw metadata unless the corresponding
  field-specific choice is enabled.

## Active next plan

The next planned cycle is [reliable local moderation](NEXT_SPRINT.md): reasoned
decisions, append-only local audit events, history, and full fictional-data
workflow tests. It intentionally precedes accounts, media, public hosting, and
Android work.

The longer sequence from local prototype to a potential public alpha and Android
companion is maintained in the [future roadmap](FUTURE_ROADMAP.md). Its gates
are decision checkpoints, not calendar promises.

## How to work openly

- Open an issue or discussion for each ticket, linking to its workstream and acceptance evidence.
- Keep policy and architectural choices in `docs/decisions/`; do not bury them in code reviews.
- Use synthetic, clearly labelled data in issues, tests, previews, and demos.
- Do not open a real submission endpoint until its moderation and privacy dependencies are complete.
- Update [STATUS.md](STATUS.md) after each completed release gate, not simply when a feature is coded.

## Coordination rhythm

During active development, maintainers should review the board regularly:

1. Check safety blockers before scheduling features.
2. Confirm each workstream has capacity for the next dependency.
3. Record decisions, risks, and scope changes publicly.
4. Release only when evidence, not optimism, satisfies the gate.
