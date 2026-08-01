# Contributing to OpenSurveillanceDB

Thank you for helping build a public-interest tool. Contributions are welcome from developers, researchers, accessibility specialists, translators, privacy advocates, local communities, and moderators.

## Before opening a change

1. Read the [development plan](docs/DEVELOPMENT_PLAN.md), [privacy and safety rules](docs/PRIVACY_AND_SAFETY.md), and [code of conduct](CODE_OF_CONDUCT.md).
2. Keep the purpose clear: informed civic transparency, never camera-feed access or surveillance evasion.
3. Discuss changes affecting data publication, identity, moderation, or licensing before implementing them.
4. Do not include real camera reports, personal data, credentials, private URLs, or unredacted images in issues, tests, screenshots, or commits.

## Development workflow

```bash
npm install
npm run dev
npm run build
```

- Keep changes small and explain the user need they solve.
- Use accessible semantic HTML and test keyboard navigation for interface changes.
- Add or update documentation whenever a behaviour, decision, or data field changes.
- Use fictional or clearly labelled demo data in the repository.
- For database changes, generate and review the Drizzle migration.

## Proposing a camera record

The public submission workflow is not live. When it is, reports must comply with the moderation policy. Never submit private residential cameras, inside views of sensitive facilities, live-stream URLs, account details, or information that could facilitate harm.

## Decisions and disagreements

Open a discussion for material design choices. Decisions should be recorded in [`docs/decisions/`](docs/decisions/README.md) with context, alternatives, and consequences — use the [ADR template](docs/decisions/_template.md). The governance document explains how unresolved questions are handled.
