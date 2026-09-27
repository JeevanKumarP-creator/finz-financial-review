import { nowIso, qAll, qBatch, qGet, type InValue } from "./db";
import { CATEGORY_MAP } from "./categories";
import { resolveFlagsStatement } from "./review";
import type { Classification, ReviewFlag, Transaction, Treatment } from "./types";
import type { NormalizedRow } from "./csv";

export interface TransactionFilter {
  id?: number;
  month?: string;
  categoryId?: string;
  q?: string;
  flagged?: boolean;
  treatment?: Treatment | string;
  minAbsCents?: number;
  limit?: number;
  offset?: number;
  sort?: "date" | "amount";
}

interface JoinRow {
  id: number;
  date: string;
  description: string;
  counterparty: string | null;
  reference: string | null;
  amountCents: number;
  balanceCents: number | null;
  category_id: string | null;
  category_label: string | null;
  category_section: string | null;
  confidence: number | null;
  reasoning: string | null;
  source: string | null;
  needs_review: number | null;
  treatment: string | null;
  flag_id: number | null;
  flag_reason: string | null;
  flag_severity: string | null;
  flag_detail: string | null;
  flag_status: string | null;
}

function toTransaction(rows: JoinRow[]): Transaction | null {
  if (rows.length === 0) return null;
  const first = rows[0];
  const category = first.category_id
    ? (CATEGORY_MAP[first.category_id] ?? {
        id: first.category_id,
        label: first.category_label ?? first.category_id,
        section: (first.category_section as never) ?? null,
        treatment: (first.treatment as Treatment) ?? "NON_P_AND_L",
        description: "",
        keywords: [],
      })
    : null;
  const classification: Classification | null = first.category_id
    ? {
        categoryId: first.category_id,
        treatment: (first.treatment as Treatment) ?? "NON_P_AND_L",
        confidence: first.confidence ?? 0,
        reasoning: first.reasoning,
        source: (first.source as Classification["source"]) ?? "rules",
        needsReview: first.needs_review === 1,
      }
    : null;
  const reviewFlags: ReviewFlag[] = rows
    .filter((r) => r.flag_id != null)
    .map((r) => ({
      id: r.flag_id!,
      reasonCode: r.flag_reason!,
      severity: (r.flag_severity as ReviewFlag["severity"]) ?? "low",
      detail: r.flag_detail,
      status: (r.flag_status as ReviewFlag["status"]) ?? "open",
    }));
  return {
    id: first.id,
    date: first.date,
    description: first.description,
    counterparty: first.counterparty,
    reference: first.reference,
    amountCents: first.amountCents,
    balanceCents: first.balanceCents,
    category,
    classification,
    reviewFlags,
  };
}

function buildWhere(f: TransactionFilter): { where: string; params: InValue[] } {
  const clauses: string[] = [];
  const params: InValue[] = [];
  if (f.id != null) {
    clauses.push("t.id = ?");
    params.push(f.id);
  }
  if (f.month) {
    clauses.push("substr(t.date, 1, 7) = ?");
    params.push(f.month);
  }
  if (f.categoryId) {
    clauses.push("cl.category_id = ?");
    params.push(f.categoryId);
  }
  if (f.q) {
    clauses.push("(LOWER(t.description) LIKE ? OR LOWER(COALESCE(t.counterparty, '')) LIKE ?)");
    const like = `%${f.q.toLowerCase()}%`;
    params.push(like, like);
  }
  if (f.treatment) {
    clauses.push("cl.treatment = ?");
    params.push(f.treatment);
  }
  if (f.minAbsCents != null) {
    clauses.push("ABS(t.amount_cents) >= ?");
    params.push(f.minAbsCents);
  }
  if (f.flagged) {
    clauses.push("EXISTS (SELECT 1 FROM review_items ri WHERE ri.transaction_id = t.id AND ri.status = 'open')");
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}

export async function loadTransactions(f: TransactionFilter = {}): Promise<Transaction[]> {
  const { where, params } = buildWhere(f);
  const order = f.sort === "amount" ? "ABS(t.amount_cents) DESC" : "t.date ASC, t.id ASC";
  const limit = f.limit ?? 500;
  const offset = f.offset ?? 0;
  const sql = `
    SELECT t.id, t.date, t.description, t.counterparty, t.reference,
           t.amount_cents AS amountCents, t.balance_cents AS balanceCents,
           cl.category_id, cl.confidence, cl.reasoning, cl.source,
           cl.needs_review, cl.treatment,
           ri.id AS flag_id, ri.reason_code AS flag_reason, ri.severity AS flag_severity,
           ri.detail AS flag_detail, ri.status AS flag_status
    FROM transactions t
    LEFT JOIN classifications cl ON cl.transaction_id = t.id
    LEFT JOIN review_items ri ON ri.transaction_id = t.id
    ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?`;
  const rows = await qAll<JoinRow>(sql, ...params, limit, offset);

  const grouped = new Map<number, JoinRow[]>();
  for (const r of rows) {
    const arr = grouped.get(r.id) ?? [];
    arr.push(r);
    grouped.set(r.id, arr);
  }
  return [...grouped.values()].map(toTransaction).filter((t): t is Transaction => t !== null);
}

export async function countTransactions(f: TransactionFilter = {}): Promise<number> {
  const { where, params } = buildWhere(f);
  const sql = `SELECT COUNT(DISTINCT t.id) AS n FROM transactions t
    LEFT JOIN classifications cl ON cl.transaction_id = t.id
    ${where}`;
  const row = await qGet<{ n: number }>(sql, ...params);
  return row?.n ?? 0;
}

export async function getTransaction(id: number): Promise<Transaction | null> {
  const rows = await qAll<JoinRow>(
    `SELECT t.id, t.date, t.description, t.counterparty, t.reference,
            t.amount_cents AS amountCents, t.balance_cents AS balanceCents,
            cl.category_id, cl.confidence, cl.reasoning, cl.source,
            cl.needs_review, cl.treatment,
            ri.id AS flag_id, ri.reason_code AS flag_reason, ri.severity AS flag_severity,
            ri.detail AS flag_detail, ri.status AS flag_status
     FROM transactions t
     LEFT JOIN classifications cl ON cl.transaction_id = t.id
     LEFT JOIN review_items ri ON ri.transaction_id = t.id
     WHERE t.id = ?`,
    id
  );
  return toTransaction(rows);
}

export async function insertParsedRows(
  rows: NormalizedRow[],
  ingestionId: number
): Promise<{ inserted: number; skipped: number }> {
  const stmts = rows.map((r) => ({
    sql: `INSERT OR IGNORE INTO transactions
       (ingestion_id, date, description, counterparty, reference, amount_cents, balance_cents, content_hash, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      ingestionId,
      r.date,
      r.description,
      r.counterparty,
      r.reference,
      r.amountCents,
      r.balanceCents,
      r.contentHash,
      JSON.stringify(r.raw),
    ] as InValue[],
  }));
  const results = await qBatch(stmts);
  const inserted = results.reduce((s, n) => s + n, 0);
  return { inserted, skipped: rows.length - inserted };
}

export interface CorrectionResult {
  ok: boolean;
  transaction?: Transaction;
  error?: string;
}

export async function applyCorrection(
  transactionId: number,
  categoryId: string,
  note?: string
): Promise<CorrectionResult> {
  const cat = CATEGORY_MAP[categoryId];
  if (!cat) return { ok: false, error: `Unknown category "${categoryId}"` };
  const current = await qGet<{ category_id: string }>(
    `SELECT category_id FROM classifications WHERE transaction_id = ?`,
    transactionId
  );

  if (!current) {
    const exists = await qGet<unknown>(`SELECT 1 FROM transactions WHERE id = ?`, transactionId);
    if (!exists) return { ok: false, error: `Transaction ${transactionId} not found` };
  }

  const now = nowIso();
  await qBatch([
    {
      sql: `INSERT INTO classifications (transaction_id, category_id, treatment, confidence, reasoning, source, needs_review, updated_at)
       VALUES (?, ?, ?, 1.0, ?, 'human', 0, ?)
       ON CONFLICT(transaction_id) DO UPDATE SET
         category_id = excluded.category_id,
         treatment = excluded.treatment,
         confidence = excluded.confidence,
         reasoning = excluded.reasoning,
         source = excluded.source,
         needs_review = excluded.needs_review,
         updated_at = excluded.updated_at`,
      args: [
        transactionId,
        categoryId,
        cat.treatment,
        note?.trim() ? note.trim() : "Corrected by reviewer",
        now,
      ] as InValue[],
    },
    {
      sql: `INSERT INTO corrections (transaction_id, old_category_id, new_category_id, note, corrected_at)
       VALUES (?, ?, ?, ?, ?)`,
      args: [transactionId, current?.category_id ?? null, categoryId, note ?? null, now] as InValue[],
    },
    resolveFlagsStatement(now, transactionId),
  ]);

  return { ok: true, transaction: (await getTransaction(transactionId)) ?? undefined };
}

export async function resetDatabase(): Promise<void> {
  await qBatch([
    { sql: `DELETE FROM review_items` },
    { sql: `DELETE FROM corrections` },
    { sql: `DELETE FROM classifications` },
    { sql: `DELETE FROM chat_messages` },
    { sql: `DELETE FROM transactions` },
    { sql: `DELETE FROM ingestions` },
  ]);
}
