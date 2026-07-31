# Development plan

## North-star outcome

Create a trustworthy, international, open database of visible public surveillance cameras that helps people understand surveillance in shared space. The database should be searchable and reusable while minimising harm, respecting privacy, and keeping a human reviewer in the publication loop.

## Non-goals

- Hosting, embedding, or linking to live video feeds.
- Identifying people, vehicles, officers, security staff, or private residents.
- Providing tactics to bypass, disable, or evade surveillance.
- Mapping private residential cameras or security arrangements of sensitive sites.
- Advertising, data brokerage, paid access, or behavioural profiling.

## Workstreams

| Workstream | Goal | Launch evidence |
| --- | --- | --- |
| Product | Clear map, search, submission, and correction flow | Usability and accessibility tests pass |
| Data | Consistent, attributable, exportable records | Schema, provenance, and quality rules published |
| Trust & safety | No unreviewed harmful publication | Moderation queue, audit trail, appeals, redaction process |
| Privacy & legal | Lawful, minimal, accountable handling | Jurisdictional review and public policy pages |
| Operations | Reliable public service | Backups, monitoring, incident plan, tile-provider plan |
| Community | Transparent collaboration | Governance, code of conduct, contributor guidance |

The detailed workstream plans and their coordination order are in the
[execution board](EXECUTION_BOARD.md). They are living documents: changes to
scope, safety boundaries, or release gates must be recorded openly.

## Phases and release gates

### 0. Foundation — current local prototype

**Objective:** validate the core experience without gathering real data.

- Map, demo pins, record API, GeoJSON export, and pending-submission path.
- Publish architecture, data, moderation, safety, and licensing proposals.
- Keep all seeded records fictional or explicitly illustrative.

**Exit gate:** docs reviewed by initial maintainers; no accidental real data or public endpoint.

### 1. Public-alpha preparation

**Objective:** make a narrowly scoped pilot safe to operate.

- Select one jurisdiction and consult local digital-rights/privacy expertise.
- Finalise eligibility rules for public cameras and exclusion zones.
- Add login/rate limits, abuse reporting, reviewer roles, decision reasons, and audit logs.
- Add image pipeline: consent/rights assertion, EXIF removal, face/plate redaction where needed, malware scanning, and private staging.
- Publish privacy notice, terms, moderation policy, appeal method, and responsible contact.
- Adopt a compliant production tile provider or self-hosted map stack.

**Exit gate:** tested moderation workflow; legal/privacy sign-off for pilot scope; operations owner and incident contacts named.

### 2. Limited public beta

**Objective:** publish reviewed records for a small, clearly defined area.

- Invite a small group of contributors and moderators.
- Keep every new report private until reviewed.
- Show status, source type, last verification date, and correction/report links.
- Release database snapshots and GeoJSON using the chosen data license.
- Run accessibility, security, and abuse-testing rounds.

**Success measures:** review turnaround, correction rate, record completeness, contributor retention, and zero unresolved high-severity privacy incidents.

### 3. Multi-city, open-data beta

**Objective:** scale carefully without weakening review quality.

- Add locality-specific guidance and moderation capacity before opening each new area.
- Add duplicate detection, data-confidence scoring, change history, bulk import review, and map filters.
- Publish API documentation, reproducible exports, and changelogs.
- Establish appeals, moderator training, and regular transparency reports.

**Exit gate:** evidence that review capacity and operational costs scale with contribution volume.

### 4. Android companion

**Objective:** support field reporting only after the web workflow is safe and stable.

- Start with browse/search, a guided report draft, and privacy reminders.
- Send drafts to the same backend moderation queue; do not publish from the device.
- Use minimal location permissions and explicit photo handling.
- Release the app as open source, with reproducible builds where practical.

## Near-term backlog

1. Replace demo-only D1 bootstrapping with migrations applied by deployment tooling.
2. Add record detail pages and an explicit correction/takedown request path.
3. Design reviewer roles, audit log, and review reasons.
4. Define photo safety pipeline before adding uploads.
5. Add automated tests for input validation, publication filtering, and GeoJSON output.
6. Select a host, tile strategy, domain, and public repository only after the policy foundations are ready.

## Definition of “publicly ready”

No feature is publicly ready merely because it works on a developer machine. The service becomes publicly ready only when all of the following are true:

- real submissions remain unpublished until human review;
- users can request a correction or removal;
- privacy, moderation, and security contacts are reachable;
- data provenance and license are visible;
- backups, logs, rate limits, and incident response are operating;
- map use complies with the chosen provider's terms; and
- the public repository contains enough documentation to reproduce the system.
