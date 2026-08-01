# Execution board

This board turns the development plan into an ordered, open programme of work.
It is intentionally a plan, not a promise of a launch date. Real public data
must not be accepted until the public-alpha gate is met.

## Workstream ownership

| Workstream | Responsible role | Detailed plan | Main dependency |
| --- | --- | --- | --- |
| Product, UX, accessibility | Product lead | [PRODUCT_UX.md](workstreams/PRODUCT_UX.md) | Pilot scope and public data boundary |
| Data, moderation, privacy, safety | Data & trust lead — Linus and Grace (data stewards); Grace (moderation contact) | [DATA_TRUST.md](workstreams/DATA_TRUST.md) | Jurisdictional review and trained reviewers |
| Operations, infrastructure, open source | Operations lead — Ken (operations owner, security contact) | [OPS_OPEN.md](workstreams/OPS_OPEN.md) | Named service owners and sustainable budget |
| Coordination | Maintainers — Simone (syax89) and Ada (CTO, sole merge authority) | This board and [development plan](DEVELOPMENT_PLAN.md) | Public decision log |

One person may initially hold several roles, but each responsibility must have
a named, reachable owner before it becomes a production dependency. The current
named owners are recorded in [GOVERNANCE.md](../GOVERNANCE.md).

## Sequence

### Wave A — establish the pilot boundary

**Decision owners:** maintainers, with input from data & trust lead.

1. Select one pilot jurisdiction and working languages. — **Decided 2026-07-31: Italy, Comune di Ferrara as launch area; Italian and English.** [ADR 0010](decisions/0010-pilot-jurisdiction-languages-eligibility.md)
2. Confirm which public infrastructure is eligible and which places/details are excluded. — **Decided 2026-07-31: cameras visible from public space are eligible; private homes, live feeds, sensitive operational details, and security weaknesses are excluded.** [ADR 0010](decisions/0010-pilot-jurisdiction-languages-eligibility.md)
3. Choose the data licence, publication precision, retention approach, and correction/removal contact. — **Decided 2026-07-31: ODbL 1.0 for the database and exports; coordinates rounded to ~4 decimal places (~10 m) by default; 12-month retention with re-verification renewal; `privacy@opensurveillancedb` as the correction/removal contact.** [ADR 0008](decisions/0008-data-licence-precision-retention-contact.md)
4. Name the initial maintainers, operations owner, data steward, security contact, and moderation contact. — **Decided 2026-07-31: maintainers are Simone (syax89) and Ada (CTO, sole merge authority); operations owner and security contact are Ken; data stewards are Linus and Grace; moderation contact is Grace.** Recorded in [GOVERNANCE.md](../GOVERNANCE.md).
5. Create a public organisation/repository and an accessible private route for security and privacy reports. — **Decided 2026-07-31: the repository `Syax89/open-surveillance-db` is public with CI as its merge gate; SECURITY.md is the private reporting route (GitHub Private Vulnerability Reporting plus a project PGP key) with a 48-hour first-response commitment; near-term hosting is local-first.** [ADR 0012](decisions/0012-public-repo-security-disclosure-and-hosting.md). RFC 9116 `security.txt` discovery on the deployed site is drafted (PR #79) and merges with the public deployment.

**Gate:** the decisions are documented in `docs/decisions/`; there is no ambiguity about what data may enter the pilot. (Items 1–5 are decided — ADR 0010 (pilot boundary), ADR 0008 (data licence, precision, retention, contact), GOVERNANCE.md (named owners), ADR 0012 (public repository and the private reporting route via SECURITY.md). What remains is deployment, not policy: `security.txt` discovery (RFC 9116, PR #79) and real operator identity provisioning land with the public deployment.)

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

Status reflects the local prototype as of 2026-08-01; every `Done` row is evidenced in the Progress log below.

| Priority | Ticket | Owner | Depends on | Status |
| --- | --- | --- | --- | --- |
| P0 | Replace demo seeding in deployed environments with controlled migrations | Operations | Environment policy | Open — migrations are journal-managed, but local deploys still seed demo records |
| P0 | Prevent every non-public status from UI/API/GeoJSON, with automated tests | Data & trust | Target status model | Done (local prototype) — boundary contract tests guard public-list, GeoJSON, corrections, navigation, and status leaks |
| P0 | Add an accessible public list and record-detail view | Product | Public-field decision | Done (local prototype) — directory and record-detail route complement the map |
| P0 | Add locality/address/coordinate search and truthful empty states | Product | Pilot dataset boundary | Done (local prototype) — `GET /api/cameras/search` |
| P0 | Create private correction/removal and urgent-hide intake | Data & trust | Contact and retention policy | Done (local prototype) — `correction_requests` intake plus moderation hide |
| P0 | Implement reviewer roles, queue, decision reasons, and audit events | Data & trust | Named moderators and role policy | Done — ADR 0009/0014; append-only audit and appeals included |
| P0 | Add route-level rate limits, input limits, and abuse alerts | Operations | Hosting choice | Done — per-route limits, input caps, abuse alerts (PR #43) |
| P0 | Configure staging, secrets, backups, restore rehearsal, and monitoring | Operations | Hosting choice | In progress — local LXC 114 covered (ops/ scripts); Cloudflare staging deferred (CEO local-first decision) |
| P1 | Create separate private evidence/media pipeline with scanning, EXIF removal, and redaction | Data & trust | Approved retention and review policy | Done (local prototype) — intake caps, magic-byte verification, EXIF/XMP/IPTC strip, R2 storage, moderation/redaction gate (PR #64) |
| P1 | Internationalise safety-critical UI strings | Product | Pilot language decision | Done — bilingual EN/IT surfaces (PRs #68, #72, #78, #88); per-domain bundle refactor in flight (PR #80) |
| P1 | Publish versioned data exports, data dictionary, and changelog | Data & trust + Operations | Final data licence | In progress — CSV export done; changelog done (PR #86); ODbL export notice open (PR #81) |
| P1 | Add privacy-preserving aggregate service metrics and transparency reporting | Operations + Product | Privacy review | Open |

## Progress log

- **2026-07-31 — Pilot boundary decided (Wave A items 1–2):** the CEO approved
  Italy as pilot jurisdiction with the Comune di Ferrara as launch area, Italian
  and English as working languages, and a defined eligibility boundary (visible
  public-space surveillance cameras; private homes, live feeds, sensitive
  operational details, and security weaknesses excluded). The Italian GDPR
  review is coherent with the existing legal drafts. Recorded in
  [ADR 0010](decisions/0010-pilot-jurisdiction-languages-eligibility.md). Items
  3–5 of Wave A (final data licence, named owners, public organisation and
  private reporting route) remain open.
- **2026-07-31 — Pilot search started:** locality/address/coordinate search
  (`GET /api/cameras/search`) with truthful empty states: coordinate queries
  are parsed locally, free-text places resolve through a configurable
  geocoder, and every response returns the searched area and radius.
  Zero results are never presented as proof of no surveillance. The route is
  per-caller rate-limited (default 15/min, env-configurable) and excluded
  from edge caching.
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
- **2026-07-31 — Map-to-directory keyboard equivalent completed:** every map
  task now has a keyboard/text-list path. Directory "Show on map" selects a
  record, scrolls, and moves keyboard focus to the labelled map region,
  honouring reduced-motion preferences; picking a report location keeps the
  manual-coordinate fields; and if the lazy Leaflet load or tile host fails,
  the map degrades to a visible panel linking the accessible directory instead
  of an empty box (PR #22, 155/155 tests green).
- **2026-07-31 — Initial owners named (Wave A item 4):** the CEO named the
  initial maintainers, operations owner, data steward, security contact, and
  moderation contact: maintainers are Simone (syax89) and Ada (CTO, sole merge
  authority); operations owner and security contact are Ken; data stewards are
  Linus and Grace; moderation contact is Grace. Recorded in
  [GOVERNANCE.md](../GOVERNANCE.md). Items 3 and 5 of Wave A (final data
  licence, public organisation and private reporting route) remain open.
- **2026-07-31 — Route-level rate limits, input caps, and abuse alerts added (Wave B, Operations):** every route family now has its own per-caller sliding-window limit (reads 60/min, exports 10/min, nearby and revisions 30/min, submissions 5/min, moderation 30/min, auth 10/min, search 15/min — all env-configurable via `${PREFIX}_RATE_LIMIT_MAX`/`_WINDOW_SECONDS`). Oversized payloads are capped, and repeated blocks or surges emit structured abuse alerts in which the caller is identified only by a SHA-256 hash, never the raw IP (PR #43).
- **2026-07-31 — Reviewer roles, moderation queue, decision reasons, and
  append-only audit events implemented (Wave B, Data & Trust):** every
  decision now requires a named reviewer (`actorId`) enforced against a
  role→action matrix mirroring DATA_TRUST.md separation of duties (intake
  reviewers triage but cannot publish; only record reviewers/senior moderators
  approve; privacy/safety lead owns hide/escalate; administrator may only
  escalate). A per-entity `moderation_queue` tracks assignment, sensitivity,
  second review, and escalation; sensitive/urgent items require a second,
  different reviewer before publish/reject/reverify; recusal is recorded
  without touching the record; escalation requires a mandatory note. The audit
  trail is append-only at the database layer (UPDATE/DELETE triggers raise
  ABORT) with reviewer id + role captured at write time. Schema ships as
  migration `0008` (journal-registered, drizzle-kit generate no-op) and is
  documented in ADR 0009. 362/362 tests green; fresh-DB migration 9/9.
- **2026-08-01 — Contributor accounts, sessions, and self-service erasure implemented (Wave B, Data & Trust):** registration uses email+password with salted PBKDF2-SHA256 at 210,000 iterations (OWASP 2023); sessions are opaque random tokens stored only as their SHA-256 (30-day TTL, `HttpOnly; SameSite=Strict`), with CSRF double-submit on every state-changing request and a per-caller auth rate limit (10/min). Anonymous reporting remains possible by design: a live session attributes the report to the contributor, its absence leaves the report anonymous (`contributor_id` NULL). GDPR art. 17 erasure (`DELETE /api/auth/account`) de-attributes every report in one atomic batch, revokes all sessions, and hard-deletes the account; the audit trail is never rewritten. Documented in [ADR 0013](decisions/0013-contributor-accounts-and-sessions.md) (PRs #57, #61).
- **2026-08-01 — Coarse auth roles, route-level authorization, and contributor appeals implemented (Wave B, Data & Trust):** a `users` identity table (`contributor`/`moderator`/`admin`) gates every protected route through a single `requireRole` chokepoint (401 unknown or inactive, 403 below tier); the moderation PATCH no longer trusts a client-supplied `actorId` — reviewer identity is derived server-side from the caller. A contributor can appeal a final decision (`pending → upheld | dismissed | escalated`), one pending appeal per decision; escalated appeals resolve only at the administrator, an upheld appeal returns the record to the moderation queue for a fresh decision by a different reviewer, and the original decider is blocked. Every appeal transition appends to the immutable audit trail and is filtered out of public revisions. Documented in [ADR 0014](decisions/0014-auth-roles-appeals.md) (PRs #56, #62; migration 0010).
- **2026-08-01 — Private evidence/media pipeline implemented (Wave B, Data & Trust):** `/api/photos` intake applies size/MIME/dimension caps and magic-byte container verification, strips EXIF/XMP/IPTC metadata fail-closed, stores sanitised bytes in R2 with metadata only in D1, and publishes a photo only after moderation/redaction approval for a public camera — pending or rejected evidence never leaks (PR #64, STATUS gap #3).
- **2026-08-01 — Public information-site restructure completed (Wave C item 5):** bilingual pages `/manifesto`, `/regole`, `/faq`, `/contatti`, `/privacy`, `/termini`, `/licenze`, and `/moderazione` are wired into a single global site footer with institutional links and ODbL/OSM attribution; GDPR art. 13/14 short-notice links now appear in the report, correction, and register forms; a full navigation QA pass (link resolution, accessibility, EN/IT coverage, leak and render checks) and a footer de-duplication fix keep the restructure consistent. Site structure is documented in [SITEMAP.md](SITEMAP.md). (PRs #65, #67, #68, #70, #71, #72, #73, #75, #76, #88.)
- **2026-08-01 — Local LXC 114 operations added (Wave B, Operations):** `ops/` now provides `health-check.sh` (LAN reachability and endpoint checks, run every 5 minutes), `backup-lxc114.sh` (vzdump snapshot to the NAS, 7 kept, nightly 02:30), `snapshot-pre-deploy.sh`, and `rollback-lxc114.sh` (polls the Proxmox task UPID, stops → restores → restarts the container). A live drill on 2026-08-01 backed up the container (1.02 GB in ~40 s), rolled back a pre-deploy snapshot, and brought the site back with the health check 5/5. Documented in [OPERATIONS.md](OPERATIONS.md) §8 and its appendix. (PRs #58, #60.)

## Active next plan

The reliable-local-moderation sprint is **complete** (2026-08-01): reasoned
decisions, append-only audit events, history, and fictional-data workflow
tests all shipped on `main`, together with most of its original deferrals
(accounts, roles, appeals, photo pipeline). The sprint plan and its outcome are
archived in [NEXT_SPRINT.md](NEXT_SPRINT.md); current capability is tracked in
[STATUS.md](STATUS.md).

The board sequence continues with [Wave C — verify the pilot](#wave-c--verify-the-pilot).

As of 2026-08-01 that cycle is complete on the local prototype — reasoned,
append-only audited decisions with reviewer roles and appeals (ADR 0009/0014) —
and the two items it deliberately deferred (contributor accounts and erasure,
ADR 0013; evidence/media pipeline, PR #64) have landed too. The next cycle
therefore starts beyond accounts and media; see [NEXT_SPRINT.md](NEXT_SPRINT.md)
and [STATUS.md](STATUS.md) for the current local-capability list. Public
hosting, provisioning real operator identities with MFA, versioned exports, and
Android work remain future gates.

The longer sequence from local prototype to a potential public alpha and Android
companion is maintained in the [future roadmap](FUTURE_ROADMAP.md). Its gates
are decision checkpoints, not calendar promises.

## How to work openly

- Open an issue or discussion for each ticket, linking to its workstream and acceptance evidence.
- Keep policy and architectural choices in [`docs/decisions/`](decisions/README.md) (ADR log); do not bury them in code reviews.
- Use synthetic, clearly labelled data in issues, tests, previews, and demos.
- Do not open a real submission endpoint until its moderation and privacy dependencies are complete.
- Update [STATUS.md](STATUS.md) after each completed release gate, not simply when a feature is coded.

## Coordination rhythm

During active development, maintainers should review the board regularly:

1. Check safety blockers before scheduling features.
2. Confirm each workstream has capacity for the next dependency.
3. Record decisions, risks, and scope changes publicly.
4. Release only when evidence, not optimism, satisfies the gate.
