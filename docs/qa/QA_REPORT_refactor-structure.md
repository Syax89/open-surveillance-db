# QA_REPORT_refactor-structure.md — Grace (t_14b1949c)

Stato: **POST-REFACTOR** — verifiche eseguite dopo il merge dei refactor di
Ada (t_6104f386, PR #134 → `4b90ac0`: split home in Hero/MapPanel/
PublicDirectory/ReportForm/CorrectionForm + hook `useReportFlow`) e di Linus
(t_04ad3e41, PR #78 → `3d7e8bc`: layout condiviso `InfoPage.tsx`).

Commit verificato: `b583c43` (origin/main, HEAD al momento del run)
Data: 2026-08-01 · Branch di lavoro: `qa/t_14b1949c-refactor-structure`

---

## 1. Suite completa (requisito 1: rendered-html e route continuano a passare)

| Step            | Esito |
|-----------------|-------|
| `npm run lint`  | ✅ PASS (0 errors; 1 warning pre-esistente in tests/client-record-page.test.mjs, non introdotto da questo run) |
| `npx tsc --noEmit` | ✅ PASS |
| `npm test` (build + node --test) | ✅ **786/786 PASS, 0 fail, 0 skipped** |
| `npm run db:smoke` | ✅ PASS (fresh-DB migration, come da job CI) |

Suite di route, eseguite singolarmente post-refactor:

| Suite                  | Baseline | Post-refactor | Esito |
|------------------------|:--------:|:-------------:|-------|
| tests/rendered-html    | 12/12    | **19/19**     | ✅ (espanso da altri task QA nel frattempo) |
| tests/navigation-pages | 17/17    | **17/17**     | ✅ |
| tests/legal-pages      | 2/2      | **2/2**       | ✅ |
| tests/pages-render     | 8/8      | **9/9**       | ✅ |

→ **I test rendered-html e le route continuano a passare dopo il refactor**
(requisito 1 ✅). La suite è cresciuta da 623 (baseline) a 786 test totali
grazie ad altri task QA mergiati nel frattempo — nessuna regressione.

## 2. Smoke test nuovi componenti (requisito 2)

Nuovo `tests/component-smoke.test.mjs` (7 test, inclusi in `npm test` via
glob `tests/*.test.mjs`). **7/7 PASS.** Pina il contratto strutturale:

1. ✅ esistenza file: `app/components/home/{Hero,PublicDirectory,ReportForm,
   CorrectionForm,MapPanel}.tsx`;
2. ✅ esistenza `app/components/InfoPage.tsx` (layout condiviso di Linus);
3. ✅ limite righe ≤ 150 per ogni componente estratto E per `app/page.tsx`
   (orchestratore sottile) — con **deviation registry** esplicito (v. §4);
4. ✅ `app/page.tsx` importa i componenti estratti (non li definisce inline);
5. ✅ le 6 pagine informative (`/guide /faq /manifesto /contatti /regole
   /moderazione`) importano `InfoPage` dal path condiviso.

## 3. Regressioni visive route chiave (requisito 3)

Script `scripts/check-key-routes.mjs` (render reale via Miniflare sul bundle
`dist/server`, come il worker di produzione): HTTP 200, `main#main-content`,
skip link, nav-shell, un solo h1, un solo footer, SiteFooter globale, sezioni
attese per pagina. **5/5 PASS** post-refactor:

| Route       | Esito | h1 |
|-------------|-------|----|
| `/`         | ✅ | Public data about public surveillance. |
| `/manifesto`| ✅ | A manifesto for legible public space. |
| `/regole`   | ✅ | What we publish, and how you can help. |
| `/privacy`  | ✅ | Privacy notice |
| `/faq`      | ✅ | Questions people ask about the database. |

→ **Zero regressioni visive/strutturali sulle route chiave** (requisito 3 ✅).
Nota: il check SiteFooter usa `aria-label="Site footer"` (locale EN di default,
coerente con rendered-html.test.mjs); le route con cookie `=it` rendono
"Piè di pagina del sito" — coperto dai test i18n esistenti.

## 4. Audit struttura — obiettivo ~150 righe (requisito 4)

| File | Righe | Target ~150 | Note |
|------|------:|:---:|------|
| **app/page.tsx** (orchestratore) | **129** | ✅ | era 269 (monolite) → -52% |
| app/components/home/Hero.tsx | 20 | ✅ | |
| app/components/home/MapPanel.tsx | 41 | ✅ | |
| app/components/home/CorrectionForm.tsx | 38 | ✅ | |
| app/components/home/PublicDirectory.tsx | 94 | ✅ | |
| app/components/home/ReportForm.tsx | **162** | ⚠️ | **deviazione registrata** (v. sotto) |
| app/components/InfoPage.tsx | 76 | ✅ | layout condiviso |
| app/components/LegalPage.tsx | 146 | ✅ | pattern di riferimento |
| app/components/SiteFooter.tsx | 58 | ✅ | |
| app/components/LocaleProvider.tsx | 110 | ✅ | |

⚠️ **Anomalia (non bloccante): `ReportForm.tsx` = 162 righe** (> target ~150,
+12). Causa: hook `useReportFlow` (~131 righe di logica: stato flusso report,
nearby-check, upload foto) **co-locato** con il componente JSX nello stesso
file. Il refactor ha centrato l'obiettivo su tutti gli altri file; questo è
l'unico sforamento. **Raccomandazione:** split dell'hook in
`app/components/home/useReportFlow.ts` dedicato (riporterebbe ReportForm a
~30 righe). Registrato come **KNOWN_DEVIATION con baseline pinnata (162)** nel
test: la suite fallisce se il file cresce oltre 162, e il log del test lo
segnala esplicitamente a ogni run (niente pass silenzioso).

Fuori scope del refactor (pre-esistenti, non toccati da questo run):
`ModerationDashboard.tsx` (341) e `app/account/page.tsx` (240) superano il
target ma non fanno parte dei componenti estratti da Ada/Linus.

## 5. Esiti per requisito

| # | Requisito | Esito |
|---|-----------|-------|
| 1 | rendered-html e route continuano a passare | ✅ 786/786 + suite route 19+17+2+9 |
| 2 | smoke test nuovi componenti (Hero, PublicDirectory, ReportForm, InfoPage) | ✅ tests/component-smoke.test.mjs 7/7 |
| 3 | zero regressioni visive route chiave (/, /manifesto, /regole, /privacy, /faq) | ✅ 5/5 PASS |
| 4 | nessun componente > ~150 righe | ⚠️ 6/7 sotto target; ReportForm 162 (deviazione registrata + baseline pinnata) |

## 6. Modifiche in questo PR

- `tests/component-smoke.test.mjs` — **nuovo**, smoke test struttura post-refactor (7 test).
- `scripts/check-key-routes.mjs` — **nuovo**, baseline regressioni visive 5 route chiave.
- `docs/qa/QA_REPORT_refactor-structure.md` — **questo report**.

## 7. Note privacy/safety

Nessun dato personale nei test; nessun dato reale di sorveglianza (solo
`prototypeRecords` demo). Nessuna modifica a codice di produzione.
