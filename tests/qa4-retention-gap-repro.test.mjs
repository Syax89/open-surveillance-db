// QA #4 — riproduzione finding retention (t_56d09899), convertito da
// "documenta il comportamento attuale" a test rosso→verde con asserzioni
// (t_a852d1a4).
//
// Finding candidato A: `email_send_log` (migration 0029, ADR 0020 rate-limit
// 3/h) non aveva NESSUNA sweep nel retention cron: le righe vivevano per
// sempre finché l'account non veniva cancellato (l'unico DELETE era la
// cascade di db/auth.ts deleteAccount). Ogni email inviata = 1 riga; un
// contributore attivo che usa il limite 3/h accumula ~90 righe/mese di puro
// garbage (il rate-limit conta solo la finestra 1h).
//
// Finding candidato B: R12 (`demo` records, RETENTION_SCHEDULE.md "Purged
// before public launch") NON aveva alcuna implementazione nel retention
// sweep: il gate fail-closed (demoRecordsPublic) nasconde le righe dalle
// superfici pubbliche, ma le righe demo restavano nel DB per sempre se
// qualcuno aveva eseguito `npm run db:seed` (o in un DB promosso da dev).
//
// Il test ora ASSERISCE il comportamento corretto:
//   - email_send_log: le righe oltre la TTL (30d, EMAIL_SEND_LOG_RETENTION_DAYS)
//     vengono eliminate; la riga fresca sopravvive; il contatore
//     summary.emailSendLogPurged riflette la sweep;
//   - demo: le righe `demo` vengono eliminate in produzione (ENVIRONMENT
//     unset = fail-closed, stessa convenzione di demoRecordsPublic) insieme
//     alle loro evidence (R6), e SOPRAVVIVONO in ENVIRONMENT=development
//     (guard R12: il seed illustrativo è un fixture locale);
//   - sessions (R7): controllo positivo — le sessioni scadute spariscono.

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
} from "./helpers/db-runtime-harness.mjs";

let runtime;

beforeEach(async () => {
  if (!runtime) runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  // Fail-closed default: ENVIRONMENT unset behaves as production (same
  // convention as tests/demo-export-gate.test.mjs).
  delete runtime.env.ENVIRONMENT;
});

after(async () => cleanupDbRuntime());

const NOW = "2026-08-01T00:00:00.000Z";
const day = 86_400_000;
const daysBefore = (days) => new Date(Date.parse(NOW) - days * day).toISOString();

async function count(table, where = "1=1", ...args) {
  const row = await runtime.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)
    .bind(...args)
    .first();
  return row.n;
}

async function seedFixtures() {
  // Un contributore con email_send_log vecchie (90 e 400 giorni) e una fresca.
  const contributor = await runtime.env.DB.prepare(
    "INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
  )
    .bind("qa-repro@invalid", "QA Repro", "pbkdf2$1$x$y", NOW, NOW)
    .first();
  await runtime.env.DB.prepare(
    "INSERT INTO email_send_log (contributor_id, kind, sent_at) VALUES (?, 'verify', ?)",
  ).bind(contributor.id, daysBefore(90)).run();
  await runtime.env.DB.prepare(
    "INSERT INTO email_send_log (contributor_id, kind, sent_at) VALUES (?, 'reset', ?)",
  ).bind(contributor.id, daysBefore(400)).run();
  await runtime.env.DB.prepare(
    "INSERT INTO email_send_log (contributor_id, kind, sent_at) VALUES (?, 'verify', ?)",
  ).bind(contributor.id, daysBefore(0)).run(); // 0 giorni fa → fresca, deve sopravvivere

  // Una demo camera (come da scripts/demo-cameras.sql) con una foto di
  // supporto: l'evidence segue il record (R6) anche nella purge R12.
  const demo = await runtime.env.DB.prepare(
    "INSERT INTO cameras (title, kind, latitude, longitude, status, source, updated, description, created_at) VALUES (?, 'Fixed dome', 41.9, 12.49, 'demo', 'Prototype seed', 'Demo data', 'QA repro demo', ?) RETURNING id",
  )
    .bind("QA repro demo record", daysBefore(200))
    .first();
  await runtime.env.DB.prepare(
    "INSERT INTO photos (camera_id, contributor_id, storage_key, mime_type, width, height, size_bytes, status, exif_stripped, redaction_confirmed, created_at, updated_at) VALUES (?, NULL, 'qa-repro-demo.jpg', 'image/jpeg', 100, 100, 1000, 'pending', 1, 0, ?, ?)",
  ).bind(demo.id, daysBefore(200), daysBefore(200)).run();

  // Una sessione scaduta (R7, controllo positivo).
  await runtime.env.DB.prepare(
    "INSERT INTO sessions (token_hash, csrf_token, contributor_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  ).bind("deadbeef", "csrf123", contributor.id, daysBefore(1), NOW).run();
}

test("QA#4: sweep produzione — email_send_log e demo records vengono purgati, sessioni pure (rosso→verde)", async () => {
  await seedFixtures();

  assert.equal(await count("email_send_log"), 3, "fixture: 3 righe di log email");
  assert.equal(await count("cameras", "status = 'demo'"), 1, "fixture: 1 demo camera");
  assert.equal(await count("sessions"), 1, "fixture: 1 sessione scaduta");

  const { runRetentionSweep } = runtime.retention;
  const summary = await runRetentionSweep(NOW, {});

  // Finding A: le righe oltre la TTL 30d spariscono, la fresca sopravvive.
  assert.equal(await count("email_send_log"), 1, "le 2 righe vecchie (90d/400d) sono eliminate");
  assert.equal(await count("email_send_log", "sent_at < ?", daysBefore(30)), 0, "nessuna riga oltre la TTL sopravvive");
  assert.equal(summary.emailSendLogPurged, 2, "il contatore del summary riflette la sweep");

  // Finding B: la demo camera è eliminata CON la sua evidence (R6).
  assert.equal(await count("cameras", "status = 'demo'"), 0, "la demo record è purgata in produzione");
  assert.equal(summary.demoRecordsPurged, 1, "il contatore R12 riflette la purge");
  assert.equal(await count("photos", "storage_key = 'qa-repro-demo.jpg'"), 0, "l'evidence della demo è eliminata con il record");

  // Controllo positivo R7: la sessione scaduta sparisce.
  assert.equal(await count("sessions"), 0);
  assert.equal(summary.sessionsPurged, 1);

  assert.equal(summary.failures, 0, "nessun errore durante la sweep");
});

test("QA#4: ENVIRONMENT=development — le demo records SOPRAVVIVONO (guard R12, seed locale)", async () => {
  await seedFixtures();

  runtime.env.ENVIRONMENT = "development";

  const { runRetentionSweep } = runtime.retention;
  const summary = await runRetentionSweep(NOW, {});

  assert.equal(await count("cameras", "status = 'demo'"), 1, "il seed illustrativo resta in development");
  assert.equal(await count("photos", "storage_key = 'qa-repro-demo.jpg'"), 1, "anche la sua evidence resta");
  assert.equal(summary.demoRecordsPurged, 0, "nessuna purge R12 in development");

  // Le altre sweep NON sono condizionate dall'ambiente: email e sessioni
  // vengono purgate comunque.
  assert.equal(await count("email_send_log"), 1, "la sweep email_send_log non dipende da ENVIRONMENT");
  assert.equal(summary.emailSendLogPurged, 2);
  assert.equal(await count("sessions"), 0, "la sweep sessioni non dipende da ENVIRONMENT");
  assert.equal(summary.sessionsPurged, 1);

  delete runtime.env.ENVIRONMENT;
});

test("QA#4: ENVIRONMENT=production esplicito — stessa purge fail-closed del default", async () => {
  await seedFixtures();

  runtime.env.ENVIRONMENT = "production";

  const { runRetentionSweep } = runtime.retention;
  const summary = await runRetentionSweep(NOW, {});

  assert.equal(await count("cameras", "status = 'demo'"), 0, "anche con ENVIRONMENT='production' la demo è purgata");
  assert.equal(summary.demoRecordsPurged, 1);
  assert.equal(await count("email_send_log"), 1);
  assert.equal(summary.emailSendLogPurged, 2);

  delete runtime.env.ENVIRONMENT;
});

test("QA#4: un valore ENVIRONMENT sconosciuto è trattato come produzione (fail-closed)", async () => {
  await seedFixtures();

  runtime.env.ENVIRONMENT = "staging";

  const { runRetentionSweep } = runtime.retention;
  const summary = await runRetentionSweep(NOW, {});

  assert.equal(await count("cameras", "status = 'demo'"), 0, "solo l'esatto valore 'development' tiene le demo");
  assert.equal(summary.demoRecordsPurged, 1);

  delete runtime.env.ENVIRONMENT;
});
