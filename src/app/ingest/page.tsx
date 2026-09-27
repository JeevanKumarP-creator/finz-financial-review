"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { apiSend } from "@/lib/api";
import { Badge, Button, Panel, PageHeader, Spinner } from "@/components/ui";
import { REVIEW_REASON_LABELS } from "@/lib/categories";

interface IngestResult {
  filename: string;
  parsedRows: number;
  inserted: number;
  skipped: number;
  columns: string[];
  mapping: Record<string, string | null>;
  errors: string[];
  openReviewItems: number;
  unclassifiedRemaining: number;
  error?: string;
}

interface ClassifyResult {
  processed: number;
  aiDecided: number;
  rulesDecided: number;
  remaining: number;
  aiAvailable: boolean;
  openReviewItems: number;
  aiModel: string | null;
  error?: string;
}

export default function IngestPage() {
  const [ingest, setIngest] = useState<IngestResult | null>(null);
  const [busy, setBusy] = useState<"ingest" | "classify" | "reset" | null>(null);
  const [progress, setProgress] = useState<{ processed: number; ai: number; rules: number; remaining: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setBusy("ingest");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ingest", { method: "POST", body: form });
      const data = (await res.json()) as IngestResult;
      if (!res.ok) throw new Error(data.error ?? "Ingest failed");
      setIngest(data);
      setProgress(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setBusy(null);
    }
  }

  async function loadSample() {
    setBusy("ingest");
    setError(null);
    try {
      const data = await apiSend<IngestResult>("/api/ingest", "POST", { sample: true });
      setIngest(data);
      setProgress(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setBusy(null);
    }
  }

  async function runClassification() {
    setBusy("classify");
    setError(null);
    let processed = 0;
    let ai = 0;
    let rules = 0;
    let remaining = ingest?.unclassifiedRemaining ?? 0;
    try {
      let guard = 0;
      while (remaining > 0 && guard < 40) {
        guard++;
        const r = await apiSend<ClassifyResult>("/api/classify", "POST", { limit: 60 });
        if (r.error) throw new Error(r.error);
        processed += r.processed;
        ai += r.aiDecided;
        rules += r.rulesDecided;
        remaining = r.remaining;
        setProgress({ processed, ai, rules, remaining });
        if (r.processed === 0) break;
      }
      setIngest((prev) => (prev ? { ...prev, unclassifiedRemaining: remaining, openReviewItems: 0 } : prev));
      const summary = await apiSend<{ openReviewItems: number }>("/api/review", "POST");
      setIngest((prev) => (prev ? { ...prev, openReviewItems: summary.openReviewItems } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Classification failed");
    } finally {
      setBusy(null);
    }
  }

  async function resetAll() {
    if (!window.confirm("Delete all imported transactions, classifications, corrections and review items?")) return;
    setBusy("reset");
    try {
      await apiSend("/api/reset", "POST");
      setIngest(null);
      setProgress(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }

  const mappingEntries = ingest ? Object.entries(ingest.mapping).filter(([, v]) => v) : [];
  const done = ingest !== null && ingest.unclassifiedRemaining === 0 && (progress?.remaining ?? 0) === 0;

  return (
    <>
      <PageHeader
        title="Ingest & Categorize"
        subtitle="1) Parse the bank statement into structured transactions. 2) Classify each transaction into the chart of accounts with AI (keyword fallback if the model is unavailable). 3) Surface anything that needs judgment."
        actions={
          ingest && ingest.inserted > 0 ? (
            <Button variant="danger" onClick={resetAll} disabled={busy !== null}>
              Reset all data
            </Button>
          ) : null
        }
      />

      {error ? (
        <Panel className="mb-5 border-rose-500/40">
          <div className="text-sm text-rose-300">{error}</div>
        </Panel>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-5">
        <Panel>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-sky-300 text-xs font-semibold">
              1
            </span>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Ingest financial data
            </h2>
          </div>
          <p className="text-sm text-slate-400 mb-4 ml-8">
            Accepts CSV with date / description / amount or debit / credit columns. Column names are
            auto-detected, amounts normalized to cents, duplicates skipped.
          </p>

          <div className="ml-8">
            <label
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 cursor-pointer hover:border-sky-500/60 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) uploadFile(f);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                }}
              />
              <span className="text-sm text-slate-300">
                {busy === "ingest" ? "Parsing..." : "Drop a CSV here or click to upload"}
              </span>
              <span className="text-xs text-slate-500">e.g. your bank export</span>
            </label>

            <div className="flex items-center gap-3 mt-4">
              <Button variant="secondary" onClick={loadSample} disabled={busy !== null}>
                Load sample dataset
              </Button>
              <span className="text-xs text-slate-500">
                247 transactions, Feb-Jul 2026
              </span>
            </div>
          </div>

          {ingest ? (
            <div className="mt-5 ml-8 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Source</span>
                <span className="text-slate-200 truncate max-w-[220px]" title={ingest.filename}>
                  {ingest.filename}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Rows parsed / imported / skipped</span>
                <span className="num text-slate-200">
                  {ingest.parsedRows} / {ingest.inserted} / {ingest.skipped}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {mappingEntries.map(([key, col]) => (
                  <Badge key={key} color="sky" title={`Detected column: ${col}`}>
                    {key} → {col}
                  </Badge>
                ))}
              </div>
              {ingest.errors.length > 0 ? (
                <ul className="text-xs text-amber-400/90 list-disc pl-4 pt-1 max-h-28 overflow-y-auto">
                  {ingest.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-emerald-400">All rows parsed cleanly.</div>
              )}
            </div>
          ) : null}
        </Panel>

        <Panel>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-sky-300 text-xs font-semibold">
              2
            </span>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              Categorize & label
            </h2>
          </div>
          <p className="text-sm text-slate-400 mb-4 ml-8">
            Each transaction is sent to the LLM with the chart of accounts and returns a category,
            confidence and reasoning. Low confidence, AI-flagged and rule-fallback items enter the
            review queue automatically.
          </p>

          <div className="ml-8">
            <Button
              onClick={runClassification}
              disabled={busy !== null || !ingest || ingest.unclassifiedRemaining === 0}
            >
              {busy === "classify" ? "Classifying..." : "Run AI categorization"}
            </Button>
            {ingest && ingest.unclassifiedRemaining > 0 ? (
              <span className="ml-3 text-xs text-slate-500">
                {ingest.unclassifiedRemaining} transactions awaiting classification
              </span>
            ) : null}

            {busy === "classify" || progress ? (
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-2 text-sm">
                {busy === "classify" ? <Spinner label="Calling the model batch by batch..." /> : null}
                {progress ? (
                  <>
                    <div className="flex justify-between text-slate-300">
                      <span>Processed</span>
                      <span className="num">{progress.processed}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Decided by AI</span>
                      <span className="num text-emerald-400">{progress.ai}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Keyword fallback</span>
                      <span className="num text-amber-400">{progress.rules}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Remaining</span>
                      <span className="num">{progress.remaining}</span>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {done && ingest ? (
              <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
                Classification complete. Continue below to inspect the P&L, variances and review queue.
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        {[
          { href: "/transactions", title: "Review transactions", desc: "See categories, confidence and correct mistakes" },
          { href: "/pnl", title: "Build the P&L", desc: "Monthly revenue, COGS, payroll, opex and profit" },
          { href: "/variances", title: "Find variances", desc: "Material changes with drivers and evidence" },
          { href: "/review", title: "Resolve review items", desc: "Uncertain, unusual or inconsistent entries" },
        ].map((s) => (
          <Link key={s.href} href={s.href} className="panel p-4 hover:border-slate-600 transition-colors">
            <div className="text-sm font-medium text-white">{s.title}</div>
            <div className="text-xs text-slate-500 mt-1">{s.desc}</div>
          </Link>
        ))}
      </div>

      <div className="mt-6 text-xs text-slate-500 leading-relaxed max-w-3xl">
        Review reasons currently configured:{" "}
        <span className="text-slate-400">
          {Object.values(REVIEW_REASON_LABELS).join(" · ")}
        </span>
      </div>
    </>
  );
}
