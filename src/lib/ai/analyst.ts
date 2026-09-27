import { nowIso, qAll, qRun } from "../db";
import { CATEGORIES } from "../categories";
import { computePnlForMonth, listMonthsWithCounts } from "../pnl";
import { allAdjacentVariances, computeVariance } from "../variance";
import type { ChatEvidence, ChatReply, ChatVerification } from "../types";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { aiConfigured, aiModel, getAiClient } from "./client";
import { extractDollarFigures, unsupportedFigures } from "./explain";
import { loadTransactions } from "../transactions";

const MAX_TOOL_ROUNDS = 6;

interface ToolOutcome {
  summary: string;
  data: unknown;
  href: string;
}

function cents(n: number): string {
  return (n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONTH_NAMES: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

export function normalizeMonth(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = /^([a-z]+)\s+(\d{4})$/.exec(s);
  if (m && MONTH_NAMES[m[1]]) return `${m[2]}-${MONTH_NAMES[m[1]]}`;
  m = /^(\d{4})\s+([a-z]+)$/.exec(s);
  if (m && MONTH_NAMES[m[2]]) return `${m[1]}-${MONTH_NAMES[m[2]]}`;
  return null;
}

async function monthsAvailable(): Promise<string[]> {
  return (await listMonthsWithCounts()).map((m) => m.month);
}

async function requireMonth(raw: unknown): Promise<string> {
  const m = normalizeMonth(raw) ?? (typeof raw === "string" ? raw.slice(0, 7) : null);
  const all = await monthsAvailable();
  if (m && all.includes(m)) return m;
  if (!m && all.length > 0) return all[all.length - 1];
  return m ?? "";
}

async function statementJson(month: string): Promise<unknown> {
  const s = await computePnlForMonth(month);
  if (!s) {
    return { error: `No data for ${month}. Available months: ${(await monthsAvailable()).join(", ")}` };
  }
  return {
    month: s.month,
    revenue: cents(s.revenue.amountCents),
    cost_of_goods_sold: cents(s.cogs.amountCents),
    gross_profit: cents(s.grossProfit.amountCents),
    payroll: cents(s.payroll.amountCents),
    operating_expenses: cents(s.opex.amountCents),
    operating_profit: cents(s.operatingProfit.amountCents),
    revenue_breakdown: s.revenue.categories.map((c) => ({ category: c.label, amount: cents(c.amountCents), transactions: c.transactionCount })),
    cogs_breakdown: s.cogs.categories.map((c) => ({ category: c.label, amount: cents(c.amountCents), transactions: c.transactionCount })),
    payroll_breakdown: s.payroll.categories.map((c) => ({ category: c.label, amount: cents(c.amountCents), transactions: c.transactionCount })),
    opex_breakdown: s.opex.categories.map((c) => ({ category: c.label, amount: cents(c.amountCents), transactions: c.transactionCount })),
    unclassified_transactions: s.unclassifiedCount,
    non_pl_transactions: s.nonPlCount,
  };
}

async function varianceJson(from: string, to: string, materialOnly: boolean): Promise<unknown> {
  const cmp = await computeVariance(from, to);
  if (!cmp) return { error: `Cannot compare ${from} and ${to}` };
  const lines = cmp.lines.filter((l) => (materialOnly ? l.material : true));
  return {
    from_month: cmp.from,
    to_month: cmp.to,
    materiality: { min_amount: cents(cmp.materialityMinCents), min_percent: cmp.materialityMinPct * 100 },
    lines: lines.map((l) => ({
      line: l.label,
      line_id: l.lineId,
      prior: cents(l.priorCents),
      current: cents(l.currentCents),
      change: cents(l.deltaCents),
      change_percent: l.deltaPct,
      material: l.material,
      top_drivers: l.drivers.filter((d) => d.deltaCents !== 0).slice(0, 4).map((d) => ({
        category: d.label,
        change: cents(d.deltaCents),
      })),
      sample_transactions: l.topTransactions.slice(0, 4).map((t) => ({
        date: t.date,
        description: t.description,
        amount: cents(t.amountCents),
        category: t.categoryLabel,
      })),
    })),
  };
}

interface ListArgs {
  month?: unknown;
  category_id?: unknown;
  query?: unknown;
  flagged_only?: unknown;
  treatment?: unknown;
  min_amount?: unknown;
  limit?: unknown;
}

async function listTransactionsJson(args: ListArgs): Promise<unknown> {
  const month = args.month ? normalizeMonth(args.month) ?? String(args.month).slice(0, 7) : null;
  const categoryId = typeof args.category_id === "string" ? args.category_id : null;
  const query = typeof args.query === "string" ? args.query.toLowerCase() : null;
  const flaggedOnly = args.flagged_only === true;
  const treatment = typeof args.treatment === "string" ? args.treatment : null;
  const minAmount = typeof args.min_amount === "number" ? Math.round(args.min_amount * 100) : null;
  const limit = Math.min(typeof args.limit === "number" ? args.limit : 25, 50);

  let rows = await loadTransactions({});
  if (month) rows = rows.filter((t) => t.date.startsWith(month));
  if (categoryId) rows = rows.filter((t) => t.category?.id === categoryId);
  if (query) {
    rows = rows.filter(
      (t) =>
        t.description.toLowerCase().includes(query) ||
        (t.counterparty ?? "").toLowerCase().includes(query)
    );
  }
  if (flaggedOnly) rows = rows.filter((t) => t.reviewFlags.some((f) => f.status === "open"));
  if (treatment) rows = rows.filter((t) => t.classification?.treatment === treatment);
  if (minAmount != null) rows = rows.filter((t) => Math.abs(t.amountCents) >= minAmount);
  rows.sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents));
  const total = rows.length;
  rows = rows.slice(0, limit);

  return {
    total_matching: total,
    showing: rows.length,
    transactions: rows.map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: cents(t.amountCents),
      direction: t.amountCents >= 0 ? "money in" : "money out",
      category: t.category?.label ?? "unclassified",
      category_id: t.category?.id ?? null,
      confidence: t.classification ? Math.round(t.classification.confidence * 100) + "%" : null,
      treatment: t.classification?.treatment ?? null,
      flags: t.reviewFlags.filter((f) => f.status === "open").map((f) => f.reasonCode),
    })),
  };
}

async function reviewItemsJson(status: string): Promise<unknown> {
  const rows = await qAll<{
    id: number;
    reason_code: string;
    severity: string;
    detail: string;
    status: string;
    txn_id: number;
    date: string;
    description: string;
    amountCents: number;
  }>(
    `SELECT ri.id, ri.reason_code, ri.severity, ri.detail, ri.status,
            t.id AS txn_id, t.date, t.description, t.amount_cents AS amountCents
     FROM review_items ri
     JOIN transactions t ON t.id = ri.transaction_id
     WHERE ri.status = ?
     ORDER BY CASE ri.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, ABS(t.amount_cents) DESC`,
    status
  );
  return {
    status,
    count: rows.length,
    items: rows.slice(0, 30).map((r) => ({
      transaction_id: r.txn_id,
      date: r.date,
      description: r.description,
      amount: cents(r.amountCents),
      reason: r.reason_code,
      severity: r.severity,
      detail: r.detail,
    })),
  };
}

async function transactionDetailJson(id: number): Promise<unknown> {
  const row = (await loadTransactions({ id })).find((t) => t.id === id);
  if (!row) return { error: `No transaction ${id}` };
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    counterparty: row.counterparty,
    reference: row.reference,
    amount: cents(row.amountCents),
    category: row.category?.label ?? null,
    category_id: row.category?.id ?? null,
    confidence: row.classification?.confidence ?? null,
    source: row.classification?.source ?? null,
    ai_reasoning: row.classification?.reasoning ?? null,
    treatment: row.classification?.treatment ?? null,
    review_flags: row.reviewFlags.map((f) => ({ reason: f.reasonCode, severity: f.severity, detail: f.detail, status: f.status })),
  };
}

async function executeTool(name: string, rawArgs: Record<string, unknown>): Promise<ToolOutcome> {
  switch (name) {
    case "list_months": {
      const months = await listMonthsWithCounts();
      return {
        summary: `${months.length} months imported`,
        data: { months: months.map((m) => ({ month: m.month, transactions: m.count })), chart_of_accounts: CATEGORIES.map((c) => ({ id: c.id, label: c.label, treatment: c.treatment })) },
        href: "/",
      };
    }
    case "get_pnl": {
      const month = await requireMonth(rawArgs.month);
      const data = await statementJson(month);
      return { summary: `P&L ${month}`, data, href: `/pnl?month=${month}` };
    }
    case "compare_pnl":
    case "get_variances": {
      const from = normalizeMonth(rawArgs.from);
      const to = normalizeMonth(rawArgs.to);
      if (from && to) {
        const data = await varianceJson(from, to, false);
        return { summary: `Variance ${from} vs ${to}`, data, href: `/variances?from=${from}&to=${to}` };
      }
      const pairs = await allAdjacentVariances();
      const data = { comparisons: await Promise.all(pairs.map((c) => varianceJson(c.from, c.to, true))) };
      return { summary: `${pairs.length} month-over-month comparisons`, data, href: "/variances" };
    }
    case "list_transactions": {
      const data = await listTransactionsJson(rawArgs as ListArgs);
      const params = new URLSearchParams();
      if (rawArgs.month) params.set("month", normalizeMonth(String(rawArgs.month)) ?? String(rawArgs.month));
      if (typeof rawArgs.category_id === "string") params.set("category", rawArgs.category_id);
      if (typeof rawArgs.query === "string") params.set("q", rawArgs.query);
      if (rawArgs.flagged_only === true) params.set("flagged", "1");
      return { summary: "Transaction list", data, href: `/transactions?${params.toString()}` };
    }
    case "get_review_items": {
      const status = rawArgs.status === "resolved" ? "resolved" : "open";
      const data = await reviewItemsJson(status);
      return { summary: `${status} review items`, data, href: "/review" };
    }
    case "get_transaction": {
      const id = Number(rawArgs.id);
      const data = await transactionDetailJson(id);
      return { summary: `Transaction ${id}`, data, href: `/transactions?id=${id}` };
    }
    default:
      return { summary: "Unknown tool", data: { error: `Unknown tool ${name}` }, href: "/" };
  }
}

export const ANALYST_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_months",
      description: "List the months imported from the bank statement and the available chart of accounts. Use first to learn what data exists.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pnl",
      description: "Deterministically computed monthly P&L (revenue, COGS, gross profit, payroll, opex, operating profit) with per-category breakdowns.",
      parameters: {
        type: "object",
        properties: { month: { type: "string", description: "Month as YYYY-MM, e.g. 2026-03" } },
        required: ["month"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_variances",
      description: "Material month-over-month P&L variances with drivers. Optionally compare two specific months.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Prior month YYYY-MM" },
          to: { type: "string", description: "Later month YYYY-MM" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_transactions",
      description: "Search imported transactions with filters: month, category_id, text query, flagged_only, treatment (P_AND_L or NON_P_AND_L), min_amount (dollars).",
      parameters: {
        type: "object",
        properties: {
          month: { type: "string" },
          category_id: { type: "string" },
          query: { type: "string" },
          flagged_only: { type: "boolean" },
          treatment: { type: "string", enum: ["P_AND_L", "NON_P_AND_L"] },
          min_amount: { type: "number" },
          limit: { type: "integer" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_review_items",
      description: "Transactions that need human attention: uncertain classification, judgment needed, duplicates, outliers, data problems.",
      parameters: {
        type: "object",
        properties: { status: { type: "string", enum: ["open", "resolved"] } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_transaction",
      description: "Full detail for one transaction including AI classification reasoning and open review flags.",
      parameters: {
        type: "object",
        properties: { id: { type: "integer" } },
        required: ["id"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are the FINZ AI financial analyst, embedded in a financial review application for a small business.

You answer questions about imported bank transactions, monthly P&L statements, variances and review items.

MANDATORY RULES:
1. Every number must come from a tool result. Never recall, estimate or compute money yourself. The deterministic engine owns all arithmetic.
2. Call tools before answering. Use list_months first if you do not know the periods.
3. When tool results arrive, immediately write the final answer for the user. Never describe which tool you would or could call, and never talk about function calls in your reply.
4. Write money exactly as the tools return it, formatted as $X,XXX.XX.
5. Cite the month and the category you are talking about. Keep answers under 100 words unless asked for detail.
6. If the tools cannot answer, say clearly what data is missing. Never invent transactions, totals or trends.
7. When you describe a change (increase/decrease), always quote the exact change amount from the tool result in the same sentence. Never characterize a line you do not quote.
8. For "what needs my attention" questions use get_review_items.
9. For "why did X change" questions use get_variances with the relevant months, then list_transactions for evidence if needed.`;

function verifyFigures(text: string, evidenceJson: string): ChatVerification {
  const unsupported = unsupportedFigures(text, evidenceJson);
  const checked = (text.match(/\$\s*[\d,]+(?:\.\d{1,2})?/g) ?? []).length;
  return {
    checkedFigures: checked,
    unsupportedFigures: unsupported,
    passed: unsupported.length === 0,
    repaired: false,
  };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  evidence?: ChatEvidence[];
  verification?: ChatVerification;
}

export async function loadHistory(limit = 16): Promise<ChatTurn[]> {
  const rows = await qAll<{
    role: string;
    content: string;
    evidence_json: string | null;
    verification_json: string | null;
  }>(
    `SELECT role, content, evidence_json, verification_json
     FROM chat_messages ORDER BY id DESC LIMIT ?`,
    limit
  );
  return rows.reverse().map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
    evidence: r.evidence_json ? (JSON.parse(r.evidence_json) as ChatEvidence[]) : undefined,
    verification: r.verification_json
      ? (JSON.parse(r.verification_json) as ChatVerification)
      : undefined,
  }));
}

async function persist(
  role: "user" | "assistant",
  content: string,
  evidence?: ChatEvidence[],
  verification?: ChatVerification
): Promise<void> {
  await qRun(
    `INSERT INTO chat_messages (session_id, role, content, evidence_json, verification_json, created_at)
     VALUES ('default', ?, ?, ?, ?, ?)`,
    role,
    content,
    evidence ? JSON.stringify(evidence) : null,
    verification ? JSON.stringify(verification) : null,
    nowIso()
  );
}

export async function clearHistory(): Promise<void> {
  await qRun(`DELETE FROM chat_messages`);
}

export async function runAnalyst(userMessage: string, history: ChatTurn[]): Promise<ChatReply> {
  await persist("user", userMessage);

  if (!aiConfigured()) {
    const reply =
      "AI is not configured on this deployment (no NVIDIA_API_KEY). Deterministic data is still available in the P&L, Variance and Review tabs.";
    await persist("assistant", reply);
    return {
      reply,
      evidence: [],
      verification: { checkedFigures: 0, unsupportedFigures: [], passed: true, repaired: false },
      toolCallCount: 0,
    };
  }

  const client = getAiClient();
  const model = aiModel();
  const evidenceLog: ChatEvidence[] = [];
  const evidenceJsons: string[] = [];

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((h) => ({ role: h.role, content: h.content }) as ChatCompletionMessageParam),
    { role: "user", content: userMessage },
  ];

  let finalText = "";
  let rounds = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;
    const res = await client.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 2000,
      tools: ANALYST_TOOLS,
      messages,
    });
    const msg = res.choices[0]?.message;
    if (!msg) break;

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      finalText = msg.content?.trim() ?? "";
      break;
    }

    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: msg.tool_calls,
    } as ChatCompletionMessageParam);
    for (const tc of msg.tool_calls) {
      if (tc.type !== "function") continue;
      const fn = tc.function;
      let args: Record<string, unknown> = {};
      try {
        args = fn.arguments ? (JSON.parse(fn.arguments) as Record<string, unknown>) : {};
      } catch {
        args = {};
      }
      const outcome = await executeTool(fn.name, args);
      evidenceJsons.push(JSON.stringify(outcome.data));
      evidenceLog.push({ tool: fn.name, args, summary: outcome.summary, href: outcome.href });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(outcome.data),
      });
    }
  }

  if (!finalText) {
    const res = await client.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 1500,
      messages,
    });
    finalText = res.choices[0]?.message?.content?.trim() ?? "";
  }

  const deferralPattern =
    /\b(function call|would call|could call|call the tool|using the tool|next,? i (will|would)|the tool (that|which)|best answers the prompt)\b/i;
  const looksLikeMetaText =
    evidenceJsons.length > 0 &&
    ((extractDollarFigures(finalText).length === 0 && deferralPattern.test(finalText)) ||
      (deferralPattern.test(finalText) && finalText.length < 400));

  if (looksLikeMetaText) {
    try {
      const res = await client.chat.completions.create({
        model,
        temperature: 0.1,
        max_tokens: 1500,
        messages: [
          ...messages,
          { role: "assistant", content: finalText },
          {
            role: "user",
            content:
              "Now give the final answer to my original question, directly and completely, using the tool results above. Do not mention tools or function calls. Format money as $X,XXX.XX.",
          },
        ],
      });
      const fixed = res.choices[0]?.message?.content?.trim();
      if (fixed) finalText = fixed;
    } catch {
      // keep the original text if the nudge fails
    }
  }

  const allEvidenceJson = evidenceJsons.join("\n");
  let verification = verifyFigures(finalText, allEvidenceJson);

  if (!verification.passed && evidenceJsons.length > 0) {
    try {
      const repairMessages: ChatCompletionMessageParam[] = [
        ...messages,
        { role: "assistant", content: finalText },
        {
          role: "user",
          content: `A deterministic verifier found money figures in your answer that do NOT appear in any tool result: ${verification.unsupportedFigures.join(", ")}. Rewrite the answer using only figures present in the tool results. Keep conclusions that the evidence supports; drop anything it does not. Reply with the corrected answer only.`,
        },
      ];
      const res = await client.chat.completions.create({
        model,
        temperature: 0.1,
        max_tokens: 1500,
        messages: repairMessages,
      });
      const fixed = res.choices[0]?.message?.content?.trim();
      if (fixed) {
        const recheck = verifyFigures(fixed, allEvidenceJson);
        finalText = fixed;
        verification = { ...recheck, repaired: true };
      }
    } catch {
      verification = { ...verification, repaired: false };
    }
  }

  const dedupedEvidence = evidenceLog.filter(
    (e, i) => evidenceLog.findIndex((x) => x.href === e.href && x.tool === e.tool) === i
  );

  await persist("assistant", finalText, dedupedEvidence, verification);
  return {
    reply: finalText,
    evidence: dedupedEvidence,
    verification,
    toolCallCount: rounds,
  };
}

export async function seedGreeting(): Promise<string> {
  const months = await monthsAvailable();
  if (months.length === 0) return "No data yet - import a bank statement first.";
  return `Data loaded for ${months[0]} to ${months[months.length - 1]}. Ask me about revenue, costs, variances or review items.`;
}
