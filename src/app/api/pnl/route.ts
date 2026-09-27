import { computeAllPnl, computePnlForMonth } from "@/lib/pnl";
import { listMonthsWithCounts } from "@/lib/pnl";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const month = new URL(request.url).searchParams.get("month");
  if (month) {
    const statement = await computePnlForMonth(month);
    if (!statement) return Response.json({ error: `No data for ${month}` }, { status: 404 });
    return Response.json({ statement, months: await listMonthsWithCounts() });
  }
  return Response.json({ statements: await computeAllPnl(), months: await listMonthsWithCounts() });
}
