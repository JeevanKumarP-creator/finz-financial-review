import { qAll } from "@/lib/db";
import { scanReviewItems } from "@/lib/review";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export interface ReviewItemRow {
  id: number;
  transactionId: number;
  reasonCode: string;
  severity: "high" | "medium" | "low";
  detail: string | null;
  status: "open" | "resolved";
  resolution: string | null;
  createdAt: string;
  date: string;
  description: string;
  amountCents: number;
  counterparty: string | null;
  categoryId: string | null;
  confidence: number | null;
  source: string | null;
}

async function query(status: string): Promise<ReviewItemRow[]> {
  return qAll<ReviewItemRow>(
    `SELECT ri.id, ri.transaction_id AS transactionId, ri.reason_code AS reasonCode,
            ri.severity, ri.detail, ri.status, ri.resolution, ri.created_at AS createdAt,
            t.date, t.description, t.amount_cents AS amountCents, t.counterparty,
            cl.category_id AS categoryId, cl.confidence, cl.source
     FROM review_items ri
     JOIN transactions t ON t.id = ri.transaction_id
     LEFT JOIN classifications cl ON cl.transaction_id = t.id
     WHERE ri.status = ?
     ORDER BY CASE ri.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
              ABS(t.amount_cents) DESC`,
    status
  );
}

export async function GET(request: Request): Promise<Response> {
  const status = new URL(request.url).searchParams.get("status") ?? "open";
  const [items, counts] = await Promise.all([
    query(status === "resolved" ? "resolved" : "open"),
    qAll<{ status: string; n: number }>(`SELECT status, COUNT(*) AS n FROM review_items GROUP BY status`),
  ]);
  return Response.json({ items, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
}

export async function POST(): Promise<Response> {
  const scan = await scanReviewItems();
  return Response.json({ scan, items: await query("open") });
}
