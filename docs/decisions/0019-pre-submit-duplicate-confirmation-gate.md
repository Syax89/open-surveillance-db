# ADR 0019: Pre-submit duplicate confirmation gate

- **Status:** accepted
- **Date:** 2026-08-02
- **Author:** Linus (Backend/API)
- **Related ADRs:** 0001 (public data boundary), 0008 (data licence,
  precision, retention), 0013 (contributor accounts and sessions),
  0018 (community verifications, trust levels and contribution editing)
- **Related docs:** `docs/roadmap.md` (Horizon 1 — data quality and
  lifecycle), `docs/COMMUNITY_PLAN.md` (community system), `docs/qa/` (C-QA
  anti-gaming report)

## Context

Horizon 1 of the future roadmap asks to "detect likely duplicates before a
contributor submits a new record". At the time of writing the duplicate
detection exists in two non-blocking forms:

1. A client-side warning on `/segnala`: when a position is picked, the form
   calls `GET /api/cameras/nearby` (radius 75 m) and shows the nearby
   reviewed records in a `duplicate-alert` box. The contributor can ignore it
   and submit anyway.
2. A server-side check in `POST /api/cameras` that runs **after** the record
   is inserted and returns the candidates as `possibleDuplicates` in the
   `201` response, purely informational.

Neither form prevents a likely duplicate from being stored. The gap is not
the detection — the pure primitives (`app/lib/duplicate-detection.ts`) and
the `findNearbyPublicCameras` helper already classify candidates into
`high` / `medium` / `low` strength (same spot ≤ 25 m; ≤ 75 m with or without
matching text; text upgrade up to 200 m). The gap is that nothing makes the
contributor act on the signal before the record exists.

The decision to record: what threshold turns the warning into a gate, and
whether that gate is a hard block or an explicit confirmation.

## Decision

### 1. A "high"-strength candidate forces an explicit confirmation

1. `POST /api/cameras` runs the duplicate check **before** `createPendingCamera`
   (previously after the insert), on the same cleaned, validated fields and
   the same 75 m radius.
2. The gate trips when any candidate has `matchStrength === "high"` — i.e.
   essentially the same spot (≤ 25 m) or ≤ 75 m with matching text
   (similarity ≥ 0.6). This is the "very close match" label already shown in
   the UI. Medium and low candidates stay informational and never block.
3. When the gate trips and the payload does **not** carry
   `duplicateConfirmed: true` (strictly boolean `true`; `"true"`, `1`, any
   other value fail closed), the route answers **409 Conflict** with
   `{ error, possibleDuplicates }` and **no row is written** — no camera, no
   photo linking.
4. With `duplicateConfirmed: true` the report is stored as usual; the
   `possibleDuplicates` are still returned in the `201` so the moderation
   queue can compare the confirmed report against the nearby record.
5. A failure of the duplicate check itself **fails open**: the catch sets
   `possibleDuplicates = []` and the report proceeds, exactly like the old
   post-insert warning. A broken duplicate check must never silence
   legitimate submissions.

### 2. The gate is a confirmation, not a hard block

The submitter can always proceed after acknowledging that the camera is
distinct. The gate's purpose is to force the human to look at the existing
record before filing a near-duplicate, not to censor submissions. A hard
block would be a false-positive trap: two cameras on the same pole, a camera
replaced after relocation, or a contributor correcting the database's wrong
details for a real camera are all legitimate reports that must not be lost.
Anti-gaming (C-QA) remains the responsibility of the existing layers —
rate limits, the moderation review of every pending report, the
one-open-report correction dedupe — not of a similarity heuristic, which a
determined client can always sidestep by nudging coordinates anyway.

### 3. Client surface

The `/segnala` form keeps the position-based nearby hint. When the server
answers `409` with candidates, the hook surfaces the authoritative
(text-aware) candidate list in the existing `duplicate-alert` box, shows a
mandatory confirmation checkbox ("I confirm this is a distinct camera and I
still want to submit it"), and disables the submit button until it is
checked. The resubmit carries `duplicateConfirmed: true`. The checkbox state
lives in `useReportFlow` (not the DOM) so the payload and the disabled button
share one source of truth; the hook also refuses implicit form submissions
(Enter in a text field) while the gate is open.

### 4. Privacy boundary

The check only ever reads **reviewed public** records through the same public
predicate as every read route. A `409` reveals at most the same records the
public directory would show for that position; it can never leak pending or
rejected reports.

## Consequences

- **API contract change**: `POST /api/cameras` can now answer `409` with
  `possibleDuplicates`; clients that do not handle it see a non-2xx as
  before. The `duplicateConfirmed` field is additive and ignored when no
  high-strength candidate exists.
- **No schema change**: the confirmation is a request-time acknowledgement,
  not persisted state (data minimisation, ADR 0008). Moderators still see the
  candidates in the response and can judge duplicates at review time.
- **Order of operations**: the duplicate check now runs before the insert, so
  an unconfirmed duplicate costs one bounded proximity query and no write.
  Fail-open keeps availability: a check outage degrades to the old
  non-blocking warning.
- **Tests**: unit tests for the pure threshold predicate; route tests for the
  409/201 split, the strict-boolean fail-closed rule, and the fail-open path;
  client interaction tests for the checkbox flow and the implicit-submit
  guard.
- **Review**: the UX choice (confirmation over hard block) and the threshold
  (`high` only) are the two points Ada should weigh before merge.

## Alternatives

- **Hard block** (reject high-strength duplicates unconditionally): rejected
  because the heuristic cannot tell a true duplicate from two legitimate
  cameras at the same spot; it would lose real reports and be trivially
  bypassed by nudging coordinates, so as an absolute gate it is both harmful
  and ineffective.
- **Soft warning only** (status quo): rejected because it does not satisfy
  the roadmap's "before submit" requirement — the record was stored before
  the contributor ever saw the text-aware signal, and an API client could
  silently file duplicates.
- **Gate on medium as well**: rejected as too aggressive for a sparse civic
  dataset; two cameras 75 m apart with no text match are plausibly distinct.
  The UI already labels medium as "likely match" but keeps it informational.
