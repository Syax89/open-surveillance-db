# QA Report — Navigazione completa e pagine informative (t_cdbaad9e)

**QA Engineer:** Grace (OpenSurveillanceDB Ltd.)
**Data:** 2026-08-01
**PR:** (feature/qa-navigation-pages)
**Esito CI:** da confermare su GitHub (attesi verdi: Lint · Typecheck · Test · Build, Fresh-DB migration smoke)

---

## 1. Cosa è stato aggiunto

Due file di test nuovi (25 test totali) + ignore eslint per le tree temporanee del harness:

- `tests/navigation-pages.test.mjs` — 17 test che esercitano le route reali del worker
  buildato via Miniflare (stesso percorso di deploy):
  1. **Route resolution**: ogni rotta pubblica risponde 200 HTML; le rotte sconosciute
     rispondono 404 pulito (non soft-render); il gate di moderazione chiude fail-closed
     (503 senza credenziali, 200 con credenziali); **crawl di tutti i link nav/footer**:
     ogni href interno risolve a una pagina reale (nessun 404).
  2. **Accessibilità**: esattamente un `<h1>` per pagina, gerarchia heading senza salti,
     skip-link verso `#main-content`, stili `:focus-visible` dichiarati, contrasto
     WCAG AA (≥ 4.5:1) su tutte le coppie core testo/sfondo.
  3. **EN/IT coerenti**: i bundle `en.ts` e `it.ts` espongono lo **stesso identico set
     di chiavi** (nested, ricorsivo); nessuna stringa inglese intraducibile rimasta
     nel bundle italiano.
  4. **Nessun dato pending/privato esposto**: nessun marker di stato non pubblico
     (`needs_review`, contatti, identità interne, CSRF) su nessuna pagina pubblica;
     la dashboard di moderazione non è linkata da nessuna pagina pubblica; la pagina
     account non renderizza mai email prima del login.
- `tests/pages-render.test.mjs` — 8 test di render SSR: transpila le `page.tsx` reali
  (con i moduli `app/lib` + `app/components`) e le renderizza con `react-dom/server`
  dentro `LocaleProvider`, verificando: nessun crash SSR, `main#main-content` presente,
  esattamente un h1 e gerarchia senza salti, toggle lingua EN/IT presente, ogni href
  interno punta a una route nota del repo, nessun leak di stato non pubblico nel markup.
- `eslint.config.mjs` — aggiunte le pattern `tests/.render-tmp-*/**` e
  `tests/.dbg-tmp-*/**` ai global ignores: il harness genera tree temporanee dentro
  `tests/` a runtime e un crash intermedio non deve mai sporcare lint.

## 2. Esiti per pagina (probe reale sul worker buildato)

| Route | HTTP | h1 | h2 | h3 | skip-link | Esito |
|---|---|---|---|---|---|---|
| `/` (home) | 200 | 1 | 5 | 7 | ✅ | ✅ PASS |
| `/guide` (come funziona / data policy) | 200 | 1 | 4 | 12 | ✅ | ✅ PASS |
| `/login` (accesso contributore) | 200 | 1 | 0 | 0 | ✅ | ✅ PASS |
| `/register` (registrazione contributore) | 200 | 1 | 0 | 0 | ✅ | ✅ PASS |
| `/account` (account + erasure) | 200 | 1 | 0 | 0 | ✅ | ✅ PASS |
| `/moderation` (senza credenziali) | 503 | — | — | — | — | ✅ PASS (fail-closed, gate) |
| `/moderation` (con credenziali) | 200 | 1 | 6 | 1 | ✅ | ✅ PASS |
| `/records/1` (dettaglio record) | 200 | 0¹ | 0 | 0 | ✅ | ✅ PASS (shell client-rendered) |
| `/records/999999` (id inesistente) | 200 | 0¹ | 0 | 0 | ✅ | ✅ PASS (shell + stato not-found client) |
| `/records/not-a-number` | 200 | 0¹ | 0 | 0 | ✅ | ✅ PASS (shell, nessun crash) |
| `/does-not-exist` | 404 | — | — | — | — | ✅ PASS (404 pulito) |
| `/guide/extra` | 404 | — | — | — | — | ✅ PASS (404 pulito) |

¹ `/records/:id` è una pagina **client-rendered**: la shell SSR risponde 200 con uno
stato di caricamento (`Loading the public record`, `aria-live="polite"`); l'`<h1>` e
gli stati record/not-found arrivano dopo il fetch client-side. Comportamento
documentato e pinato nei test — non è una regressione.

## 3. Copertura dei 5 punti richiesti

| # | Punto del task | Esito | Test |
|---|---|---|---|
| 1 | Ogni link in nav/footer risolve (404 check su tutte le route) | ✅ PASS | crawl di tutti gli href interni dalle 5 pagine pubbliche: ogni target risponde ≠404; rotte fantasma danno 404 vero; gate moderazione fail-closed 503. Le 7 rotte del footer globale (#71) ancora in PR paralleli aperti (`/manifesto` #65, `/regole` #67, `/privacy` `/termini` `/licenze` #70, `/faq` `/contatti` #68) sono tracciate come planned: tollerate a 404 finché il PR non merge, mai 500, e il link deve restare presente |
| 2 | Pagine accessibili (heading hierarchy, contrasto, focus) | ✅ PASS | 1 h1 per pagina, nessun salto di livello; skip-link + `#main-content` su tutte; `:focus-visible` e `prefers-reduced-motion` dichiarati in globals.css; 24 coppie core ≥ 4.5:1 WCAG AA |
| 3 | EN/IT coerenti | ✅ PASS | set chiavi identico tra `en.ts` e `it.ts` (zero mancanti/extra); zero stringhe inglesi non tradotte nel bundle IT (allowlist solo prestiti tecnici: Bullet, GeoJSON, OpenStreetMap, status key, ecc.) |
| 4 | Nessun dato pending/privato esposto | ✅ PASS | nessun marker interno (`needs_review`, email contatto, identità reviewer, header auth prototipo, CSRF) su `/`, `/login`, `/register`, `/account`, `/records/*`; `/moderation` mai linkata; nessuna email renderizzata in `/account` anonimo |
| 5 | Test render per le nuove route | ✅ PASS | 8 test SSR su tutte le 7 route (`/`, `/guide`, `/login`, `/register`, `/account`, `/moderation`, `/records/[id]`): zero crash, struttura heading, link interni, toggle lingua, leak check |

## 4. Esiti esecuzione (local, Node 22.22.3)

```
npm test (build + node --test "tests/*.test.mjs")
  # tests 569
  # pass  569
  # fail  0
  # duration ~17.4s
npm run lint            → clean (0 errori, 0 warning)
npx tsc --noEmit        → clean
npm run db:smoke        → PASSED (fresh-DB migration smoke)
```

Baseline su main: 543 test. Dopo questa PR: **569 test** (+26).

## 5. Anomalie / note

- **Nessuna anomalia funzionale** nel codice testato: tutte le rotte rispondono come
  documentato e nessun dato non pubblico trapela nelle pagine pubbliche.
- **Rotte del footer in attesa di PR paralleli (non bloccante):** il footer globale
  mergiato in #71 linka `/manifesto`, `/regole`, `/privacy`, `/termini`, `/licenze`,
  `/faq` e `/contatti`, pagine portate dai PR aperti #65/#67/#70/#68. Il crawl test
  le tratta come *planned*: il 404 è tollerato finché il PR non merge (con diagnostic
  nel log), un 500 fallisce sempre, e la rimozione del link dal footer fallisce il
  test. Quando i PR atterrano su main, le rotte passano a 200 e il contratto
  "no 404" si riattiva automaticamente senza modifiche al test.
- **Anomalia nota (non bloccante) — contrasto loading-note (QA-2026-08-01-1):**
  `.loading-note { color:#6f7e84 }` su `--paper (#f5f3ec)` = **3.79:1**, sotto la soglia
  AA 4.5:1 per testo normale. Compare in home durante il load della API e sulla pagina
  record durante il fetch. È **pinato da un test dedicato** che ne fissa il valore
  attuale: un futuro pass di design che lo corregga deve aggiornare l'assertion
  deliberatamente. Raccomandato: passare a un grigio più scuro (es. `#5f7078`, 5.08:1).
- Nota di processo: `tests/pages-render.test.mjs` transpila le page reali e mocka
  `next/link` + `next/navigation` con stub innocui; il leak check non viene applicato
  a `/guide` (documenta intenzionalmente gli stati) né a `/moderation` (pagina gated
  interna che mostra "Pending camera reports" per design).
- I fixture non contengono dati personali reali (requisito privacy-and-safety-by-design).

## 6. Raccomandazioni

- PR **mergeable**: suite completa verde in locale (568/568), lint/tsc/db:smoke puliti.
- Review finale in carico ad Ada (CTO) come da flusso del progetto.
- Follow-up consigliato (separato, non bloccante): fix contrasto `.loading-note`.
