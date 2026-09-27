import { qAll } from "./db";
import { CATEGORY_MAP } from "./categories";
import { computePnlForMonth, getMonthlyCategoryTotals } from "./pnl";
import type {
  PnlLine,
  PnlStatement,
  Section,
  VarianceComparison,
  VarianceDriverCategory,
  VarianceDriverTransaction,
  VarianceLine,
} from "./types";

export const MATERIALITY_MIN_CENTS = 500_00;
export const MATERIALITY_MIN_PCT = 0.1;

const LINE_SECTIONS: Record<string, { sections: Section[]; sign: 1 | -1 }> = {
  revenue: { sections: ["REVENUE"], sign: 1 },
  cogs: { sections: ["COGS"], sign: -1 },
  payroll: { sections: ["PAYROLL"], sign: -1 },
  opex: { sections: ["OPEX"], sign: -1 },
};

const COMPUTED_LINES = ["grossProfit", "operatingProfit"];

function pickLine(stmt: PnlStatement, lineId: string): PnlLine {
  switch (lineId) {
    case "revenue":
      return stmt.revenue;
    case "cogs":
      return stmt.cogs;
    case "payroll":
      return stmt.payroll;
    case "opex":
      return stmt.opex;
    case "grossProfit":
      return stmt.grossProfit;
    default:
      return stmt.operatingProfit;
  }
}

interface TxnRow {
  id: number;
  date: string;
  description: string;
  amountCents: number;
  categoryId: string;
}

function signedDelta(section: Section, rawDelta: number): number {
  return section === "REVENUE" ? rawDelta : -rawDelta;
}

function driversForLine(
  lineId: string,
  from: string,
  to: string,
  fromGroups: Awaited<ReturnType<typeof getMonthlyCategoryTotals>>,
  toGroups: Awaited<ReturnType<typeof getMonthlyCategoryTotals>>
): VarianceDriverCategory[] {
  const spec = LINE_SECTIONS[lineId];
  if (!spec) return [];
  const fromMap = new Map(fromGroups.map((g) => [g.categoryId, g.amountCents]));
  const out: VarianceDriverCategory[] = [];
  for (const g of toGroups) {
    const cat = CATEGORY_MAP[g.categoryId];
    if (!cat?.section || !spec.sections.includes(cat.section)) continue;
    const prior = fromMap.get(g.categoryId) ?? 0;
    const current = g.amountCents;
    out.push({
      categoryId: g.categoryId,
      label: cat.label,
      deltaCents: signedDelta(cat.section, current - prior),
      currentCents: spec.sign * current,
      priorCents: spec.sign * prior,
    });
  }
  for (const [categoryId, prior] of fromMap) {
    if (out.some((d) => d.categoryId === categoryId)) continue;
    const cat = CATEGORY_MAP[categoryId];
    if (!cat?.section || !spec.sections.includes(cat.section)) continue;
    out.push({
      categoryId,
      label: cat.label,
      deltaCents: signedDelta(cat.section, 0 - prior),
      currentCents: 0,
      priorCents: spec.sign * prior,
    });
  }
  return out.sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents));
}

async function topTransactionsForLine(
  lineId: string,
  month: string,
  limit = 5
): Promise<VarianceDriverTransaction[]> {
  const spec = LINE_SECTIONS[lineId];
  if (!spec) return [];
  const rows = await qAll<TxnRow>(
    `SELECT t.id, t.date, t.description, t.amount_cents AS amountCents,
            cl.category_id AS categoryId
     FROM transactions t
     JOIN classifications cl ON cl.transaction_id = t.id
     WHERE substr(t.date, 1, 7) = ?
     ORDER BY ABS(t.amount_cents) DESC`,
    month
  );
  return rows
    .filter((r) => {
      const cat = CATEGORY_MAP[r.categoryId];
      return !!cat?.section && spec.sections.includes(cat.section);
    })
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description,
      amountCents: r.amountCents,
      categoryId: r.categoryId,
      categoryLabel: CATEGORY_MAP[r.categoryId]?.label ?? r.categoryId,
    }));
}

function deltaPctOf(deltaCents: number, priorCents: number): number | null {
  if (priorCents === 0) return null;
  return Math.round((deltaCents / Math.abs(priorCents)) * 10000) / 100;
}

export function isMaterial(deltaCents: number, priorCents: number): boolean {
  if (Math.abs(deltaCents) < MATERIALITY_MIN_CENTS) return false;
  if (priorCents === 0) return true;
  return Math.abs(deltaCents / Math.abs(priorCents)) >= MATERIALITY_MIN_PCT;
}

export async function computeVariance(from: string, to: string): Promise<VarianceComparison | null> {
  const [a, b, fromGroups, toGroups] = await Promise.all([
    computePnlForMonth(from),
    computePnlForMonth(to),
    getMonthlyCategoryTotals(from),
    getMonthlyCategoryTotals(to),
  ]);
  if (!a || !b) return null;

  const lineIds = ["revenue", "cogs", "payroll", "opex", "grossProfit", "operatingProfit"] as const;
  const lines: VarianceLine[] = await Promise.all(
    lineIds.map(async (lineId) => {
      const currentLine = pickLine(b, lineId);
      const priorLine = pickLine(a, lineId);
      const current = currentLine.amountCents;
      const prior = priorLine.amountCents;
      const delta = current - prior;
      const drivers = COMPUTED_LINES.includes(lineId)
        ? distributeComputedDrivers(lineId, from, to, fromGroups, toGroups)
        : driversForLine(lineId, from, to, fromGroups, toGroups);
      return {
        lineId,
        label: currentLine.label,
        currentCents: current,
        priorCents: prior,
        deltaCents: delta,
        deltaPct: deltaPctOf(delta, prior),
        material: isMaterial(delta, prior),
        drivers,
        topTransactions: await topTransactionsForLine(lineId, to),
      };
    })
  );

  return {
    from,
    to,
    materialityMinCents: MATERIALITY_MIN_CENTS,
    materialityMinPct: MATERIALITY_MIN_PCT,
    lines,
    materialLineIds: lines.filter((l) => l.material).map((l) => l.lineId),
  };
}

function distributeComputedDrivers(
  lineId: string,
  from: string,
  to: string,
  fromGroups: Awaited<ReturnType<typeof getMonthlyCategoryTotals>>,
  toGroups: Awaited<ReturnType<typeof getMonthlyCategoryTotals>>
): VarianceDriverCategory[] {
  const baseLines = lineId === "grossProfit" ? ["revenue", "cogs"] : ["revenue", "cogs", "payroll", "opex"];
  const out: VarianceDriverCategory[] = [];
  for (const base of baseLines) {
    const drivers = driversForLine(base, from, to, fromGroups, toGroups);
    const total = drivers.reduce((s, d) => s + d.deltaCents, 0);
    if (total !== 0) {
      out.push({
        categoryId: `${base}_total`,
        label: `Change in ${base === "cogs" ? "Cost of Goods Sold" : base === "opex" ? "Operating Expenses" : base}`,
        deltaCents: total,
        currentCents: 0,
        priorCents: 0,
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents));
}

export async function adjacentMonthPairs(): Promise<{ from: string; to: string }[]> {
  const months = (
    await qAll<{ m: string }>(`SELECT DISTINCT substr(date, 1, 7) AS m FROM transactions ORDER BY 1`)
  ).map((r) => r.m);
  const pairs: { from: string; to: string }[] = [];
  for (let i = 0; i < months.length - 1; i++) pairs.push({ from: months[i], to: months[i + 1] });
  return pairs;
}

export async function allAdjacentVariances(): Promise<VarianceComparison[]> {
  const pairs = await adjacentMonthPairs();
  const out: VarianceComparison[] = [];
  for (const p of pairs) {
    const v = await computeVariance(p.from, p.to);
    if (v) out.push(v);
  }
  return out;
}
