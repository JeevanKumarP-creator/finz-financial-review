"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiGet, money, monthLabel, pct } from "@/lib/api";
import { Badge, Button, EmptyState, Panel, PageHeader, Spinner } from "@/components/ui";
import type { VarianceComparison, VarianceExplanation } from "@/lib/types";

interface VarianceResponse {
  comparison: VarianceComparison;
  explanation: VarianceExplanation | null;
  evidence: Record<string, unknown>;
}

interface AllResponse {
  comparisons: VarianceComparison[];
}

function VarianceContent() {
  const params = useSearchParams();
  const [all, setAll] = useState<VarianceComparison[]>([]);
  const [selected, setSelected] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [detail, setDetail] = useState<VarianceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openLine, setOpenLine] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<AllResponse>("/api/variances")
      .then((r) => {
        if (cancelled) return;
        setAll(r.comparisons);
        const from = params.get("from");
        const to = params.get("to");
        const fallback = r.comparisons[r.comparisons.length - 1];
        if (from && to) setSelected({ from, to });
        else if (fallback) setSelected({ from: fallback.from, to: fallback.to });
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (!selected) return;
    const { from, to } = selected;
    let cancelled = false;
    apiGet<VarianceResponse>(`/api/variances?from=${from}&to=${to}&explain=1`)
      .then((r) => {
        if (cancelled) return;
        setDetail(r);
        const material = r.comparison.lines.find((l) => l.material);
        setOpenLine(material?.lineId ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load variance");
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const loading = all.length === 0 && !error;
  const explaining =
    !!selected &&
    (!detail || detail.comparison.from !== selected.from || detail.comparison.to !== selected.to);

  if (loading) {
    return (
      <div className="pt-10">
        <Spinner label="Loading variances..." />
      </div>
    );
  }
  if (error) return <EmptyState title="Error" description={error} />;
  if (all.length === 0) {
    return (
      <EmptyState
        title="Not enough data to compare"
        description="Import at least two months of transactions and classify them to compare P&Ls."
        action={
          <Link href="/ingest">
            <Button>Go to Ingest</Button>
          </Link>
        }
      />
    );
  }

  const materialCount = detail?.comparison.materialLineIds.length ?? 0;

  return (
    <>
      <PageHeader
        title="Variances"
        subtitle="Adjacent monthly P&Ls compared line by line. Material changes (≥ $500 and ≥ 10% of the prior month) are ranked with their category drivers and the transactions behind them."
        actions={
          <div className="flex flex-wrap gap-1.5">
            {all.map((c) => (
              <button
                key={`${c.from}-${c.to}`}
                onClick={() => {
                  setSelected({ from: c.from, to: c.to });
                  setDetail(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm border transition-colors ${
                  selected?.from === c.from && selected?.to === c.to
                    ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {monthLabel(c.from)} → {monthLabel(c.to)}
              </button>
            ))}
          </div>
        }
      />

      {!detail || !selected ? (
        <Spinner label="Computing comparison..." />
      ) : (
        <div className="grid lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 space-y-5">
            <Panel>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                    {monthLabel(detail.comparison.from)} vs {monthLabel(detail.comparison.to)}
                  </h2>
                  <div className="text-xs text-slate-500 mt-1">
                    Materiality: ≥ ${detail.comparison.materialityMinCents / 100} and ≥{" "}
                    {detail.comparison.materialityMinPct * 100}% of the prior month ·{" "}
                    <span className="text-amber-400">{materialCount} material line(s)</span>
                  </div>
                </div>
                <Badge color="sky">deterministic comparison</Badge>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <th className="text-left py-2">P&L line</th>
                    <th className="text-right py-2">{monthLabel(detail.comparison.from)}</th>
                    <th className="text-right py-2">{monthLabel(detail.comparison.to)}</th>
                    <th className="text-right py-2">Change</th>
                    <th className="text-right py-2">%</th>
                    <th className="text-right py-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.comparison.lines.map((l) => (
                    <tr
                      key={l.lineId}
                      onClick={() => setOpenLine(openLine === l.lineId ? null : l.lineId)}
                      className={`border-b border-slate-800/60 cursor-pointer table-row-hover ${
                        l.material ? "bg-amber-500/5" : ""
                      } ${openLine === l.lineId ? "bg-slate-800/40" : ""}`}
                    >
                      <td className="py-2.5 text-slate-200">
                        {l.label}
                        {l.material ? (
                          <Badge color="amber">material</Badge>
                        ) : null}
                      </td>
                      <td className="text-right num text-slate-400">{money(l.priorCents)}</td>
                      <td className="text-right num text-slate-200">{money(l.currentCents)}</td>
                      <td
                        className={`text-right num font-medium ${l.deltaCents >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                      >
                        {money(l.deltaCents, { sign: true })}
                      </td>
                      <td className="text-right num text-slate-400">
                        {pct(l.deltaPct, { sign: true })}
                      </td>
                      <td className="text-right text-[11px] text-slate-600">
                        {l.drivers.filter((d) => d.deltaCents !== 0).length} drivers
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            {openLine ? (
              <DrillDown
                line={detail.comparison.lines.find((l) => l.lineId === openLine)!}
                month={detail.comparison.to}
              />
            ) : null}
          </div>

          <div className="lg:col-span-2 space-y-5">
            <Panel>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  AI explanation
                </h2>
                {detail.explanation ? (
                  detail.explanation.generatedBy === "ai" ? (
                    <Badge color={detail.explanation.verified ? "emerald" : "rose"}>
                      {detail.explanation.verified ? "verified" : "figures withheld"}
                    </Badge>
                  ) : (
                    <Badge color="slate">deterministic</Badge>
                  )
                ) : null}
              </div>

              {explaining || !detail.explanation ? (
                <Spinner label="Explaining the material variance..." />
              ) : (
                <div className="space-y-3">
                  <div className="text-white font-medium">
                    {detail.explanation.headline}
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                    {detail.explanation.explanation}
                  </p>
                  {detail.explanation.issues.map((issue, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300"
                    >
                      {issue}
                    </div>
                  ))}
                  <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-800">
                    The AI only narrates figures produced by the deterministic engine; a verifier
                    checks every dollar amount in the text against the evidence and withholds
                    anything unsupported.
                  </div>
                </div>
              )}
            </Panel>

            <Panel>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Evidence
                </h2>
                <Link
                  href={`/pnl?month=${detail.comparison.to}`}
                  className="text-xs text-sky-400 hover:text-sky-300"
                >
                  Open P&L →
                </Link>
              </div>
              <details className="group">
                <summary className="cursor-pointer text-sm text-slate-300 hover:text-white">
                  Raw computed evidence passed to the model
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-slate-950 border border-slate-800 p-3 text-[11px] text-slate-400 num">
                  {JSON.stringify(detail.evidence, null, 2)}
                </pre>
              </details>
            </Panel>

            <Panel>
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
                How this is computed
              </h2>
              <ul className="text-xs text-slate-400 space-y-2 leading-relaxed">
                <li>
                  1. Both months are rebuilt from classified transactions in integer cents
                  (<code className="text-slate-500">pnl.ts</code>).
                </li>
                <li>
                  2. Line deltas and category drivers are summed from the same rows
                  (<code className="text-slate-500">variance.ts</code>).
                </li>
                <li>
                  3. Materiality and ranking are deterministic; AI only writes the narrative.
                </li>
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

function DrillDown({
  line,
  month,
}: {
  line: VarianceComparison["lines"][number];
  month: string;
}) {
  const drivers = line.drivers.filter((d) => d.deltaCents !== 0);
  return (
    <Panel>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
          Drivers of {line.label}
        </h3>
        <Link
          href={`/transactions?month=${month}`}
          className="text-xs text-sky-400 hover:text-sky-300"
        >
          All transactions in {monthLabel(month)} →
        </Link>
      </div>

      {drivers.length === 0 ? (
        <p className="text-sm text-slate-500">No category-level movement on this line.</p>
      ) : (
        <div className="space-y-1.5 mb-4">
          {drivers.slice(0, 6).map((d) => (
            <div key={d.categoryId} className="flex items-center justify-between text-sm">
              <Link
                href={`/transactions?month=${month}&category=${d.categoryId.replace("_total", "")}`}
                className="text-slate-300 hover:text-sky-300"
              >
                {d.label}
              </Link>
              <span
                className={`num ${d.deltaCents >= 0 ? "text-emerald-400" : "text-rose-400"}`}
              >
                {money(d.deltaCents, { sign: true })}
              </span>
            </div>
          ))}
        </div>
      )}

      {line.topTransactions.length > 0 ? (
        <>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">
            Largest transactions in {monthLabel(month)}
          </div>
          <table className="w-full text-sm">
            <tbody>
              {line.topTransactions.map((t) => (
                <tr key={t.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="py-2 num text-slate-500 w-24">{t.date}</td>
                  <td className="py-2">
                    <Link
                      href={`/transactions?id=${t.id}`}
                      className="text-slate-200 hover:text-sky-300"
                    >
                      {t.description}
                    </Link>
                    <div className="text-[11px] text-slate-500">{t.categoryLabel}</div>
                  </td>
                  <td
                    className={`py-2 text-right num ${t.amountCents >= 0 ? "text-emerald-400" : "text-slate-200"}`}
                  >
                    {money(t.amountCents, { sign: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </Panel>
  );
}

export default function VariancesPage() {
  return (
    <Suspense
      fallback={
        <div className="pt-10">
          <Spinner label="Loading..." />
        </div>
      }
    >
      <VarianceContent />
    </Suspense>
  );
}
