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

// D1 caps bound parameters at 100 per statement (the same cap the retention
// sweep and correction-history chunk against, db/retention.ts
// D1_MAX_BOUND_PARAMS). node:sqlite's own SQLITE_MAX_VARIABLE_NUMBER is far
// higher, so the adapter would silently accept IN (...) queries that the real
// D1 binding rejects with a 500/503. Throwing here keeps the in-memory
// harness faithful to the production cap and lets a >100-record regression
// test actually fail on the unfixed code.
const D1_MAX_BOUND_PARAMS = 100;

export class D1SqliteStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.boundArgs = [];
  }

  bind(...args) {
    if (args.length > D1_MAX_BOUND_PARAMS) {
      throw new Error(
        `D1 bound-parameter cap exceeded: ${args.length} params (max ${D1_MAX_BOUND_PARAMS}) — split the IN (...) into chunks like db/confirmations.ts confirmationCountsFor`,
      );
    }
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
  // Returns one D1Result per statement, mirroring the real binding: RETURNING
  // statements AND plain SELECT statements execute via all() (their rows land
  // in `results` — real D1 populates `results` for SELECTs in a batch too),
  // everything else via run() (only `meta`).
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

  close() {
    this.db.close();
  }

  exec(sql) {
    this.db.exec(sql);
  }
}
