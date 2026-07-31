// D1-compatible in-memory database backed by node:sqlite (DatabaseSync).
//
// The real Cloudflare D1 surface used by db/cameras.ts and db/moderation.ts
// is a small, explicit API:
//
//   d1.prepare(sql).bind(...args).first<T>()  -> T | null
//   d1.prepare(sql).bind(...args).all<T>()    -> { results: T[] }
//   d1.prepare(sql).bind(...args).run()       -> { meta: {...} }
//   d1.batch([...preparedStatements])         -> executes in order
//
// This adapter runs the *real SQL* of the database layer against a fresh
// in-memory SQLite database per test, so status transitions and the public
// visibility boundary are exercised at runtime instead of being stubbed.
//
// node:sqlite is available on Node >= 22.5 (the project requires >= 22.13).

import { DatabaseSync } from "node:sqlite";

function toPlain(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  // node:sqlite rows carry a null prototype; hand back plain objects so
  // deepStrictEqual comparisons against fixtures behave predictably.
  return Object.fromEntries(Object.entries(value));
}

export class D1SqliteStatement {
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
    // node:sqlite exposes changes/lastInsertRowid on the StatementSync run
    // result, not on the DatabaseSync instance (verified on Node 22.x).
    const result = statement.run(...this.boundArgs);
    return {
      meta: {
        changes: Number(result.changes),
        lastRowId: Number(result.lastInsertRowid),
      },
    };
  }

  first() {
    const statement = this.database.prepare(this.sql);
    const row = statement.get(...this.boundArgs);
    return row === undefined ? null : toPlain(row);
  }

  all() {
    const statement = this.database.prepare(this.sql);
    const rows = statement.all(...this.boundArgs);
    return { results: rows.map(toPlain) };
  }

  raw() {
    const statement = this.database.prepare(this.sql);
    const rows = statement.all(...this.boundArgs);
    return rows.map(toPlain);
  }
}

export class D1SqliteDatabase {
  constructor() {
    this.db = new DatabaseSync(":memory:");
  }

  prepare(sql) {
    return new D1SqliteStatement(this.db, sql);
  }

  // D1 batch runs its statements in order; the in-memory adapter wraps them
  // in a transaction so partial failures roll back like the real binding.
  batch(statements) {
    this.db.exec("BEGIN");
    try {
      for (const statement of statements) {
        statement.run();
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return [];
  }

  close() {
    this.db.close();
  }

  exec(sql) {
    this.db.exec(sql);
  }
}
