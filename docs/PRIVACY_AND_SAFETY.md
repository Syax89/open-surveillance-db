# Privacy and safety by design

This project concerns surveillance, so it must hold itself to a high privacy and safety standard. This document is product guidance, not legal advice; local legal review is required before any public launch.

## Data minimisation

- Do not require a real name to browse public data.
- Collect the minimum account and submission data needed to prevent abuse and run moderation.
- Keep evidence private by default and delete it according to a published retention schedule.
- Avoid personal names, faces, plates, private interiors, and precise details that do not serve the public record.

## Location and media rules

- Publish only public-facing, visible infrastructure after review.
- Generalise locations when a precise point introduces unnecessary risk.
- Do not publish images until a reviewable redaction workflow exists.
- Strip EXIF/geolocation metadata from any accepted image unless the retained data is deliberately necessary and documented.

## User rights and accountability

The public service needs, before launch: a privacy notice, lawful-basis analysis for each operating jurisdiction, retention schedule, correction/removal path, data-access contact, and processor/subprocessor register. Draft deliverables covering each of these are collected in [LEGAL_DELIVERABLES_INDEX.md](LEGAL_DELIVERABLES_INDEX.md): privacy notice ([PRIVACY_NOTICE.md](PRIVACY_NOTICE.md)), lawful-basis assessment ([LAWFUL_BASIS.md](LAWFUL_BASIS.md)), retention schedule ([RETENTION_SCHEDULE.md](RETENTION_SCHEDULE.md)), processor register ([PROCESSOR_REGISTER.md](PROCESSOR_REGISTER.md)), and breach procedure ([BREACH_PROCEDURE.md](BREACH_PROCEDURE.md)). All are drafts pending legal review before launch. Records of moderation decisions must be protected from public exposure while sufficient transparency reporting is published in aggregate.

## Abuse prevention

- Rate-limit submissions and public API use.
- Require reviewed accounts for high-volume contributions.
- Detect duplicates and suspicious patterns without behavioural advertising.
- Maintain emergency hide/remove controls for credible safety reports.
- Never expose unpublished reports through search, API, exports, logs, or analytics.

## Accessibility and inclusion

The map must have an accessible list/search alternative, keyboard operation, non-colour-only status indicators, readable language, and translations. Community reporting must not be the only basis for determining whether a group is subject to surveillance.
