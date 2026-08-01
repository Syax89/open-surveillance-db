# QA Report — a11y avanzata: keyboard nav mappa, focus trap, aria su componenti interattivi

- Task: `t_444f7598` (P2)
- QA: Grace (QA Automation Engineer)
- Data: 2026-08-01
- Base: `main` @ `9b8714a` (fix(api): rate limit photo bytes, tile proxy, and appeal decisions (#85))
- Deliverable: `tests/a11y-interactive.test.mjs` (nuovo file, 24 test)

## Sintesi

Suite nuova `a11y-interactive.test.mjs`: **24/24 verdi** in esecuzione singola.
Suite completa (`npm test` = build + tutti i test `tests/*.test.mjs`): vedi esito sotto.

Nessuna modifica a codice di produzione: solo test, fixture e tooling QA.

## Casi coperti (mappati sui 6 punti dell'audit t_0de37378)

### 1. Mappa — keyboard path
- `#map-region` è un landmark `role="region"` con `aria-label` + `aria-describedby`,
  `tabindex="-1"` (focus programmatico, FUORI dal tab order → nessun trap).
- La descrizione sr-only contiene il link `#records` ("Go to the accessible directory").
- Ogni record della directory ha un vero `<button type="button">` "Show on map"
  (1:1 con le card; handler `showRecordOnMap` muove il focus su `#map-region` e
  rispetta `prefers-reduced-motion`).
- Nessun `tabindex` positivo in nessuna pagina pubblica → tab order standard.
- Skip link primo elemento focusabile (prima del nav shell).
- Keyboard path per "pick a location": input coordinate manuali con
  `label for` + `aria-describedby="manual-coordinates-help"`; place search con
  `role="search"` e `label for`.

### 2. ModerationDashboard
- Shell SSR con credenziali: 200, `nav-shell` con `aria-label`, h1, `aria-live="polite"`
  sul loading.
- Nessun `tabIndex` nel componente (né nell'HTML SSR) → nessun focus trap involontario.
- Controlli decisione: `label htmlFor` su reason select e note textarea,
  `aria-describedby` sulla nota, actor select con `label for` nel SSR.
- Gruppi azione con `aria-label`, liste coda (`ul.moderation-list`) etichettate.
- Feedback: `role="status"` (successo) e `role="alert"` (errore).
- Preview foto con `alt`.

### 3. Form auth/account
- Ogni controllo di login (2) e register (3) ha un accessible name: associazione
  implicita via `<label>` wrappante (pattern HTML valido per WCAG 1.3.1/4.1.2).
- Errori annunciati via `role="alert"` (live region assertiva) in login/register/account.
- Account: logout/delete sono `<button type="button">` nativi, nessun tabindex.
- **Gap trovato**: `aria-invalid` NON è cablato sugli input auth (vedi Finding 2).

### 4. Toggle lingua
- SSR: `<html lang="en">` + toggle con `aria-label="Language selection"` e
  `aria-pressed` su EN/IT.
- `LocaleProvider` aggiorna `document.documentElement.lang` a ogni cambio locale
  (effetto su `[locale]`) → la pagina viene riletta in lingua dallo screen reader.

### 5. Footer/nav
- Footer `contentinfo` con `aria-label`, nav istituzionale etichettata; ogni link
  ha testo visibile (nessun link non etichettato).
- Ogni `<img>` nel HTML pubblico ha `alt` (home/login/register/guide; preview foto
  moderation verificata sul sorgente).
- **Gap trovato**: `aria-current` sulla pagina attiva NON implementato (vedi Finding 3).

### 6. Igiene fixture
- Nessun dato personale reale: fixture fittizie (demo records "Illustrative record
  A/B", credenziali moderation locali `moderator:s3cret`).
- Test dedicato: password/header Basic/identità test mai presenti nell'HTML pubblico;
  nessuna cella `<dd>…@…</dd>` con email.

## Findings

### QA-2026-08-01-2 — aria-invalid assente sugli input auth (P3, UX a11y)
- **Dove**: `app/login/page.tsx`, `app/register/page.tsx`.
- **Cosa**: gli input non impostano `aria-invalid` quando la validazione fallisce.
  La validazione nativa (`required`/`minLength`) applica lo stile `:invalid` del
  browser e gli errori server sono annunciati via `role="alert"`, ma l'AT non può
  sapere quale campo specifico ha fallito.
- **Stato**: accettato come eccezione nota, pinnato nel test
  ("aria-invalid is not yet wired on auth inputs — known gap, tracked").
  Un fix deve aggiornare deliberatamente il pin.
- **Consiglio**: collegare `aria-invalid` allo stato di errore per campo (es.
  `aria-invalid={error !== null}` sull'input interessato).

### QA-2026-08-01-3 — aria-current assente su nav/footer (P3, UX a11y)
- **Dove**: `app/components/SiteFooter.tsx`, nav-shell delle pagine (nessun link
  marca la pagina attiva).
- **Cosa**: nessun link imposta `aria-current="page"`; il pattern WCAG 2.4.2 /
  ARIA per siti multi-pagina richiede di marcarlo sulla voce corrente.
- **Stato**: accettato come eccezione nota, pinnato nel test
  ("aria-current for the active page is not yet implemented — known gap, tracked").
- **Consiglio**: aggiungere `aria-current={isActive ? "page" : undefined}` sul link
  corrispondente alla rotta corrente (home inclusa, dove la nav usa ancore `#map`
  ecc. — in quel caso `aria-current="true"`/`"location"` sulla sezione attiva).

### Nota (non bloccante) — label auth implicite invece di for/id
- I form auth usano `<label>` wrappante (associazione implicita): accessibile e
  valida. Dove il form è più complesso il codice usa già `for/id` espliciti
  (record-search, manual-latitude/longitude, place-search, actor-select,
  reason/note in moderation). Nessuna azione richiesta; se si vuole uniformità
  stilistica si può migrare a for/id, ma non è un difetto.

## Come eseguire

```bash
npm test                      # build + intera suite
node --test tests/a11y-interactive.test.mjs   # solo la nuova suite
```

## Esito suite completa

Vedi output di `npm test` (log: `/tmp/osdb-fulltest-444f.log`).
