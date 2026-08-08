# ADR 0006: Non-sensitive usability-feedback route

- **Status:** proposed (draft, awaiting implementation)
- **Date:** 2026-07-31
- **Author:** Marie (documentation)
- **Related:** [ACCESSIBILITY_STATEMENT.md](../ACCESSIBILITY_STATEMENT.md)

## Context

The accessibility statement (EN 301 549 § 9.6 and the European
accessibility-statement model) requires a stated mechanism for reporting
accessibility problems. This ADR records the chosen shape for that route: a
non-sensitive usability-feedback page that lets a visitor report an interface
barrier *without being forced to create an account*.

Design constraints from existing policy:

- Privacy by design and data minimisation
  ([PRIVACY_AND_SAFETY.md](../PRIVACY_AND_SAFETY.md),
  [LAWFUL_BASIS.md](../legal/LAWFUL_BASIS.md)): no account, no mandatory
  contact data, no behavioural tracking.
- Write routes need abuse controls before public exposure (rate limiting,
  review finding H2 of the 2026-07-31 legal review).
- Retention values must come from
  [RETENTION_SCHEDULE.md](../legal/RETENTION_SCHEDULE.md); operational logs are
  aggregate-only and retained ≤ 12 months.

## Decision

Add a public **`/feedback` page**, linked from the site footer and from the
accessibility statement, that lets any visitor report an interface barrier
**without an account and without providing personal data**.

The form collects only non-sensitive fields:

1. **Barrier type** — a closed set: navigation/keyboard, screen reader,
   colour/contrast, zoom/layout, other.
2. **Description** — free text in plain language; input limits apply
   (consistent with the record intake limits in the data model).
3. **Page URL** — optional; the page where the barrier occurred.
4. **Contact** — optional, offered only so the visitor can receive a reply;
   never required; deleted once the exchange is closed.

The route must **not** collect names, addresses, account identifiers, or any
special-category data, and must not be combined with analytics or behavioural
tracking.

Implementation phases:

- **Local development (current):** the page may compose a `mailto:` message or
  point to the public issue tracker; no server-side storage is required.
- **Public launch:** a dedicated mailbox and minimal storage, with rate
  limiting (per IP, no retained logs) and retention aligned with
  RETENTION_SCHEDULE. Feedback handling follows the MODERATION_SLA response
  targets: acknowledgement within 48 h, substantive response within 14 days.

The accessibility statement references this route as the primary
barrier-reporting channel until launch, with the public issue tracker and the
record-correction form as alternative channels.

## Consequences

- Barriers can be reported anonymously, lowering the friction for disabled
  users — the people who experience the interface problems first.
- Minimal data means a minimal GDPR surface; the contact field is the only
  personal data and is covered by the privacy notice and retention schedule.
- The route is a write surface: it must be rate-limited and abuse-checked
  before public exposure, like the other intake routes (review finding H2).
- Implementation is separate code work (UI page + intake) and is tracked as a
  follow-up task; this ADR fixes the design so the accessibility statement can
  already name the route and its privacy properties.
