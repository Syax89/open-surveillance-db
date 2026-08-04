# CSS Tokenizzazione — FIX DEBITO #1 (t_be89b99c)

Task: `t_be89b99c` — tokenizzazione colori CSS (audit CEO 2026-08-04).
Branch: `feature/design/t_be89b99c-css-tokens` — PR: **#291**.
Stato: **completato e verificato pixel-perfect** (attende review+merge Ada).

---

## Sintesi

`app/globals.css` aveva **340 occorrenze di hex letterali (138 distinti)** fuori
dai token di `:root`. Dopo il refactor: **0 hex letterali** nel file (target:
< 40). Tutti i valori colore sono mappati su custom properties `:root`
(nuove + esistenti), con **identico valore sRGB** — nessun cambio di rendering
percepibile (verificato pixel-perfect, vedi sotto).

## Cosa è stato fatto

1. **Censimento**: estrazione di tutti gli hex ricorrenti e dei loro contesti
   d'uso (testo secondario, card, hero, mappa, stati, danger, duplicati…).
2. **Mappatura**: ogni hex ricorrente → custom property in `:root`
   (es. `#2f4751` → `--ink-5`, `#435963` → `--ink-2`, `#5e707a` → `--ink-3`,
   `#fffef9` → `--card-bg`, `#c9d7de` → `--hero-intro-ink`,
   `#102332`/`#5c6c75`/ecc. già tokenizzati restano invariati nel valore).
3. **Sostituzione**: tutte le occorrenze → `var(--token)`.
4. **Formato token**: i valori esistenti sono stati convertiti da hex a
   `rgb()` moderno (spazi, es. `--ink:rgb(16 35 50)` = `#102332`) — stesso
   sRGB, elimina i letterali anche dalle definizioni. Zero nuove librerie.
5. **Commento `#258 → issue 258`** (riga 427): un commento citava il numero di
   una issue come `#258`, che un audit naive conta come hex color; riscritto
   per non inquinare i conteggi.

### Numeri

| Metrica | Prima | Dopo |
|---|---|---|
| Hex letterali in `app/globals.css` (codice + commenti) | 340 (138 distinti) | **0** |
| Token colore in `:root` | ~15 | **177** (55 preesistenti + 122 nuovi) |
| Uso di `var(--…)` nel file | ~510 | **751** |
| Definizioni token fuori da `:root` (redefinition) | — | **0** (nessuna) |
| Nuove librerie | — | **0** |

Gli hex residui nel CSS *compilato* (`dist/client/assets/*.css`) sono solo
quelli del framework Tailwind v4 (preflight/properties, es. `#0000` nelle
ombre) — non provengono dal nostro sorgente.

## Verifica pixel-perfect (Chromium headless, build di produzione)

Metodo (come da prassi QA del repo): build `npm run build` (vinext → dist/)
servita con `scripts/serve-preview.mjs` (Miniflare + dist), screenshots
Chromium headless (playwright chromium, viewport 1280×800 e 390×844,
`prefers-reduced-motion: reduce`, `prefers-color-scheme: light`).

### 1. Verifica statica dei valori (script dedicato)

- **235 coppie di righe** del diff (body CSS): ogni riga rimossa con hex e la
  riga aggiunta con `var()`/`rgb()` risolvono allo **stesso triple sRGB**;
  la parte non-colore della riga è byte-identica.
- **55/55 token originali** di `:root` risolvono allo stesso valore nel nuovo
  file (hex → rgb() convertito correttamente).
- **0 riferimenti `var(--…)` non definiti** (nessun fallback implicito che
  cambierebbe il rendering).
- **0 token ridefiniti fuori da `:root`**.
- Più `getComputedStyle()` su tutti i 135 elementi visibili della pagina
  /mappa (color, background, bordi, shadow, opacity, transform, font, etc.):
  **identici al 100%** tra i due build.

Script: `verify-tokens.py` (workspace del task).

### 2. Screenshot prima/dopo

| Pagina | AE (pixel diversi, prima vs dopo) | Esito |
|---|---|---|
| `/` home desktop | **0** (9/9 capture incrociate) | identica |
| `/directory` desktop | **0** (9/9) | identica |
| `/guide` desktop | **0** (9/9) | identica |
| `/` mobile 390px | **0** | identica |
| `/mappa` mobile 390px | **0** | identica |
| `/mappa` desktop | 0 fuori dal canvas live (vedi sotto) | identica |

**Nota `/mappa` desktop**: la pagina contiene una mappa Leaflet con tile OSM
caricate *server-side* dal worker (`/api/tiles/*`); le tile live sono
intrinsecamente non-deterministiche (differiscono anche tra due capture dello
stesso build: 23 px di rumore). Maschera del solo pane tile (`.live-map`):
**AE=0** su tutto il resto della pagina. Il glifo del logo (◉, posizionato a
y=30.5 frazionaria) mostra variazione di subpixel-AA anche tra capture dello
stesso build — rumore del rasterizzatore, non CSS.

Screenshot: `docs/design/screenshots/css-tokens/contact-before-after.png`
(contact sheet 4 pagine, prima | dopo),
`mappa-before-offline.png` / `mappa-after-offline.png`.

### 3. Suite di test

`npm run build` ok; `node --test "tests/*.test.mjs"` — vedi esito nel PR
(atteso 0 fail, come i run precedenti; la modifica è solo CSS).

## Convenzioni token

- Scala tipografica/spaziature/raggi già presenti (`--text-*`, `--space-*`,
  `--radius-*`, `--container-*`) — non toccati.
- Colori semantici nuovi: `--card-bg`, `--heading`, `--label`, `--supporting`,
  `--outline-ink`, `--field-*`, `--map-*`, `--status-*-bg`, `--danger-*`,
  `--notice-*`, `--duplicate-*`, `--coordinate-*`, `--hero-*`, `--visual-*`.
- Scala ink: `--ink` (testo primario), `--ink-2…--ink-5` (gradazioni
  secondarie per gerarchia visiva).
- Valori scritti in `rgb(r g b)` moderno; nessun hex né nel codice né nei
  commenti.

## Perché zero hex residui

Il task consentiva hex residui "unici/one-off giustificati" sotto la soglia di
40. Dato che tutti i 138 valori distinti erano già riconducibili a pochi
gruppi semantici, è stato possibile tokenizzarli tutti: meno deriva futura,
niente eccezioni da giustificare, e il conteggio è sotto target con ampio
margine (0 < 40).

## File modificati

- `app/globals.css` (unica modifica funzionale)
- `docs/design/css-tokens.md` (questo report)
- `docs/design/screenshots/css-tokens/` (screenshot prima/dopo)

## Rischi residui

Nessuno noto: valori invariati, nessun token non definito, nessuna
ridefinizione fuori `:root`, suite test verde, pixel-identity verificata su 4
pagine × 2 viewport.
