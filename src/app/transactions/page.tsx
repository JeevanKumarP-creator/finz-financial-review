"use client";

import { Fragment, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, money, confidenceTone } from "@/lib/api";
import { CATEGORIES, REVIEW_REASON_LABELS } from "@/lib/categories";
import { Badge, Button, EmptyState, Panel, PageHeader, Spinner } from "@/components/ui";
import { CategorySelect } from "@/components/CategorySelect";
import type { Transaction } from "@/lib/types";

interface ListResponse {
  transactions: Transaction[];
  total: number;
}

function monthOptions(): string[] {
  const out: string[] = [];
  for (let y = 2024; y <= 2030; y++) {
    for (let m = 1; m <= 12; m++) out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

function TransactionsContent() {
  const params = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const [month, setMonth] = useState(params.get("month") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [flagged, setFlagged] = useState(params.get("flagged") === "1");
  const [treatment, setTreatment] = useState(params.get("treatment") ?? "");
  const focusId = Number(params.get("id")) || null;

  const filterKey = `${month}|${category}|${q}|${flagged}|${treatment}`;
  const loading = loadedKey !== filterKey;

  useEffect(() => {
    const search = new URLSearchParams();
    if (month) search.set("month", month);
    if (category) search.set("category", category);
    if (q) search.set("q", q);
    if (flagged) search.set("flagged", "1");
    if (treatment) search.set("treatment", treatment);
    let cancelled = false;
    apiGet<ListResponse>(`/api/transactions?${search.toString()}`)
      .then((r) => {
        if (cancelled) return;
        setTransactions(r.transactions);
        setTotal(r.total);
        setError(null);
        if (focusId) setExpanded(focusId);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(filterKey);
      });
    return () => {
      cancelled = true;
    };
  }, [filterKey, focusId, month, category, q, flagged, treatment]);

  function clearFilters() {
    setMonth("");
    setCategory("");
    setQ("");
    setFlagged(false);
    setTreatment("");
  }

  const hasFilters = Boolean(month || category || q || flagged || treatment);

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Every imported transaction with its assigned category, confidence and review flags. Correct anything the system got wrong - the correction is saved and the P&L recalculates from it."
        actions={
          <span className="text-sm text-slate-400 num">
            {total} shown
          </span>
        }
      />

      <Panel className="mb-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
          >
            <option value="">All months</option>
            {monthOptions()
              .filter((m) => transactions.some((t) => t.date.startsWith(m)) || m === month)
              .map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 max-w-[220px]"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={treatment}
            onChange={(e) => setTreatment(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
          >
            <option value="">P&L + non-P&L</option>
            <option value="P_AND_L">P&L only</option>
            <option value="NON_P_AND_L">Non-P&L only</option>
          </select>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search description or payee..."
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-sky-500 w-56"
          />

          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={flagged}
              onChange={(e) => setFlagged(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-sky-500"
            />
            Flagged only
          </label>

          {hasFilters ? (
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
        </div>
      </Panel>

      {error ? (
        <Panel className="border-rose-500/40 text-sm text-rose-300">{error}</Panel>
      ) : loading ? (
        <Spinner label="Loading transactions..." />
      ) : transactions.length === 0 ? (
        <EmptyState
          title="No transactions match"
          description={hasFilters ? "Try clearing the filters." : "Import a bank statement first."}
          action={
            hasFilters ? (
              <Button onClick={clearFilters}>Clear filters</Button>
            ) : undefined
          }
        />
      ) : (
        <Panel className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="text-left px-4 py-3 w-24">Date</th>
                <th className="text-left px-2 py-3">Description</th>
                <th className="text-left px-2 py-3 w-56">Category</th>
                <th className="text-left px-2 py-3 w-28">Treatment</th>
                <th className="text-right px-4 py-3 w-32">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => {
                const openFlags = t.reviewFlags.filter((f) => f.status === "open");
                const isExpanded = expanded === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr
                      onClick={() => setExpanded(isExpanded ? null : t.id)}
                      className={`border-b border-slate-800/60 cursor-pointer table-row-hover ${isExpanded ? "bg-slate-800/40" : ""}`}
                    >
                      <td className="px-4 py-2.5 num text-slate-400 whitespace-nowrap">{t.date}</td>
                      <td className="px-2 py-2.5">
                        <div className="text-slate-100 flex items-center gap-2 flex-wrap">
                          {t.description}
                          {openFlags.slice(0, 2).map((f) => (
                            <Badge
                              key={f.id}
                              color={f.severity === "high" ? "rose" : f.severity === "medium" ? "amber" : "slate"}
                              title={f.detail ?? REVIEW_REASON_LABELS[f.reasonCode]}
                            >
                              {REVIEW_REASON_LABELS[f.reasonCode] ?? f.reasonCode}
                            </Badge>
                          ))}
                          {openFlags.length > 2 ? (
                            <Badge color="slate">+{openFlags.length - 2}</Badge>
                          ) : null}
                        </div>
                        {t.counterparty ? (
                          <div className="text-xs text-slate-500 mt-0.5">{t.counterparty}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5">
                        {t.category ? (
                          <div>
                            <div className="text-slate-200">{t.category.label}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                              <span className={confidenceTone(t.classification?.confidence ?? 0)}>
                                {Math.round((t.classification?.confidence ?? 0) * 100)}%
                              </span>
                              <span>· {t.classification?.source}</span>
                              {t.classification?.source === "human" ? (
                                <Badge color="sky">corrected</Badge>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <Badge color="amber">unclassified</Badge>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {t.classification?.treatment === "NON_P_AND_L" ? (
                          <Badge color="violet" title="Excluded from the P&L; may need different accounting treatment">
                            non-P&L
                          </Badge>
                        ) : (
                          <Badge color="emerald">P&L</Badge>
                        )}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right num font-medium whitespace-nowrap ${
                          t.amountCents >= 0 ? "text-emerald-400" : "text-slate-200"
                        }`}
                      >
                        {money(t.amountCents, { sign: true })}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="border-b border-slate-800/60 bg-slate-950/60">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-3 text-sm">
                              <div className="text-[11px] uppercase tracking-wider text-slate-500">
                                Source transaction
                              </div>
                              <div className="grid grid-cols-2 gap-y-1.5 text-slate-300">
                                <span className="text-slate-500">Reference</span>
                                <span className="num">{t.reference ?? "-"}</span>
                                <span className="text-slate-500">Statement balance</span>
                                <span className="num">
                                  {t.balanceCents != null ? money(t.balanceCents) : "-"}
                                </span>
                                <span className="text-slate-500">Counterparty</span>
                                <span>{t.counterparty ?? "-"}</span>
                                <span className="text-slate-500">Transaction id</span>
                                <span className="num">#{t.id}</span>
                              </div>
                              {t.classification?.reasoning ? (
                                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                                  <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                                    AI reasoning ({t.classification.source}, {Math.round(t.classification.confidence * 100)}%)
                                  </div>
                                  <div className="text-slate-300">{t.classification.reasoning}</div>
                                </div>
                              ) : null}
                            </div>

                            <div className="space-y-3">
                              {t.reviewFlags.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="text-[11px] uppercase tracking-wider text-slate-500">
                                    Review flags
                                  </div>
                                  {t.reviewFlags.map((f) => (
                                    <div
                                      key={f.id}
                                      className={`rounded-lg border p-2.5 text-sm ${
                                        f.status === "resolved"
                                          ? "border-slate-800 bg-slate-900/40 opacity-60"
                                          : f.severity === "high"
                                            ? "border-rose-500/40 bg-rose-500/10"
                                            : "border-amber-500/30 bg-amber-500/10"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-slate-200 font-medium">
                                          {REVIEW_REASON_LABELS[f.reasonCode] ?? f.reasonCode}
                                        </span>
                                        <Badge color={f.status === "resolved" ? "slate" : f.severity === "high" ? "rose" : "amber"}>
                                          {f.status}
                                        </Badge>
                                      </div>
                                      {f.detail ? (
                                        <div className="text-xs text-slate-400 mt-1">{f.detail}</div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              <CategorySelect
                                transaction={t}
                                onSaved={(updated) => {
                                  setTransactions((prev) =>
                                    prev.map((p) => (p.id === updated.id ? updated : p))
                                  );
                                }}
                              />
                            </div>
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
      )}
    </>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="pt-10">
          <Spinner label="Loading..." />
        </div>
      }
    >
      <TransactionsContent />
    </Suspense>
  );
}
