import { qAll } from "./db";
import { CATEGORY_MAP, PNL_LINE_LABELS } from "./categories";
import type { PnlLine, PnlStatement, Section } from "./types";

interface GroupedRow {
  month: string;
  categoryId: string;
  amountCents: number;
  n: number;
}

interface CoverageRow {
  month: string;
  n: number;
  amountCents: number;
}

function monthsFrom(rows: GroupedRow[], coverage: CoverageRow[], nonPl: CoverageRow[]): string[] {
  const set = new Set<string>();
  rows.forEach((r) => set.add(r.month));
  coverage.forEach((r) => set.add(r.month));
  nonPl.forEach((r) => set.add(r.month));
  return [...set].sort();
}

export async function getMonthlyCategoryTotals(month?: string): Promise<GroupedRow[]> {
  const where = month ? "WHERE substr(t.date, 1, 7) = ?" : "";
  const sql = `
    SELECT substr(t.date, 1, 7) AS month,
           cl.category_id AS categoryId,
           SUM(t.amount_cents) AS amountCents,
           COUNT(*) AS n
    FROM transactions t
    JOIN classifications cl ON cl.transaction_id = t.id
    ${where}
    GROUP BY 1, 2
    ORDER BY 1, 2`;
  return month ? await qAll<GroupedRow>(sql, month) : await qAll<GroupedRow>(sql);
}

async function getCoverage(month?: string): Promise<{ unclassified: CoverageRow[]; nonPl: CoverageRow[] }> {
  const where = month ? "AND substr(t.date, 1, 7) = ?" : "";
  const unclassifiedSql = `
    SELECT substr(t.date, 1, 7) AS month, COUNT(*) AS n, COALESCE(SUM(t.amount_cents), 0) AS amountCents
    FROM transactions t
    LEFT JOIN classifications cl ON cl.transaction_id = t.id
    WHERE cl.transaction_id IS NULL ${where}
    GROUP BY 1`;
  const nonPlSql = `
    SELECT substr(t.date, 1, 7) AS month, COUNT(*) AS n, COALESCE(SUM(t.amount_cents), 0) AS amountCents
    FROM transactions t
    JOIN classifications cl ON cl.transaction_id = t.id
    WHERE cl.treatment = 'NON_P_AND_L' ${where}
    GROUP BY 1`;
  const [unclassified, nonPl] = await Promise.all([
    month ? qAll<CoverageRow>(unclassifiedSql, month) : qAll<CoverageRow>(unclassifiedSql),
    month ? qAll<CoverageRow>(nonPlSql, month) : qAll<CoverageRow>(nonPlSql),
  ]);
  return { unclassified, nonPl };
}

function lineFromCategories(
  id: string,
  sections: Section[],
  groups: GroupedRow[],
  sign: 1 | -1
): PnlLine {
  const cats = groups.filter((g) => {
    const cat = CATEGORY_MAP[g.categoryId];
    return cat?.section && sections.includes(cat.section);
  });
  const categories = cats.map((g) => ({
    categoryId: g.categoryId,
    label: CATEGORY_MAP[g.categoryId]?.label ?? g.categoryId,
    amountCents: sign * g.amountCents,
    transactionCount: g.n,
  }));
  return {
    id,
    label: PNL_LINE_LABELS[id],
    amountCents: categories.reduce((s, c) => s + c.amountCents, 0),
    transactionCount: categories.reduce((s, c) => s + c.transactionCount, 0),
    categories,
  };
}

export function buildStatement(
  month: string,
  allGroups: GroupedRow[],
  unclassified: CoverageRow[],
  nonPl: CoverageRow[]
): PnlStatement {
  const groups = allGroups.filter((g) => g.month === month);
  const revenue = lineFromCategories("revenue", ["REVENUE"], groups, 1);
  const cogs = lineFromCategories("cogs", ["COGS"], groups, -1);
  const payroll = lineFromCategories("payroll", ["PAYROLL"], groups, -1);
  const opex = lineFromCategories("opex", ["OPEX"], groups, -1);
  const grossProfit: PnlLine = {
    id: "grossProfit",
    label: PNL_LINE_LABELS.grossProfit,
    amountCents: revenue.amountCents - cogs.amountCents,
    transactionCount: revenue.transactionCount + cogs.transactionCount,
    categories: [],
  };
  const operatingProfit: PnlLine = {
    id: "operatingProfit",
    label: PNL_LINE_LABELS.operatingProfit,
    amountCents: grossProfit.amountCents - payroll.amountCents - opex.amountCents,
    transactionCount: grossProfit.transactionCount + payroll.transactionCount + opex.transactionCount,
    categories: [],
  };
  const unc = unclassified.find((u) => u.month === month);
  const non = nonPl.find((u) => u.month === month);
  return {
    month,
    revenue,
    cogs,
    grossProfit,
    payroll,
    opex,
    operatingProfit,
    unclassifiedCount: unc?.n ?? 0,
    unclassifiedCents: unc?.amountCents ?? 0,
    nonPlCount: non?.n ?? 0,
    nonPlCents: non?.amountCents ?? 0,
  };
}

export async function computeAllPnl(): Promise<PnlStatement[]> {
  const groups = await getMonthlyCategoryTotals();
  const { unclassified, nonPl } = await getCoverage();
  const months = monthsFrom(groups, unclassified, nonPl);
  return months.map((m) => buildStatement(m, groups, unclassified, nonPl));
}

export async function computePnlForMonth(month: string): Promise<PnlStatement | null> {
  const [groups, coverage] = await Promise.all([getMonthlyCategoryTotals(month), getCoverage(month)]);
  const { unclassified, nonPl } = coverage;
  const months = monthsFrom(groups, unclassified, nonPl);
  if (!months.includes(month)) return null;
  return buildStatement(month, groups, unclassified, nonPl);
}

export async function listMonthsWithCounts(): Promise<{ month: string; count: number }[]> {
  return qAll<{ month: string; count: number }>(
    `SELECT substr(date, 1, 7) AS month, COUNT(*) AS count
     FROM transactions GROUP BY 1 ORDER BY 1`
  );
}
