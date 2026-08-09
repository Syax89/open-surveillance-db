# Pull request

> Template for PR review (also used by Ada, CTO, as the review checklist).
> PRs touching UI/UX/frontend components are subject to the **Design
> compliance** section — the design-system source of truth is
> [`docs/FRONTEND_DESIGN.md`](../docs/FRONTEND_DESIGN.md) (v2, 2026-08-02).

## 1. Summary

<!-- What changes and why. One or two sentences. Link the kanban task. -->

## 2. Test plan

<!-- What you verified and how (commands, pages, cases). For UI: dev server +
     browser; for API: curl/test. No UI/UX change is merged without real
     rendering verification. -->

- [ ] Build: `npm run build` ✅
- [ ] Type-check: `npx tsc --noEmit` ✅
- [ ] Lint: `npm run lint` ✅
- [ ] Test: `npm test` ✅

## 3. Review checklist

### Functional and data

- [ ] The behaviour declared in the summary is verifiable and verified.
- [ ] No non-public data (`pending`, reviewer, account, evidence) is
      exposed in UI, API, export or logs (fail-closed).
- [ ] Empty states are truthful: never "no camera exists" — only
      "no published record found" (+ action). The map never disappears
      with filters at 0 results (`FRONTEND_DESIGN` D5).
- [ ] Legacy redirects (`/#map`, `/#records`) stay client-side
      (`LegacyAnchorRedirect`) — do not go back to a server-side 302 (D8).

### Code and architecture (Ada review)

- [ ] Conventional commits (`feat|fix|docs|test|refactor(scope):`), one scope
      per PR.
- [ ] CSS/TSX comments explain the *why* and cite task/decision
      (codebase convention).
- [ ] Shared patterns are reused, not duplicated: `FiltersBar`, `RecordCard`,
      `EmptyState`, `PublicNav`, `ConfirmDialog`, status dot (§6.3).
- [ ] i18n: per-domain bundles, no hardcoded strings, type-checked parity
      (`Translation<typeof en>`).

### Design compliance (source: `docs/FRONTEND_DESIGN.md`)

- [ ] **Tokens:** no new colour hardcode where a token exists; focus rings
      use `var(--focus)` (never literal `#0b705c`); statuses use
      `--status-*`. Palette unchanged (§3.1, Don't #10).
- [ ] **Typography:** the §3.2 scale is respected (body 16px/1.5 explicit;
      h1/h2/h3 with the 800/700 weights of the scale). No new fonts.
- [ ] **CSS classes:** every introduced `className` is defined in
      `app/globals.css` — zero used-but-never-defined classes and zero no-ops
      (Don't #4). No new rules outside globals.css.
- [ ] **State never colour-only (WCAG 1.4.1):** status dots always paired with
      a localised text label (D7).
- [ ] **Contrast:** normal text ≥ 4.5:1; secondary greys stay in the §3.1
      table (≥ 4.5:1). No grey below threshold on small text.
- [ ] **Focus:** visible `:focus-visible` with `var(--focus)`; keyboard
      navigation tested; no focus trap (D10).
- [ ] **Touch targets:** controls ≥ 44×44px where practical (WCAG 2.5.8);
      nothing below 24px.
- [ ] **Header/nav:** `PublicNav` with 6 links on every public page with
      `aria-current`; contextual headers only on auth/record/moderation/error
      (D11, §2.3). Error pages: intentionally reduced header, no
      path/error leak (D14).
- [ ] **Responsive/mobile:** the mobile map uses the panel above the map
      (≤768px), never a bottom-sheet (D12); at 320px and 200% zoom there is
      no horizontal scroll on core tasks.
- [ ] **Tone:** sober, civic-tech — no "police-aesthetic", alarmism,
      aggressive gradients, animated skeleton/spinners (Don't #1/#8).
- [ ] **Reduced motion:** `prefers-reduced-motion` respected (Don't #11).
- [ ] **Design-system changes** (tokens, scale, patterns, new components) are
      documented in `FRONTEND_DESIGN.md` in the same PR — the document is
      binding and must be updated before merge.

### Documentation

- [ ] Documentation updated if behaviour/decision/data changes
      (`docs/STATUS.md`, `docs/FRONTEND_DESIGN.md`, SITEMAP, ADRs).
- [ ] Changelog updated for user-facing PRs.

## 4. Outcome

<!-- By the reviewer: approve / changes-requested + short notes. -->
