"use client";

import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiGet, money, monthLabel } from "@/lib/api";
import { Badge, Button, EmptyState, Panel, PageHeader, Spinner } from "@/components/ui";
import type { PnlStatement } from "@/lib/types";

interface PnlResponse {
  statements: PnlStatement[];
  months: { month: string; count: number }[];
}

function PnlContent() {
  const params = useSearchParams();
  const [data, setData] = useState<PnlResponse | null>(null);
  const [selected, setSelected] = useState<string>(params.get("month") ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<PnlResponse>("/api/pnl")
      .then((r) => {
        setData(r);
        if (!params.get("month") && r.statements.length > 0) {
          setSelected(r.statements[r.statements.length - 1].month);
        }
      })
      .catch((e) => setError(e.message));
  }, [params]);

  const statement = useMemo(
    () => data?.statements.find((s) => s.month === selected) ?? null,
    [data, selected]
  );

  if (error) return <EmptyState title="Failed to load P&L" description={error} />;
  if (!data) {
    return (
      <div className="pt-10">
        <Spinner label="Loading P&L..." />
      </div>
    );
  }
  if (data.statements.length === 0) {
    return (
      <EmptyState
        title="No data yet"
        description="Import a statement and run categorization to build the P&L."
        action={
          <Link href="/ingest">
            <Button>Go to Ingest</Button>
          </Link>
        }
      />
    );
  }

  const rows: { id: string; indent?: boolean; subtotal?: boolean; highlight?: boolean }[] = [
    { id: "revenue" },
    { id: "cogs" },
    { id: "grossProfit", subtotal: true },
    { id: "payroll" },
    { id: "opex" },
    { id: "operatingProfit", highlight: true },
  ];

  const lineOf = (id: string) => statement?.[id as keyof PnlStatement];

  return (
    <>
      <PageHeader
        title="Monthly P&L"
        subtitle="Built from classified transactions only - every figure drills down to the categories and transactions behind it. Non-P&L movements (transfers, loans, capex, owner drawings) are held out."
        actions={
          <div className="flex flex-wrap gap-1.5">
            {data.statements.map((s) => (
              <button
                key={s.month}
                onClick={() => {
                  setSelected(s.month);
                  setExpanded(null);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm border transition-colors ${
                  selected === s.month
                    ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {monthLabel(s.month)}
              </button>
            ))}
          </div>
        }
      />

      {!statement ? (
        <EmptyState title="Select a month" description="Choose a month above to view its statement." />
      ) : (
        <>
          <Panel className="p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <div className="text-sm text-slate-300">
                Statement for{" "}
                <span className="text-white font-medium">{monthLabel(statement.month)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/variances?to=${statement.month}`}>
                  <Button variant="ghost">Compare with previous month</Button>
                </Link>
              </div>
            </div>

            <table className="w-full text-sm">
              <tbody>
                {rows.map((r) => {
                  const line = lineOf(r.id);
                  if (!line || typeof line === "string" || typeof line === "number") return null;
                  const isExpanded = expanded === r.id;
                  const tone = r.highlight
                    ? line.amountCents >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                    : "text-white";
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => setExpanded(isExpanded ? null : r.id)}
                        className={`border-b border-slate-800/70 table-row-hover cursor-pointer ${
                          r.subtotal ? "bg-slate-800/30" : ""
                        } ${r.highlight ? "bg-emerald-500/5" : ""}`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] text-slate-600 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            >
                              ▶
                            </span>
                            <span className={`${r.subtotal || r.highlight ? "font-semibold" : ""} ${tone}`}>
                              {line.label}
                            </span>
                            {line.categories.length > 0 ? (
                              <span className="text-[11px] text-slate-500">
                                {line.transactionCount} txns
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className={`px-5 py-3 text-right num text-lg ${tone} ${r.subtotal || r.highlight ? "font-semibold" : ""}`}>
                          {money(line.amountCents)}
                        </td>
                      </tr>
                      {isExpanded && line.categories.length > 0 ? (
                        <tr className="bg-slate-950/70 border-b border-slate-800/70">
                          <td colSpan={2} className="px-5 py-3">
                            <div className="space-y-1">
                              {line.categories
                                .slice()
                                .sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents))
                                .map((c) => (
                                  <div
                                    key={c.categoryId}
                                    className="flex items-center justify-between rounded-md px-3 py-1.5 hover:bg-slate-800/50"
                                  >
                                    <Link
                                      href={`/transactions?month=${statement.month}&category=${c.categoryId}`}
                                      className="text-slate-300 hover:text-sky-300 flex items-center gap-2"
                                    >
                                      {c.label}
                                      <span className="text-[11px] text-slate-600">{c.transactionCount} txns</span>
                                    </Link>
                                    <span className="num text-slate-200">{money(c.amountCents)}</span>
                                  </div>
                                ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          <div className="grid sm:grid-cols-3 gap-4 mt-5">
            <Panel
              className={statement.unclassifiedCount > 0 ? "border-amber-500/40" : ""}
            >
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                Data coverage
              </div>
              {statement.unclassifiedCount > 0 ? (
                <>
                  <div className="text-amber-400 font-medium mt-1.5 text-sm">
                    {statement.unclassifiedCount} unclassified transaction
                    {statement.unclassifiedCount > 1 ? "s" : ""} excluded
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Excluded from the P&L so totals are never guessed. Classified value in flight:{" "}
                    <span className="num">{money(statement.unclassifiedCents)}</span>
                  </p>
                  <Link
                    href={`/transactions?month=${statement.month}`}
                    className="text-xs text-sky-400 hover:text-sky-300 mt-2 inline-block"
                  >
                    Classify them →
                  </Link>
                </>
              ) : (
                <div className="text-emerald-400 text-sm mt-1.5">
                  100% of transactions in {monthLabel(statement.month)} are classified.
                </div>
              )}
            </Panel>

            <Panel>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                Non-P&L movements
              </div>
              <div className="text-slate-200 font-medium mt-1.5 text-sm">
                {statement.nonPlCount} transaction{statement.nonPlCount === 1 ? "" : "s"} held out
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Transfers, loans, capex, owner drawings and tax remittances are not income-statement
                items. Net flow: <span className="num">{money(statement.nonPlCents)}</span>
              </p>
              <Link
                href={`/transactions?month=${statement.month}&treatment=NON_P_AND_L`}
                className="text-xs text-sky-400 hover:text-sky-300 mt-2 inline-block"
              >
                Inspect them →
              </Link>
            </Panel>

            <Panel>
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Method</div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Revenue = credits in revenue categories. COGS / Payroll / OpEx = debits in their
                categories (refunds reduce the cost). Gross Profit and Operating Profit are
                arithmetic on those lines, computed in integer cents.
                <span className="block mt-1.5">
                  <Badge color="sky">deterministic</Badge>{" "}
                  <span className="text-slate-500">src/lib/pnl.ts</span>
                </span>
              </p>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

export default function PnlPage() {
  return (
    <Suspense
      fallback={
        <div className="pt-10">
          <Spinner label="Loading..." />
        </div>
      }
    >
      <PnlContent />
    </Suspense>
  );
}
