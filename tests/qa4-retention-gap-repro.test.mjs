// QA #4 — riproduzione finding retention (t_56d09899).
//
// Finding candidato A: `email_send_log` (migration 0029, ADR 0020 rate-limit
// 3/h) non ha NESSUNA sweep nel retention cron. R7/R15/R16 coprono sessions,
// email_verification_tokens, webauthn_challenges e login_attempts, ma le
// righe di email_send_log vivono per sempre finché l'account non viene
// cancellato (l'unico DELETE è in db/auth.ts deleteAccount). Ogni email
// inviata = 1 riga; un contributore attivo che usa il limite 3/h accumula
// ~90 righe/mese di puro garbage (il rate-limit conta solo la finestra 1h).
//
// Finding candidato B: R12 (`demo` records, RETENTION_SCHEDULE.md "Purged
// before public launch") NON ha alcuna implementazione nel retention sweep:
// le query R1/R2/R3 filtrano solo pending/rejected/needs_review/stale e il
// gate fail-closed (demoRecordsPublic) le nasconde dalle superfici pubbliche,
// ma le righe demo restano nel DB di produzione per sempre se qualcuno ha
// eseguito `npm run db:seed` (o in un DB promosso da dev).
//
// Il test documenta il COMPORTAMENTO ATTUALE (senza asserzioni di valore):
// stampa quanti row di ciascuna categoria sopravvivono allo sweep, così il
// report QA può citare numeri reali.

import { test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { D1SqliteDatabase } from "./helpers/d1-sqlite.mjs";
import {
  applyDrizzleMigrations,
  cleanupDbRuntime,
  loadDbRuntime,
} from "./helpers/db-runtime-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let runtime;

async function setup() {
  if (!runtime) runtime = await loadDbRuntime();
  const db = new D1SqliteDatabase();
  await applyDrizzleMigrations(db);
  runtime.env.DB = db;
  return db;
}

const NOW = "2026-08-01T00:00:00.000Z";
const day = 86_400_000;
const daysBefore = (days) => new Date(Date.parse(NOW) - days * day).toISOString();

test("QA#4 riproduzione: email_send_log e demo records dopo runRetentionSweep", async () => {
  const db = await setup();

  // --- Fixture: un contributore con email_send_log vecchie (90 e 400 giorni).
  await db
    .prepare(
      "INSERT INTO contributors (email, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind("qa-repro@invalid", "QA Repro", "pbkdf2$1$x$y", NOW, NOW)
    .run();
  const contributor = await db
    .prepare("SELECT id FROM contributors WHERE email = ?")
    .bind("qa-repro@invalid")
    .first();
  await db
    .prepare(
      "INSERT INTO email_send_log (contributor_id, kind, sent_at) VALUES (?, 'verify', ?)",
    )
    .bind(contributor.id, daysBefore(90))
    .run();
  await db
    .prepare(
      "INSERT INTO email_send_log (contributor_id, kind, sent_at) VALUES (?, 'reset', ?)",
    )
    .bind(contributor.id, daysBefore(400))
    .run();

  // --- Fixture: una demo camera (come da scripts/demo-cameras.sql).
  await db
    .prepare(
      "INSERT INTO cameras (title, kind, latitude, longitude, status, source, updated, description, created_at) VALUES (?, 'Fixed dome', 41.9, 12.49, 'demo', 'Prototype seed', 'Demo data', 'QA repro demo', ?)",
    )
    .bind("QA repro demo record", daysBefore(200))
    .run();

  // --- Fixture: sessioni scadute (R7, controllo positivo: DEVE sparire).
  await db
    .prepare(
      "INSERT INTO sessions (token_hash, csrf_token, contributor_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind("deadbeef", "csrf123", contributor.id, daysBefore(1), NOW)
    .run();

  const before = {
    sendLog: await db
      .prepare("SELECT COUNT(*) AS n FROM email_send_log")
      .first(),
    demo: await db
      .prepare("SELECT COUNT(*) AS n FROM cameras WHERE status = 'demo'")
      .first(),
    sessions: await db
      .prepare("SELECT COUNT(*) AS n FROM sessions")
      .first(),
  };

  // --- Esegue il retention sweep reale con `now` iniettato.
  const { runRetentionSweep } = runtime.retention;
  const summary = await runRetentionSweep(NOW, {});

  const after = {
    sendLog: await db
      .prepare("SELECT COUNT(*) AS n FROM email_send_log")
      .first(),
    demo: await db
      .prepare("SELECT COUNT(*) AS n FROM cameras WHERE status = 'demo'")
      .first(),
    sessions: await db
      .prepare("SELECT COUNT(*) AS n FROM sessions")
      .first(),
  };

  console.log("\n=== QA#4 riproduzione retention ===");
  console.log("email_send_log rows:  before=" + before.sendLog.n + " after=" + after.sendLog.n + "  (atteso: invariato se nessuna sweep R-mail-log)");
  console.log("demo cameras rows:    before=" + before.demo.n + " after=" + after.demo.n + "  (atteso: invariato se R12 non implementato)");
  console.log("sessions (R7):        before=" + before.sessions.n + " after=" + after.sessions.n + "  (controllo positivo: deve calare)");
  console.log("summary.sessionsPurged=" + summary.sessionsPurged);

  await cleanupDbRuntime();
});
