"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend, monthLabel } from "@/lib/api";
import { Badge, Button, Panel, PageHeader, Spinner } from "@/components/ui";
import type { ChatEvidence, ChatVerification } from "@/lib/types";

interface Turn {
  role: "user" | "assistant";
  content: string;
  evidence?: ChatEvidence[];
  verification?: ChatVerification;
}

interface AnalystResponse {
  reply: string;
  evidence: ChatEvidence[];
  verification: ChatVerification;
  toolCallCount: number;
  error?: string;
}

const SUGGESTIONS = [
  "What was our revenue in March?",
  "How much did we spend on payroll each month?",
  "Why did operating profit change between February and March?",
  "What drove the increase in food costs?",
  "Which transactions need my attention?",
  "What changed most significantly over the review period?",
];

function evidenceLabel(e: ChatEvidence): string {
  const args = e.args ?? {};
  switch (e.tool) {
    case "get_pnl":
      return `P&L ${monthLabel(String(args.month ?? ""))}`;
    case "compare_pnl":
    case "get_variances":
      return args.from && args.to
        ? `Variance ${monthLabel(String(args.from))} → ${monthLabel(String(args.to))}`
        : "All variances";
    case "list_transactions": {
      const bits: string[] = ["Transactions"];
      if (args.month) bits.push(monthLabel(String(args.month)));
      if (args.category_id) bits.push(String(args.category_id).replace(/^(revenue|cogs|payroll|opex|nonpl)_/, ""));
      if (args.query) bits.push(`"${String(args.query)}"`);
      if (args.flagged_only) bits.push("flagged");
      return bits.join(" · ");
    }
    case "get_review_items":
      return "Review queue";
    case "get_transaction":
      return `Transaction #${String(args.id)}`;
    case "list_months":
      return "Data coverage";
    default:
      return e.summary;
  }
}

export default function AnalystPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [greeting, setGreeting] = useState<string>("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolActivity, setToolActivity] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet<{ history: Turn[]; greeting: string }>("/api/analyst")
      .then((r) => {
        setTurns(r.history);
        setGreeting(r.greeting);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy, toolActivity]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setBusy(true);
    setToolActivity(0);
    const ticker = window.setInterval(() => setToolActivity((n) => n + 1), 1200);
    try {
      const r = await apiSend<AnalystResponse>("/api/analyst", "POST", { message: text });
      if (r.error) throw new Error(r.error);
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: r.reply,
          evidence: r.evidence,
          verification: r.verification,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyst failed");
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      window.clearInterval(ticker);
      setBusy(false);
      setToolActivity(0);
    }
  }

  async function clearChat() {
    try {
      const r = await apiSend<{ history: Turn[]; greeting: string }>("/api/analyst", "POST", {
        clear: true,
      });
      setTurns(r.history);
      setGreeting(r.greeting);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear");
    }
  }

  return (
    <>
      <PageHeader
        title="AI Financial Analyst"
        subtitle="Ask anything about the books. The analyst must call deterministic tools for every number, and a verifier checks each dollar figure in the answer against the tool evidence before it reaches you."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/review">
              <Button variant="ghost">Open review queue</Button>
            </Link>
            <Button variant="secondary" onClick={clearChat}>
              Clear chat
            </Button>
          </div>
        }
      />

      <Panel className="flex flex-col h-[calc(100vh-220px)] min-h-[520px] p-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div className="text-center text-xs text-slate-500">{greeting}</div>

          {turns.length === 0 ? (
            <div className="max-w-2xl mx-auto text-center pt-4">
              <div className="text-sm text-slate-400 mb-4">Try one of these:</div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-slate-700 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-300 hover:border-sky-500/50 hover:text-white transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {turns.map((t, i) => (
            <div
              key={i}
              className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[760px] ${t.role === "user" ? "text-right" : ""}`}>
                <div
                  className={`inline-block rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    t.role === "user"
                      ? "bg-sky-500/20 border border-sky-500/30 text-sky-50"
                      : "bg-slate-800/70 border border-slate-700/70 text-slate-100"
                  }`}
                >
                  {t.content}
                </div>

                {t.role === "assistant" && (t.evidence?.length || t.verification) ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {t.evidence?.map((e, j) => (
                      <Link
                        key={j}
                        href={e.href}
                        className="rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-400 hover:text-sky-300 hover:border-sky-500/40 transition-colors"
                        title={JSON.stringify(e.args)}
                      >
                        {evidenceLabel(e)} →
                      </Link>
                    ))}
                    {t.verification ? (
                      <Badge
                        color={t.verification.passed ? "emerald" : "rose"}
                        title={
                          t.verification.passed
                            ? `${t.verification.checkedFigures} dollar figures checked against tool evidence`
                            : `Unsupported: ${t.verification.unsupportedFigures.join(", ")}`
                        }
                      >
                        {t.verification.passed
                          ? `${t.verification.checkedFigures} figures verified`
                          : `${t.verification.unsupportedFigures.length} figure(s) unsupported`}
                      </Badge>
                    ) : null}
                    {t.verification?.repaired ? <Badge color="amber">auto-repaired</Badge> : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {busy ? (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-800/60 px-4 py-3">
                <div className="flex items-center gap-3 text-sm text-slate-400">
                  <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-slate-600 border-t-sky-400 animate-spin" />
                  {toolActivity < 2
                    ? "Planning the investigation..."
                    : toolActivity < 4
                      ? "Calling deterministic tools..."
                      : "Verifying every figure..."}
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        <div className="border-t border-slate-800 px-5 py-4">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={2}
              placeholder="Ask about revenue, costs, variances, review items..."
              className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-sky-500"
            />
            <Button onClick={() => send(input)} disabled={busy || !input.trim()}>
              {busy ? "Thinking..." : "Send"}
            </Button>
          </div>
          <div className="text-[11px] text-slate-600 mt-2">
            Answers are grounded in tool results only - the model cannot invent totals. Click any
            evidence chip to see the underlying rows.
          </div>
        </div>
      </Panel>

      {busy ? (
        <div className="mt-3">
          <Spinner />
        </div>
      ) : null}
    </>
  );
}
