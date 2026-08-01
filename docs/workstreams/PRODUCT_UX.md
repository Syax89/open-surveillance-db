# Product, UX, and accessibility workstream

## Mandate

Design a clear, low-risk public experience for discovering reviewed information about visible public surveillance infrastructure. The product must support civic understanding, correction, and accountable data stewardship; it must not become a source of live feeds, operational intelligence, personal-data collection, or guidance for evading surveillance.

This workstream turns the release gates in the [development plan](../DEVELOPMENT_PLAN.md) into user-facing requirements. It is a public-alpha plan, not a claim that the current local prototype is ready to receive real reports.

## Public-alpha objectives

The first public alpha is a deliberately narrow pilot in one reviewed jurisdiction. Its objectives are to:

1. Let anyone browse a small set of human-reviewed, clearly attributed records without creating an account.
2. Make it easy to find a location through a map **and** an equivalent list/search experience.
3. Let a contributor privately submit a possible record, with clear eligibility guidance and no promise of publication.
4. Let affected people and the public request a correction, review, or urgent temporary hide of a published record.
5. Explain record status, source, last verification, licensing, privacy limits, and the limits of the dataset in plain language.
6. Work on a small phone screen, with keyboard and assistive-technology access, in the pilot language and English.

### Alpha scope boundary

- Only reviewed `verified` records are public; illustrative `demo` data is never mixed with real records without prominent labelling.
- No public field of view, live-feed URL, credentials, precise operational capabilities, or other sensitive detail.
- Photos are out of scope until the separate evidence, redaction, retention, and moderation pipeline is operating.
- Browsing does not require an account. Submission authentication and rate limiting must be chosen before accepting real reports.
- The product must name the pilot area and state that absence from the map does not mean absence of surveillance.

## Primary users and jobs

| User | Need | Product response |
| --- | --- | --- |
| Resident or visitor | Understand what reviewed public records exist near a place | Map and accessible results list, source and verification information, clear data limitations |
| Community contributor | Share a possible visible public camera responsibly | Guided private submission, safety checks, acknowledgement, no immediate publication |
| Person affected by a record | Correct an error or report potential harm | Fast correction/removal path, reference ID, expected response route |
| Moderator | Make consistent decisions without exposing reporter data | This workstream supplies user-facing status and reason language; the moderator workspace is specified elsewhere |
| Researcher or civic group | Reuse reviewed data transparently | Documented export, license/provenance context, and a clear distinction from OSM data |

## Target user journeys

The four core journeys map to the public tool routes introduced by the
frontend refactor (F1, `docs/FRONTEND_PLAN.md` §1.2): **Browse** → `/mappa`
+ `/directory`; **Search** → `/directory` (and `/mappa` filters); **Submit**
→ `/segnala`; **Correct** → `/correggi`. The home page is the hub that links
the four tools; the map and the directory are separate pages, each with its
own URL, so a journey can be deep-linked and bookmarked.

### 1. Browse

1. A visitor opens the site and sees a short purpose statement, pilot-area
   notice, privacy/safety boundary, and a choice between **Map**
   (`/mappa`) and **Directory** (`/directory`).
2. The map (`/mappa`) loads reviewed public records in the current area. A
   text alternative — the directory (`/directory`) — lists the same records
   without requiring map interaction.
3. The visitor selects a marker or list item and opens a record summary:
   type, general location, source type, verification date, status, and
   record ID.
4. The visitor can open the full public record, download the reviewed
   dataset, or use **Report an issue with this record** (`/correggi`).

**Success condition:** a visitor can find and understand a record without
using a mouse, colour cues, or a map gesture.

### 2. Search

1. The visitor enters a locality, neighbourhood, public address, or
   coordinate in a labelled search field on `/directory` (or filters the
   map on `/mappa`).
2. The interface returns matching reviewed records and indicates the search
   area. It does not imply exhaustive coverage.
3. Filters allow only low-risk, explained categories (for example, camera
   type and verification freshness), with a visible reset action.
4. A zero-result state says that no **published record** was found and
   offers a route to submit a private observation (`/segnala`) or learn
   about coverage limits.

**Success condition:** search is usable without precise geographic knowledge
and zero results are not misrepresented as proof that no camera exists.

### 3. Submit a possible record

1. The contributor reads a short eligibility check on `/segnala`: visible
   public infrastructure only; no private homes, people, plates, live
   feeds, credentials, or sensitive-site details.
2. The contributor selects a location by search, entering coordinates, or
   choosing a point on the map. The form explains that the published
   location may be generalised.
3. The contributor supplies only the minimum structured information:
   observation type, general location, source/observation date, and optional
   factual note. Brand is optional and subject to review; direction or
   coverage is not requested in alpha.
4. Before submit, a review screen repeats the privacy warning,
   license/contribution statement, and the fact that the report is private
   and may be rejected or edited.
5. The service validates fields, creates a non-public reference ID, and
   shows an acknowledgement with no public link. It gives a way to add
   clarification or withdraw the report where the identity model permits.

**Success condition:** no newly submitted record appears in public map,
public API, search, or export before a human approval decision.

### 4. Correct, challenge, or request removal

1. Each public record has a prominent **Report an issue** link to
   `/correggi`; the site also offers a general contact route (`/contatti`)
   for people who cannot locate a record.
2. The requester chooses an issue type on `/correggi`: inaccurate,
   outdated, privacy/safety concern, duplicate, or other; they can provide
   minimal supporting context. A `?record=ID` parameter pre-fills the
   related record.
3. For credible urgent privacy or safety concerns, the interface confirms
   that the record can be temporarily hidden while reviewed; it never
   promises an automatic outcome.
4. The requester receives a private reference ID and an explanation of the
   review/appeal path. Public pages show a neutral status such as “under
   review” only when it is safe to do so.

**Success condition:** a correction can be started without an account, and
its details do not become public or leak through API/export/logs.

## Prioritised backlog

### Must have for public alpha

| Item | Outcome |
| --- | --- |
| Public record page and accessible list alternative | Every visible map record has a keyboard-accessible, indexable text representation. |
| Locality/address/coordinate search | Visitors can navigate the reviewed pilot dataset without depending only on the map. |
| Clear status, provenance, and freshness labels | Users can distinguish verified, pending (never public), and demo data, and see source type and date. |
| Guided private submission | Eligibility, minimisation, validation, acknowledgement, and an explicit pre-publication review state are present. |
| Correction/takedown entry point | Every public record and site footer link to a low-friction, private issue flow. |
| Empty, error, loading, and offline states | The interface does not silently fail or overstate data coverage. The standard state set is `{loading, empty, not-found, error, offline}`, each with title + body + recovery action (see `docs/REFACTOR_I18N.md`, "Microcopy standards"). |
| Mobile responsive interaction | Core browse, search, submit, and correction tasks work at 320 CSS px width and without hover. |
| Accessibility baseline | Semantic structure, focus management, keyboard map alternative, contrast, labels, and screen-reader announcements are verified. |
| Pilot-language and English copy | All safety-critical and consent/review messages are translated and reviewed by a human speaker. |
| Non-commercial privacy-preserving measurement | Minimal aggregate telemetry with an opt-out/consent design appropriate to the jurisdiction; no ad tracking or behavioural profiles. |

### Should have after the alpha is stable

| Item | Outcome |
| --- | --- |
| Low-risk filters and sort controls | Search results can be narrowed by safe category, source type, and verification recency. |
| Saved shareable search URLs | A visitor can share a public search state without exposing contributor or correction data. |
| Record change summary | Public record pages show meaningful reviewed updates and last verification, not internal identities or notes. |
| Guided duplicate warning | Submitters are shown nearby published records and can choose correction rather than creating a duplicate. |
| Plain-language data dictionary | Category names, status meanings, source types, and location precision are explained in context. |
| Usability feedback route | Visitors can report an interface barrier without being forced to create an account; design recorded in [ADR 0006](../decisions/0006-non-sensitive-usability-feedback-route.md). |
| Additional locale framework | Translations can be added without hard-coded strings or layout breakage. |

### Could have after policies and moderation capacity permit

| Item | Outcome |
| --- | --- |
| Optional pseudonymous contributor accounts | Support report follow-up and anti-abuse controls with minimal identity data. |
| Accessible comparison/timeline view | Show aggregate, reviewed change over time without exposing sensitive details. |
| Community translation workflow | Let trusted volunteers propose translations with review and versioning. |
| Progressive web-app shell | Improve return visits and low-connectivity browsing without bulk-downloading map tiles or unpublished data. |
| Android companion | Reuse the same private submission and moderation workflow only after the web product is safe and stable. |

## Acceptance criteria

Public alpha may proceed only when the following can be demonstrated in a test environment with fictional records and a reviewed pilot policy.

| Area | Acceptance criteria |
| --- | --- |
| Browse | A published record can be found from map and list; the two presentations expose matching public fields and record ID. No `pending`, rejected, removed, reporter, or moderation data is reachable through the UI. |
| Search | Keyboard users can focus, type, submit, change filters, clear filters, and open a result. Searches return a clear result count, a text description of the selected area, and a truthful zero-result state. |
| Submission | Required fields have visible labels and helpful validation. The confirmation explains that a report is private, reviewed by humans, and may not be published. A test submission remains absent from public endpoints and exports. |
| Correction | A record-level and a general correction route exist. The request form collects only necessary context, returns a reference ID, and shows emergency/privacy contact guidance. |
| Accessibility | Core journeys pass automated checks and manual keyboard/screen-reader testing; all functionality has a visible focus state; status is not conveyed by colour alone; and the list alternative remains usable if map scripts fail. |
| Mobile | At 320 CSS px and 200% browser zoom, text reflows without horizontal scrolling for core tasks, touch targets are at least 44 by 44 CSS px where practical, and map actions have non-map alternatives. |
| i18n | No safety-critical content is left untranslated in a supported locale. Dates, coordinates, languages, directionality, and text expansion are tested. The user may choose a language without losing entered form data. |
| Content safety | No alpha UI asks for or displays live feeds, credentials, private-camera locations, face/plate imagery, or detailed field-of-view/capability information. |
| Trust | Every public record exposes source type, reviewed status, and last verification; the site explains data limitations and links the correction process. |

## Accessibility, mobile, and internationalisation requirements

### Accessibility

- Target WCAG 2.2 AA for the public website, with manual testing by disabled users before widening the pilot.
- Use semantic headings, landmarks, native controls where possible, descriptive labels, and concise error messages tied to fields.
- Provide a functional list/search experience equivalent to map exploration. Leaflet controls alone are not sufficient.
- Announce asynchronous results, validation errors, saved drafts, and submission outcomes to assistive technologies without moving focus unexpectedly.
- Support keyboard operation in a logical order; use a visible skip link and never trap focus in panels or dialogs.
- Meet colour contrast requirements and pair status colours with text/icon labels. Respect reduced-motion and user contrast preferences.
- Do not encode critical instructions only in images, map position, colour, or a gesture.
- Publish an [accessibility statement](../ACCESSIBILITY_STATEMENT.md) and a non-sensitive barrier-reporting route ([ADR 0006](../decisions/0006-non-sensitive-usability-feedback-route.md)); reported barriers receive a time-bound response (see the statement's response commitment).

### Mobile

- Design mobile-first; do not hide submission, correction, source, or safety information behind hover-only controls.
- Let users enter or search a location instead of requiring a precise map tap. Confirm selected coordinates in readable text.
- Avoid persistent, full-screen map overlays that obscure results or form controls.
- Preserve form progress on accidental orientation change or transient network failure when doing so does not retain sensitive data longer than declared.
- Keep page weight modest and degrade gracefully on slow connections; never prefetch a large map area or offline tile set from the community OSM service.

### Internationalisation

- Start with English and the pilot jurisdiction's primary language; publish the supported-language list and a fallback policy.
- Externalise every user-visible string, including errors, consent, moderation states, alt text, and date/status formats.
- Use locale-aware formatting for dates and numbers while keeping coordinates unambiguous and copyable.
- Avoid culture-specific assumptions about address order, camera terminology, legal roles, or the availability of formal postal addresses.
- Treat translation of privacy, safety, consent, and moderation text as a reviewed policy change, not a mechanical task.
- **Semantic parity, not just structural parity.** Type-checked EN/IT key
  parity (`Translation<typeof en>`) guarantees the *shape* of a bundle, not
  that the Italian copy says the same thing. Real regressions were found in
  `auth.ts` (`loggedOutTitle`, `accountDeletedBody` translated as "logged
  in" instead of "logged out"; `createOne` as "Crealo") — a **human review
  of every Italian string** is required before the redesign ships
  (`docs/FRONTEND_PLAN.md` §5.1).
- **Conceptual mapping, not one file per route.** The user-facing domains
  (home, directory, report, moderation, auth, info, legal) map to the
  per-domain bundles in `app/lib/i18n/`; the table lives in
  `docs/SITEMAP.md` ("i18n message bundles") and `docs/REFACTOR_I18N.md`.
  No monolithic `info`/`legal` bundle is created; legal content stays in the
  typed `app/lib/legal/` layer.

## Non-commercial success measures

Measure public value and safety, not engagement, growth, or monetisation. Aggregate metrics must not identify visitors or contributors and must follow the eventual privacy notice.

| Measure | Why it matters | Example review cadence |
| --- | --- | --- |
| Share of public records with source, date, and complete required fields | Indicates data transparency and quality | Monthly |
| Median correction and urgent-hide response time | Indicates accountability to affected people | Monthly, with aggregate publication |
| Correction, removal, and reversal rate | Reveals data quality and moderation weaknesses | Monthly/quarterly |
| Median moderation turnaround and rejection reasons | Checks whether the submission flow and moderator capacity are workable | Monthly |
| Accessibility task completion and reported barriers | Measures whether people can actually use the service | Each release and quarterly |
| Search zero-result rate by pilot area | Helps identify coverage gaps without claiming absence of cameras | Monthly |
| Export/API reliability and public-data freshness | Measures usefulness of the open database | Monthly |
| Privacy/safety incidents and time to containment | Measures harm prevention; high-severity details remain confidential | Quarterly transparency report |

Do not use metrics such as ad impressions, individual behavioural profiles, time-on-site optimisation, or contributor ranking as product goals.

## Product and UX risks

| Risk | Product safeguard | Escalation signal |
| --- | --- | --- |
| Users treat the map as complete or real-time | Persistent coverage and freshness language; truthful zero-result state | Repeated reports of missed/stale entries |
| A report exposes private or sensitive information | Strict eligibility copy, minimum fields, private-by-default queue, reviewer checks | Credible privacy/safety request or prohibited content |
| Map-only interaction excludes users | Equivalent list/search flow and manual accessibility testing | Core task cannot be completed without map gesture |
| Detailed metadata creates operational risk | Exclude field-of-view, coverage, credentials, and sensitive capability fields from alpha | Requests to add risky information or local policy concern |
| Abuse, spam, or coordinated false reports | Rate limits, duplicate signals, private queue, moderation audit trail | Sudden volume change, repeated sources, or targeted locations |
| Language ambiguity causes unsafe submissions | Reviewed translations, plain terms, examples and exclusions | High rejection/error rate tied to locale or category |
| Small screens cause accidental disclosure or poor input | Mobile-first form design, readable coordinate confirmation, draft safety rules | High mobile abandonment or wrong-location corrections |
| Third-party map dependence conflicts with OSM policy | Follow the documented tile-provider plan and preserve attribution | Traffic/terms warning or inability to sustain service |
| Metrics become surveillance of users | Aggregate, minimal, documented measurement only; no ad-tech SDKs | Telemetry requires identity or granular behavioural data |

## Open decision log for this workstream

Before public alpha, maintainers must publicly record decisions on:

1. The pilot jurisdiction, supported languages, and local terminology.
2. Which record fields are safe to show at what geographic precision.
3. The account, rate-limit, acknowledgement, and withdrawal model for submissions.
4. The correction/removal service-level target and urgent escalation contact.
5. The accessibility test method, participants, and known exceptions (draft position in the [accessibility statement](../ACCESSIBILITY_STATEMENT.md)).
6. The privacy-preserving metrics configuration and retention period.

Material decisions belong in `docs/decisions/` and must be linked from the development plan before the affected feature is opened to the public.
