# FIX LAYOUT IT — audit responsive e correzioni (t_c18b48f0)

CEO: *"quando metto italiano il layout si fotte un po' perche' le parole sono
piu' lunghe"*.

## Sintesi

Il bug reale e confermato e' uno: **le righe dell'h1 hero collidono** (la 'p'
di "pubblici" tocca la 's' della riga sotto, la 'g' di "sorveglianza" entra
nelle 'b' di "pubblica"). Causa: `line-height:.96` + `letter-spacing:-.075em`
su un titolo che in italiano gira su 3-4 righe (in inglese su 2-3, per cui il
difetto era meno visibile). Le altre quattro aree sospette elencate dal PM
(tool-heading h1, bottoni nowrap, hero-intro, record-detail/auth-card) sono
state verificate **senza overflow** sui viewport richiesti; sono comunque
state irrobustite in modo difensivo (balance + overflow-wrap) perche' il
rischio IT e' strutturale (parole piu' lunghe).

## Metodo di verifica (LXC, browser reale)

- Build di produzione (`npm run build`, vinext → dist/), servita con
  `scripts/serve-preview.mjs` (Miniflare + dist, come LHCI).
- Browser Chromium headless, cookie `opensurveillancedb-locale=it` +
  `localStorage` (SSR e client allineati), viewport **1280 / 768 / 390**
  (+ 1024/900 per la griglia directory).
- Controlli per pagina: `document.scrollWidth` vs `innerWidth` (overflow
  orizzontale), line-box dell'h1 (sovrapposizione), bottoni nowrap
  (clipping), `scrollWidth`/`clientWidth` di h1 e intro.
- **Verifica a livello di pixel**: analisi delle bande di inchiostro negli
  screenshot (gap verticali tra le righe di testo), piu' affidabile della
  sola ispezione visiva.
- record-detail verificato con **dati reali**: D1 locale seminato
  (`npm run db:reset && db:seed`) + record aggiuntivo con titolo italiano
  lungo ("Videocamera di sorveglianza in Piazza della Repubblica angolo Via
  Nazionale"), servito da un preview server con binding D1
  (`scripts/serve-preview-d1.mjs`, locale, non tracciato).

## Rilievi

| Area | Stato | Dettaglio |
|---|---|---|
| hero h1 (globals.css ~riga 130) | **ROTTO** | `line-height:.96` < font-size: le line-box si sovrappongono; a pixel, gap tra le righe del titolo IT = **2px** (collisione visiva) su 1280/768/390 |
| tool-heading h1 | OK | "Elenco pubblico", "Segnala una telecamera", "Correggi un record": nessun overflow a nessun viewport |
| bottoni nowrap (righe ~90, ~498) | OK | "Usa invece la mappa ↑", "Azzera i filtri →", "Cerca vicino a un luogo… ↓", export CSV/GeoJSON: nessun clipping a 1280/1024/900/768/390 |
| hero-intro | OK | `max-width:525px`, nessun overflow |
| record-detail h1 | **a rischio** | Stesso pattern di hero h1 (`line-height:.96` su `--text-display`): con titoli IT lunghi su piu' righe collide; verificato con record reale |
| auth-card h1 | OK | "Crea un account per contribuire" a 54px: nessun overflow |

Overflow orizzontale: **nessuno** su nessuna pagina/viewport (prima e dopo).

## Correzioni (solo `app/globals.css`, nessun token globale → nessun ADR)

1. `.hero h1`: `line-height:.96 → 1.06`, + `text-wrap:balance`,
   + `overflow-wrap:anywhere` (rete di sicurezza per token ininterrompibili
   tipo "OpenSurveillanceDB").
2. `.record-detail h1`: `line-height:.96 → 1.06`, + `text-wrap:balance`,
   + `overflow-wrap:anywhere` (stesso pattern del hero).
3. `.tool-heading h1`: `line-height:1.04 → 1.08`, + `text-wrap:balance`,
   + `overflow-wrap:anywhere` (titoli tool IT su 2 righe).
4. `.auth-card h1`: + `text-wrap:balance` + `overflow-wrap:anywhere`.
5. `.moderation-page>h1` (vista moderatore idratata): stesso pattern di
   `.record-detail h1` (`.96 → 1.06` + balance + anywhere) — trovato con
   l'audit complementare su TUTTI gli h1; la shell SSR di /moderazione usa
   gia' `.record-detail` (InfoPage) quindi era coperta, la regola serve alla
   vista autenticata.

Nota di copertura: le pagine informative (/guide, /manifesto, /faq,
/privacy, /termini, /licenze, /regole, /contatti, /accessibility) usano il
componente condiviso InfoPage che renderizza l'h1 dentro `.record-detail`:
sono coperte dal fix #2 senza altre modifiche (verificato con audit
complementare su tutti gli h1 a 1280/768/390 IT, zero overflow).

`text-wrap:balance` evita orfani e righe sbilenche nei titoli IT multiriga;
`overflow-wrap:anywhere` e' l'ultima risorsa che spezza un token troppo lungo
invece di allargare la pagina. In EN (2-3 righe, meno discendenti) le
modifiche non cambiano il look: il leading resta volutamente compatto
(display type), solo senza collisioni.

## Verifica dopo il fix (pixel)

- Hero h1 IT, 390px: gap tra le 4 righe = **7px / 17px / 7px** (prima: 2px).
- Hero h1 IT, 1280px: 3 righe, nessuna collisione (ispezione visiva + gap).
- Hero h1 EN, 390px: gap 17px / 7px — nessuna regressione.
- Record-detail con titolo IT lungo: 1280px gap minimo **8px** su 5 righe,
  390px gap minimo **4px** su 6 righe, nessun overflow del card.
- `document.scrollWidth == innerWidth` su tutte le pagine ai 3 viewport,
  EN e IT.

## Test

- Suite completa: `node --test "tests/*.test.mjs"` (pagina di questo report:
  esito in calce al PR) — include pages-render (IT), rendered-html,
  a11y-interactive, i18n-pages, navigation-pages, legal-pages, etc.
- Nessuna modifica a markup/i18n: i test strutturali non sono toccati.

## File toccati

- `app/globals.css` (4 regole, solo CSS)
- Report: `docs/design/layout-it-fix.md`

Strumenti locali non tracciati (verifica): `scripts/layout-it-audit.cjs`,
`scripts/serve-preview-d1.mjs`, D1 locale in `.wrangler/state/`.
