# Moderation policy

## Publication standard

OpenSurveillanceDB may publish a record only when it documents visible public surveillance infrastructure, has a clear civic-transparency purpose, contains no unnecessary personal data or sensitive operational detail, and has been reviewed by a trained moderator.

## Eligible examples

- A camera visibly mounted in a public street, square, station exterior, or public building exterior.
- A publicly documented traffic-monitoring camera, where publishing the record is lawful and safe.
- A record from an official public source, marked with its source and verification date.

## Exclusions

- Residential/private cameras, including doorbells and cameras facing a private home.
- Live video, stream URLs, credentials, network information, or control interfaces.
- Detailed field-of-view or operational capability that could create a safety risk.
- Sensitive facilities or locations where publication could materially increase risk.
- Images containing identifiable people, vehicle plates, or private interiors unless safely redacted and necessary.
- Unverifiable allegations about people or organisations.

## Review flow

1. **Receive:** create a private `pending` record; acknowledge without promising publication.
2. **Screen:** remove spam, personal data, prohibited content, and dangerous details.
3. **Verify:** assess whether the camera is public, visible, current, and within local policy.
4. **Minimise:** publish the least specific location and metadata that still serves transparency. **Published coordinates are rounded to ~4 decimal places (~10 m, zone level) by default; the exact location stays in the private moderation record, visible only to moderators** (decision 2026-07-31). Optional manufacturer and observation-date values are reviewed individually; approval of the camera does not publish them.
5. **Decide:** approve, request clarification, reject, or escalate; record a reason. When approving a camera, set the publication choice for manufacturer and observation date separately (`publishManufacturer` / `publishObservedOn`), with both choices defaulting to private. Photos attached to the record follow the photo gate: approval requires confirmed redaction (`redaction_confirmed`) — the API rejects an approval without it, fail-closed — and a photo is never public without an individual approval with confirmed redaction (image upload and the moderation/redaction gate landed in [PR #64](https://github.com/Syax89/open-surveillance-db/pull/64)).
6. **Maintain:** re-check periodically and respond to corrections, removal requests, and appeals (see [Appeals and corrections](#appeals-and-corrections)).

## Photo moderation

Photo evidence (images attached to camera records) follows a dedicated fail-closed workflow (implemented in PR #64). The public can never see a photo that has not been individually approved with confirmed redaction.

### Intake (automatic, at upload)

- Only JPEG, PNG and WebP are accepted. The container is verified from magic bytes; the declared `Content-Type` is treated as a hint only, and a mismatch is rejected.
- Server-side size and dimension caps are enforced before any storage: **10 MiB** and **4096 px per side** by default (`PHOTO_MAX_BYTES` / `PHOTO_MAX_DIMENSION`).
- **EXIF/XMP/IPTC stripping is mandatory and fail-closed**: if the metadata walk cannot be completed safely, the upload is rejected (400). GPS/EXIF data never reaches storage.
- Image bytes are stored in the private R2 bucket (`PHOTOS`) under an opaque key; D1 holds metadata only. The storage key is never exposed; photos are addressed by id only.
- Every upload lands as `pending` with `exif_stripped = 1` and `redaction_confirmed = 0`. Uploads are rate-limited; attributed uploads additionally require same-origin + CSRF checks.

### Moderation decision

- Pending photos appear in the moderation queue as metadata only.
- Moderators preview the bytes through the private, edge-gated route `GET /api/moderation/photos/[id]` (fail-closed auth gate; never cached). This is the only path that serves pending/rejected bytes.
- **Approval requires the explicit `redaction_confirmed` flag: the API rejects an approval without it (fail closed).** Rejection requires only a reason code.
- Every decision writes an append-only moderation event (entity `photo`, reason code, note, reviewer pseudonym) — the same audit log as camera decisions (MODERATION_SLA.md §5).

### Publication criteria

A photo becomes public only when **all** of the following hold:

1. a moderator approved it (`status = approved`);
2. `redaction_confirmed = 1` — the moderator confirmed the subject was redacted;
3. the linked camera is itself public (public camera status and inside its review window) — the record's own publication boundary.

The public routes apply a double check (`listApprovedPhotosForCamera` + `getPublicPhoto`); anything else answers **404 fail-closed**, with no existence leak. Public responses use restrictive headers (`Content-Security-Policy: default-src 'none'; sandbox`).

Before approving, the moderator verifies that the image:

- documents the camera/infrastructure in the record (coherent with the record);
- contains **no identifiable people, vehicle plates, or private interiors** — incidental content must be safely redacted in the image before approval (the general exclusion above applies);
- contains no excluded operational detail (field-of-view capability, control surfaces, live-stream elements).

### Visibility and retention

- Pending and rejected photos are **never public** — any public request answers 404, regardless of the camera record.
- **Rejected** photos are hard-deleted **30 days** after the rejection decision (D1 row and R2 bytes) — [RETENTION_SCHEDULE.md](legal/RETENTION_SCHEDULE.md) R13, aligned with R2; they stay private for the whole window.
- **Pending** photos: 90 days from upload when never linked to a camera (orphaned); otherwise they follow the camera record lifecycle (R13). **Approved** photos follow the 12-month record renewal cycle and are hard-deleted with the record (R13/R3).
- Deletion always removes both the D1 metadata row and the R2 object bytes; the moderation decision itself remains in the audit log (R5) without the image.

### Appeals

Photo moderation decisions are appealable under [MODERATION_SLA.md](legal/MODERATION_SLA.md) (S5): within 30 days of the decision, decided by a different reviewer than the original one. The appeal window is aligned with the rejected-photo retention window (R13/R2).

## Edit moderation

Contributor edits to published records are moderated before they become public (COMMUNITY_PLAN.md § 2.2; ADR 0018). The moderation queue entry entity is **`camera_edit`**, backed by `camera_edit_requests` + a `moderation_queue` row; every decision writes an append-only `moderation_events` entry.

### Two-track flow

- **Edits to `pending` records (never public):** direct PATCH by the record owner with ownership check, CSRF + same-origin + rate-limit (bucket `edit`); anonymous/non-owner requests answer **404 fail-closed** (no-existence-oracle pattern). No moderation queue entry.
- **Edits to `verified` / `needs_review` / `stale` records (public history):** the PATCH **never mutates `cameras` in place**. It creates a `camera_edit_requests` row (explicit per-column diff) + a `moderation_queue` row (entity `camera_edit`). One open edit-request per camera at a time (partial unique, pattern `moderation_queue_open_unique`).
- **`removed` / `rejected` (terminal) records:** edits blocked, no queue entry (**409**).

### Standard applied to edits

- Editable fields are the POST `/api/cameras` whitelist: `title`, `kind`, `address`, `notes`, `manufacturer`, `observedOn`, `description`. **Never editable:** `status`, `contributor_id`, `source`, `publish_manufacturer`/`publish_observed_on` (moderator decisions), `last_verified_at`/`review_due_at` (freshness clock). Proposed coordinates are rounded (~10 m) + sensitivity-reviewed.
- An edit must be accurate to the best of the contributor's knowledge, limited to what the record actually supports, and must not introduce prohibited content (TERMS_OF_USE.md § 4).
- **Approve** applies the diff and writes `moderation_events` action `edit_applied`; **reject** writes `edit_rejected`. A no-op edit (same content) returns 200 "no changes" and writes no event (anti-farming, ADR 0018).
- Moderators/admins who are **not the record owner** act only through the moderation endpoints (403 on the edit API); they never bypass the queue.

### Emergency hide and appeals

- An edit that turns out harmful (safety risk, personal data, prohibited content) is handled through the existing emergency flow ([MODERATION_SLA.md](legal/MODERATION_SLA.md) S1: temporary hide within **24 h**) and the removal path of TERMS_OF_USE.md § 11; the revert keeps the audit trail in the revision history (RETENTION_SCHEDULE.md R14).
- Decisions on edits — rejection, revert, or hide of a submitted edit, and published edits later found inaccurate — are appealable under the same path as other moderation decisions ([ADR 0014](decisions/0014-auth-roles-appeals.md), MODERATION_SLA.md S5/S6): within **30 days**, decided by a **different reviewer** than the original decision, with escalation to the advisory circle for disputed cases. The edit queue follows the same SLA as the submission queue.

## Appeals and corrections

A contributor who disagrees with a recorded moderation decision can challenge it through the implemented appeal workflow ([ADR 0014](decisions/0014-auth-roles-appeals.md), routes `/api/appeals`): file, list, decide. Any authenticated user with at least the `contributor` role may file an appeal (`POST /api/appeals`); moderators and admins list and decide them (`GET /api/appeals`, `PATCH /api/appeals/:id`).

- **File:** contest a *final* decision event (a status change on a camera or correction request). Intent events — recusals, escalations, second-review steps — cannot be appealed. One pending appeal per decision (a duplicate is rejected, 409); the appeal is attributed to the appellant's account and rate-limited.
- **Decide:** an independent senior moderator — never the reviewer who made the original decision (recusal enforced, 409) — decides `uphold`, `dismiss`, or `escalate`. An escalated appeal may only be resolved by the administrator and requires a note explaining the reason. The acting reviewer is derived server-side from the authenticated user's linked reviewer profile.
- **Outcome:** `uphold` reverses the decision — the record returns to the moderation queue (`pending`) for a fresh decision by a different reviewer; an upheld appeal never publishes anything by itself. `dismiss` leaves the original decision standing.
- **Audit:** every appeal transition writes an append-only moderation event (`appeal-filed` / `appeal-uphold` / `appeal-dismiss` / `appeal-escalate`). Appeals, like recusals and escalations, are internal workflow and never appear in the public revision history.
- **Correction association (H1, t_69891619):** a correction request is resolved with a record outcome — approve requires one (`kept`/verified, `corrected`, `removed`, `marked-stale`, `escalated`), which drives the record lifecycle when it applies, and the new `associate` decision links a still-pending request to a record without deciding it. The moderator dashboard exposes a private per-record correction history (`GET /api/moderation/corrections?cameraId=N`) with pending and resolved requests plus their append-only decision trail; contact details and reviewer attribution never leave the gated moderation API.

Urgent privacy/safety reports can be temporarily hidden while reviewed (emergency flow, [MODERATION_SLA.md](legal/MODERATION_SLA.md) S1), and decisions and rationale are auditable internally without exposing reporters or reviewers. The public, bilingual page `/moderazione` explains this workflow in plain language. Target response times for requests, appeals, and emergency hides are defined in [MODERATION_SLA.md](legal/MODERATION_SLA.md) — still a draft for pre-launch review, not yet in force; the appeal workflow itself is live in the prototype ([ADR 0014](decisions/0014-auth-roles-appeals.md)).

## Moderator safeguards

- **Coarse role separation on every protected route** (`requireRole`, [ADR 0014](decisions/0014-auth-roles-appeals.md)): the moderation queue and appeal decisions require a `moderator` or `admin` account; any authenticated `contributor` may file an appeal; camera submission, correction intake, and all public read surfaces need no account. Unknown or inactive identities get 401, callers below the required tier 403. The acting reviewer is derived server-side from the authenticated user's linked reviewer profile — never client-chosen.
- **Granular reviewer roles** ([ADR 0009](decisions/0009-reviewer-roles-moderation-queue.md)): a role → action matrix gates moderation actions in the database layer. Intake reviewers may triage (reject, hide, escalate) but never publish; only `record_reviewer` and `senior_moderator` may approve; the administrator may only escalate.
- **Two-person review** for sensitive or disputed records: approve, reject, and reverify decisions on a sensitive/flagged item require a second reviewer. Emergency hides stay single-person so harm can be stopped immediately, but they are reviewed retrospectively ([DATA_TRUST.md](workstreams/DATA_TRUST.md)).
- **Recusal:** the reviewer who made the original decision cannot decide the appeal (409); a moderator with no linked reviewer profile is rejected 403 before any write.
- **Escalation:** a clear escalation route for legal/privacy questions — items and appeals escalate to senior moderators, the privacy/safety lead, or the administrator, and escalation requires a note.
- Separate moderation credentials from general contributor accounts.
- Training for consistent criteria and bias awareness.
- Regular review of published records, reversals, and false-positive patterns.
