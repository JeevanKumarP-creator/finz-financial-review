"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend, money } from "@/lib/api";
import { REVIEW_REASON_LABELS } from "@/lib/categories";
import { Badge, Button, EmptyState, Panel, PageHeader, Spinner } from "@/components/ui";
import { CategorySelect } from "@/components/CategorySelect";
import type { Transaction } from "@/lib/types";

interface ReviewItem {
  id: number;
  transactionId: number;
  reasonCode: string;
  severity: "high" | "medium" | "low";
  detail: string | null;
  status: "open" | "resolved";
  resolution: string | null;
  date: string;
  description: string;
  amountCents: number;
  counterparty: string | null;
  categoryId: string | null;
  confidence: number | null;
  source: string | null;
}

interface ReviewResponse {
  items: ReviewItem[];
  counts: Record<string, number>;
}

export default function ReviewPage() {
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [loadedTab, setLoadedTab] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | "scan" | null>(null);
  const [correcting, setCorrecting] = useState<number | null>(null);

  const loading = loadedTab !== tab;

  useEffect(() => {
    let cancelled = false;
    apiGet<ReviewResponse>(`/api/review?status=${tab}`)
      .then((r) => {
        if (cancelled) return;
        setData(r);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoadedTab(tab);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, reloadKey]);

  async function resolve(id: number, resolution: string) {
    setBusy(id);
    try {
      await apiSend(`/api/review/${id}`, "PATCH", { status: "resolved", resolution });
      setData((prev) =>
        prev ? { ...prev, items: prev.items.filter((i) => i.id !== id) } : prev
      );
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve");
    } finally {
      setBusy(null);
    }
  }

  async function reopen(id: number) {
    setBusy(id);
    try {
      await apiSend(`/api/review/${id}`, "PATCH", { status: "open" });
      setTab("open");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reopen");
    } finally {
      setBusy(null);
    }
  }

  async function rescan() {
    setBusy("scan");
    try {
      const r = await apiSend<ReviewResponse>("/api/review", "POST");
      setData(r);
      setTab("open");
      setLoadedTab("open");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(null);
    }
  }

  const openCount = data?.counts?.open ?? 0;

  return (
    <>
      <PageHeader
        title="Review Queue"
        subtitle="Transactions where classification is uncertain, treatment needs judgment, or the data looks unusual or inconsistent. Resolve them and the P&L updates immediately."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={rescan} disabled={busy !== null}>
              {busy === "scan" ? "Scanning..." : "Re-run rules"}
            </Button>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden">
              {(["open", "resolved"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3.5 py-2 text-sm capitalize ${
                    tab === t ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t} {t === "open" ? `(${data?.counts?.open ?? 0})` : `(${data?.counts?.resolved ?? 0})`}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {error ? (
        <Panel className="mb-5 border-rose-500/40 text-sm text-rose-300">{error}</Panel>
      ) : null}

      {loading ? (
        <Spinner label="Loading review items..." />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title={tab === "open" ? "Nothing needs review" : "No resolved items yet"}
          description={
            tab === "open"
              ? openCount === 0 && data
                ? "Every flagged transaction has been handled. Re-run the rules after any new import or classification."
                : "No items in this state."
              : "Items you resolve will appear here."
          }
          action={
            tab === "open" ? (
              <Button variant="secondary" onClick={rescan}>
                Re-run rules
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => (
            <Panel
              key={item.id}
              className={
                item.severity === "high"
                  ? "border-rose-500/40"
                  : item.severity === "medium"
                    ? "border-amber-500/30"
                    : ""
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      color={
                        item.severity === "high"
                          ? "rose"
                          : item.severity === "medium"
                            ? "amber"
                            : "slate"
                      }
                    >
                      {item.severity}
                    </Badge>
                    <span className="text-sm font-medium text-white">
                      {REVIEW_REASON_LABELS[item.reasonCode] ?? item.reasonCode}
                    </span>
                    <span className="num text-sm text-slate-300">
                      {money(item.amountCents, { sign: true })}
                    </span>
                  </div>
                  <div className="text-sm text-slate-300 mt-1.5">
                    <span className="num text-slate-500">{item.date}</span> {item.description}
                    {item.counterparty ? (
                      <span className="text-slate-500"> · {item.counterparty}</span>
                    ) : null}
                  </div>
                  {item.detail ? (
                    <div className="text-xs text-slate-400 mt-1.5 max-w-3xl">{item.detail}</div>
                  ) : null}
                  <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px] text-slate-500">
                    <span>
                      Current category:{" "}
                      <span className="text-slate-300">{item.categoryId ?? "unclassified"}</span>
                    </span>
                    {item.confidence != null ? (
                      <span>confidence {Math.round(item.confidence * 100)}%</span>
                    ) : null}
                    {item.source ? <span>source {item.source}</span> : null}
                    <Link
                      href={`/transactions?id=${item.transactionId}`}
                      className="text-sky-400 hover:text-sky-300"
                    >
                      Open transaction →
                    </Link>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    onClick={() => setCorrecting(correcting === item.id ? null : item.id)}
                  >
                    {correcting === item.id ? "Close" : "Set category"}
                  </Button>
                  {item.status === "open" ? (
                    <Button
                      onClick={() => resolve(item.id, "Reviewed - no change required")}
                      disabled={busy === item.id}
                    >
                      {busy === item.id ? "..." : "Mark reviewed"}
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => reopen(item.id)} disabled={busy === item.id}>
                      Reopen
                    </Button>
                  )}
                </div>
              </div>

              {correcting === item.id ? (
                <div className="mt-4">
                  <ReviewCategoryEditor
                    transactionId={item.transactionId}
                    onSaved={() => {
                      setCorrecting(null);
                      setReloadKey((k) => k + 1);
                    }}
                  />
                </div>
              ) : null}

              {item.status === "resolved" && item.resolution ? (
                <div className="mt-3 text-xs text-emerald-400/90">
                  Resolved: {item.resolution}
                </div>
              ) : null}
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}

function ReviewCategoryEditor({
  transactionId,
  onSaved,
}: {
  transactionId: number;
  onSaved: () => void;
}) {
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ transaction: Transaction }>(`/api/transactions/${transactionId}`)
      .then((r) => setTransaction(r.transaction))
      .catch((e) => setError(e.message));
  }, [transactionId]);

  if (error) return <div className="text-xs text-rose-400">{error}</div>;
  if (!transaction) return <Spinner label="Loading transaction..." />;

  return (
    <CategorySelect
      transaction={transaction}
      onSaved={() => {
        onSaved();
      }}
    />
  );
}
