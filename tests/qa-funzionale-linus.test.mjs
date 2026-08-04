// QA FUNZIONALE APPROFONDITO #1 (task t_894e0cc3) — test di riproduzione.
//
// Ogni test inquadra UN finding del report docs/qa/qa-funzionale-linus.md:
// file:riga del difetto, scenario di riproduzione, severità, fix proposto.
// Convenzione red-before-green (stessa del malformed-json-routes): i test
// ROSSI (che falliscono su main) documentano il bug; passano solo dopo il
// fix. I test che inquadrano race condition non riproducibili con il D1
// sincrono del harness (node:sqlite serializza) verificano il vincolo
// STRUTTURALE che il fix introduce (indice UNIQUE / guardia SQL atomica).
//
// Findings coperti:
//   F1 (P2) app/lib/csrf.ts:43        cookie malformato -> URIError -> 503
//                                     (e handler non protetto su appeals)
//   F2 (P2) db/appeals.ts:203         duplicate_pending non atomico: manca
//                                     UNIQUE parziale su decision_event_id
//   F3 (P2) db/appeals.ts:320         decideAppeal: UPDATE senza guardia di
//                                     stato (moderateCamera la ha)
//   F4 (P3) app/lib/cache-purge.ts:75 fetch CF Purge API senza timeout,
//                                     atteso inline nel write path moderation
//   F5 (P2) db/auth.ts:271, db/mailer.ts:126 — registrations_ip_log e
//                                     email_send_log mai spazzati dal
//                                     retention sweep (nessuna policy R-*)
//   F6 (P3) db/confirmations.ts:219   quota giornaliera/per-record: conteggio
//                                     e insert non atomici (TOCTOU)
//   F7 (P3) app/lib/rate-limit.ts:236 callerKey fida di X-Forwarded-For
//                                     spoofabile quando manca cf-connecting-ip

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { apiRequest } from "./helpers/api-harness.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
} from "./helpers/db-runtime-harness.mjs";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  cleanupE2ETree,
  e2eEnv,
  loadE2EModule,
  loadE2ERoute,
} from "./helpers/e2e-harness.mjs";

const NOW = "2026-08-01T00:00:00.000Z";

// Repo root (per i test STRUTTURALI che leggono il sorgente reale dei fix).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// F1 (P2) — cookie di sessione malformato: decodeURIComponent lancia URIError
// ---------------------------------------------------------------------------
// app/lib/csrf.ts:43 `cookies[name] = decodeURIComponent(value)` non protegge
// il decode: un cookie `osdb_session=%E0%A4%A` (percent-encoding troncato)
// lancia URIError. Su GET /api/auth/me (readCookie dentro il try) la route
// rispondeva 503 "Unable to read the session" invece del 401 da anonimo; su
// POST /api/appeals (resolveOptionalContributor a riga 112, FUORI dal try)
// l'eccezione usciva dall'handler -> 500. Un chiamante anonimo poteva generare
// errori 5xx a piacere (robustezza/error handling).
// Fix (t_894e0cc3 + follow-up t_b6f04976):
//   1. try/catch attorno a decodeURIComponent: un valore malformato è trattato
//      come ASSENTE (parseCookies non lancia mai più) — le route di lettura
//      che degradano l'assenza ad anonimo rispondono 401 pulito;
//   2. le route SCRIVENTI (write gate, PATCH /api/auth/me, POST /api/appeals)
//      distinguono ora "nessun cookie" da "cookie PRESENTE ma corrotto" tramite
//      malformedSessionCookieGuard (app/lib/auth-session.ts): un cookie rotto è
//      un bug del client, la risposta è un 400 pulito e actionable (cancella i
//      cookie) — mai un 5xx, mai un 401 silenzioso che nasconde la corruzione.

let e2e;

beforeEach(async () => {
  e2e = await e2eEnv();
  e2e.DB = new D1SqliteDatabase();
  await applyDrizzleMigrations(e2e.DB);
  // Alza i bucket di rate limit: il contratto sotto test è il cookie, non il
  // limiter.
  e2e.AUTH_RATE_LIMIT_MAX = "100000";
  e2e.POST_RATE_LIMIT_MAX = "100000";
  e2e.REGISTER_IP_RATE_LIMIT_MAX = "100000";
  delete e2e.REGISTER_IP_RATE_LIMIT_WINDOW_SECONDS;
});

after(async () => {
  await cleanupE2ETree();
  await cleanupDbRuntime();
});

test("F1a: GET /api/auth/me con cookie malformato risponde 401 (anonimo), non 503", async () => {
  const me = await loadE2ERoute("app/api/auth/me/route.mjs");
  const request = apiRequest("/api/auth/me", {
    headers: { cookie: "osdb_session=%E0%A4%A" },
  });
  const response = await me.GET(request);
  assert.equal(
    response.status,
    401,
    "un cookie malformato è un chiamante anonimo: deve rispondere 401, " +
      `non ${response.status} (URIError non gestito in parseCookies -> 503)`,
  );
});

test("F1b: POST /api/appeals con cookie malformato risponde 400 pulito (mai 5xx, mai throw di handler)", async () => {
  const appeals = await loadE2ERoute("app/api/appeals/route.mjs");
  const request = apiRequest("/api/appeals", {
    method: "POST",
    headers: { cookie: "osdb_session=%E0%A4%A" },
    body: {
      entity: "camera",
      entityId: 1,
      decisionEventId: 1,
      reason: "I am directly affected by this decision and want it reviewed.",
    },
  });

  let threw = null;
  let response = null;
  try {
    response = await appeals.POST(request);
  } catch (error) {
    threw = error;
  }
  assert.equal(
    threw,
    null,
    "resolveOptionalContributor (app/api/appeals/route.ts:112) era fuori dal " +
      "try: un cookie malformato faceva esplodere l'handler (URIError). Deve " +
      `essere intercettato dal guard. Errore osservato: ${threw}`,
  );
  assert.equal(
    response.status,
    400,
    "un cookie di sessione PRESENTE ma non decodificabile è un bug del client: " +
      "le route scriventi rispondono 400 pulito (cancella i cookie) — follow-up " +
      "t_b6f04976 sul contratto 401-anonimo del report originale — mai un " +
      `500/503 da URIError. Status osservato: ${response.status}`,
  );
  const body = await response.json();
  assert.match(
    body.error,
    /Malformed session cookie/,
    "il 400 deve spiegare l'azione correttiva (cancellare i cookie), non " +
      `nascondere la corruzione. Body: ${JSON.stringify(body)}`,
  );
});

// ---------------------------------------------------------------------------
// F2 (P2) — fileAppeal duplicate_pending non atomico: manca l'indice UNIQUE
// ---------------------------------------------------------------------------
// db/appeals.ts:203-209: SELECT di un pending appeal poi INSERT; nessun
// vincolo UNIQUE parziale su (decision_event_id) WHERE status='pending'
// (drizzle/0010_auth_roles_appeals.sql:24-42 crea solo status_idx e
// entity_idx). Due POST /api/appeals concorrenti sullo stesso decision event
// passano entrambi la SELECT e inseriscono due appeal pending sulla stessa
// decisione: il 409 documentato è aggirabile e l'audit trail si duplica.
// Fix: CREATE UNIQUE INDEX ... ON moderation_appeals (decision_event_id)
// WHERE status = 'pending' + INSERT ... ON CONFLICT DO NOTHING (changes=0
// -> duplicate_pending). Il harness D1 è sincrono e non può interleave due
// richieste: il test pinna il vincolo strutturale che il fix introduce.

test("F2: deve esistere un indice UNIQUE parziale su decision_event_id (pending) per rendere atomico duplicate_pending", async () => {
  const runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;

  const indexList = await db.prepare("PRAGMA index_list('moderation_appeals')").all();
  const candidates = indexList.results.filter((row) => row.unique === 1);
  let hasDecisionEventUnique = false;
  for (const index of candidates) {
    const columns = await db
      .prepare(`PRAGMA index_info('${index.name}')`)
      .all();
    if (
      columns.results.some(
        (column) => column.name === "decision_event_id",
      )
    ) {
      // Il fix proposto è un indice UNIQUE parziale WHERE status='pending';
      // qualunque UNIQUE su decision_event_id chiude comunque la race
      // SELECT-then-INSERT di fileAppeal.
      hasDecisionEventUnique = true;
    }
  }
  assert.ok(
    hasDecisionEventUnique,
    "manca l'indice UNIQUE parziale su moderation_appeals(decision_event_id) " +
      "WHERE status='pending': due appeal concorrenti sulla stessa decisione " +
      "passano entrambi il check SELECT-then-INSERT (db/appeals.ts:203) e " +
      "finiscono entrambi pending",
  );
});

// ---------------------------------------------------------------------------
// F3 (P2) — decideAppeal: UPDATE finale senza guardia di stato atomica
// ---------------------------------------------------------------------------
// db/appeals.ts:320-324: `UPDATE moderation_appeals SET status = ... WHERE
// id = ?` senza `AND status IN ('pending','escalated')`. Il guard è solo nel
// SELECT precedente; moderateCamera usa invece la guardia nella UPDATE
// stessa (db/moderation.ts:1022-1025 `WHERE id = ? AND status = ?`). Due
// decisioni concorrenti sullo stesso appeal passano entrambe la pre-lettura,
// il last-write-wins ribalta una decisione già presa e l'audit trail registra
// due eventi di decisione (la coda può essere riaperta due volte).
// Fix: aggiungere la guardia di stato alla UPDATE e mappare changes=0 a
// not_found/not_pending.
//
// NOTA (follow-up t_0b7dd8fc): la prima versione di questo test hardcoded la
// UPDATE GIÀ corretta nel test stesso (`AND status IN ('pending',
// 'escalated')`), quindi passava anche su main col bug (test VACUO: non
// verificava il codice reale). Riscritto su due livelli:
//   1. STRUTTURALE — la UPDATE reale in db/appeals.ts (il sorgente, non un
//      copia-incolla nel test) deve contenere la guardia: rosso su main
//      senza il fix, verde con il fix.
//   2. COMPORTAMENTALE — decideAppeal() REALE invocato su un appeal già
//      deciso deve rispondere not_pending senza toccare righe.

test("F3a: la UPDATE di decideAppeal in db/appeals.ts porta la guardia di stato atomica (strutturale)", async () => {
  const source = await readFile(path.join(root, "db", "appeals.ts"), "utf8");
  const update = source.match(
    /UPDATE moderation_appeals SET status = \?, decided_by = \?, decision_note = \?, decided_at = \? WHERE id = \?[\s\S]*?RETURNING id/,
  );
  assert.ok(
    update,
    "UPDATE finale di decideAppeal non trovata in db/appeals.ts: lo statement " +
      "reale non è quello atteso dal test — il test non può più essere vacuo",
  );
  assert.ok(
    update[0].includes("AND status IN ('pending', 'escalated')"),
    "la UPDATE di decideAppeal (db/appeals.ts) non ha la guardia di stato: " +
      "WHERE id = ? senza AND status IN ('pending','escalated') — due " +
      "decisioni concorrenti sullo stesso appeal passano entrambe la " +
      "pre-lettura e il last-write-wins ribalta una decisione già presa " +
      "(come db/moderation.ts moderateCamera)",
  );
});

test("F3b: decideAppeal reale su un appeal già deciso risponde not_pending e non tocca righe", async () => {
  const runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;

  // Fixture minima: un utente, un reviewer (FK di decided_by), un decision
  // event finale, un appeal già deciso (status='upheld').
  await db
    .prepare(
      "INSERT INTO users (email, display_name, role, active, created_at, updated_at) VALUES (?, ?, 'moderator', 1, ?, ?)",
    )
    .bind("reviewer@osdb.test", "Senior Reviewer", NOW, NOW)
    .run();
  const user = await db.prepare("SELECT id FROM users WHERE email = ?").bind("reviewer@osdb.test").first();
  await db
    .prepare(
      "INSERT INTO reviewers (display_name, role, active, mfa_enabled, created_at, updated_at) VALUES ('QA Reviewer', 'senior_moderator', 1, 0, ?, ?)",
    )
    .bind(NOW, NOW)
    .run();
  const reviewer = await db.prepare("SELECT id FROM reviewers WHERE display_name = ?").bind("QA Reviewer").first();
  await db
    .prepare(
      `INSERT INTO moderation_events (entity, entity_id, previous_status, new_status, action, reason_code, note, actor, reviewer_id, actor_role, recused, escalated, second_reviewer_id, appeal_id, created_at)
       VALUES ('camera', 1, 'pending', 'verified', 'approve', 'verified-on-site', 'x', 'X', NULL, 'moderator', 0, 0, NULL, NULL, ?)`,
    )
    .bind(NOW)
    .run();
  const event = await db.prepare("SELECT id FROM moderation_events LIMIT 1").first();
  await db
    .prepare(
      `INSERT INTO moderation_appeals (entity, entity_id, decision_event_id, appellant_id, reason, status, created_at)
       VALUES ('camera', 1, ?, ?, 'I am directly affected by this decision and want it reviewed.', 'upheld', ?)`,
    )
    .bind(event.id, user.id, NOW)
    .run();
  const appeal = await db.prepare("SELECT id FROM moderation_appeals LIMIT 1").first();

  // decideAppeal REALE (runtime.appeals = db/appeals.ts transpilato) su un
  // appeal già 'upheld': la pre-lettura lo vede deciso e la guarded UPDATE
  // (F3a) non deve comunque toccare righe. Prima del fix la UPDATE senza
  // guardia avrebbe ribaltato upheld -> dismissed.
  const result = await runtime.appeals.decideAppeal({
    id: appeal.id,
    decision: "dismiss",
    reviewer: { id: reviewer.id, displayName: "QA Reviewer", role: "senior_moderator", active: 1 },
    note: "second decision attempt",
  });
  assert.equal(
    result.kind,
    "not_pending",
    "decideAppeal su un appeal già deciso deve rispondere not_pending, " +
      `non ${result.kind} — un secondo moderatore non può ribaltare una decisione presa`,
  );
  const after = await db.prepare("SELECT status FROM moderation_appeals WHERE id = ?").bind(appeal.id).first();
  assert.equal(
    after.status,
    "upheld",
    "l'appeal già deciso non deve cambiare stato: 0 righe toccate (guardia " +
      "di stato nella UPDATE, db/appeals.ts)",
  );
});

// ---------------------------------------------------------------------------
// F4 (P3) — purgeCacheTags: fetch senza timeout atteso sul write path
// ---------------------------------------------------------------------------
// app/lib/cache-purge.ts:75: `fetch(PURGE_API/...)` senza AbortSignal.timeout
// (tiles e geocode lo usano, questo no). app/api/moderation/route.ts:459-482
// attende `await purgeCacheTags(...)` DOPO che il batch D1 ha committato la
// decisione: un'API CF lenta/hung blocca la risposta di moderazione — il
// moderatore vede un errore e ritenta, ma l'item è già transitato (404).
// Fix (t_894e0cc3 + follow-up t_b6f04976): AbortSignal.timeout sul fetch,
// default 2.5s, personalizzabile con CACHE_PURGE_TIMEOUT_MS (stesso pattern
// dei knob TILE_UPSTREAM_TIMEOUT_MS/geocode). Fail-open: mai un throw.

test("F4: purgeCacheTags deve avere un bound temporale sul fetch (AbortSignal.timeout)", async () => {
  const cachePurge = await loadE2EModule("app/lib/cache-purge.mjs");
  e2e.CACHE_PURGE_TOKEN = "test-token";
  e2e.CACHE_PURGE_ZONE_ID = "test-zone";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, init) =>
    new Promise((resolve, reject) => {
      const signal = init?.signal;
      // Stub signal-aware: senza signal non si risolve MAI (oggi il fetch di
      // cache-purge non passa signal -> hang). Con il fix, l'abort la rifiuta.
      if (!signal) return;
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });

  try {
    const result = await Promise.race([
      cachePurge.purgeCacheTags(["cameras-list"], e2e),
      new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), 4000)),
    ]);
    assert.notEqual(
      result.__timeout,
      true,
      "purgeCacheTags resta appeso su un upstream morto: il fetch (cache-purge.ts:75) " +
        "non ha AbortSignal.timeout e la moderation route lo attende inline " +
        "dopo che il batch D1 ha già committato la decisione",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("F4b: CACHE_PURGE_TIMEOUT_MS accorcia il bound del fetch purge (knob t_b6f04976)", async () => {
  const cachePurge = await loadE2EModule("app/lib/cache-purge.mjs");
  e2e.CACHE_PURGE_TOKEN = "test-token";
  e2e.CACHE_PURGE_ZONE_ID = "test-zone";
  e2e.CACHE_PURGE_TIMEOUT_MS = "80"; // ben sotto il default 2500ms

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, init) =>
    new Promise((resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });

  try {
    const start = Date.now();
    const result = await Promise.race([
      cachePurge.purgeCacheTags(["cameras-list"], e2e),
      new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), 1500)),
    ]);
    assert.notEqual(
      result.__timeout,
      true,
      "con CACHE_PURGE_TIMEOUT_MS=80 la chiamata deve abortire entro il knob, " +
        "non restare appesa fino al default 2500ms (oltre il budget del race)",
    );
    assert.ok(
      Date.now() - start < 1500,
      "l'abort deve arrivare molto prima del budget del race (knob rispettato)",
    );
    // Fail-open documentato: l'abort non deve mai propagarsi come throw sul
    // write path di moderazione — risposta di purge pulita, decisione già
    // committata su D1.
    assert.deepEqual(result, { purged: false, reason: "network-error" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// F5 (P2) — registrations_ip_log / email_send_log: nessuna retention
// ---------------------------------------------------------------------------
// db/auth.ts:271-300 (recordRegistrationAttempt inserisce in
// registrations_ip_log), db/mailer.ts:126-137 (recordEmailSend inserisce in
// email_send_log): entrambe le tabelle crescono senza limite — il count del
// cap per-IP e del budget mail legge solo le righe dentro la finestra
// (24h / 1h), le righe più vecchie non servono MAI più e non vengono mai
// eliminate. Il retention sweep (db/retention.ts) copre R1-R16 e tocca solo
// login_attempts tra le tabelle di auth; nessuna policy R-* documentata per
// queste due (RETENTION_SCHEDULE.md non le menziona). In più le righe
// registrations_ip_log conservano SHA-256 non salati di IP (brute-forcable
// sullo spazio IPv4) per sempre: contro la minimizzazione del progetto.
// Fix: aggiungere registrationsIpDays (30, speculare a R16) e
// emailSendLogDays (>= 1) a DEFAULT_RETENTION_POLICY + sweep.
// Test: dopo il sweep, le righe più vecchie della finestra devono sparire.

test("F5: il retention sweep deve eliminare le righe scadute di registrations_ip_log e email_send_log", async () => {
  const runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;

  const oldIpRow = "2026-05-01T00:00:00.000Z"; // 92 giorni prima di NOW
  const oldMailRow = "2026-07-30T00:00:00.000Z"; // 2 giorni prima di NOW
  // email_send_log.contributor_id ha una FK verso contributors: crea prima il
  // contributor (auth_provider ha DEFAULT 'password').
  await db
    .prepare(
      "INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind("retained@osdb.test", "Retained", "pbkdf2$1$x$y", NOW, NOW)
    .run();
  await db
    .prepare("INSERT INTO registrations_ip_log (ip_hash, created_at) VALUES (?, ?)")
    .bind("abc123", oldIpRow)
    .run();
  await db
    .prepare("INSERT INTO email_send_log (contributor_id, kind, sent_at) VALUES (1, 'verify', ?)")
    .bind(oldMailRow)
    .run();

  await runtime.retention.runRetentionSweep(NOW);

  const ipRemaining = await db
    .prepare("SELECT COUNT(*) AS n FROM registrations_ip_log WHERE ip_hash = ?")
    .bind("abc123")
    .first();
  const mailRemaining = await db
    .prepare("SELECT COUNT(*) AS n FROM email_send_log WHERE contributor_id = 1")
    .first();
  assert.equal(
    Number(ipRemaining.n),
    0,
    "registrations_ip_log non ha policy di retention: righe più vecchie della " +
      "finestra del cap per-IP non servono più ma restano per sempre " +
      "(crescita illimitata + hash IP non salati conservati) — il sweep R16 " +
      "copre solo login_attempts",
  );
  assert.equal(
    Number(mailRemaining.n),
    0,
    "email_send_log non ha policy di retention: il budget mail conta solo le " +
      "righe dell'ultima ora, le altre restano per sempre",
  );
});

// ---------------------------------------------------------------------------
// F6 (P3) — setConfirmation: quota giornaliera/per-record TOCTOU
// ---------------------------------------------------------------------------
// db/confirmations.ts:219-245: conteggio (SELECT COUNT) e INSERT sono due
// statement separate. Due PUT concorrenti dello stesso contributor su record
// diversi (o di account diversi sullo stesso record) passano entrambe il
// conteggio al limite e inseriscono: il cap giornaliero/per-record viene
// sforato di +1 per ogni race. L'UNIQUE (camera_id, contributor_id) deduplica
// solo la stessa coppia, non le quote.
// Fix (t_0b7dd8fc): INSERT condizionale con i conteggi nella STESSA
// statement (`INSERT ... SELECT ... WHERE (SELECT COUNT(*) ...) < max ...
// ON CONFLICT DO NOTHING RETURNING id`): la verifica della quota e la write
// sono un unico statement SQLite atomico — due PUT concorrenti non possono
// leggere entrambe un COUNT stantio.
// Test: il contratto sequenziale (pin del comportamento, sotto) + il vincolo
// STRUTTURALE che il fix introduce (conteggio dentro l'INSERT, non in una
// SELECT COUNT separata). Il harness D1 sincrono non può interleave: la race
// vera richiede il deploy D1 reale; il test struttura fa da rosso-prima-verde.

test("F6a: la quota di setConfirmation è verificata nella STESSA statement dell'INSERT (niente count-then-insert)", async () => {
  const source = await readFile(path.join(root, "db", "confirmations.ts"), "utf8");
  const insert = source.match(/INSERT INTO camera_community_actions[\s\S]*?RETURNING id/);
  assert.ok(
    insert,
    "INSERT di setConfirmation non trovata in db/confirmations.ts: lo " +
      "statement reale non è quello atteso dal test",
  );
  const statement = insert[0];
  assert.match(
    statement,
    /SELECT \?, \?, 'confirm', \?, \?, \?/,
    "l'INSERT deve essere condizionale (INSERT ... SELECT ... WHERE): oggi " +
      "db/confirmations.ts fa SELECT COUNT -> INSERT in due statement " +
      "separate (TOCTOU, quota sforabile di +1/race)",
  );
  assert.match(
    statement,
    /WHERE \(SELECT COUNT\(\*\) FROM camera_community_actions/,
    "il conteggio della quota deve stare nella WHERE della stessa statement " +
      "dell'INSERT: solo così due PUT concorrenti non leggono un COUNT stantio",
  );
  assert.match(
    statement,
    /ON CONFLICT \(camera_id, contributor_id\) DO NOTHING/,
    "l'ON CONFLICT DO NOTHING sulla coppia UNIQUE deve restare (deduplica " +
      "della stessa coppia, 409)",
  );
});

test("F6b: la quota giornaliera per contributor (max 1) non deve essere superabile in sequenza", async () => {
  const runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  const confirmations = runtime.confirmations;

  // Due record pubblici (active, ADR 0021 §12.1) ANONIMI (contributor_id NULL)
  // per il self-verify check e un terzo record del contributor 99 per
  // superare il level gate (>= 1 contributo verificato). Quota imposta a 1
  // sia per gli account normali sia per i trusted.
  for (const cameraId of [1, 2]) {
    await db
      .prepare(
        "INSERT INTO cameras (id, title, kind, address, notes, latitude, longitude, status, source, updated, description, contributor_id, created_at, review_due_at) VALUES (?, ?, 'Fixed dome', NULL, '', 41.9, 12.5, 'active', 'test', ?, '', NULL, ?, NULL)",
      )
      .bind(cameraId, `Camera ${cameraId}`, NOW, NOW)
      .run();
  }
  await db
    .prepare(
      "INSERT INTO contributors (id, email, display_name, password_hash, created_at, updated_at) VALUES (99, 'contrib@osdb.test', 'Contributor', 'pbkdf2$1$x$y', ?, ?)",
    )
    .bind(NOW, NOW)
    .run();
  // Il contributor ha 1 contributo attivo (per il level gate, ADR 0021 §12.1).
  await db
    .prepare(
      "INSERT INTO cameras (id, title, kind, address, notes, latitude, longitude, status, source, updated, description, contributor_id, created_at, review_due_at) VALUES (3, 'Own verified', 'Fixed dome', NULL, '', 41.9, 12.5, 'active', 'test', ?, '', 99, ?, NULL)",
    )
    .bind(NOW, NOW)
    .run();

  const env = { CONFIRMATIONS_DAILY_MAX: "1", CONFIRMATIONS_DAILY_MAX_TRUSTED: "1", CONFIRMATIONS_PER_RECORD_DAILY_MAX: "5" };
  const first = await confirmations.setConfirmation({
    cameraId: 1,
    contributorId: 99,
    now: NOW,
    env,
  });
  assert.equal(first.kind, "ok", "il primo toggle entro la quota deve passare");
  const second = await confirmations.setConfirmation({
    cameraId: 2,
    contributorId: 99,
    now: NOW,
    env,
  });
  assert.equal(
    second.kind,
    "daily_quota_exceeded",
    "il secondo toggle deve essere rifiutato dalla quota giornaliera (contratto " +
      "sequenziale che il fix deve rendere atomico anche sotto race)",
  );
});

test("F6c: INSERT e probe di classificazione girano nella STESSA d1.batch (snapshot unico, follow-up t_b6f04976)", async () => {
  // Dopo #281 l'ENFORCEMENT della quota era atomico (INSERT ... SELECT ...
  // WHERE) ma la CLASSIFICAZIONE della risposta (duplicate / daily_quota /
  // per_record_cap) dopo un INSERT rifiutato girava in tre SELECT separate:
  // sotto race (un DELETE concorrente libera uno slot, o un INSERT atterra tra
  // il tentativo e le letture) potevano disallinearsi dal motivo reale del
  // rifiuto e rispondere il kind sbagliato. Il follow-up t_b6f04976 sposta le
  // probe nella STESSA d1.batch dell'INSERT: un solo snapshot, nessun TOCTOU
  // residuo. Il harness D1 sincrono non può interleave: si pinna la struttura.
  const source = await readFile(path.join(root, "db", "confirmations.ts"), "utf8");
  const batch = source.match(/d1\.batch\(\[[\s\S]*?\]\)/);
  assert.ok(
    batch,
    "setConfirmation deve usare d1.batch([...]) per insert+probe: il blocco " +
      "reale non è quello atteso dal test — il test non può più essere vacuo",
  );
  const block = batch[0];
  assert.match(
    block,
    /INSERT INTO camera_community_actions[\s\S]*?RETURNING id/,
    "l'INSERT condizionale deve stare DENTRO la batch (enforcement atomico)",
  );
  assert.match(
    block,
    /SELECT 1 AS ok FROM camera_community_actions/,
    "la probe existing-pair deve stare nella STESSA batch dell'INSERT, così la " +
      "classificazione duplicate usa lo snapshot del tentativo di scrittura",
  );
  assert.match(
    block,
    /SELECT COUNT\(\*\) AS n FROM camera_community_actions WHERE contributor_id/,
    "la probe della quota giornaliera deve stare nella stessa batch (stesso snapshot)",
  );
  assert.match(
    block,
    /SELECT COUNT\(\*\) AS n FROM camera_community_actions WHERE camera_id/,
    "la probe del per-record cap deve stare nella stessa batch (stesso snapshot)",
  );
});

// ---------------------------------------------------------------------------
// F7 (P3) — callerKey fida di X-Forwarded-For spoofabile senza cf-connecting-ip
// ---------------------------------------------------------------------------
// app/lib/rate-limit.ts:236-245: senza cf-connecting-ip il primo hop di
// X-Forwarded-For era usato come identità del chiamante. Su una deployment NON
// dietro l'edge Cloudflare (es. il prototype LXC 114 servito in HTTP diretto
// — worker/index.ts:211-214) l'header è interamente controllato dal client:
// un account-farm poteva ruotare X-Forwarded-For a ogni richiesta e azzerare
// TUTTI i cap per-IP — incluso il cap registrazione 5/24h (anti account-farm,
// t_0941036b) e i bucket auth/submit/tiles/geocode.
// Fix (t_894e0cc3 + follow-up t_b6f04976): senza cf-connecting-ip XFF NON è
// mai fidato di default (callerKey = "unknown", un bucket globale, fail-closed).
// Il follow-up aggiunge l'opt-in esplicito TRUST_XFF=true per deployment dietro
// un proxy affidabile che sanifica/sovrascrive XFF (mai il valore client):
// ogni route passa ora `env` a callerKey, quindi il knob è raggiungibile.
// Nota: abuse-controls.test.mjs pinna il default (no knob -> "unknown").

test("F7: il cap per-IP di registrazione regge anche con X-Forwarded-For ruotato (niente cf-connecting-ip)", async () => {
  const register = await loadE2ERoute("app/api/auth/register/route.mjs");
  // Cap per-IP di default: 5 registrazioni / 24h per caller key.
  delete e2e.REGISTER_IP_RATE_LIMIT_MAX;

  const results = [];
  for (let index = 0; index < 6; index += 1) {
    const response = await register.POST(
      apiRequest("/api/auth/register", {
        method: "POST",
        // Rotazione dell'header X-Forwarded-For: su una deployment senza
        // edge Cloudflare ogni richiesta ha una callerKey diversa.
        headers: { "x-forwarded-for": `203.0.113.${100 + index}` },
        body: {
          email: `rotator${index}@osdb.test`,
          displayName: `Rotator ${index}`,
          password: "Sup3rsecret!",
        },
      }),
    );
    results.push(response.status);
  }
  // DOPO il fix: tutte le richieste senza cf-connecting-ip condividono il
  // bucket "unknown" (una sola callerKey), quindi la sequenza è identica a
  // quella di un singolo IP — 4 ok, 5a 429, 6a 429 — come pinnato da
  // registration-ip-cap.test.mjs. Prima del fix ogni rotazione di XFF aveva
  // una callerKey diversa e tutte e 6 le registrazioni passavano (cap
  // aggirabile).
  assert.deepEqual(
    results,
    [201, 201, 201, 201, 429, 429],
    "il cap per-IP (5/24h) deve reggere anche ruotando X-Forwarded-For: " +
      "callerKey (rate-limit.ts:236) NON deve fidarsi del primo hop senza " +
      "cf-connecting-ip, il cap è aggirabile. Status osservati: " +
      results.join(", "),
  );
});

test("F7b: TRUST_XFF=true (opt-in esplicito t_b6f04976) ripristina i cap per-IP dietro un proxy affidabile", async () => {
  const register = await loadE2ERoute("app/api/auth/register/route.mjs");
  // Cap per-IP di default (5/24h); l'operatore DICHIARA che la deployment sta
  // dietro un proxy affidabile che sanifica/sovrascrive X-Forwarded-For (mai
  // il valore client) e abilita il knob: le route passano env a callerKey,
  // quindi il primo hop XFF torna a essere la callerKey.
  delete e2e.REGISTER_IP_RATE_LIMIT_MAX;
  e2e.TRUST_XFF = "true";

  const results = [];
  for (let index = 0; index < 6; index += 1) {
    const response = await register.POST(
      apiRequest("/api/auth/register", {
        method: "POST",
        headers: { "x-forwarded-for": `203.0.113.${100 + index}` },
        body: {
          email: `trusted-proxy${index}@osdb.test`,
          displayName: `Trusted ${index}`,
          password: "Sup3rsecret!",
        },
      }),
    );
    results.push(response.status);
  }
  // Con TRUST_XFF=true ogni hop XFF è una callerKey distinta: 6 IP diversi
  // passano tutti (cap per-IP tornato per-client, comportamento speculare a
  // registration-ip-cap.test.mjs con cf-connecting-ip). Senza il knob il
  // default fail-closed (F7) li raggrupperebbe tutti in "unknown" -> 429.
  assert.deepEqual(
    results,
    [201, 201, 201, 201, 201, 201],
    "TRUST_XFF=true deve ripristinare i cap per-IP leggendo il primo hop di " +
      "X-Forwarded-For (proxy dichiarato affidabile): 6 IP diversi devono " +
      `passare tutti. Status osservati: ${results.join(", ")}`,
  );
});
