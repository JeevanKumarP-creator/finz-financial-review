import { CATEGORY_MAP } from "../categories";
import type { VarianceComparison, VarianceExplanation, VarianceLine } from "../types";
import { aiConfigured, aiModel, extractJson, getAiClient } from "./client";

function cents(n: number): string {
  return (n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildVarianceEvidence(cmp: VarianceComparison): Record<string, unknown> {
  const material = cmp.lines.filter((l) => l.material);
  return {
    from_month: cmp.from,
    to_month: cmp.to,
    materiality_threshold: {
      min_absolute_amount: cents(cmp.materialityMinCents),
      min_percent_change: cmp.materialityMinPct * 100,
    },
    pnl_lines: material.map((l) => ({
      line: l.label,
      line_id: l.lineId,
      prior_month_amount: cents(l.priorCents),
      current_month_amount: cents(l.currentCents),
      change_amount: cents(l.deltaCents),
      change_percent: l.deltaPct,
      categories: l.drivers
        .filter((d) => d.deltaCents !== 0)
        .map((d) => ({
          category: d.label,
          change_amount: cents(d.deltaCents),
          current_amount: cents(d.currentCents),
          prior_amount: cents(d.priorCents),
        })),
      sample_transactions: l.topTransactions.map((t) => ({
        date: t.date,
        description: t.description,
        amount: cents(t.amountCents),
        category: t.categoryLabel,
      })),
    })),
  };
}

export function extractDollarFigures(text: string): number[] {
  const out: number[] = [];
  const re = /\$\s*(-?[\d,]+(?:\.\d{1,2})?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const EVIDENCE_NUMBER_RE = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;

function collectNumbers(value: unknown, into: Set<number>): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    into.add(Math.abs(Math.round(value * 100)));
    into.add(Math.abs(Math.round(value)) * 100);
    return;
  }
  if (typeof value === "string") {
    const matches = value.match(EVIDENCE_NUMBER_RE) ?? [];
    for (const raw of matches) {
      const n = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(n)) continue;
      into.add(Math.abs(Math.round(n * 100)));
      into.add(Math.abs(Math.round(n)) * 100);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectNumbers(v, into));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((v) => collectNumbers(v, into));
  }
}

export function evidenceFigureSet(evidenceJson: string): Set<number> {
  const into = new Set<number>();
  try {
    collectNumbers(JSON.parse(evidenceJson), into);
  } catch {
    for (const m of evidenceJson.match(EVIDENCE_NUMBER_RE) ?? []) {
      const n = Number(m.replace(/,/g, ""));
      if (Number.isFinite(n)) {
        into.add(Math.abs(Math.round(n * 100)));
        into.add(Math.abs(Math.round(n)) * 100);
      }
    }
  }
  return into;
}

export function unsupportedFigures(text: string, evidenceJson: string): string[] {
  const allowed = evidenceFigureSet(evidenceJson);
  const unsupported: string[] = [];
  for (const dollars of extractDollarFigures(text)) {
    const cents = Math.abs(Math.round(dollars * 100));
    const wholeDollars = Math.abs(Math.round(dollars)) * 100;
    if (!allowed.has(cents) && !allowed.has(wholeDollars)) {
      unsupported.push(
        Math.abs(dollars).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    }
  }
  return [...new Set(unsupported)];
}

const SYSTEM = `You are the financial explanation engine of the FINZ review app.
You are given pre-computed, verified evidence for a month-over-month P&L variance.
Hard rules:
- Use ONLY the numbers inside the evidence JSON. Never add, subtract, average or estimate any amount.
- Every dollar figure you write must appear verbatim in the evidence (format as $X,XXX.XX).
- Explain what changed, which categories drove it, and which transactions matter.
- Be specific and concise: 2-4 sentences plus one short bullet per major driver.
- If the evidence is insufficient, say what is missing instead of guessing.
Output JSON: {"headline":"<max 12 words>","explanation":"<2-4 sentences>","drivers":["<one short line per driver, each containing only evidence figures>"]}`;

export async function explainVariance(cmp: VarianceComparison): Promise<VarianceExplanation> {
  const evidence = buildVarianceEvidence(cmp);
  const evidenceJson = JSON.stringify(evidence, null, 2);
  const materialLines = cmp.lines.filter((l) => l.material);
  if (materialLines.length === 0) {
    return {
      headline: "No material variance",
      explanation: `No P&L line moved beyond the materiality threshold (${(cmp.materialityMinCents / 100).toFixed(0)} and 10%) between ${cmp.from} and ${cmp.to}.`,
      generatedBy: "none",
      verified: true,
      issues: [],
    };
  }

  if (!aiConfigured()) {
    return {
      headline: `${materialLines.length} material line${materialLines.length > 1 ? "s" : ""} changed`,
      explanation: `AI explanation is disabled (no API key). Deterministic drivers: ${materialLines
        .map((l) => `${l.label} ${l.deltaCents >= 0 ? "+" : "-"}$${cents(Math.abs(l.deltaCents))}`)
        .join("; ")}.`,
      generatedBy: "none",
      verified: true,
      issues: [],
    };
  }

  try {
    const res = await getAiClient().chat.completions.create({
      model: aiModel(),
      temperature: 0.1,
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Evidence (all figures are already computed by the deterministic engine):\n${evidenceJson}`,
        },
      ],
    });
    const parsed = extractJson(res.choices[0]?.message?.content ?? "") as {
      headline?: string;
      explanation?: string;
      drivers?: string[];
    } | null;

    if (!parsed || typeof parsed.explanation !== "string") {
      return {
        headline: "Explanation unavailable",
        explanation: deterministicSummary(materialLines),
        generatedBy: "none",
        verified: true,
        issues: ["Model returned unparseable output; fell back to the deterministic driver list."],
      };
    }

    const drivers = Array.isArray(parsed.drivers) ? parsed.drivers.map(String) : [];
    const full = `${parsed.explanation}\n${drivers.join("\n")}`;
    const unsupported = unsupportedFigures(full, evidenceJson);
    if (unsupported.length > 0) {
      return {
        headline: String(parsed.headline ?? "Explanation flagged"),
        explanation: `${parsed.explanation}`,
        generatedBy: "ai",
        verified: false,
        issues: [`The following figures were not present in the evidence and were withheld: ${unsupported.join(", ")}. Deterministic drivers: ${deterministicSummary(materialLines)}`],
      };
    }

    return {
      headline: String(parsed.headline ?? "Material variance"),
      explanation: parsed.explanation,
      generatedBy: "ai",
      verified: true,
      issues: [],
    };
  } catch {
    return {
      headline: "Explanation unavailable",
      explanation: deterministicSummary(materialLines),
      generatedBy: "none",
      verified: true,
      issues: ["AI call failed; fell back to the deterministic driver list."],
    };
  }
}

function deterministicSummary(lines: VarianceLine[]): string {
  const parts = lines.map((l) => {
    const top = l.drivers[0];
    const driverTxt = top ? ` driven by ${top.label}` : "";
    return `${l.label} moved from $${cents(l.priorCents)} to $${cents(l.currentCents)} (${l.deltaCents >= 0 ? "+" : "-"}$${cents(Math.abs(l.deltaCents))})${driverTxt}.`;
  });
  return parts.join(" ");
}

export function categoryLabelSafe(id: string): string {
  return CATEGORY_MAP[id]?.label ?? id;
}
