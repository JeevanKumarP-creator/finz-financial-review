"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import { apiSend } from "@/lib/api";
import { Button } from "./ui";
import type { Transaction } from "@/lib/types";

export function CategorySelect({
  transaction,
  onSaved,
}: {
  transaction: Transaction;
  onSaved: (t: Transaction) => void;
}) {
  const [categoryId, setCategoryId] = useState(transaction.category?.id ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = categoryId !== (transaction.category?.id ?? "");
  const pl = CATEGORIES.filter((c) => c.treatment === "P_AND_L");
  const nonPl = CATEGORIES.filter((c) => c.treatment !== "P_AND_L");

  async function save() {
    if (!categoryId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiSend<{ transaction: Transaction }>(
        `/api/transactions/${transaction.id}`,
        "PATCH",
        { categoryId, note: note || undefined }
      );
      onSaved(res.transaction);
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3.5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">
        Correct classification
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 outline-none max-w-[320px]"
        >
          <option value="">Select a category...</option>
          <optgroup label="P&L (income statement)">
            {pl.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Non-P&L (needs different treatment)">
            {nonPl.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </optgroup>
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for the audit trail"
          className="flex-1 min-w-[200px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-sky-500 outline-none"
        />
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving..." : "Save correction"}
        </Button>
      </div>
      {error ? <div className="text-xs text-rose-400 mt-2">{error}</div> : null}
      <div className="text-[11px] text-slate-500 mt-2">
        Corrections are stored as <code className="text-slate-400">source = human</code>, keep an
        audit row in <code className="text-slate-400">corrections</code>, and auto-resolve open
        confidence flags for this transaction.
      </div>
    </div>
  );
}
