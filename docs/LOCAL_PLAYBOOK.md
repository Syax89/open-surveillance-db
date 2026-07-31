# Local playbook

This playbook is for exercising OpenSurveillanceDB with fictional data on one
development machine. It is not an operating procedure for a public service.
Do not enter real camera reports, personal data, images, live-feed links,
credentials, or sensitive operational details.

## What this verifies

The local loop has one important boundary:

```text
fictional report → pending moderation → local decision → public result only when approved
```

`pending`, rejected, hidden, and correction-request records must never appear
on the public map, directory, `/api/cameras`, CSV/GeoJSON exports, or nearby search.

## Start the prototype

Requirements: Node.js 22.13 or newer and a recent npm.

```bash
npm install
npm run dev
```

Open the public prototype at `http://localhost:3000` and the local moderation
dashboard at `http://localhost:3000/moderation`. Keep the development server
running while following the checks below.

For the full clean-setup walkthrough — prerequisites, schema migrations,
synthetic fixtures, and the non-destructive reset procedure — see
[DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md).

The local database creates two explicitly labelled `demo` records when it is
empty. They are fictional pins used to show the interface; they are not claims
about real cameras.

## Create a safe test report

1. On the public page, either click an arbitrary position on the map or enter
   valid latitude and longitude values in the report form. Do not choose a real
   sensitive location. Manual coordinates must be within the normal geographic
   ranges: latitude `-90` to `90`, longitude `-180` to `180`.
2. Confirm the selected coordinates are shown and the map centres on that
   point. The same non-blocking nearby-record check runs for a map click and
   valid manual coordinate entry; it considers reviewed/demo public records
   only.
3. Open **Add a camera**.
4. Submit a clearly fictional title such as `Local test — do not publish` and a
   generic type such as `Fixed dome`.
5. If exercising the optional fields, use a fictional manufacturer and a valid
   observation date in ISO form (`YYYY-MM-DD`). Do not use them for operational
   claims. Both values stay in the private pending report and are not public
   merely because the camera is approved. During moderation, opt in separately
   to publishing the manufacturer and the observation date only when each is
   accurate, relevant, and safe.
6. Leave the address empty or use `Fictional test location`; use a short note
   that contains no personal or operational information.
7. Confirm the form notice: the report is saved for moderation and is not
   public.

Before visiting the moderation dashboard, confirm the new title is absent from
the map, public directory, `http://localhost:3000/api/cameras`, and its CSV
and GeoJSON exports.

## Moderate the report

Open `http://localhost:3000/moderation`. The report should appear in **Pending
camera reports**. Select a required reason, optionally add a local note, then
choose one of the following actions.

| Action | Expected local state | Expected public result |
| --- | --- | --- |
| Approve | `verified` | The record appears in the public API, directory, map, CSV/GeoJSON, and relevant nearby results. Manufacturer and observation date remain private unless their individual publication choices are enabled. |
| Reject | `rejected` | The record remains absent from all public outputs. |
| Hide | `hidden` | The record remains absent from all public outputs. |

Every decision should remove the item from the pending queue and add an entry
to **Recent decisions**. The event should show the old and new status, action,
reason, actor, timestamp, and any note.

## Manual acceptance checks

Use a separate fictional report for each action so results are unambiguous.

### Approve

1. Submit a fictional report and approve it with the reason **Verified public
   infrastructure**.
2. Refresh the public page and search for its fictional title.
3. Confirm it appears in the directory and map, and in `/api/cameras`, CSV,
   and GeoJSON exports.
4. If using nearby search, query coordinates near the selected point with a
   radius between 10 and 500 metres; confirm the approved record is returned.
5. Confirm its audit event says `pending → verified`.
6. If the fictional report contains manufacturer or observation-date metadata,
   verify each field independently: it is absent from JSON, CSV, GeoJSON, map,
   directory, and record detail unless its own publication choice was enabled.

### Reject

1. Submit another fictional report and reject it with an appropriate reason.
2. Refresh every public view listed above.
3. Confirm its title is absent from the map, directory, JSON, GeoJSON, and
   nearby results.
4. Confirm its audit event says `pending → rejected`.

### Hide

1. Submit a third fictional report and hide it with an appropriate reason.
2. Refresh every public view listed above.
3. Confirm its title is absent from the map, directory, JSON, GeoJSON, and
   nearby results.
4. Confirm its audit event says `pending → hidden`.

### Review and reverify a published record

1. Use a fictional report that has already been approved, so it appears under
   **Published records** in the local dashboard.
2. Select a reason and choose **Mark for review**. Confirm the record moves to
   **Records needing review** and is no longer in the public map, directory,
   JSON, GeoJSON, or nearby results.
3. Select a reason and choose **Reverify**. Confirm it returns to the public
   outputs and its audit history records `needs_review → verified`.
4. To leave the local exercise clean, choose **Hide** from either lifecycle
   section and confirm the record is removed from every public output.

## Nearby API check

The local proximity endpoint is:

```text
/api/cameras/nearby?latitude=41.9004&longitude=12.4936&radius=100
```

`latitude` and `longitude` are required. `radius` is optional and defaults to
75 metres; when supplied it must be between 10 and 500 metres. A malformed,
out-of-range, or incomplete query must return a validation error rather than a
broader dataset. The endpoint is derived from the same reviewed/demo public
list as `/api/cameras`; it is not a separate database query.

## Reset a local exercise safely

Local state can include submitted fictional reports and their audit history.
Treat it as data even in a prototype.

1. Stop the development server before changing any local state.
2. Identify the project-local runtime state directory created by the local
   worker tooling (`.wrangler/state/`), and make a dated copy outside the
   project before changing it. The exact non-destructive move-aside commands
   are in [DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md#6-reset).
3. Prefer creating a fresh workspace copy for a clean exercise instead of
   erasing the existing state.
4. If a maintainer intentionally clears local state, restart the server and
   verify that only the two labelled demo records are recreated.

This playbook intentionally provides no destructive reset command. Never use a
reset procedure against a deployment, shared environment, or any data that may
contain real reports.

## Automated verification

Run the project test suite before considering a local change complete:

```bash
npm test
```

The suite builds the application and checks the static publication boundaries:
only reviewed/demo camera records may reach public JSON, CSV, GeoJSON, and
nearby responses; correction and moderation surfaces remain separate from
public pages. It also guards the manual-coordinate fallback so it continues to
use the same selection and nearby-check flow as the map.
