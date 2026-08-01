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
5. **Decide:** approve, request clarification, reject, or escalate; record a reason. When approving a camera, set the publication choice for manufacturer and observation date separately, with both choices defaulting to private.
6. **Maintain:** re-check periodically and respond to corrections or removal requests.

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

## Appeals and corrections

Before public launch, the project must provide a simple, reachable way to challenge a record, request correction, or report harm. Urgent privacy/safety reports should be temporarily hidden while reviewed. Decisions and rationale should be auditable internally, without exposing reporters or reviewers. Target response times for requests, appeals, and emergency hides are proposed in [MODERATION_SLA.md](legal/MODERATION_SLA.md) — a draft for pre-launch review, not yet in force.

## Moderator safeguards

- Two-person review for sensitive or disputed records.
- Clear escalation route for legal/privacy questions.
- Separate moderation credentials from general contributor accounts.
- Training for consistent criteria and bias awareness.
- Regular review of published records, reversals, and false-positive patterns.
