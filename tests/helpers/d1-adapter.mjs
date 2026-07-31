// Minimal in-memory D1-compatible adapter backed by node:sqlite.
//
// The real db/* modules issue the same SQLite SQL that D1 accepts
// (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, PRAGMA
// table_info, INSERT ... RETURNING, UPDATE ... WHERE ... RETURNING, SELECT)
// through the D1 statement API (prepare().bind().all()/first()/run() and
// batch()). node:sqlite provides a real SQLite engine, so the SQL runs
// unmodified; only the D1 API shape is translated. This lets the test suite
// exercise the REAL database boundary (public query, moderation transitions,
// audit events) instead of only source-level assertions.
//
// Each D1 instance owns its own in-memory database; tests that need a clean
// slate simply construct a new D1().

import { DatabaseSync } from "node:sqlite";

class D1Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  run() {
    const result = this.db.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }

  all() {
    const rows = this.db.prepare(this.sql).all(...this.params);
    return { results: rows.map((row) => ({ ...row })) };
  }

  first() {
    const row = this.db.prepare(this.sql).get(...this.params);
    return row ? { ...row } : null;
  }
}

export class D1 {
  constructor(db = new DatabaseSync(":memory:")) {
    this.db = db;
  }

  prepare(sql) {
    return new D1Statement(this.db, sql);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      results.push(statement.run());
    }
    return results;
  }

  close() {
    this.db.close();
  }
}
