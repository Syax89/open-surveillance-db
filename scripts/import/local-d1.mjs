// Local SQLite-backed D1-compatible database for the import CLI (FONTI
// PUBBLICHE FASE A, kanban t_6030d390).
//
// The runner talks to an interface D1 (prepare/bind/first/all/run/batch).
// In production the CLI runs inside the Worker context where `env.DB` is
// the real Cloudflare D1 binding; for local/offline runs (design §8.6 — the
// runner is an offline single-operator tool) this class opens a local
// SQLite file (e.g. the wrangler dev database at
// .wrangler/state/v3/d1/*.sqlite) and exposes the same surface, so
// `npm run import:run -- --d1-path=...` works without a network round-trip.
//
// Mirrors tests/helpers/d1-sqlite.mjs (D1SqliteDatabase) minus the
// bound-parameter cap check, which is a test-faithfulness concern; the
// import runner chunks its own writes.

import { DatabaseSync } from "node:sqlite";

function toPlain(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value));
}

class LocalStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.boundArgs = [];
  }

  bind(...args) {
    this.boundArgs = args;
    return this;
  }

  run() {
    const statement = this.database.prepare(this.sql);
    const result = statement.run(...this.boundArgs);
    return { meta: { changes: Number(result.changes), lastRowId: Number(result.lastInsertRowid) } };
  }

  first() {
    const row = this.database.prepare(this.sql).get(...this.boundArgs);
    return row === undefined ? null : toPlain(row);
  }

  all() {
    const rows = this.database.prepare(this.sql).all(...this.boundArgs);
    return { results: rows.map(toPlain) };
  }
}

export class LocalD1Database {
  constructor(filePath) {
    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  prepare(sql) {
    return new LocalStatement(this.db, sql);
  }

  batch(statements) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) {
        if (/\breturning\b/i.test(statement.sql) || /^\s*(SELECT|WITH|PRAGMA)\b/i.test(statement.sql)) {
          const { results: rows } = statement.all();
          results.push({ success: true, results: rows, meta: { changes: rows.length, lastRowId: 0 } });
        } else {
          const { meta } = statement.run();
          results.push({ success: true, results: [], meta });
        }
      }
      this.db.exec("COMMIT");
      return results;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  exec(sql) {
    this.db.exec(sql);
  }

  close() {
    this.db.close();
  }
}
