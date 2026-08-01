# OpenSurveillanceDB

An open, non-commercial civic database for documenting **visible public surveillance infrastructure**. The project helps people understand where cameras are installed in shared spaces; it does not provide video feeds, tracking tools, or advice on avoiding lawful surveillance.

> Current state: local working prototype. The map uses OpenStreetMap and shows only clearly labelled illustrative records; contributor accounts, moderation, roles, and appeals run locally, but the service is not yet a public registry.

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
- Locality/address/coordinate public search (`/api/cameras/search`) with truthful
  empty states: coordinate pairs are parsed locally, other places are resolved
  through a configurable geocoder, and a zero-result response describes the
  searched area instead of claiming an absence of surveillance.
- Data licensing decided: the public dataset and every export format (JSON,
  CSV, GeoJSON) are under ODbL 1.0, and published coordinates are rounded to
  ~4 decimal places by default (ADR 0008).
- Submission form that stores new reports as `pending` for moderation.
- Optional manufacturer and observation-date metadata at report intake. These
  fields remain private while a report is `pending`. Approving the camera does
  not disclose either value: a local moderator must separately opt in to
  publishing each field after deciding it is accurate, safe, and suitable.
- Report-location selection by map click or valid manual coordinates, using the
  same non-blocking nearby-record check in either case.
- Private correction/request-for-review form that creates a non-public moderation request.
- Contributor accounts: email+password registration, login/logout, and an
  account page listing the contributor's own submissions, with PBKDF2-SHA256
  password hashing, hashed opaque session cookies, and CSRF protection.
  Anonymous submissions remain possible by design (ADR 0013).
- Self-service account erasure with de-attribution (GDPR art. 17): deleting an
  account detaches its submissions from the identity without unpublishing them
  (ADR 0013).
- Moderation dashboard at `/moderation` for reviewing pending reports and
  requests, gated by `MODERATION_USER`/`MODERATION_PASSWORD` (Basic auth) or
  `MODERATION_TOKEN` (bearer) environment credentials — fail-closed, returning
  `503` when none are configured (ADR 0003).
- Coarse authorization roles (`contributor`/`moderator`/`admin`) enforced on
  every protected route via `requireRole`, with the acting reviewer derived
  server-side from the authenticated user (ADR 0014).
- Appeal workflow against moderation decisions: an independent senior moderator
  (or the administrator, for escalations) reviews a contested decision; an
  upheld appeal returns the record to the moderation queue for a fresh decision
  (ADR 0014).
- Local record lifecycle: verified → needs review → reverified or removed, with audit history.
- Image upload for camera records with secure storage: size/MIME/dimension
  caps, magic-byte verification, mandatory EXIF/XMP/IPTC stripping (fail-closed),
  R2 storage with metadata kept only in D1, and a moderation/redaction gate
  before a photo can be served for a public camera (PR #64).
- Nearby-record warning and safe type/order filters shared by map and directory.
- Bilingual interface (English and Italian), with a device-local language preference.
- In-app bilingual project guide at `/guide`.
- Public information-site pages — `/manifesto`, `/regole`, `/privacy`,
  `/termini`, `/licenze`, `/faq`, `/contatti`, `/moderazione` — linked from a
  global site footer with ODbL and OSM attribution.
- Draft accessibility statement and design for a non-sensitive usability-feedback route (see `docs/ACCESSIBILITY_STATEMENT.md` and ADR 0006).
- Cloudflare D1-compatible data layer, with local demo records.

The prototype is deliberately not a public registry yet. The code and draft
policies are public, but accepting real-world reports still requires a public
launch: independent legal review of the draft terms and privacy documents, real
moderation staffing, and operational safeguards.

## Read the project plan

The documentation is part of the project and is intended to be discussed openly.

- [Development plan](docs/DEVELOPMENT_PLAN.md)
- [Execution board and workstream ownership](docs/EXECUTION_BOARD.md)
- [Sprint archive: reliable moderation loop (completed)](docs/NEXT_SPRINT.md)
- [Future roadmap](docs/FUTURE_ROADMAP.md)
- [Current status](docs/STATUS.md)
- [Site map and information architecture](docs/SITEMAP.md)
- [Clean local setup and schema migrations](docs/DEVELOPMENT_SETUP.md)
- [Local playbook and acceptance checks](docs/LOCAL_PLAYBOOK.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data model and API](docs/DATA_MODEL.md)
- [Data dictionary (public fields)](docs/DATA_DICTIONARY.md)
- [Export versioning policy](docs/EXPORT_VERSIONING.md)
- [Moderation policy](docs/MODERATION.md)
- [Terms of use](docs/TERMS_OF_USE.md)
- [Pre-launch legal deliverables](docs/legal/README.md)
- [Privacy and safety](docs/PRIVACY_AND_SAFETY.md)
- [Accessibility statement](docs/ACCESSIBILITY_STATEMENT.md)
- [Open-source and data licensing](docs/OPEN_SOURCE.md)
- [OpenStreetMap integration](docs/OSM_INTEGRATION.md)
- [Deployment and operations](docs/DEPLOYMENT.md)
- [Operations manual](docs/OPERATIONS.md)
- [Local release checklist](docs/RELEASE_CHECKLIST.md)
- [Decision records (ADR 0001–0014)](docs/decisions/)
- [Changelog](CHANGELOG.md)
- [Governance](GOVERNANCE.md)

## Roles and contacts

Initial project roles were named on 2026-07-31 as part of the Wave A pilot
boundary (decision recorded in [GOVERNANCE.md](GOVERNANCE.md)):

| Role | Owner(s) |
| --- | --- |
| Maintainers | Simone (syax89) and Ada (CTO). Ada is the sole merge authority: every merge into `main` is performed by Ada. |
| Operations owner | Ken |
| Data stewards | Linus and Grace |
| Security contact | Ken — private reporting route in [SECURITY.md](SECURITY.md) |
| Moderation contact | Grace |

These are initial nominations for the pilot, not a claim that the full public
governance structure already exists. Only public professional identities are
listed, in line with the project's privacy-by-design approach.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run db:migrate   # apply the Drizzle schema migrations to a fresh local DB
npm run dev
```

Open `http://localhost:3000`. The database starts empty — no demo rows are
inserted at runtime. For the two labelled illustrative pins used in manual
checks, run the optional, separate demo seed:

```bash
npm run db:seed
```

For local moderation testing, open `http://localhost:3000/moderation`. This
route is intentionally not linked from the public prototype and has no
production authentication yet. The local DB ships with demo identities
(`Demo *` reviewers) only until migration `0017` is applied — the last
migration removes them from every fresh database. Local suites that need the
demo identities seed them explicitly in their test setup; for a real
alpha/prod deployment, provision real moderator/admin accounts instead (see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §Provisioning real accounts):

```bash
PROVISION_ACCOUNTS='[{"email":"ada@example.org","displayName":"Ada","role":"admin","reviewerRole":"administrator"}]' npm run db:provision
```

For a complete walkthrough of a clean local setup — prerequisites, schema
migrations, synthetic fixtures, and a safe non-destructive reset — read
[docs/DEVELOPMENT_SETUP.md](docs/DEVELOPMENT_SETUP.md).

To start over with a clean local database, run `npm run db:reset`
(non-destructive: it moves the local state aside under a timestamped backup,
then re-applies the migrations). After changing the schema in `db/schema.ts`,
regenerate a migration with `npm run db:generate` before running
`db:migrate`.

For local moderation testing, open `http://localhost:3000/moderation`. This
route is intentionally not linked from the public prototype. Access is gated by
the `MODERATION_USER`/`MODERATION_PASSWORD` (Basic auth) or `MODERATION_TOKEN`
(bearer) environment variables and fails closed: with none configured, the
dashboard and `/api/moderation` return `503`. Protected routes additionally
enforce coarse roles via `requireRole` (see ADR 0003 and ADR 0014). The local
DB no longer ships demo identities (`Demo *` reviewers): migration `0017`
removes them from every fresh database. Local suites that need the demo
identities seed them explicitly in their test setup; for a real alpha/prod
deployment, provision real moderator/admin accounts instead (see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §Provisioning real accounts):

```bash
PROVISION_ACCOUNTS='[{"email":"ada@example.org","displayName":"Ada","role":"admin","reviewerRole":"administrator"}]' npm run db:provision
```

For a complete fictional-data workflow—submission, approval/rejection/hiding,
public-boundary checks, and a cautious reset approach—read the [local
playbook](docs/LOCAL_PLAYBOOK.md).

To verify a production build:

```bash
npm run build
```

## License

The application source code is offered under [GNU Affero General Public License v3.0 or later](LICENSE) (`AGPL-3.0-or-later`). Documentation is proposed under CC BY-SA 4.0; the public database and every export format are licensed under ODbL 1.0 (ADR 0008) — see [Open source and data licensing](docs/OPEN_SOURCE.md).

## Contributing

Contributions, criticism, translations, accessibility reviews, and local knowledge are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md) before participating.
