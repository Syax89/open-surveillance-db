# FIX QA#2 — UI/UX (Vera, design)

Task: `t_e0324743` — fix dei 4 finding P1 emersi dall'audit `t_6a94e797`
(QA Approfondito #2, docs/qa/qa-ui-design.md). Branch:
`feature/design/t_e0324743-fix-qa2`.

Stato: **4/4 finding corretti**, suite completa 1884 test / 0 fail, axe
reale (browser) 0 violazioni sulle pagine corrette.

---

## F1 — /privacy: tabella scrollabile non raggiungibile da tastiera
(axe serious, WCAG 2.1.1, `scrollable-region-focusable`)

**Problema** — `app/components/LegalPage.tsx:74` + `app/globals.css:738`:
il wrapper `.legal-table-wrap` (overflow-x: auto) è scrollabile ma NON
focusabile → un utente da tastiera non può mai raggiungerlo per scorrere
le colonne tagliate a viewport strette (es. 390px). axe lo classifica
serious.

**Fix** — nuovo client island `app/components/LegalTableWrap.tsx`
(integrato in LegalPage):
- misura l'overflow client-side (`scrollWidth > clientWidth`, con
  re-check su resize/ResizeObserver) — non conoscibile a SSR;
- **solo quando la tabella straripa**: `tabIndex={0}` + `role="region"` +
  `aria-label` localizzato (nuova chiave `home.tableScrollAria`, EN/IT).
  Tab atterra sul wrapper e le frecce lo scorrono;
- **quando la tabella entra**: div semplice, NESSUN tab stop in più
  (l'ordine di tab desktop resta pulito).

**Verifica**
- axe reale nel browser a 390px (prima → dopo):
  - BEFORE: `scrollable-region-focusable`, impact **serious**, 1 nodo
  - AFTER: **0 violazioni** (tabIndex=0, role=region, aria-label presenti)
- Tab sul wrapper a 390px: focus ring visibile (`outline: rgb(16,16,16)
  auto 1px`).
- Test: `tests/legal-pages.test.mjs` (wrapper+tabella presenti in SSR),
  nuovo `tests/client-legal-table-wrap.test.mjs` (3 casi: niente tab stop
  se non straripa; region label se straripa; tab stop rimosso se rientra).

Screenshot: `docs/qa/screenshots/fix-qa2/f1-privacy-390-before.png`,
`f1-privacy-390-after.png`, `f1-privacy-390-after-focused.png`.

---

## F2 — /termini e /licenze: link markdown grezzi resi come testo
(P1 Medium)

**Problema** — `app/components/LegalPage.tsx:28-48`: la regex inline
`(\*\*[^*]+\*\*|...)` è greedy sul bold: `**[ODbL 1.0](url)**` viene
catturato come UN SOLO token bold, e il branch bold rendeva il contenuto
come testo piatto → a schermo compariva il sorgente markdown
`[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)` dentro `<strong>`
(oltre a un overflow di 1px a 390px per la stringa più lunga del link
reso).

**Fix** — `renderInline` ricorsivo: nel branch bold (e italic, per
simmetria) se il contenuto interno contiene un link, viene ri-parsato →
`<strong><a href="...">ODbL 1.0</a></strong>`. Il bold semplice resta
testo semplice (nessun cambio di output per i casi non annidati).

**Verifica**
- HTML SSR di /termini e /licenze:
  - BEFORE: `<strong>[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)</strong>`
  - AFTER: `<strong><a href="https://opendatacommons.org/licenses/odbl/">ODbL 1.0</a></strong>`, 0 occorrenze di `**[ODbL 1.0]` e `[ODbL 1.0](`
- Screenshot visivo (crop del paragrafo ODbL su /licenze):
  - BEFORE: `**[ODbL 1.0] (https://…/odbl/)**` letterale in grassetto
  - AFTER: **ODbL 1.0** come hyperlink pulito (verde, sottolineato, bold)
- Test: `tests/legal-pages.test.mjs` ora pinna che /termini e /licenze
  contengano l'ancora reale e NON il markdown grezzo.

Screenshot: `docs/qa/screenshots/fix-qa2/f2-licenze-odbl-before.png`,
`f2-licenze-odbl-after.png`.

---

## F3 — rate limit auth 10/min rompe header e write gate su navigazione rapida
(P1 Medium)

**Problema** — `app/lib/rate-limit.ts:76` (bucket `auth` 10/min) +
`app/api/auth/me/route.ts:26`: `GET /api/auth/me` condivideva il bucket
delle MUTAZIONI auth (register/login). Header (`AuthNavLinks`) e write
gate (`WriteGateWall`) chiamano /me a OGNI page-view → 11+ pagine/min →
429 → l'header perde i link di sessione (fail-closed, nessun link) e il
write gate va in errore.

**Fix — due livelli (back-end + front-end)**

1. **Back-end** (`app/lib/rate-limit.ts`, `app/lib/auth-route-helpers.ts`,
   `app/api/auth/me/route.ts`): nuovo RouteKind `session` con bucket
   dedicato, default **120/min** (soglia 12×, molto sopra la navigazione
   interattiva) e knobs env `SESSION_RATE_LIMIT_MAX` /
   `SESSION_RATE_LIMIT_WINDOW_SECONDS`. `GET /api/auth/me` passa da
   `authLimit` a `sessionLimit`; **tutte le mutazioni auth** (register,
   login, passkey, OIDC, PATCH /me, logout, erasure) restano sul bucket
   `auth` 10/min. Il binding di produzione AUTH_LIMITER resta invariato
   (10/min) — `session` è un read personale per-caller, non una superficie
   di credential-guessing, quindi resta sul fallback in-memory come le
   altre famiglie non bound (documentato in rate-limit.ts e nel test
   binding).

2. **Front-end** (nuovo `app/lib/session-fetch.ts`, usato da
   `AuthNavLinks` e `WriteGateWall`): retry con backoff **limitato** su
   429 per la sola GET /me (max 2 retry, delay da Retry-After cap a 3s).
   5xx/network error passano subito (fail-closed come prima — mai
   dichiarare "anonymous" su un errore non interpretabile).

**Verifica**
- Test back-end (in `tests/api-auth.test.mjs`):
  - 15 GET /me rapidi → tutti 401/200, MAI 429 (il bucket auth non li
    tocca; il PATCH side è pinnato dal test esistente a 10);
  - `SESSION_RATE_LIMIT_MAX=1` → 2ª GET /me = 429 con Retry-After
    (bucket dedicato indipendente).
- Test front-end:
  - `client-auth-nav-links`: 429 poi 401 → header recupera e mostra i
    link (2 chiamate: retry ok);
  - `client-tools`: wall error → "Try again" rifà la check.
- Binding test aggiornato: `session` resta sul fallback in-memory.

Nota: nessun cambiamento alle soglie di sicurezza esistenti (auth 10/min,
submit 5/min, ecc.) — solo una famiglia READ nuova e più alta.

---

## F4 — WriteGateWall:133: label del bottone retry sempre "Verify your email"
(P1 Medium)

**Problema** — `app/components/WriteGateWall.tsx:133`:
`{t.loading ? t.verifyTitle : t.wallLogIn}` — `t.loading` è una STRINGA
truthy ("Loading…"), quindi il ternario rendeva SEMPRE `t.verifyTitle`
("Verify your email") sul wall di errore, anche se l'azione del bottone è
`check()` (riprovare la verifica sessione). Label e azione disallineate.

**Fix** — nuova chiave i18n `auth.wallRetry` (EN "Try again" / IT
"Riprova", entrambi i bundle, type-checked) e bottone = `{t.wallRetry}`.
Rimosso il ternario buggato.

**Verifica**
- Screenshot /segnala con /api/auth/me=503:
  - BEFORE: bottone "Verify your email"
  - AFTER: bottone "Try again"
- Test `client-tools.test.mjs`: wall error mostra "Try again", NON
  "Verify your email"; click → 2ª chiamata /me → wall flippa a login.

Screenshot: `docs/qa/screenshots/fix-qa2/f4-writegate-error-before.png`,
`f4-writegate-error-after.png`.

---

## File modificati

| File | Fix |
|---|---|
| `app/components/LegalTableWrap.tsx` | NUOVO — region focusabile condizionale (F1) |
| `app/components/LegalPage.tsx` | wrapper → LegalTableWrap (F1); renderInline ricorsivo (F2) |
| `app/lib/i18n/home.ts` | +`tableScrollAria` EN/IT (F1) |
| `app/lib/rate-limit.ts` | +RouteKind `session` 120/min + prefix SESSION (F3) |
| `app/lib/auth-route-helpers.ts` | +`sessionLimit`/`bucketLimit`, authLimit solo mutazioni (F3) |
| `app/api/auth/me/route.ts` | GET → sessionLimit, PATCH resta auth (F3) |
| `app/lib/session-fetch.ts` | NUOVO — retry backoff 429 per GET /me (F3) |
| `app/components/AuthNavLinks.tsx` | usa fetchSessionMe (F3) |
| `app/components/WriteGateWall.tsx` | usa fetchSessionMe (F3); bottone wallRetry (F4) |
| `app/lib/i18n/auth.ts` | +`wallRetry` EN/IT (F4) |
| `tests/legal-pages.test.mjs` | pin F1 (wrapper/tabella) + F2 (ancora reale, no markdown grezzo) |
| `tests/client-legal-table-wrap.test.mjs` | NUOVO — 3 casi F1 |
| `tests/api-auth.test.mjs` | NUOVI — GET /me non-auth-limited + bucket session (F3) |
| `tests/rate-limit-binding.test.mjs` | `session` nel fallback in-memory (F3) |
| `tests/client-auth-nav-links.test.mjs` | NUOVO — retry 429 header (F3) |
| `tests/client-tools.test.mjs` | NUOVO — wall error label retry + azione (F4) |
| `tests/helpers/dom-harness.mjs` | jsonResponse: +headers (supporto test 429) |

## Verifica finale

- `npm run build` — ok
- `node --test "tests/*.test.mjs"` — **1884 test, 0 fail** (inclusi
  rendered-html, axe-audit jsdom, a11y-interactive, i18n, tutti i client)
- axe reale in browser (puppeteer + axe-core) su /privacy 390px:
  `scrollable-region-focusable` serious **eliminata**
- Nessun cambiamento a token globali / design system; nessuna nuova
  libreria; nessuna modifica alle soglie di sicurezza esistenti.
