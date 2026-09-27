import { nowIso, qAll, qBatch, qGet, qRun, type InStatement, type InValue } from "./db";
import { CATEGORY_MAP, REVIEW_REASON_LABELS } from "./categories";

export type ReasonCode = keyof typeof REVIEW_REASON_LABELS;

interface Candidate {
  transactionId: number;
  reasonCode: ReasonCode;
  severity: "high" | "medium" | "low";
  detail: string;
}

interface TxnBasic {
  id: number;
  date: string;
  description: string;
  amountCents: number;
  balanceCents: number | null;
  categoryId: string | null;
  confidence: number | null;
  source: string | null;
  needsReview: number | null;
  treatment: string | null;
}

const JUDGMENT_CATEGORIES = new Set([
  "nonpl_loan_repayment",
  "nonpl_capex",
  "nonpl_tax",
  "nonpl_other",
]);

const OPAQUE_PATTERNS = [
  /\bupi\/{1,2}[a-z]{2,4}\//i,
  /p2a\/\d+/i,
  /ref\s*\d{4,}/i,
  /\btrx\s*\d{6,}/i,
  /^[^a-z]{0,3}\d{6,}[^a-z]{0,3}$/i,
  /unknown|not identified|unidentified|unclear|no details/i,
];

function severityFor(reason: ReasonCode, amountCents: number): Candidate["severity"] {
  const big = Math.abs(amountCents) >= 200_000;
  switch (reason) {
    case "BALANCE_MISMATCH":
    case "DUPLICATE":
      return big ? "high" : "medium";
    case "LOW_CONFIDENCE":
    case "AI_FLAGGED":
    case "UNUSUAL_INFLOW":
      return big ? "high" : "medium";
    case "RULES_FALLBACK":
    case "TREATMENT_JUDGMENT":
    case "OUTLIER":
      return big ? "medium" : "low";
    default:
      return "low";
  }
}

function loadTransactions(): Promise<TxnBasic[]> {
  return qAll<TxnBasic>(
    `SELECT t.id, t.date, t.description, t.amount_cents AS amountCents,
            t.balance_cents AS balanceCents,
            cl.category_id AS categoryId, cl.confidence AS confidence,
            cl.source AS source, cl.needs_review AS needsReview,
            cl.treatment AS treatment
     FROM transactions t
     LEFT JOIN classifications cl ON cl.transaction_id = t.id
     ORDER BY t.date, t.id`
  );
}

function detectBalanceMismatch(txns: TxnBasic[]): Candidate[] {
  const out: Candidate[] = [];
  let prevRecorded: number | null = null;
  for (const t of txns) {
    if (t.balanceCents == null) continue;
    if (prevRecorded != null) {
      const expected: number = prevRecorded + t.amountCents;
      if (expected !== t.balanceCents) {
        out.push({
          transactionId: t.id,
          reasonCode: "BALANCE_MISMATCH",
          severity: "high",
          detail: `Expected balance ${fmt(expected)} but statement shows ${fmt(t.balanceCents)} (difference ${fmt(t.balanceCents - expected)}).`,
        });
      }
    }
    prevRecorded = t.balanceCents;
  }
  return out;
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function detectDuplicates(txns: TxnBasic[]): Candidate[] {
  const out: Candidate[] = [];
  const byKey = new Map<string, TxnBasic[]>();
  for (const t of txns) {
    const key = `${Math.abs(t.amountCents)}|${t.description.toUpperCase().trim()}`;
    const arr = byKey.get(key) ?? [];
    arr.push(t);
    byKey.set(key, arr);
  }
  for (const arr of byKey.values()) {
    if (arr.length < 2) continue;
    for (let i = 1; i < arr.length; i++) {
      const gap = Math.abs(
        new Date(arr[i].date).getTime() - new Date(arr[i - 1].date).getTime()
      );
      if (gap <= 3 * 86400_000) {
        out.push({
          transactionId: arr[i].id,
          reasonCode: "DUPLICATE",
          severity: severityFor("DUPLICATE", arr[i].amountCents),
          detail: `Same description and amount (${fmt(Math.abs(arr[i].amountCents))}) also booked on ${arr[i - 1].date} (${gap / 86400_000} day${gap === 86400_000 ? "" : "s"} apart).`,
        });
      }
    }
  }
  return out;
}

function detectRoundNumbers(txns: TxnBasic[]): Candidate[] {
  return txns
    .filter((t) => t.amountCents < 0 && Math.abs(t.amountCents) >= 100_000 && Math.abs(t.amountCents) % 50_000 === 0)
    .map((t) => ({
      transactionId: t.id,
      reasonCode: "ROUND_NUMBER" as const,
      severity: severityFor("ROUND_NUMBER", t.amountCents),
      detail: `Payment of exactly ${fmt(Math.abs(t.amountCents))} is a suspiciously round number for an arm's-length transaction.`,
    }));
}

function detectOpaque(txns: TxnBasic[]): Candidate[] {
  const out: Candidate[] = [];
  for (const t of txns) {
    const opaque = OPAQUE_PATTERNS.find((p) => p.test(t.description));
    if (opaque) {
      out.push({
        transactionId: t.id,
        reasonCode: "OPAQUE_DESCRIPTION",
        severity: severityFor("OPAQUE_DESCRIPTION", t.amountCents),
        detail: `Description "${t.description}" does not name a clear counterparty or purpose.`,
      });
    }
    if (t.amountCents > 0 && t.amountCents >= 200_000 && /unknown|not identified|remittance|misc/i.test(t.description)) {
      out.push({
        transactionId: t.id,
        reasonCode: "UNUSUAL_INFLOW",
        severity: "high",
        detail: `Inflow of ${fmt(t.amountCents)} with no identifiable payer - revenue treatment needs confirmation.`,
      });
    }
  }
  return out;
}

function detectClassificationIssues(txns: TxnBasic[]): Candidate[] {
  const out: Candidate[] = [];
  for (const t of txns) {
    if (!t.categoryId) continue;
    if (t.confidence != null && t.confidence < 0.7) {
      out.push({
        transactionId: t.id,
        reasonCode: "LOW_CONFIDENCE",
        severity: severityFor("LOW_CONFIDENCE", t.amountCents),
        detail: `AI classified this as "${CATEGORY_MAP[t.categoryId]?.label ?? t.categoryId}" with only ${Math.round(t.confidence * 100)}% confidence.`,
      });
    } else if (t.source === "rules") {
      out.push({
        transactionId: t.id,
        reasonCode: "RULES_FALLBACK",
        severity: severityFor("RULES_FALLBACK", t.amountCents),
        detail: `Classified by the deterministic keyword fallback ("${CATEGORY_MAP[t.categoryId]?.label ?? t.categoryId}") because the AI was unavailable - confirm before relying on it.`,
      });
    }
    if (t.needsReview === 1) {
      out.push({
        transactionId: t.id,
        reasonCode: "AI_FLAGGED",
        severity: severityFor("AI_FLAGGED", t.amountCents),
        detail: `The AI classifier explicitly asked for a human check on this transaction.`,
      });
    }
    if (t.treatment === "NON_P_AND_L" && JUDGMENT_CATEGORIES.has(t.categoryId)) {
      out.push({
        transactionId: t.id,
        reasonCode: "TREATMENT_JUDGMENT",
        severity: severityFor("TREATMENT_JUDGMENT", t.amountCents),
        detail: `Held out of the P&L as "${CATEGORY_MAP[t.categoryId]?.label ?? t.categoryId}". Confirm this treatment (e.g. split principal vs interest, or capitalise vs expense).`,
      });
    }
  }
  return out;
}

function detectOutliers(txns: TxnBasic[]): Candidate[] {
  const byCat = new Map<string, number[]>();
  for (const t of txns) {
    if (!t.categoryId || t.amountCents >= 0) continue;
    const arr = byCat.get(t.categoryId) ?? [];
    arr.push(Math.abs(t.amountCents));
    byCat.set(t.categoryId, arr);
  }
  const out: Candidate[] = [];
  for (const t of txns) {
    if (!t.categoryId || t.amountCents >= 0) continue;
    const samples = byCat.get(t.categoryId)!;
    if (samples.length < 8) continue;
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
    const sd = Math.sqrt(variance);
    if (sd === 0) continue;
    const z = (Math.abs(t.amountCents) - mean) / sd;
    if (z > 3) {
      out.push({
        transactionId: t.id,
        reasonCode: "OUTLIER",
        severity: severityFor("OUTLIER", t.amountCents),
        detail: `${fmt(Math.abs(t.amountCents))} is ${z.toFixed(1)} standard deviations above the typical "${CATEGORY_MAP[t.categoryId]?.label ?? t.categoryId}" transaction (mean ${fmt(Math.round(mean))}).`,
      });
    }
  }
  return out;
}

export async function scanReviewItems(): Promise<{ created: number; total: number; candidates: number }> {
  const txns = await loadTransactions();
  const candidates = [
    ...detectClassificationIssues(txns),
    ...detectBalanceMismatch(txns),
    ...detectDuplicates(txns),
    ...detectRoundNumbers(txns),
    ...detectOpaque(txns),
    ...detectOutliers(txns),
  ];

  const now = nowIso();
  const results = await qBatch(
    candidates.map((c) => ({
      sql: `INSERT OR IGNORE INTO review_items (transaction_id, reason_code, severity, detail, status, created_at)
       VALUES (?, ?, ?, ?, 'open', ?)`,
      args: [c.transactionId, c.reasonCode, c.severity, c.detail, now] as InValue[],
    }))
  );
  const created = results.reduce((s, n) => s + n, 0);

  const totalRow = await qGet<{ n: number }>(`SELECT COUNT(*) AS n FROM review_items WHERE status = 'open'`);
  return { created, total: totalRow?.n ?? 0, candidates: candidates.length };
}

const RESOLVE_FLAGS_SQL = `UPDATE review_items
 SET status = 'resolved', resolution = 'Auto-resolved after category correction', resolved_at = ?
 WHERE transaction_id = ? AND status = 'open'
   AND reason_code IN ('LOW_CONFIDENCE','RULES_FALLBACK','AI_FLAGGED')`;

export function resolveFlagsStatement(resolvedAt: string, transactionId: number): InStatement {
  return { sql: RESOLVE_FLAGS_SQL, args: [resolvedAt, transactionId] };
}

export async function resolveClassificationFlags(transactionId: number): Promise<void> {
  await qRun(RESOLVE_FLAGS_SQL, nowIso(), transactionId);
}
