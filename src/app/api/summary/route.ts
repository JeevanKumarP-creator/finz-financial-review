import { qAll, qGet } from "@/lib/db";
import { listMonthsWithCounts, computeAllPnl } from "@/lib/pnl";
import { countUnclassified } from "@/lib/ai/categorize";
import { allAdjacentVariances } from "@/lib/variance";
import { aiConfigured, aiModel } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const [totals, classified, reviewCounts, highOpen, corrections] = await Promise.all([
    qGet<{ n: number }>(`SELECT COUNT(*) AS n FROM transactions`),
    qGet<{ n: number }>(`SELECT COUNT(*) AS n FROM classifications`),
    qAll<{ status: string; n: number }>(`SELECT status, COUNT(*) AS n FROM review_items GROUP BY status`),
    qGet<{ n: number }>(`SELECT COUNT(*) AS n FROM review_items WHERE status='open' AND severity='high'`),
    qGet<{ n: number }>(`SELECT COUNT(*) AS n FROM corrections`),
  ]);

  const [statements, months, unclassifiedCount, variances] = await Promise.all([
    computeAllPnl(),
    listMonthsWithCounts(),
    countUnclassified(),
    allAdjacentVariances(),
  ]);
  const latest = statements[statements.length - 1] ?? null;
  const materialCount = variances.reduce((s, v) => s + v.materialLineIds.length, 0);

  return Response.json({
    totalTransactions: totals?.n ?? 0,
    classified: classified?.n ?? 0,
    unclassified: unclassifiedCount,
    classificationPct: (totals?.n ?? 0) === 0 ? 0 : Math.round(((classified?.n ?? 0) / (totals?.n ?? 1)) * 100),
    openReview: reviewCounts.find((c) => c.status === "open")?.n ?? 0,
    resolvedReview: reviewCounts.find((c) => c.status === "resolved")?.n ?? 0,
    highSeverityOpen: highOpen?.n ?? 0,
    corrections: corrections?.n ?? 0,
    months,
    latestMonth: latest?.month ?? null,
    latest: latest
      ? {
          revenueCents: latest.revenue.amountCents,
          cogsCents: latest.cogs.amountCents,
          grossProfitCents: latest.grossProfit.amountCents,
          payrollCents: latest.payroll.amountCents,
          opexCents: latest.opex.amountCents,
          operatingProfitCents: latest.operatingProfit.amountCents,
          unclassifiedCount: latest.unclassifiedCount,
        }
      : null,
    statements: statements.map((s) => ({
      month: s.month,
      revenueCents: s.revenue.amountCents,
      grossProfitCents: s.grossProfit.amountCents,
      payrollCents: s.payroll.amountCents,
      opexCents: s.opex.amountCents,
      operatingProfitCents: s.operatingProfit.amountCents,
      unclassifiedCount: s.unclassifiedCount,
    })),
    materialVariances: materialCount,
    aiConfigured: aiConfigured(),
    aiModel: aiConfigured() ? aiModel() : null,
  });
}
