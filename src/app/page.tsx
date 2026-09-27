"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, compactMoney, money, monthLabel, pct } from "@/lib/api";
import { Badge, Button, EmptyState, Panel, PageHeader, Spinner } from "@/components/ui";

interface Summary {
  totalTransactions: number;
  classified: number;
  unclassified: number;
  classificationPct: number;
  openReview: number;
  highSeverityOpen: number;
  corrections: number;
  latestMonth: string | null;
  latest: {
    revenueCents: number;
    cogsCents: number;
    grossProfitCents: number;
    payrollCents: number;
    opexCents: number;
    operatingProfitCents: number;
    unclassifiedCount: number;
  } | null;
  statements: {
    month: string;
    revenueCents: number;
    grossProfitCents: number;
    payrollCents: number;
    opexCents: number;
    operatingProfitCents: number;
    unclassifiedCount: number;
  }[];
  materialVariances: number;
  aiConfigured: boolean;
  aiModel: string | null;
}

interface VarianceLine {
  lineId: string;
  label: string;
  deltaCents: number;
  deltaPct: number | null;
  material: boolean;
}

interface VarianceComparison {
  from: string;
  to: string;
  materialLineIds: string[];
  lines: VarianceLine[];
}

function KpiCard({
  label,
  value,
  sub,
  href,
  tone = "text-white",
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  tone?: string;
}) {
  const body = (
    <div className="panel p-4 h-full transition-colors hover:border-slate-600">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`text-2xl font-semibold mt-2 num ${tone}`}>{value}</div>
      {sub ? <div className="text-xs text-slate-500 mt-1.5">{sub}</div> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [variances, setVariances] = useState<VarianceComparison[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiGet<Summary>("/api/summary"), apiGet<{ comparisons: VarianceComparison[] }>("/api/variances")])
      .then(([s, v]) => {
        setSummary(s);
        setVariances(v.comparisons);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="pt-10">
        <Spinner label="Loading review data..." />
      </div>
    );
  }

  if (error) {
    return <EmptyState title="Something went wrong" description={error} />;
  }

  if (!summary || summary.totalTransactions === 0) {
    return (
      <>
        <PageHeader
          title="Financial Review"
          subtitle="No bank data imported yet. Import a statement to start the workflow: ingest, categorize, review, calculate, explain, investigate."
        />
        <EmptyState
          title="Start with a bank statement"
          description="Import your CSV export or load the bundled sample dataset to see the full workflow end to end."
          action={
            <Link href="/ingest">
              <Button>Go to Ingest</Button>
            </Link>
          }
        />
      </>
    );
  }

  const materialRows = variances
    .flatMap((c) =>
      c.lines
        .filter((l) => l.material)
        .map((l) => ({ ...l, from: c.from, to: c.to }))
    )
    .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents))
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="Financial Review"
        subtitle={`AI-native review of your bank data: ${summary.totalTransactions} transactions across ${summary.statements.length} months. All P&L figures are computed deterministically from the underlying transactions.`}
        actions={
          <Link href="/analyst">
            <Button>Ask the AI Analyst</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label={`Revenue ${monthLabel(summary.latestMonth ?? "")}`}
          value={summary.latest ? compactMoney(summary.latest.revenueCents) : "-"}
          sub="Money in, P&L categories"
          href={summary.latestMonth ? `/pnl?month=${summary.latestMonth}` : "/pnl"}
        />
        <KpiCard
          label="Operating Profit"
          value={summary.latest ? compactMoney(summary.latest.operatingProfitCents) : "-"}
          sub="Gross profit - payroll - opex"
          tone={summary.latest && summary.latest.operatingProfitCents >= 0 ? "text-emerald-400" : "text-rose-400"}
          href={summary.latestMonth ? `/pnl?month=${summary.latestMonth}` : "/pnl"}
        />
        <KpiCard
          label="Open Review Items"
          value={String(summary.openReview)}
          sub={`${summary.highSeverityOpen} high severity`}
          tone={summary.openReview > 0 ? "text-amber-400" : "text-emerald-400"}
          href="/review"
        />
        <KpiCard
          label="AI Coverage"
          value={`${summary.classificationPct}%`}
          sub={`${summary.classified}/${summary.totalTransactions} classified`}
          tone={summary.classificationPct === 100 ? "text-emerald-400" : "text-amber-400"}
          href="/transactions?flagged=1"
        />
        <KpiCard
          label="Material Variances"
          value={String(summary.materialVariances)}
          sub="Across adjacent months"
          href="/variances"
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        <Panel className="lg:col-span-3 overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Monthly P&L trend
            </h2>
            <Link href="/pnl" className="text-xs text-sky-400 hover:text-sky-300">
              Full statement →
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="text-left py-2">Month</th>
                <th className="text-right py-2">Revenue</th>
                <th className="text-right py-2">Gross Profit</th>
                <th className="text-right py-2">Payroll</th>
                <th className="text-right py-2">OpEx</th>
                <th className="text-right py-2">Operating Profit</th>
              </tr>
            </thead>
            <tbody>
              {summary.statements.map((s) => (
                <tr key={s.month} className="border-b border-slate-800/60 table-row-hover">
                  <td className="py-2.5">
                    <Link href={`/pnl?month=${s.month}`} className="text-sky-400 hover:text-sky-300">
                      {monthLabel(s.month)}
                    </Link>
                    {s.unclassifiedCount > 0 ? (
                      <Badge color="amber" title="Unclassified transactions excluded from P&L">
                        {s.unclassifiedCount} unclassified
                      </Badge>
                    ) : null}
                  </td>
                  <td className="text-right num text-slate-200">{money(s.revenueCents)}</td>
                  <td className="text-right num text-slate-200">{money(s.grossProfitCents)}</td>
                  <td className="text-right num text-slate-300">{money(s.payrollCents)}</td>
                  <td className="text-right num text-slate-300">{money(s.opexCents)}</td>
                  <td className={`text-right num font-medium ${s.operatingProfitCents >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {money(s.operatingProfitCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 text-[11px] text-slate-500">
            Computed by the deterministic engine in <code className="text-slate-400">src/lib/pnl.ts</code> from
            classified transactions. The LLM never produces these totals.
          </div>
        </Panel>

        <Panel className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Material variances
            </h2>
            <Link href="/variances" className="text-xs text-sky-400 hover:text-sky-300">
              All →
            </Link>
          </div>
          {materialRows.length === 0 ? (
            <p className="text-sm text-slate-500">
              No month-over-month movement beyond the materiality threshold yet.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {materialRows.map((v, i) => (
                <li key={`${v.from}-${v.to}-${v.lineId}-${i}`}>
                  <Link
                    href={`/variances?from=${v.from}&to=${v.to}`}
                    className="block rounded-lg border border-slate-800 px-3 py-2.5 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-200">{v.label}</span>
                      <span
                        className={`num text-sm font-medium ${v.deltaCents >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                      >
                        {v.deltaCents >= 0 ? "+" : "-"}
                        {compactMoney(Math.abs(v.deltaCents))}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {monthLabel(v.from)} → {monthLabel(v.to)} · {pct(v.deltaPct, { sign: true })}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 pt-4 border-t border-slate-800 text-xs text-slate-500 space-y-1.5">
            <div className="flex items-center justify-between">
              <span>Human corrections saved</span>
              <span className="num text-slate-300">{summary.corrections}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Unclassified transactions</span>
              <span className={`num ${summary.unclassified > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {summary.unclassified}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>AI model</span>
              <span className="text-slate-400 truncate max-w-[160px]" title={summary.aiModel ?? ""}>
                {summary.aiModel ?? "not configured"}
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
