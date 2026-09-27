import { createClient, type Client, type InStatement, type InValue } from "@libsql/client";

export type { InStatement, InValue };
import { join } from "node:path";

const DB_PATH = process.env.DATABASE_PATH ?? join(process.cwd(), "data", "finz.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ingestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingestion_id INTEGER REFERENCES ingestions(id),
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  counterparty TEXT,
  reference TEXT,
  amount_cents INTEGER NOT NULL,
  balance_cents INTEGER,
  content_hash TEXT NOT NULL UNIQUE,
  raw_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

CREATE TABLE IF NOT EXISTS classifications (
  transaction_id INTEGER PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL,
  treatment TEXT NOT NULL,
  confidence REAL NOT NULL,
  reasoning TEXT,
  source TEXT NOT NULL,
  needs_review INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  old_category_id TEXT,
  new_category_id TEXT NOT NULL,
  note TEXT,
  corrected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  severity TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(transaction_id, reason_code)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL DEFAULT 'default',
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  evidence_json TEXT,
  verification_json TEXT,
  created_at TEXT NOT NULL
);
`;

function resolveTarget(): { url: string; authToken?: string } {
  const remote =
    process.env.TURSO_DATABASE_URL ??
    process.env.LIBSQL_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "";
  if (remote.startsWith("libsql://") || remote.startsWith("http")) {
    const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;
    return { url: remote, authToken };
  }
  return { url: `file:${DB_PATH}` };
}

async function initClient(): Promise<Client> {
  const { url, authToken } = resolveTarget();
  const client = createClient({ url, authToken });
  if (url.startsWith("file:")) {
    try {
      await client.execute("PRAGMA journal_mode = WAL");
      await client.execute("PRAGMA foreign_keys = ON");
    } catch {
      // pragmas are best-effort (not applicable on remote http targets)
    }
  }
  await client.executeMultiple(SCHEMA);
  return client;
}

const globalForDb = globalThis as unknown as { __finzDb?: Promise<Client> };

export function getDb(): Promise<Client> {
  if (!globalForDb.__finzDb) {
    globalForDb.__finzDb = initClient().catch((err) => {
      delete globalForDb.__finzDb;
      throw err;
    });
  }
  return globalForDb.__finzDb;
}

function rowsToObjects<T>(columns: string[], rows: ReadonlyArray<Record<string, unknown> | unknown[]>): T[] {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      const byIndex = (row as unknown[])[i];
      const raw = byIndex !== undefined ? byIndex : (row as Record<string, unknown>)[columns[i]];
      obj[columns[i]] = typeof raw === "bigint" ? Number(raw) : raw;
    }
    return obj as T;
  });
}

export async function qAll<T>(sql: string, ...args: InValue[]): Promise<T[]> {
  const db = await getDb();
  const rs = await db.execute({ sql, args });
  return rowsToObjects<T>(rs.columns, rs.rows);
}

export async function qGet<T>(sql: string, ...args: InValue[]): Promise<T | undefined> {
  const rows = await qAll<T>(sql, ...args);
  return rows.length > 0 ? rows[0] : undefined;
}

export async function qRun(
  sql: string,
  ...args: InValue[]
): Promise<{ changes: number; lastInsertRowid: number }> {
  const db = await getDb();
  const rs = await db.execute({ sql, args });
  return {
    changes: rs.rowsAffected,
    lastInsertRowid: Number(rs.lastInsertRowid ?? 0),
  };
}

export async function qExec(sql: string): Promise<void> {
  const db = await getDb();
  await db.executeMultiple(sql);
}

export async function qBatch(stmts: InStatement[]): Promise<number[]> {
  if (stmts.length === 0) return [];
  const db = await getDb();
  const results = await db.batch(stmts, "write");
  return results.map((r) => r.rowsAffected);
}

export function nowIso(): string {
  return new Date().toISOString();
}
