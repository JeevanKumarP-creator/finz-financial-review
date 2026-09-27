import { countTransactions, loadTransactions } from "@/lib/transactions";
import type { Treatment } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams;
  const filter = {
    month: q.get("month") || undefined,
    categoryId: q.get("category") || undefined,
    q: q.get("q") || undefined,
    flagged: q.get("flagged") === "1",
    treatment: (q.get("treatment") as Treatment | null) || undefined,
    minAbsCents: q.get("min") ? Math.round(Number(q.get("min")) * 100) : undefined,
    limit: Math.min(Number(q.get("limit")) || 500, 1000),
    offset: Number(q.get("offset")) || 0,
    sort: q.get("sort") === "amount" ? ("amount" as const) : ("date" as const),
  };
  const transactions = await loadTransactions(filter);
  const total = await countTransactions(filter);
  return Response.json({ transactions, total });
}
