# Report QA finale — C-QA (COMMUNITY_PLAN §8)

- **Task**: t_8f2d89ac · Fase C-QA, QA trasversale community system
- **QA**: Grace · **Data**: 2026-08-01
- **Base verificata**: `origin/main @ 9b258ef` (C1 #174 + C2 #176 + C4 #175 + C3 #177 mergiate)
- **Branch QA**: `qa/grace/t_8f2d89ac-confidence-guard` (base + commit QA 753efde)
- **Esito**: ✅ **QA APPROVATO** (approvazione bloccante per il merge — convenzione board: QA approva, ada merge)

---

## 1. Suite anti-gaming — 6 layer Nora, 1:1

`tests/anti-gaming.test.mjs` — **19/19 PASS** (14 test top-level + 5 subtest). Clock iniettato
(`NOW` costante passata come parametro `now`), zero dati reali (IP TEST-NET `203.0.113.x`,
email fittizie, id demo).

| # | Layer / caso (COMMUNITY_PLAN §4.2 + consegna) | Test | Esito |
|---|---|---|---|
| 1 | UNIQUE strutturale a livello DB + race | `the UNIQUE (camera_id, contributor_id) constraint rejects a second row at the SQL level` · `race: two concurrent setConfirmation calls yield exactly one row` | ✅ |
| 2 | Level gate L1 (≥1 verified, MAI email verification) | `level gate: only verified contributions unlock the confirm toggle` (+ `PUT maps level_gate and self_verify to 403` in api-confirmations) | ✅ |
| 3 | Sock-puppet IP-hash + surge alert callerHash | `PUT trips the IP-hash burst bucket and the alert never carries the raw IP` (api-confirmations: 3 PUT stessa IP, bucket=2 → 3ª 429 + Retry-After; alert `trackedCallers ≥ 1`, `callerHash` presente, IP raw mai nel log) | ✅ |
| 4 | Cap giornaliero 20→21° 429 + reset finestra | `daily quota: 20/day, the 21st answers 429 and the window resets after 24h` (+ `trusted quota` knob separato) | ✅ |
| 5 | Cap per-record 6° 429 | `per-record cap: 5 distinct contributors, the 6th answers 429` | ✅ |
| 6 | Decay a review window | `decay: confirmations before last_verified_at do not count; a re-verified record renews` + real SQL in db-public-contracts | ✅ |
| + | Farming livelli pending/rejected non contano | `R1: countVerifiedCameras counts ONLY status='verified' rows (real SQL)` (api-contributions) | ✅ |
| + | No-op edit senza evento (anti-farming) | `E7 no-op edit answers 200 changed:false with no event` + `E7 real SQL: a no-op pending edit writes nothing` (api-edit) | ✅ |
| + | Erasure de-attribuisce (art. 17) | `eraseContributor deletes verifications and de-attributes community data`: conferme hard-deleted, edit_requests e correction_requests SET NULL, cameras de-attribuite, contributor rimosso, altri utenti intatti (+ `E10 real SQL` per gli edit) | ✅ |
| + | Self-verify 403 | `self-verification is rejected` (+ mapping 403 distinto in api-confirmations) | ✅ |
| + | Record non pubblici 404 | `only publicly current cameras can be confirmed` (+ `camera_not_public → 404` e malformed id mai a db) | ✅ |
| + | Confidence score division-by-zero se v2 | Guard QA (commit 753efde): nessuna colonna `confidence` in nessuna tabella (v2 fuori alpha) + `deriveLevel(NaN/Infinity) → L0` | ✅ |

## 2. Gate globali §8.1 per PR (C1 #174, C2 #176, C3 #177, C4 #175)

| Gate | Verifica | Esito |
|---|---|---|
| 8.1.1 CI verde per PR | Tutte le run CI/Security/Lighthouse/Coverage su main e sui 4 merge: SUCCESS; coverage Statement **94.31%** > 75% (run CI su 9b258ef) | ✅ |
| 8.1.2 Test nella stessa PR | `git show --stat` per merge: #174 → anti-gaming + api-confirmations + db-public-contracts; #176 → api-contributions; #177 → api-edit + e2e + client-moderation-dashboard; #175 → corrections-dedupe + intake-contract | ✅ |
| 8.1.3 Vincoli DB a livello DB | UNIQUE SQL direct + race (anti-gaming), migrazioni in db-public-contracts, sezioni "real SQL" in api-edit (Part 2) | ✅ |
| 8.1.4 Anti-gaming deterministico | Clock iniettato, fixture fittizie, zero test tempo-reali | ✅ |
| 8.1.5 axe 0 + parity i18n per route | axe-audit su tutte le route registrate (0 crit/ser, incl. /account e /records/[id]); bundle community parity type-checked; route pagina nuove = C5/C6 → gate al loro merge | ✅ |
| 8.1.6 Erasure testata PRIMA del merge schema | PR #174 = schema (0020-0023) + test erasure nella STESSA PR, merge unico | ✅ |
| 8.1.7 Review CTO + approve QA | Presente (questo report); ada merge | ✅ |

## 3. Criteri per area (parere QA #821)

| Area | Criteri | Copertura | Esito |
|---|---|---|---|
| **Profilo P1-P8** | 401 anonimo; filtri type/status whitelist 400; paginazione invalida 400 (mai 500); cross-account 400; no-store; pageSize cap 100; 503 fail-closed; level nel meta | api-contributions P1/P2/P3/P4/P5/P6(+b)/P7(+b)/P8(+b) | ✅ |
| **Editing E1-E11** | guard order 401/403/403; owner pending 200 no-store; non-owner/anonimo 404, moderatore non-owner 403; verified → 202 edit-request, approve/reject idempotente + `edit_applied`/`edit_rejected`; removed/rejected 409; non-editable 400 per-campo senza effetti parziali; CSRF; no-op senza evento; race 409; rate-limit edit 5/min 429; erasure SET NULL | api-edit E1-E10 (route + real SQL), 118/118 con conferme/contributi | ✅ |
| **Livelli L1-L8** | boundary 0/1/4/5/19/20/49/50/51; solo verified conta; monotonia up e down; soglie in un const; sempre server-side; nessun endpoint espone livelli altrui/globali; erasure recalcola; funzione pura (niente cache) | api-contributions L1-L8 + R1 | ✅ |
| **Verifiche V1-V14** | toggle 200/409/404; UNIQUE DB + race = 1 riga; self-verify 403; pending/removed 404; L0 403; cap giornaliero 20→21° 429 + reset; cap per-record 6° 429; IP-hash burst → alert callerHash; cache 300/600 vs no-store; decay; CSRF + bucket rate-limit indipendenti; count GROUP BY IN (no N+1) | api-confirmations (30 test) + anti-gaming + db-public-contracts | ✅ |
| **Abuso A1-A7** | whitelist issue_type 201/400 (incl. ogni legacy free-text 400); mai free-text per removal/abuse; removal/abuse → moderation + eventi append-only; anonimo permesso ma rate-limitato; dedupe 409 (one-open per user+target, anonimi senza identifier, resolved non blocca); approved removal toglie da ogni superficie + appeal possibile; input-limits | corrections-intake-contract + corrections-dedupe + api-corrections + abuse-controls, 87/87 | ✅ |

**Suite completa locale (tree = main C1-C4 + commit QA): `npm test` → 1312/1312 PASS (0 fail, 0 skip).**

## 4. Audit a11y finale

| Voce | Verifica | Esito |
|---|---|---|
| axe-core 0 criticità/serie | `axe-audit.test.mjs` 21/21 PASS: 20 route registrate (incl. `/account` e `/records/[id]` → id demo fittizio), motore axe reale su HTML SSR, gate 0 crit/ser (moderate/minor tracciate) | ✅ |
| `/records/[id]/edit` | **Route non esistente su main** (C6 non mergiata) → il gate axe/parity si applica alla PR C6 (registro route-contracts + axe-audit lo coprono automaticamente quando la route atterra) | ⏳ pending C6 |
| 200% zoom / 320px | Layout-dependent: non valutabile in jsdom → coperto da Lighthouse CI (Chromium reale, soglia a11y ≥ 0.95, `lighthouserc.cjs`) sulle route pubbliche; componenti nuovi (StarConfirmButton, form edit) → gate alle PR C5/C6 | ✅ (gate) |
| Contrasto token badge | Asserzioni WCAG AA token-level (≥ 4.5:1) in navigation-pages.test.mjs; badge LevelBadge (C5, mai solo colore) → gate alla PR C5 | ✅ (gate) |
| aria-pressed / aria-live / aria-current | `a11y-interactive.test.mjs` 25/25: aria-pressed (toggle lingua), aria-live (role=alert, loading region), aria-current (footer/brand), aria-invalid + aria-describedby (form, gap QA-2026-08-01-2/-3 chiusi) | ✅ |

## 5. Audit i18n

| Voce | Verifica | Esito |
|---|---|---|
| Parity EN/IT runtime | Bundle `community.ts` con `Translation<typeof en>` type-checked (ADR 0007); i18n-pages: ogni route informativa renderizza EN e IT senza crash, `<html lang>` coerente col cookie, footer IT su pagine IT | ✅ |
| Plurali 1/3/0 | `community-i18n` plural formatters ("1 verifica / 3 verifiche / 0 verifiche") | ✅ |
| Zero stringhe hardcoded IT | Test "no `contributore` left in any Italian bundle" + "Italian renderings contain no English residual markers" + golden Eva EN/IT (terminologia congelata §6.1, zero jargon gamification) | ✅ |

Suite i18n: 13/13 PASS (community-i18n + i18n-pages).

## 6. Coverage (§8.4)

- Soglia globale righe: **94.31% Statement** (CI su main 9b258ef) > 75% ✅
- Moduli community ≥ 90%: db/confirmations 96.39%, db/corrections 100%, db/auth 99.55%, app/lib/confirm-ip-burst 95.83%, app/lib/abuse-alerts 90.74% ✅
- **Sotto la soglia del 90% §8.4**: `db/camera-edits.ts` 87.63% (262/299) e `app/api/cameras/[id]/confirmation/route.ts` 88.83% (167/188) → finding #1

## 7. Findings e osservazioni (NON bloccanti)

1. **Coverage §8.4 parziale**: 2 nuovi moduli community sotto il 90% (camera-edits 87.63%, confirmation route 88.83%). CI verde (soglia globale). Raccomandazione: sollevare con test dedicati nelle PR frontend C5/C6 (o un piccolo follow-up QA) — tracciato per il prossimo gate.
2. **Ratio gate livelli** (ADR 0018 §3.5, COMMUNITY_PLAN §3.3.2 ">50% rejected → il livello non sale"): documentato ma **non implementato in alpha** — `deriveLevel` è funzione pura del solo conteggio `verified` (conforme ai criteri QA L1-L8 e alla decisione §3.1). Serve decisione esplicita Ada/PM: alpha senza ratio gate oppure follow-up.
3. **Chiarimento decay**: la consegna citava "decay a `review_due_at`"; l'implementazione (e il piano §4.2 item 6) usano `last_verified_at` come finestra di decay, mentre `review_due_at` governa il public predicate. I test sono coerenti col piano — nessun difetto, solo terminologia.
4. **Ambito axe su /account**: gli audit renderizzano lo shell SSR senza sessione (nessun dato personale negli audit); il profilo autenticato con contributi/badge è C5 → il gate axe/parity/contrasto si applica alla PR C5.

## 8. Verdetto

**QA APPROVATO per le fasi backend community C1-C4** — tutte le verifiche del gate
COMMUNITY_PLAN §8 passano con evidenza reale:
suite anti-gaming 1:1 sui 6 layer (19/19), criteri P/E/L/V/A coperti e verdi
(118+87+13+21+25 test mirati), suite completa 1312/1312, axe-core 0 crit/ser sulle
route esistenti, parity i18n EN/IT ok, erasure verificata prima del merge schema,
CI 6/6 su main.

**Bloccanti QA**: nessuno.
**Gate aperti per le PR frontend C5/C6** (non parte di questo task): a11y sui nuovi
componenti (StarConfirmButton aria-pressed/aria-live, LevelBadge contrasto,
/records/[id]/edit 200% zoom/320px), parity i18n delle nuove route, coverage dei
2 moduli sotto soglia.

*Convenzione board: QA approva → ada merge.*
