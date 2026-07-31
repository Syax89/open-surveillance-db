# OpenSurveillanceDB

An open, non-commercial civic database for documenting **visible public surveillance infrastructure**. The project helps people understand where cameras are installed in shared spaces; it does not provide video feeds, tracking tools, or advice on avoiding lawful surveillance.

> Current state: local working prototype. The map uses OpenStreetMap and shows only clearly labelled illustrative records until a public moderation process exists.

## Principles

- Free to use, without ads, profiling, or paid features.
- Open source: the software can be inspected, reused, and improved by the community.
- Open data, with licensing and provenance recorded for every published record.
- Privacy and safety by design: no private-home cameras, no sensitive operational details, and no live-feed links.
- Human moderation before community submissions become public.

## What is in this prototype

- Interactive OpenStreetMap-based map.
- Searchable, map-equivalent public record directory and individual record pages.
- Public API endpoint for reviewed records and GeoJSON export.
- CSV and GeoJSON exports derived from the same reviewed public record list.
- Submission form that stores new reports as `pending` for moderation.
- Optional manufacturer and observation-date metadata at report intake. These
  fields remain private while a report is `pending`. Approving the camera does
  not disclose either value: a local moderator must separately opt in to
  publishing each field after deciding it is accurate, safe, and suitable.
- Report-location selection by map click or valid manual coordinates, using the
  same non-blocking nearby-record check in either case.
- Private correction/request-for-review form that creates a non-public moderation request.
- Local-only moderation dashboard at `/moderation` for reviewing pending reports and requests.
- Local record lifecycle: verified → needs review → reverified or removed, with audit history.
- Nearby-record warning and safe type/order filters shared by map and directory.
- Bilingual interface (English and Italian), with a device-local language preference.
- In-app bilingual project guide at `/guide`.
- Draft accessibility statement and design for a non-sensitive usability-feedback route (see `docs/ACCESSIBILITY_STATEMENT.md` and ADR 0006).
- Cloudflare D1-compatible data layer, with local demo records.

The prototype is deliberately not a public registry yet. It needs a public repository, moderation team, privacy review, terms, and operational safeguards before accepting real-world reports.

## Read the project plan

The documentation is part of the project and is intended to be discussed openly.

- [Development plan](docs/DEVELOPMENT_PLAN.md)
- [Execution board and workstream ownership](docs/EXECUTION_BOARD.md)
- [Next local sprint: reliable moderation loop](docs/NEXT_SPRINT.md)
- [Future roadmap](docs/FUTURE_ROADMAP.md)
- [Current status](docs/STATUS.md)
- [Local playbook and acceptance checks](docs/LOCAL_PLAYBOOK.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data model and API](docs/DATA_MODEL.md)
- [Moderation policy](docs/MODERATION.md)
- [Privacy and safety](docs/PRIVACY_AND_SAFETY.md)
- [Accessibility statement](docs/ACCESSIBILITY_STATEMENT.md)
- [Open-source and data licensing](docs/OPEN_SOURCE.md)
- [OpenStreetMap integration](docs/OSM_INTEGRATION.md)
- [Deployment and operations](docs/DEPLOYMENT.md)
- [Local release checklist](docs/RELEASE_CHECKLIST.md)
- [Changelog](CHANGELOG.md)
- [Governance](GOVERNANCE.md)

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The application seeds two explicitly labelled demo pins when the local database is empty.

For local moderation testing, open `http://localhost:3000/moderation`. This route is intentionally not linked from the public prototype and has no production authentication yet.

For a complete fictional-data workflow—submission, approval/rejection/hiding,
public-boundary checks, and a cautious reset approach—read the [local
playbook](docs/LOCAL_PLAYBOOK.md).

To verify a production build:

```bash
npm run build
```

## License

The application source code is offered under [GNU Affero General Public License v3.0 or later](LICENSE) (`AGPL-3.0-or-later`). Documentation is proposed under CC BY-SA 4.0; published database licensing is described in [Open source and data licensing](docs/OPEN_SOURCE.md) and must be confirmed before launch.

## Contributing

Contributions, criticism, translations, accessibility reviews, and local knowledge are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) before participating.
