# Moderation policy (community-driven model — ADR 0021)

## Publication model

OpenSurveillanceDB is **community-driven**: reports from verified contributor accounts are **published immediately** (`status = 'active'`), with no review queue and no human moderation in the normal flow (ADR 0021 § 1). Accuracy and freshness are maintained by the community through automatic, trust-weighted actions — `like`, `confirm`, `gone`, `problem`, `privacy` — that trigger record transitions at fixed thresholds (ADR 0021 § 3/§ 4). Every transition is recorded in the record's **public lifecycle history without attribution** (ADR 0021 § 7).

The only residual human steps are:

1. the **photo redaction gate** — a photo is never public until a moderator approves it with confirmed redaction (`redaction_confirmed = 1`); this acts on the **photo's own status**, never on the record lifecycle (TERMS § 6.3);
2. the **legal-emergency admin hide/remove** — the only human write power over the record lifecycle (ADR 0021 § 8).

The retired human review cycle is not part of this model; the retired review tables were closed by migration and survive only as history (ADR 0021 § 7.3, migration plan).

## Publication standard

OpenSurveillanceDB may publish a record only when it documents visible public surveillance infrastructure and has a clear civic-transparency purpose. Because publication is immediate, the standard is enforced **ex ante by the submitter** (terms of use) and **ex post by the community** (actions and thresholds) — not by a pre-publication reviewer.

## Eligible examples

- A camera visibly mounted in a public street, square, station exterior, or public building exterior.
- A publicly documented traffic-monitoring camera, where publishing the record is lawful and safe.
- A record from an official public source, marked with its source (and its verification date where the source provides one).

## Exclusions

- Residential/private cameras, including doorbells and cameras facing a private home.
- Live video, stream URLs, credentials, network information, or control interfaces.
- Detailed field-of-view or operational capability that could create a safety risk.
- Sensitive facilities or locations where publication could materially increase risk.
- Images containing identifiable people, vehicle plates, or private interiors unless safely redacted and necessary (the photo gate below).
- Unverifiable allegations about people or organisations.

These exclusions bind every submitter (TERMS § 4); violations are handled by the community thresholds (hide/remove) or, in legal emergencies, by the administrator.

## Community moderation (automatic, no human in the loop)

- **Actions:** verified accounts may `like`, `confirm`, `gone`, `problem` or `privacy` a record — one action per user per record (`UNIQUE(camera_id, contributor_id)`), switchable; self-like/self-confirm are blocked (403); self-gone/problem/privacy are allowed (own data, own camera).
- **Thresholds (trust-weighted, tunable):** `gone` sum ≥ 3 (≥ 3 distinct) → `removed`; `problem` sum ≥ 3 (≥ 2 distinct) → `hidden`; `privacy` ≥ 1 → `hidden` immediately (prudential); reversal requires contrary consensus (`confirm` sums) and, for privacy hides, a cooldown (default 7 days).
- **Transitions are events:** every state change writes a public `camera_lifecycle_events` row (no attribution) and an internal append-only audit entry; trigger actions are consumed so the state is stable until new consensus forms.
- **No transition happens on a timer** (ADR 0021 § 2.2): a record is never moved to another lifecycle state by the passing of time; a record nobody confirms stays `active` until the community says otherwise.

Full mechanics: ADR 0021 § 3–§ 6; DATA_MODEL.md.

## Photo moderation (residual human gate — photo status only)

Photo evidence (images attached to camera records) follows a dedicated fail-closed workflow (implemented in PR #64). The public can never see a photo that has not been individually approved with confirmed redaction. Photo statuses (`pending`/`approved`/`rejected`) are **photo-level states only** — they never change the record's own status.

### Intake (automatic, at upload)

- Only JPEG, PNG and WebP are accepted. The container is verified from magic bytes; the declared `Content-Type` is treated as a hint only, and a mismatch is rejected.
- Server-side size and dimension caps are enforced before any storage: **10 MiB** and **4096 px per side** by default (`PHOTO_MAX_BYTES` / `PHOTO_MAX_DIMENSION`).
- **EXIF/XMP/IPTC stripping is mandatory and fail-closed**: if the metadata walk cannot be completed safely, the upload is rejected (400). GPS/EXIF data never reaches storage.
- Image bytes are stored in the private R2 bucket (`PHOTOS`) under an opaque key; D1 holds metadata only. The storage key is never exposed; photos are addressed by id only.
- Every upload lands as `pending` with `exif_stripped = 1` and `redaction_confirmed = 0`. Uploads are rate-limited; attributed uploads additionally require same-origin + CSRF checks.

### Moderation decision

- Pending photos appear in the photo moderation surface as metadata only.
- Moderators preview the bytes through the private, edge-gated route `GET /api/moderation/photos/[id]` (fail-closed auth gate; never cached). This is the only path that serves pending/rejected bytes.
- **Approval requires the explicit `redaction_confirmed` flag: the API rejects an approval without it (fail closed).** Rejection requires only a reason code.
- Every decision writes an append-only moderation event (entity `photo`, reason code, note, reviewer pseudonym) — the same audit log as legal-emergency actions (MODERATION_SLA.md § 5).

### Publication criteria

A photo becomes public only when **all** of the following hold:

1. a moderator approved it (`status = approved`);
2. `redaction_confirmed = 1` — the moderator confirmed the subject was redacted;
3. the linked record is itself public (`active` status) — the record's own publication boundary.

The public routes apply a double check (`listApprovedPhotosForCamera` + `getPublicPhoto`); anything else answers **404 fail-closed**, with no existence leak. Public responses use restrictive headers (`Content-Security-Policy: default-src 'none'; sandbox`).

Before approving, the moderator verifies that the image:

- documents the camera/infrastructure in the record (coherent with the record);
- contains **no identifiable people, vehicle plates, or private interiors** — incidental content must be safely redacted in the image before approval (the general exclusion above applies);
- contains no excluded operational detail (field-of-view capability, control surfaces, live-stream elements).

### Visibility and retention

- Pending and rejected photos are **never public** — any public request answers 404, regardless of the record.
- **Rejected** photos are hard-deleted **30 days** after the rejection decision (D1 row and R2 bytes) — [RETENTION_SCHEDULE.md](legal/RETENTION_SCHEDULE.md) R13; they stay private for the whole window.
- **Pending** photos: 90 days from upload when never linked to a record (orphaned); otherwise they follow the record (R13). **Approved** photos follow the **record's retention** (R13/R1) and are **hard-deleted immediately when the record is withdrawn** (`hidden`/`removed`) or deleted — the withdrawal removes the image bytes, not only the database row.
- Deletion always removes both the D1 metadata row and the R2 object bytes; the moderation decision itself remains in the audit log (R5) without the image.

Photo decisions have no review workflow: the community-driven model handles challenges through community actions or the private correction path (ADR 0021 § 7).

## Legal-emergency admin actions (the only human write power over the record lifecycle)

ADR 0021 § 8: the **only** remaining human write action on a record is the administrator's legal-emergency hide/removal:

- **Who:** the administrator (ADR 0009 role model), never the intake/record reviewers — they have no normal-flow duties anymore (roles stay defined in the schema, unused).
- **When:** when the law requires it (e.g. court order, privacy breach, sensitive personal data) or an emergency exclusion applies (live stream, credentials, control interfaces, harassment).
- **How:** `hide` / `remove` with a **mandatory reason code** (single-person by design so harm can be stopped immediately; **reviewed retrospectively**).
- **Produces:** a public `hidden`/`removed` event with reason `admin-legal` (no attribution) and an internal audit entry (MODERATION_SLA.md § 3/§ 5).
- **Reversal:** administrators **cannot restore or un-hide unilaterally** — the community's contrary consensus is the only reversal path (ADR 0021 § 6.2), so no single account — human or not — controls publication.

## Corrections and rights

- **Private corrections:** any person may request a correction or removal via the private correction form or `privacy@opensurveillancedb.org` (TERMS § 6.2). Requests are private, reviewed by a person, and never change the map automatically. Response targets: 48 h first response / 14 days substantive (MODERATION_SLA.md S2/S3).
- **Data-subject rights:** correction (art. 16), erasure (art. 17) and the other GDPR rights are exercised through the privacy contact (PRIVACY_NOTICE.md § 8); erasure covers the account, its community actions and its attributed records.

## Moderator safeguards (residual surfaces)

- **Role separation on every protected route** (`requireRole`, ADR 0014/0009): photo approval and legal-emergency actions require a `moderator`/`admin` account; unknown or inactive identities get 401, callers below the required tier 403. The acting reviewer is derived server-side from the authenticated user's linked reviewer profile — never client-chosen.
- **Append-only audit trail:** every photo decision and legal-emergency action writes a `moderation_events` entry (decision, reason code, timestamp, reviewer **pseudonym** — never the raw email, M4); the trail is internal and never public (aggregate transparency reports only; 2-year retention R5).
- **Retrospective review:** legal-emergency hides/removals and photo decisions are reviewed retrospectively by the privacy/legal owner (MODERATION_SLA.md S4).
- Separate moderation credentials from general contributor accounts; training for consistent redaction criteria and exclusion handling.
- **Jurisdiction playbook (M5):** before accepting records from a new jurisdiction, the first 2-3 operating jurisdictions (start: IT, DE) get a short legal playbook — minimum training for moderators, national rules for official-source records (e.g. Italy: D.Lgs. 196/2003, D.Lgs. 33/2013 transparency), and the Garante / supervisory authority contact. This outline is the template.
