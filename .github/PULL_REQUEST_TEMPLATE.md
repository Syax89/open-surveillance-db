# Pull request

> Template per la review di una PR (usato anche da Ada, CTO, come checklist
> di review). Le PR che toccano UI/UX/componenti frontend sono soggette alla
> sezione **Design compliance** — la source of truth del design system è
> [`docs/FRONTEND_DESIGN.md`](../docs/FRONTEND_DESIGN.md) (v2, 2026-08-02).

## 1. Summary

<!-- Cosa cambia e perché. Una o due frasi. Collega il task kanban. -->

## 2. Test plan

<!-- Cosa hai verificato e come (comandi, pagine, casi). Per UI: dev server +
     browser; per API: curl/test. Nessuna modifica UI/UX va merged senza
     verifica reale di rendering. -->

- [ ] Build: `npm run build` ✅
- [ ] Type-check: `npx tsc --noEmit` ✅
- [ ] Lint: `npm run lint` ✅
- [ ] Test: `npm test` ✅

## 3. Checklist di review

### Funzionale e dati

- [ ] Il comportamento dichiarato nel summary è verificabile e verificato.
- [ ] Nessun dato non-pubblico (`pending`, reviewer, account, evidence) è
      esposto in UI, API, export o log (fail-closed).
- [ ] Gli empty state sono truthfull: mai "nessuna telecamera esiste" —
      solo "nessun record pubblicato trovato" (+ azione). La mappa non
      sparisce mai con filtri a 0 risultati (`FRONTEND_DESIGN` D5).
- [ ] I redirect legacy (`/#map`, `/#records`) restano client-side
      (`LegacyAnchorRedirect`) — non tornare a un 302 server-side (D8).

### Codice e architettura (review Ada)

- [ ] Commit convenzionali (`feat|fix|docs|test|refactor(scope):`), uno scope
      per PR.
- [ ] Commenti CSS/TSX spiegano il *perché*, citano task/decisione
      (convenzione della codebase).
- [ ] Pattern condivisi riusati, non duplicati: `FiltersBar`, `RecordCard`,
      `EmptyState`, `PublicNav`, `ConfirmDialog`, status dot (§6.3).
- [ ] i18n: bundle per dominio, nessuna stringa hardcodata, parità
      type-checked (`Translation<typeof en>`).

### Design compliance (source: `docs/FRONTEND_DESIGN.md`)

- [ ] **Token:** nessun nuovo hardcode di colore dove esiste un token; i
      focus ring usano `var(--focus)` (mai `#0b705c` letterale); gli status
      usano `--status-*`. Palette invariata (§3.1, Don't #10).
- [ ] **Tipografia:** la scala §3.2 è rispettata (body 16px/1.5 esplicito;
      h1/h2/h3 con i pesi 800/700 della scala). Niente font nuovi.
- [ ] **Classi CSS:** ogni `className` introdotto è definito in
      `app/globals.css` — zero classi usate-ma-mai-definite e zero no-op
      (Don't #4). Nessuna regola nuova fuori da globals.css.
- [ ] **Stato mai solo colore (WCAG 1.4.1):** status dot sempre abbinati a
      label testuale localizzata (D7).
- [ ] **Contrasto:** testo normale ≥ 4.5:1; i grigi secondari stanno nella
      tabella §3.1 (≥ 4.5:1). Nessun grigio sotto soglia su testo piccolo.
- [ ] **Focus:** `:focus-visible` visibile con `var(--focus)`; navigazione
      da tastiera provata; nessun focus trap (D10).
- [ ] **Touch target:** controlli ≥ 44×44px dove practical (WCAG 2.5.8);
      niente target < 24px.
- [ ] **Header/nav:** `PublicNav` a 6 link su tutte le pubbliche con
      `aria-current`; header contestuali solo su auth/record/moderation/error
      (D11, §2.3). Error pages: header ridotto voluto, nessun leak di
      path/errore (D14).
- [ ] **Responsive/mobile:** la mappa mobile usa il pannello sopra la mappa
      (≤768px), mai bottom-sheet (D12); a 320px e zoom 200% non c'è scroll
      orizzontale sui task core.
- [ ] **Tono:** sobrio, civic-tech — niente estetica "poliziesca",
      allarmismo, gradienti aggressivi, skeleton/spinner animati (Don't #1/#8).
- [ ] **Reduced motion:** `prefers-reduced-motion` rispettato (Don't #11).
- [ ] **Modifiche al design system** (token, scala, pattern, componenti
      nuovi) sono documentate in `FRONTEND_DESIGN.md` nella stessa PR —
      il documento è vincolante e va aggiornato prima del merge.

### Documentazione

- [ ] Documentazione aggiornata se comportamento/decisione/dato cambia
      (`docs/STATUS.md`, `docs/FRONTEND_DESIGN.md`, SITEMAP, ADR).
- [ ] Changelog aggiornato per le PR user-facing.

## 4. Esito

<!-- A cura del reviewer: approve / changes-requested + note brevi. -->
