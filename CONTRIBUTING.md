# Contributing to OpenSurveillanceDB

Thank you for helping build a public-interest tool. Contributions are welcome from developers, researchers, accessibility specialists, translators, privacy advocates, local communities, and moderators.

## Before opening a change

1. Read the [roadmap](docs/roadmap.md), [privacy and safety rules](docs/PRIVACY_AND_SAFETY.md), and [code of conduct](CODE_OF_CONDUCT.md).
2. Keep the purpose clear: informed civic transparency, never camera-feed access or surveillance evasion.
3. Discuss changes affecting data publication, identity, moderation, or licensing before implementing them.
4. Do not include real camera reports, personal data, credentials, private URLs, or unredacted images in issues, tests, screenshots, or commits.

## Development workflow

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in the placeholders (no secrets in the repo)
npm run dev
npm run build
```

- Keep changes small and explain the user need they solve.
- Use accessible semantic HTML and test keyboard navigation for interface changes.
- Add or update documentation whenever a behaviour, decision, or data field changes.
- Use fictional or clearly labelled demo data in the repository.
- For database changes, generate and review the Drizzle migration.

## Pull requests and review

Every change (code or docs) goes through a branch + PR and is reviewed before
merge. Fill the [PR template](.github/PULL_REQUEST_TEMPLATE.md) — it is also
the review checklist used by the CTO.

PRs that touch UI, UX, or frontend components must additionally pass the
**Design compliance** section of the template. The binding source of truth is
[`docs/FRONTEND_DESIGN.md`](docs/FRONTEND_DESIGN.md): tokens, type scale,
spacing, component specs, and the Dos & Don'ts. In short:

- Every `className` must be defined in `app/globals.css` — no undefined or
  no-op classes; no inline styles for layout.
- Use the design tokens (`var(--focus)`, `--status-*`, palette); never
  hardcode a colour that already has a token.
- Status is never conveyed by colour alone (WCAG 1.4.1): status dot always
  paired with a text label.
- Text contrast ≥ 4.5:1 (AA); secondary greys from the §3.1 table.
- Touch targets ≥ 44px where practical; visible `:focus-visible` with
  `var(--focus)`.
- `PublicNav` (6 links) on every public page; mobile map uses the panel
  above the map (≤768px), never a bottom-sheet.
- Design-system changes (tokens, scale, patterns, new components) must be
  documented in `docs/FRONTEND_DESIGN.md` in the same PR, before merge.

Accessibility is a release gate, not a lint step: verify keyboard
navigation, focus order, and contrast in a real browser before opening the
PR.

## Proposing a camera record

The public submission workflow is not live. When it is, reports must comply with the moderation policy. Never submit private residential cameras, inside views of sensitive facilities, live-stream URLs, account details, or information that could facilitate harm.

## Decisions and disagreements

Open a discussion for material design choices. Decisions should be recorded in [`docs/decisions/`](docs/decisions/README.md) with context, alternatives, and consequences — use the [ADR template](docs/decisions/_template.md). The governance document explains how unresolved questions are handled.
