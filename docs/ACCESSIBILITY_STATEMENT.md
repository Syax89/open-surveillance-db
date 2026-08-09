# Accessibility statement

- **Status:** in force (personal open-source project), 2026-08-08 — version 0.3
- **Owner:** Simone Rondina (project owner)
- **Standards target:** WCAG 2.2 AA (Web Content Accessibility Guidelines)
- **Related documents:** [FRONTEND_DESIGN.md](FRONTEND_DESIGN.md), [ADR 0006 — non-sensitive usability-feedback route](decisions/0006-non-sensitive-usability-feedback-route.md), [MODERATION_SLA.md](legal/MODERATION_SLA.md)

This statement describes the accessibility of the OpenSurveillanceDB public web
application as it is deployed today.

## Commitment

OpenSurveillanceDB is a public-interest civic database. The project is
committed to an inclusive web experience: the core journeys — browse, search,
submit, and correct/remove — must be usable with a keyboard, with assistive
technology, and on small screens, in Italian and in English. The product
target is **WCAG 2.2 AA** for the public website.

## Compliance status

**Partially compliant.** The project implements a meaningful accessibility
baseline, and **automated checks run in CI on every PR**: the QA gate audits
the SSR HTML of every public route with axe-core (WCAG 2.1/2.2 A/AA tags) and
enforces 0 critical/serious violations; a Lighthouse CI gate runs in real
Chromium and enforces a minimum accessibility score of **0.95**, covering the
layout-dependent WCAG 2.2 AA rules that jsdom cannot evaluate —
color-contrast, target-size (2.5.8), link-in-text-block,
scrollable-region-focusable. Lighthouse audits one representative route per
distinct layout template, so every layout in the app is covered by
real-rendering checks (`.github/workflows/lighthouse.yml`; local check:
`npx lhci autorun`).

### What is already implemented in the project

- A skip link and main-content target on every app surface.
- Visible keyboard focus states and logical focus order.
- `prefers-reduced-motion` support (animations reduced when requested).
- A searchable text directory and record-detail pages that work **without map
  interaction**; map and directory present the same public fields.
- Map interactions are **keyboard-operable**: markers are focusable and open
  their popup with Enter/Space, Leaflet controls are focusable, and the
  geocode search is an ARIA combobox; the text directory remains the full
  keyboard alternative for browsing.
- Report-location selection by an optional one-tap device location (with browser permission), map click **or** validated manual coordinates; map/manual alternatives remain available.
- English/Italian interface with a device-local language preference; the
  language choice does not affect API data.
- An in-app bilingual guide at `/guide` explaining data states and the
  moderation workflow.
- Status information is not conveyed by colour alone (text and icon labels are
  used), and safe type/order filters are shared by map and directory.

### Known limitations

- **No formal manual testing** with screen readers, 200% zoom, contrast
  checking, or small-screen devices has been run yet; the manual test plan is
  tracked as follow-up work. Automated checks are in place (axe-core on every
  route, CI, 0 critical/serious violations); contrast and target-size need a
  real rendering engine, so they are covered by the Lighthouse CI gate.
- Some map gestures (drag-panning) are pointer-first by nature; the directory
  is the equivalent keyboard surface for browsing.

## Reporting a barrier

Accessibility barriers can be reported **without creating an account and
without providing personal data** through these channels:

- open an issue on the project repository (public, non-sensitive content only —
  do not include personal data, screenshots of people, or private locations);
- use the [correction/request form](/) on the public page for issues related
  to a specific record;
- write to the privacy contact named in the
  [privacy notice](legal/PRIVACY_NOTICE.md): `privacy@opensurveillancedb.org`.

A dedicated non-sensitive usability-feedback page is specified in
[ADR 0006](decisions/0006-non-sensitive-usability-feedback-route.md) and is
planned as a future route; until it exists, the channels above are the way to
report a barrier.

### Response commitment

Feedback is handled with the same targets as correction and takedown requests
([MODERATION_SLA.md](legal/MODERATION_SLA.md)): an acknowledgement within
**48 hours** and a substantive response within **14 days**, in the language of
the message when possible.

## Enforcement and contact

- **Accessibility owner:** Simone Rondina (project owner).
- **Escalation:** if a reported barrier is not resolved or the response
  commitment is not met, escalate to the maintainers via
  [GOVERNANCE.md](../GOVERNANCE.md); for privacy-sensitive concerns use the
  privacy contact in the [privacy notice](legal/PRIVACY_NOTICE.md).

## Review schedule

This statement is reviewed:

- after every release that changes the interface or the accessibility
  behaviour;
- at least quarterly while the service is running;
- whenever conformance results change, recording the updated results and any
  exceptions here.
