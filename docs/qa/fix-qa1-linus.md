# FIX QA FUNZIONALE #1 — Finding aperti F1, F4, F6 (residuo), F7

- **Autore:** Linus (Backend/API)
- **Task:** t_b6f04976 — FIX QA#1 funzionale (finding aperti da t_894e0cc3)
- **Data:** 2026-08-04
- **Base:** main `137e64d` (dopo PR #281 = fix F6 enforcement atomico, già mergiato)
- **Branch:** `feature/linus/t_b6f04976-fix-qa1`
- **Stato CI:** Lint ✓ Typecheck ✓ Build ✓ Test 1880/1880 ✓
- **Test:** `tests/qa-funzionale-linus.test.mjs` (13 test, +4 rispetto alla QA originale),
  `tests/publication-boundaries.test.mjs` (regex aggiornati per la nuova firma di `callerKey`)

## Riepilogo

| Finding | Severità | Fix | File principali |
|---------|----------|-----|-----------------|
| F1 | P2 | try/catch in `parseCookies` + guard 400 pulito sulle route scriventi | `app/lib/csrf.ts`, `app/lib/auth-session.ts`, `app/lib/write-gate.ts`, `app/api/appeals/route.ts`, `app/api/auth/me/route.ts` |
| F4 | P3 | `AbortSignal.timeout` sul fetch purge (default 2.5s) + knob `CACHE_PURGE_TIMEOUT_MS` | `app/lib/cache-purge.ts` |
| F6 | P3 | TOCTOU residuo post-#281: probe di classificazione nella STESSA `d1.batch` dell'INSERT | `db/confirmations.ts` |
| F7 | P3 | XFF mai fidato senza `cf-connecting-ip` (default `"unknown"`, fail-closed) + opt-in `TRUST_XFF=true` cablato via `env` in tutte le route | `app/lib/rate-limit.ts` + 21 route + 2 lib |

---

## F1 (P2) — Cookie di sessione malformato: niente più 5xx, 400 pulito

**Problema (da QA t_894e0cc3):** `decodeURIComponent` in `parseCookies`
(`app/lib/csrf.ts:43`) lanciava `URIError` su un percent-encoding troncato
(`osdb_session=%E0%A4%A`): GET /api/auth/me rispondeva 503, POST /api/appeals
faceva uscire l'eccezione dall'handler (500 di framework).

**Fix (due livelli):**

1. **Try/catch in `parseCookies`** (`app/lib/csrf.ts:43-53`): un valore
   malformato è trattato come **assente** — `parseCookies` non lancia mai più.
   Le route di lettura che degradano l'assenza ad anonimo (es. GET
   /api/auth/me) rispondono ora 401 pulito, come da contratto.
2. **Guard 400 per le route scriventi**: `malformedCookieNames(request)` in
   `csrf.ts` rileva i cookie PRESENTI ma non decodificabili; 
   `malformedSessionCookieGuard(request)` in `app/lib/auth-session.ts` (nuovo)
   risponde `400 {"error":"Malformed session cookie. Clear cookies and log in
   again."}` con `Cache-Control: no-store`. Applicato a:
   - `app/lib/write-gate.ts` → `requireVerifiedContributor` (tutti i write);
   - `app/api/auth/me/route.ts` PATCH;
   - `app/api/appeals/route.ts` POST.

**Perché 400 e non 401 (cambio di contratto rispetto al report QA):** un cookie
corrotto è un **bug del client**, non un utente sloggato: il 401 silenzioso
nasconde la corruzione, il 400 dice all'utente l'azione giusta (cancellare i
cookie). POST /api/appeals richiede comunque una sessione (anonimo = 401), quindi
il 400 non apre superficie: è solo più diagnosticabile. Il test F1b è stato
aggiornato di conseguenza (401 → 400 + body `Malformed session cookie`).

**Test:** `F1a` (GET /api/auth/me → 401, non 503) invariato; `F1b` aggiornato
(400 pulito + body, mai throw).

---

## F4 (P3) — purgeCacheTags: timeout sul fetch + knob configurabile

**Problema:** `fetch(PURGE_API/...)` in `app/lib/cache-purge.ts` non aveva
`AbortSignal.timeout` (tiles e geocode sì); la moderation route lo attende
inline DOPO che il batch D1 ha committato la decisione → un'API CF lenta/hung
tiene in ostaggio la risposta di moderazione (il moderatore ritenta → 404 su
item già transitato, caso peggiore sul takedown privacy/safety).

**Fix:** `signal: AbortSignal.timeout(purgeTimeoutMs(env))`, dove
`purgeTimeoutMs` legge il knob `CACHE_PURGE_TIMEOUT_MS` con default 2500ms
(stesso pattern dei knob `TILE_UPSTREAM_TIMEOUT_MS`/geocode). Resta
**fail-open** (il `catch` ritorna `{ purged: false, reason: "network-error" }`,
mai un throw sul write path).

**Test:**
- `F4` (invariato): fetch stub signal-aware → abortisce entro il budget, oggi
  restava appeso senza signal;
- `F4b` (nuovo): con `CACHE_PURGE_TIMEOUT_MS=80` la chiamata completa ben prima
  del budget del race (il knob accorcia il bound) e ritorna fail-open pulito.

---

## F6 (P3) — setConfirmation: TOCTOU residuo post-#281 chiuso con batch unica

**Contesto:** PR #281 aveva reso atomico l'**enforcement** della quota
(`INSERT ... SELECT ... WHERE (SELECT COUNT(*) ...) < max ON CONFLICT DO
NOTHING RETURNING id`). Restava però un **TOCTOU residuo di classificazione**:
dopo un INSERT rifiutato, i tre read di classificazione (existing-pair, COUNT
daily, COUNT per-record) giravano in **tre statement separate** — sotto race (un
DELETE concorrente libera uno slot, o un INSERT atterra tra il tentativo e le
letture) potevano disallinearsi dal motivo reale del rifiuto e rispondere il
`kind` sbagliato (o cadere nel 429 difensivo di fallback).

**Fix:** l'INSERT condizionale e le **tre probe di classificazione girano nella
STESSA `d1.batch`** (`db/confirmations.ts:259-307`): un solo snapshot per tutte
le statement → il kind restituito corrisponde sempre a ciò che l'INSERT ha
realmente valutato. La probe `existing` ora guida `duplicate`, il COUNT daily
`daily_quota_exceeded`, il COUNT per-record `per_record_cap_exceeded`; il
fallback difensivo resta come invariante irraggiungibile.

**Test:**
- `F6a`/`F6b` (invariati, da #281): struttura INSERT condizionale + contratto
  sequenziale `CONFIRMATIONS_DAILY_MAX=1` (primo ok, secondo
  `daily_quota_exceeded`);
- `F6c` (nuovo): pin strutturale — INSERT `... RETURNING id` e le tre probe
  devono stare DENTRO la stessa `d1.batch([...])` nel sorgente reale
  (`db/confirmations.ts`).

---

## F7 (P3) — callerKey: XFF mai fidato di default, opt-in TRUST_XFF cablato

**Problema:** senza `cf-connecting-ip`, `callerKey` usava il primo hop di
`X-Forwarded-For` — su una deployment NON dietro l'edge Cloudflare (prototype
LXC 114 in HTTP diretto) l'header è interamente client-controlled: un
account-farm ruotava l'header a ogni richiesta e azzerava TUTTI i cap per-IP
(registrazione 5/24h, auth, submit, tiles, geocode).

**Fix:**
1. **Default fail-closed**: senza `cf-connecting-ip`, XFF **non è mai fidato**:
   `callerKey` ritorna `"unknown"` (un bucket globale). Pinnato da
   `abuse-controls.test.mjs` (invariato) e dal test e2e `F7`.
2. **Opt-in esplicito `TRUST_XFF=true`** (follow-up documentato nel report QA):
   per deployment dietro un proxy affidabile che sanifica/sovrascrive XFF (mai
   il valore client). **Novità di questo fix:** tutte le 21 route e le 2 lib
   (`auth-route-helpers.ts`, `photo-quota.ts` via `submitterKeyFor`) passano ora
   `env` a `callerKey(request, env)` — il knob è **raggiungibile** (prima
   sarebbe stato codice morto: nessun chiamante passava env). Firma
   retro-compatibile (`env?`), `cf-connecting-ip` resta sempre prioritario.

**Test:**
- `F7` (invariato): 6 registrazioni con XFF ruotato → `[201,201,201,201,429,429]`
  (cap 5/24h regge: tutte sul bucket "unknown");
- `F7b` (nuovo): con `TRUST_XFF=true` e XFF ruotato → `[201,201,201,201,201,201]`
  (il knob ripristina i cap per-client dietro proxy dichiarato affidabile);
- `publication-boundaries.test.mjs`: i 3 regex strutturali che pinnavano
  `callerKey(request)` accettano ora l'argomento env
  (`/callerKey\(request(?:,\s*env)?\)/`) — intento invariato (le route devono
  usare callerKey per il rate limiting).

---

## Verifiche eseguite (reali)

- `npx eslint` su tutti i file toccati: **0 errori**.
- `npx tsc --noEmit` (stesso comando della CI): **0 errori**.
- `npm run build` (vinext): **completata**.
- `node --test "tests/*.test.mjs"`: **1880/1880 pass** (prima dei fix di
  questo task: 3 rossi in publication-boundaries per la firma di callerKey,
  ora aggiornati e verdi).

## File toccati

**Fix QA (9):** `app/lib/csrf.ts`, `app/lib/auth-session.ts` (nuovo guard),
`app/lib/write-gate.ts`, `app/lib/cache-purge.ts`, `app/lib/rate-limit.ts`,
`db/confirmations.ts`, `app/api/appeals/route.ts`, `app/api/auth/me/route.ts`.

**Wiring env per TRUST_XFF (23 callsite):** `app/api/photos/route.ts`,
`app/api/photos/[id]/route.ts`, `app/api/geocode/route.ts`,
`app/api/auth/register/route.ts`, `app/api/cameras/search/route.ts`,
`app/api/cameras/route.ts`, `app/api/cameras/[id]/route.ts`,
`app/api/cameras/[id]/edit/route.ts`,
`app/api/cameras/[id]/confirmation/route.ts`, `app/api/cameras/revisions/route.ts`,
`app/api/cameras/nearby/route.ts`, `app/api/tiles/[z]/[x]/[y]/route.ts`,
`app/api/appeals/[id]/route.ts`, `app/api/moderation/route.ts`,
`app/api/moderation/corrections/route.ts`, `app/api/corrections/route.ts`,
`app/lib/auth-route-helpers.ts`, `app/lib/photo-quota.ts`.

**Test (2):** `tests/qa-funzionale-linus.test.mjs` (F1b aggiornato + F4b, F6c,
F7b nuovi), `tests/publication-boundaries.test.mjs` (regex callerKey).

**Report:** questo file.
