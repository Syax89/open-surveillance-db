# FIX DEBITO #2 — Metadata home localizzata + analisi white-space:nowrap

- **Autore:** Linus (Backend/API)
- **Task:** t_e06f5c87 — FIX DEBITO #2 (audit CEO 2026-08-04)
- **Data:** 2026-08-04
- **Base:** main `b72dcf6` (#285)
- **Branch:** `feature/linus/t_e06f5c87-home-metadata-nowrap`
- **Stato CI:** Lint ✓ Typecheck ✓ Build ✓ Test 1901/1901 ✓ (di cui rendered-html 25/25, axe 22/22)
- **Vincolo PM (anti-conflitto):** `app/globals.css` NON modificato — la PR design t_be89b99c
  (tokenizzazione CSS) è in corso; le modifiche CSS qui documentate si applicano in un
  follow-up/rebase dopo il merge della design PR.

## 1. Metadata home localizzata (app/page.tsx + app/lib/i18n/home.ts)

**Problema (audit):** `app/page.tsx` non aveva `generateMetadata` propria → la home usava il
fallback del root layout (`bundle.common.metaTitle` / `metaDescription`, "Public data about
public surveillance" EN / IT). Niente titolo/description dedicati della home.

**Fix:**
- `app/lib/i18n/home.ts` (EN + IT, parity `Translation<typeof en>` via tsc):
  - `pageTitle` — EN: "Open public surveillance infrastructure database"; IT: "Database aperto
    dell'infrastruttura di sorveglianza pubblica"
  - `pageDescription` — EN: "OpenSurveillanceDB is a civic, non-commercial database of visible
    public surveillance infrastructure: sourced, moderated and privacy-first."; IT equivalente
- `app/page.tsx`: `export async function generateMetadata(): Promise<Metadata>` che legge il
  bundle locale (stesso percorso SSR di `HomePage`, ADR 0015 — cookie locale → EN pilota di
  default) e restituisce `title`, `description`, `alternates.canonical: "/"`, `openGraph` e
  `twitter` (stessa forma del layout, `/og.png` relativo — coerente con F6 qa#5: `metadataBase`
  condizionale resta nel layout).
- `app/layout.tsx`: commento aggiornato (la home non è più nel set "fallback").

**Test:** `tests/rendered-html.test.mjs` aggiornato — il test EN e il test IT (cookie locale)
asseriscono il `<title>` e il `<meta name="description">` dedicati della home invece del
fallback. 25/25 verdi.

## 2. Analisi white-space:nowrap residui (globals.css)

Le 6 regole `white-space:nowrap` oggi presenti (le righe ~378/431/472/498 dell'audit erano di
uno snapshot precedente; le posizioni correnti sono sotto). Verifica reale: browser Chromium
headless (puppeteer-core, Chrome del dev-box), viewport **390px**, cookie locale IT, pagine
reali dal preview server Miniflare (`scripts/nowrap-390-check.mjs`, riproducibile con
`CHROME_PATH` + preview su :4173).

| # | Regola (riga attuale) | Contesto | Verdetto 390px IT | Note |
|---|---|---|---|---|
| 1 | `.sr-only` (56) | helper screen-reader, clip a 1px | **SICURO** | nowrap parte della ricetta sr-only (nessun testo visibile, niente clip visivo) |
| 2 | `.directory-tool-heading .text-button` (90) | link "Usa invece la mappa" nell'header /directory | **SICURO** | 144px, nessun overflow (già verificato in t_c18b48f0: righe ~90/~498 OK a 1280/1024/900/768/390) |
| 3 | `.photo-file-name` (389) | nome file foto in /segnala (ReportForm) | **DA INTERVENIRE** | ellipsis intenzionale ma il GRID PADRE `.photo-list` (387) ha colonna auto → col nome IT lungo la riga esplode a 748px e il documento va a 825px > 390px. Fix: `grid-template-columns:minmax(0,1fr)` su `.photo-list` (verificato empiricamente: 825→390, ellipsis attivo 592→24px) |
| 4 | `.directory-tool .directory-controls > .text-button` (509) | bottone "Azzera i filtri" nei controlli /directory | **SICURO** | 161px, grid 1fr ≤700px, nessun overflow |
| 5 | `.confirm-count` (773) | contatore verifiche nel toggle record | **SICURO** | testo breve "N verifica/verifiche" (12–15ch), niente ellipsis, nessun overflow (record demo assenti in preview → verificato staticamente + pattern) |
| 6 | `.geocode-option-type` (875) | label tipo nel dropdown geocoding /mappa | **SICURO** | 54px, font 11px, capitalize — "street/via" corti, il nome dell'opzione wrappa, il tipo resta su una riga |

Le due `flex-wrap:nowrap` (442 menu mobile, 483 indice A–Z) NON sono `white-space` e sono
intenzionali (dropdown / scroll orizzontale) — fuori scope.

### Fix richiesto (follow-up post design PR t_be89b99c)

```css
/* app/globals.css riga 387 — da applicare dopo il merge della design PR */
.photo-list { display:grid; gap:7px; margin:0; padding:0; list-style:none;
              grid-template-columns:minmax(0,1fr); }
```

Il solo `minmax(0,1fr)` sulla colonna di `.photo-list` è sufficiente e minimale: la riga
`li` (flex) viene vincolata alla larghezza del contenitore, `.photo-file-name`
(`flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis`) può finalmente
contrarsi ed ellissare il nome lungo. Verificato a 390px IT: document scrollWidth 825 → 390,
nome ellissato (scrollWidth 592 → clientWidth 24).

## 3. File toccati

- `app/page.tsx` — `generateMetadata` localizzata della home
- `app/lib/i18n/home.ts` — chiavi `pageTitle`/`pageDescription` EN+IT (tsc parity)
- `app/layout.tsx` — commento fallback aggiornato
- `tests/rendered-html.test.mjs` — asserzioni metadata home EN+IT
- `scripts/nowrap-390-check.mjs` — verifica nowrap 390px (riproducibile)
- Questo report: `docs/qa/fix-debito2-linus.md`

## 4. Verifiche eseguite

- `npx tsc --noEmit` → exit 0 (parity i18n)
- `npm run lint` → exit 0
- `npm run build` → exit 0
- `node --test tests/*.test.mjs` → **1901/1901 pass** (rendered-html 25/25, axe 22/22)
- Verifica browser 390px IT (`scripts/nowrap-390-check.mjs`) → 5 OK + 1 intervento documentato
